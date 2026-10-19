/**
 * Step 6: Build the study schedule — pure deterministic code, no LLM.
 *
 * Strategy:
 * - Must-have requirements are distributed first, earlier days
 * - Nice-to-have requirements fill remaining days
 * - Harder/must questions land earlier (day 1 onwards)
 * - Duration per day is estimated from number of questions (15 min each)
 * - Every day gets a focus topic derived from the dominant requirement category
 */

const MINUTES_PER_QUESTION = 15;
const MIN_MINUTES_PER_DAY = 30;

/**
 * @param {Array} questions - All questions (with id, category, difficulty, requirement_ids)
 * @param {Array} requirements - All requirements
 * @param {number} daysAvailable - Requested number of days
 * @returns {Object} schedule object matching Appendix A
 */
function buildSchedule(questions, requirements, daysAvailable) {
  if (daysAvailable < 1) daysAvailable = 1;

  // Sort questions: must-have requirements first, then by difficulty desc
  const mustReqIds = new Set(
    requirements.filter(r => r.priority === 'must').map(r => r.id)
  );

  const scored = questions.map(q => {
    const coversMust = (q.requirement_ids || []).some(id => mustReqIds.has(id));
    return { ...q, _priority: coversMust ? 1 : 0 };
  });

  // Sort: must first, then difficulty desc
  scored.sort((a, b) => {
    if (b._priority !== a._priority) return b._priority - a._priority;
    return (b.difficulty || 1) - (a.difficulty || 1);
  });

  // Distribute questions across days as evenly as possible
  const days = Array.from({ length: daysAvailable }, (_, i) => ({
    day: i + 1,
    focus: '',
    question_ids: [],
    minutes: 0,
  }));

  scored.forEach((q, i) => {
    const dayIndex = i % daysAvailable;
    days[dayIndex].question_ids.push(q.id);
  });

  // Set focus and minutes per day
  const categoryPriority = ['technical', 'system-design', 'behavioural', 'company-fit'];
  for (const day of days) {
    if (day.question_ids.length === 0) {
      day.focus = 'Review and consolidation';
      day.minutes = MIN_MINUTES_PER_DAY;
      continue;
    }

    // Determine dominant category
    const catCounts = {};
    for (const qId of day.question_ids) {
      const q = questions.find(q => q.id === qId);
      if (q) catCounts[q.category] = (catCounts[q.category] || 0) + 1;
    }
    const dominant = categoryPriority.find(c => catCounts[c]) || Object.keys(catCounts)[0] || 'General';
    day.focus = `${capitalise(dominant)} questions`;
    day.minutes = Math.max(MIN_MINUTES_PER_DAY, day.question_ids.length * MINUTES_PER_QUESTION);
  }

  return {
    days_available: daysAvailable,
    days,
  };
}

function capitalise(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = { buildSchedule };
