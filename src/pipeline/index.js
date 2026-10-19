/**
 * Main pipeline orchestrator.
 * Sequences all steps and updates kit status/progress in the DB.
 *
 * Coverage passes: we run up to MAX_COVERAGE_PASSES (default 3).
 * We stop early if all must-have requirements are covered.
 * Rationale: 3 passes balances completeness vs LLM token cost on free tier.
 */
const Kit = require('../models/Kit');
const { crawlCompanySite } = require('../services/crawler');
const { extractRequirements } = require('./steps/extractRequirements');
const { buildCompanyBrief } = require('./steps/buildCompanyBrief');
const { generateAllQuestions, generateQuestionsForCategory } = require('./steps/generateQuestions');
const { checkCoverage } = require('./steps/checkCoverage');
const { generateFlashcards } = require('./steps/generateFlashcards');
const { buildSchedule } = require('./steps/buildSchedule');
const { validateKitStructure } = require('../utils/kitValidator');

const MAX_PASSES = parseInt(process.env.MAX_COVERAGE_PASSES || '3', 10);

async function setProgress(kitId, step, percent) {
  await Kit.findByIdAndUpdate(kitId, { 'progress.step': step, 'progress.percent': percent });
}

async function runPipeline(kitId, jobDescription, companyUrl, daysAvailable) {
  try {
    console.log(`[pipeline] Starting kit generation for ${kitId}`);
    await Kit.findByIdAndUpdate(kitId, { status: 'researching', 'progress.step': 'Starting research', 'progress.percent': 5 });

    // --- Step 1: Extract requirements from JD ---
    await setProgress(kitId, 'Extracting requirements from job description', 10);
    const roleData = await extractRequirements(jobDescription);

    // --- Step 2: Crawl company site ---
    await setProgress(kitId, 'Crawling company website', 20);
    let crawlResult = { homepageText: '', hiringText: '', aboutText: '', pagesUsed: [], errors: [] };
    try {
      crawlResult = await crawlCompanySite(companyUrl);
    } catch (err) {
      console.warn('[pipeline] crawl failed:', err.message);
      crawlResult.errors.push({ url: companyUrl, reason: err.message });
    }

    // --- Step 3: Build company brief ---
    await setProgress(kitId, 'Building company brief', 35);
    const brief = await buildCompanyBrief(crawlResult);

    // Update DB with research results
    await Kit.findByIdAndUpdate(kitId, {
      status: 'generating',
      'progress.step': 'Generating questions',
      'progress.percent': 45,
      source: {
        company: brief.summary.split(' ').slice(0, 3).join(' '),
        company_url: companyUrl,
        role: roleData.title,
        location: roleData.location,
        jd_chars: jobDescription.length,
        researched_at: new Date().toISOString(),
        pages_used: crawlResult.pagesUsed,
      },
      company_brief: {
        summary: brief.summary,
        what_they_do: brief.what_they_do,
        sources: brief.sources,
        _state: 'generated',
      },
      role: {
        title: roleData.title,
        seniority: roleData.seniority,
        responsibilities: roleData.responsibilities,
        requirements: roleData.requirements,
      },
    });

    // --- Step 4: Generate questions (separate calls per category) ---
    await setProgress(kitId, 'Generating interview questions', 50);
    const companyContext = [brief.summary, brief.what_they_do].filter(Boolean).join('\n');
    const hiringContext = brief.hiring_process || crawlResult.hiringText || '';

    let questions = await generateAllQuestions(roleData.requirements, companyContext, hiringContext);

    // --- Step 5: Coverage loop ---
    let passes = 0;
    let coverageResult;
    while (passes < MAX_PASSES) {
      passes++;
      coverageResult = checkCoverage(roleData.requirements, questions);
      await setProgress(kitId, `Coverage check pass ${passes}`, 55 + passes * 5);

      if (coverageResult.uncoveredMust.length === 0) break;

      console.log(`[pipeline] Pass ${passes}: ${coverageResult.uncoveredMust.length} uncovered must-have requirements, generating gap questions`);

      // Generate questions for uncovered must-haves
      const gapQuestions = await generateQuestionsForCategory(
        coverageResult.uncoveredMust,
        coverageResult.uncoveredMust[0]?.kind === 'behavioural' ? 'behavioural' : 'technical',
        companyContext,
        hiringContext
      );

      // Assign new ids continuing from where we left off
      const offset = questions.length;
      const withIds = gapQuestions.map((q, i) => ({ ...q, id: `q${offset + i + 1}`, _state: 'generated' }));
      questions = [...questions, ...withIds];
    }

    // Final coverage check
    coverageResult = checkCoverage(roleData.requirements, questions);

    // --- Step 6: Generate flashcards ---
    await setProgress(kitId, 'Generating flashcards', 75);
    const flashcards = await generateFlashcards(questions, roleData.requirements);

    // --- Step 7: Build schedule (deterministic) ---
    await setProgress(kitId, 'Building study schedule', 88);
    const schedule = buildSchedule(questions, roleData.requirements, daysAvailable);

    // --- Validate structure ---
    const kitData = {
      source: {
        company: brief.summary.split('.')[0] || '',
        company_url: companyUrl,
        role: roleData.title,
        location: roleData.location,
        jd_chars: jobDescription.length,
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

    validateKitStructure(kitData); // throws if malformed

    // --- Save final kit ---
    await Kit.findByIdAndUpdate(kitId, {
      ...kitData,
      status: 'complete',
      'progress.step': 'Complete',
      'progress.percent': 100,
      error: null,
    });

    console.log(`[pipeline] Kit ${kitId} complete. ${passes} coverage pass(es). ${questions.length} questions.`);
    return kitData;

  } catch (err) {
    console.error(`[pipeline] Kit ${kitId} failed:`, err.message);
    
    // Special handling for rate limit errors
    let errorMessage = err.message;
    if (err.message.includes('429') || err.message.includes('rate') || err.message.includes('quota')) {
      errorMessage = 'Rate limit exceeded. Please wait 60 seconds and try again. The free Gemini API allows 15 requests per minute.';
      console.warn(`[pipeline] ⚠️  RATE LIMIT HIT - User should wait 60 seconds before trying again`);
    }
    
    await Kit.findByIdAndUpdate(kitId, {
      status: 'failed',
      error: errorMessage,
      'progress.step': 'Failed',
    }).catch(() => {});
    throw err;
  }
}

/**
 * Regenerate a single section without touching user-edited content.
 * Sections: 'company_brief' | 'questions:technical' | 'questions:behavioural' | etc | 'schedule'
 */
async function regenerateSection(kit, section) {
  const kitId = kit._id.toString();
  try {
    await Kit.findByIdAndUpdate(kitId, { status: 'generating', 'progress.step': `Regenerating ${section}`, 'progress.percent': 10 });

    const companyContext = [kit.company_brief?.summary, kit.company_brief?.what_they_do].filter(Boolean).join('\n');
    const hiringContext = kit.company_brief?.hiring_process || '';

    if (section === 'company_brief') {
      const crawlResult = await crawlCompanySite(kit.companyUrl);
      const brief = await buildCompanyBrief(crawlResult);
      await Kit.findByIdAndUpdate(kitId, {
        company_brief: { summary: brief.summary, what_they_do: brief.what_they_do, sources: brief.sources, _state: 'generated' },
        status: 'complete', 'progress.percent': 100,
      });
      return;
    }

    if (section === 'schedule') {
      const dbKit = await Kit.findById(kitId).lean();
      const schedule = buildSchedule(dbKit.questions || [], dbKit.role?.requirements || [], dbKit.daysAvailable);
      await Kit.findByIdAndUpdate(kitId, { schedule, status: 'complete', 'progress.percent': 100 });
      return;
    }

    if (section.startsWith('questions:')) {
      const category = section.split(':')[1];
      const dbKit = await Kit.findById(kitId).lean();
      const requirements = dbKit.role?.requirements || [];

      // Preserve pinned/edited questions in this category
      const preserved = (dbKit.questions || []).filter(
        q => q.category === category && (q._state === 'edited' || q._state === 'pinned')
      );
      const otherQuestions = (dbKit.questions || []).filter(q => q.category !== category);

      const catReqs = requirements.filter(r =>
        (category === 'technical' || category === 'system-design') ? (r.kind === 'technical' || r.kind === 'domain') :
        (category === 'behavioural') ? r.kind === 'behavioural' : true
      );

      const newQuestions = await generateQuestionsForCategory(catReqs, category, companyContext, hiringContext);
      const offset = otherQuestions.length + preserved.length;
      const withIds = newQuestions.map((q, i) => ({ ...q, id: `q${offset + i + 1}`, _state: 'generated' }));

      const allQuestions = [...otherQuestions, ...preserved, ...withIds];
      const schedule = buildSchedule(allQuestions, requirements, dbKit.daysAvailable);
      const coverage = checkCoverage(requirements, allQuestions);

      await Kit.findByIdAndUpdate(kitId, {
        questions: allQuestions,
        schedule,
        coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes: dbKit.coverage?.passes || 1 },
        status: 'complete', 'progress.percent': 100,
      });
      return;
    }

    throw new Error(`Unknown section: ${section}`);
  } catch (err) {
    await Kit.findByIdAndUpdate(kitId, { status: 'complete', 'progress.step': `Regen failed: ${err.message}` }).catch(() => {});
    throw err;
  }
}

module.exports = { runPipeline, regenerateSection };
