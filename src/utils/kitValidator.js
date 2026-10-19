/**
 * Kit structure validator — ensures the kit conforms to Appendix A.
 * Used before saving and in the batch output.
 */
const { z } = require('zod');

const requirementSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(['technical', 'behavioural', 'domain']),
  priority: z.enum(['must', 'nice']),
});

const questionSchema = z.object({
  id: z.string(),
  requirement_ids: z.array(z.string()),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']),
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.number().int().min(1).max(3),
});

const flashcardSchema = z.object({
  id: z.string(),
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});

const scheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().positive(),
});

const kitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int(),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(requirementSchema),
  }),
  questions: z.array(questionSchema),
  flashcards: z.array(flashcardSchema),
  schedule: z.object({
    days_available: z.number().int().positive(),
    days: z.array(scheduleDaySchema),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().positive(),
  }),
});

function validateKitStructure(kit) {
  // Strip internal _state fields before validation
  const stripped = stripStateFields(kit);
  const result = kitSchema.safeParse(stripped);
  if (!result.success) {
    const msg = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw Object.assign(new Error(`Kit structure invalid: ${msg}`), { code: 'KIT_STRUCTURE_INVALID' });
  }

  // Verify all question_ids in schedule exist
  const questionIds = new Set((kit.questions || []).map(q => q.id));
  for (const day of (kit.schedule?.days || [])) {
    for (const qId of (day.question_ids || [])) {
      if (!questionIds.has(qId)) {
        throw Object.assign(
          new Error(`Schedule references unknown question id: ${qId}`),
          { code: 'KIT_STRUCTURE_INVALID' }
        );
      }
    }
  }

  return true;
}

function stripStateFields(obj) {
  if (Array.isArray(obj)) return obj.map(stripStateFields);
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('_')) continue;
      result[k] = stripStateFields(v);
    }
    return result;
  }
  return obj;
}

/**
 * Serialize a kit to the exact Appendix A structure (no internal fields).
 */
function serializeKit(kit) {
  const q = (kit.questions || []).map(q => ({
    id: q.id,
    requirement_ids: q.requirement_ids || [],
    category: q.category,
    prompt: q.prompt,
    answer_outline: q.answer_outline,
    difficulty: q.difficulty,
  }));
  const f = (kit.flashcards || []).map(fc => ({
    id: fc.id,
    front: fc.front,
    back: fc.back,
    requirement_ids: fc.requirement_ids || [],
  }));

  return {
    source: kit.source,
    company_brief: {
      summary: kit.company_brief?.summary || '',
      what_they_do: kit.company_brief?.what_they_do || '',
      sources: kit.company_brief?.sources || [],
    },
    role: kit.role,
    questions: q,
    flashcards: f,
    schedule: kit.schedule,
    coverage: kit.coverage,
  };
}

module.exports = { validateKitStructure, serializeKit };
