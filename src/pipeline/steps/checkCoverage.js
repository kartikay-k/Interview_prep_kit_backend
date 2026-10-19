/**
 * Step 4: Coverage check — pure deterministic code, no LLM.
 * Finds requirements that have no question covering them.
 */

/**
 * @param {Array} requirements - All requirements from role extraction
 * @param {Array} questions - All generated questions
 * @returns {{ coveredIds: Set, uncoveredMust: Array, uncoveredNice: Array }}
 */
function checkCoverage(requirements, questions) {
  const coveredIds = new Set();

  for (const question of questions) {
    for (const reqId of (question.requirement_ids || [])) {
      coveredIds.add(reqId);
    }
  }

  const uncoveredMust = requirements.filter(
    r => r.priority === 'must' && !coveredIds.has(r.id)
  );
  const uncoveredNice = requirements.filter(
    r => r.priority === 'nice' && !coveredIds.has(r.id)
  );

  return {
    coveredIds,
    uncoveredMust,
    uncoveredNice,
    uncoveredRequirementIds: [...uncoveredMust, ...uncoveredNice].map(r => r.id),
  };
}

module.exports = { checkCoverage };
