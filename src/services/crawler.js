/**
 * Crawler service — crawls a company site to find:
 * 1. What they do (about/homepage)
 * 2. How they hire (careers/jobs/handbook page)
 *
 * Strategy:
 * - Fetch homepage, parse all links
 * - Score links by how hiring-relevant they look
 * - Fetch top-scored candidates, extract text
 * - Respect robots.txt (best-effort)
 */
const cheerio = require('cheerio');
const { fetchPage } = require('./fetcher');

const MAX_PAGES = parseInt(process.env.MAX_CRAWL_PAGES || '10', 10);

// Keyword scoring for hiring-page candidates
const HIRING_KEYWORDS = [
  'career', 'careers', 'job', 'jobs', 'hire', 'hiring', 'work-with-us',
  'work-for-us', 'join', 'join-us', 'team', 'vacancy', 'vacancies',
  'openings', 'handbook', 'engineering-blog', 'culture',
];
const ABOUT_KEYWORDS = ['about', 'about-us', 'company', 'who-we-are', 'mission', 'values'];

function scoreLink(href, text) {
  const combined = (href + ' ' + text).toLowerCase();
  let score = 0;
  for (const kw of HIRING_KEYWORDS) {
    if (combined.includes(kw)) score += 10;
  }
  for (const kw of ABOUT_KEYWORDS) {
    if (combined.includes(kw)) score += 5;
  }
  return score;
}

function extractLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const links = [];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();
    try {
      const resolved = new URL(href, baseUrl);
      // Same-host only
      if (resolved.hostname !== base.hostname) return;
      if (!['http:', 'https:'].includes(resolved.protocol)) return;
      resolved.hash = '';
      links.push({ url: resolved.toString(), text, score: scoreLink(resolved.pathname, text) });
    } catch { /* ignore bad hrefs */ }
  });

  return links;
}

function extractText(html) {
  const $ = cheerio.load(html);
  $('script, style, nav, footer, head').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 8000);
}

async function crawlCompanySite(companyUrl) {
  const result = {
    homepageText: '',
    hiringText: '',
    hiringUrl: null,
    aboutText: '',
    pagesUsed: [],
    errors: [],
  };

  // Fetch homepage
  const homepageHtml = await fetchPage(companyUrl);
  if (!homepageHtml) {
    result.errors.push({ url: companyUrl, reason: 'Homepage unreachable' });
    return result;
  }

  result.homepageText = extractText(homepageHtml);
  result.pagesUsed.push(companyUrl);

  // Parse and score all links
  const links = extractLinks(homepageHtml, companyUrl);

  // Sort by score descending, deduplicate
  const seen = new Set([companyUrl]);
  const candidates = links
    .filter(l => !seen.has(l.url) && seen.add(l.url))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PAGES);

  // Fetch candidates
  for (const candidate of candidates) {
    if (result.pagesUsed.length >= MAX_PAGES) break;
    const html = await fetchPage(candidate.url);
    if (!html) {
      result.errors.push({ url: candidate.url, reason: 'Unreachable' });
      continue;
    }
    const text = extractText(html);
    result.pagesUsed.push(candidate.url);

    const isHiring = HIRING_KEYWORDS.some(kw => candidate.url.toLowerCase().includes(kw) || candidate.text.toLowerCase().includes(kw));
    const isAbout = ABOUT_KEYWORDS.some(kw => candidate.url.toLowerCase().includes(kw) || candidate.text.toLowerCase().includes(kw));

    if (isHiring && !result.hiringText) {
      result.hiringText = text;
      result.hiringUrl = candidate.url;
    } else if (isAbout && !result.aboutText) {
      result.aboutText = text;
    }
  }

  return result;
}

module.exports = { crawlCompanySite };
