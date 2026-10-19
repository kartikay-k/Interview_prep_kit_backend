#!/usr/bin/env node
/**
 * Batch entry point (Section 9).
 * Usage: npm run evaluate -- --input <cases.json> --output <kits.json>
 *
 * Reads an array of { id, jd, company_url, days } cases.
 * Runs the full pipeline on each.
 * Writes { version, generated_at, kits } to output file.
 * Continues after individual case failures.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { crawlCompanySite } = require('../services/crawler');
const { extractRequirements } = require('../pipeline/steps/extractRequirements');
const { buildCompanyBrief } = require('../pipeline/steps/buildCompanyBrief');
const { generateAllQuestions, generateQuestionsForCategory } = require('../pipeline/steps/generateQuestions');
const { checkCoverage } = require('../pipeline/steps/checkCoverage');
const { generateFlashcards } = require('../pipeline/steps/generateFlashcards');
const { buildSchedule } = require('../pipeline/steps/buildSchedule');
const { validateKitStructure, serializeKit } = require('../utils/kitValidator');

const MAX_PASSES = parseInt(process.env.MAX_COVERAGE_PASSES || '3', 10);

function parseArgs() {
  const args = process.argv.slice(2);
  let inputFile, outputFile;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') inputFile = args[i + 1];
    if (args[i] === '--output') outputFile = args[i + 1];
  }
  if (!inputFile || !outputFile) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }
  return { inputFile, outputFile };
}

async function processCase(caseItem) {
  const { id, jd, company_url, days } = caseItem;
  console.log(`[batch] Processing case: ${id}`);

  try {
    // Step 1: Extract requirements
    console.log(`[batch][${id}] Extracting requirements...`);
    const roleData = await extractRequirements(jd);

    // Step 2: Crawl company site
    console.log(`[batch][${id}] Crawling ${company_url}...`);
    let crawlResult = { homepageText: '', hiringText: '', aboutText: '', pagesUsed: [], errors: [] };
    try {
      crawlResult = await crawlCompanySite(company_url);
    } catch (err) {
      console.warn(`[batch][${id}] Crawl failed: ${err.message}`);
      crawlResult.errors.push({ url: company_url, reason: err.message });
    }

    // Step 3: Company brief
    console.log(`[batch][${id}] Building company brief...`);
    const brief = await buildCompanyBrief(crawlResult);

    const companyContext = [brief.summary, brief.what_they_do].filter(Boolean).join('\n');
    const hiringContext = brief.hiring_process || crawlResult.hiringText || '';

    // Step 4: Generate questions
    console.log(`[batch][${id}] Generating questions...`);
    let questions = await generateAllQuestions(roleData.requirements, companyContext, hiringContext);

    // Step 5: Coverage loop
    let passes = 0;
    let coverageResult;
    while (passes < MAX_PASSES) {
      passes++;
      coverageResult = checkCoverage(roleData.requirements, questions);
      if (coverageResult.uncoveredMust.length === 0) break;
      console.log(`[batch][${id}] Pass ${passes}: filling ${coverageResult.uncoveredMust.length} gaps`);
      const gap = await generateQuestionsForCategory(
        coverageResult.uncoveredMust,
        coverageResult.uncoveredMust[0]?.kind === 'behavioural' ? 'behavioural' : 'technical',
        companyContext, hiringContext
      );
      const offset = questions.length;
      questions = [...questions, ...gap.map((q, i) => ({ ...q, id: `q${offset + i + 1}`, _state: 'generated' }))];
    }
    coverageResult = checkCoverage(roleData.requirements, questions);

    // Step 6: Flashcards
    console.log(`[batch][${id}] Generating flashcards...`);
    const flashcards = await generateFlashcards(questions, roleData.requirements);

    // Step 7: Schedule (deterministic)
    console.log(`[batch][${id}] Building schedule for ${days} days...`);
    const schedule = buildSchedule(questions, roleData.requirements, days);

    const kit = {
      source: {
        company: brief.summary.split('.')[0] || '',
        company_url,
        role: roleData.title,
        location: roleData.location,
        jd_chars: jd.length,
        researched_at: new Date().toISOString(),
        pages_used: crawlResult.pagesUsed,
      },
      company_brief: { summary: brief.summary, what_they_do: brief.what_they_do, sources: brief.sources },
      role: { title: roleData.title, seniority: roleData.seniority, responsibilities: roleData.responsibilities, requirements: roleData.requirements },
      questions,
      flashcards,
      schedule,
      coverage: { uncovered_requirement_ids: coverageResult.uncoveredRequirementIds, passes },
    };

    validateKitStructure(kit);

    console.log(`[batch][${id}] Done. ${questions.length} questions, ${passes} pass(es).`);
    return { id, status: 'ok', kit: serializeKit(kit), error: null };

  } catch (err) {
    console.error(`[batch][${id}] Failed: ${err.message}`);
    return {
      id,
      status: 'failed',
      kit: null,
      error: { code: err.code || 'PIPELINE_ERROR', message: err.message },
    };
  }
}

async function main() {
  const { inputFile, outputFile } = parseArgs();

  let cases;
  try {
    const raw = fs.readFileSync(path.resolve(inputFile), 'utf8');
    cases = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read input file:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(cases)) {
    console.error('Input must be a JSON array');
    process.exit(1);
  }

  console.log(`[batch] Processing ${cases.length} case(s)...`);

  // Process cases sequentially to avoid smashing rate limits
  const kits = [];
  for (const caseItem of cases) {
    const result = await processCase(caseItem);
    kits.push(result);
  }

  const output = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits,
  };

  fs.writeFileSync(path.resolve(outputFile), JSON.stringify(output, null, 2), 'utf8');
  console.log(`[batch] Written to ${outputFile}`);
  process.exit(0);
}

main().catch(err => {
  console.error('[batch] Fatal error:', err.message);
  process.exit(1);
});
