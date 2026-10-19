const { checkCoverage } = require('../pipeline/steps/checkCoverage');

const requirements = [
  { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Node.js', kind: 'technical', priority: 'must' },
  { id: 'r3', text: 'Nice-to-have', kind: 'domain', priority: 'nice' },
  { id: 'r4', text: 'Leadership', kind: 'behavioural', priority: 'must' },
];

describe('checkCoverage', () => {
  test('returns no uncovered when all requirements have questions', () => {
    const questions = [
      { id: 'q1', requirement_ids: ['r1', 'r2'] },
      { id: 'q2', requirement_ids: ['r3'] },
      { id: 'q3', requirement_ids: ['r4'] },
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredMust).toHaveLength(0);
    expect(result.uncoveredNice).toHaveLength(0);
    expect(result.uncoveredRequirementIds).toHaveLength(0);
  });

  test('identifies uncovered must-have requirements', () => {
    const questions = [
      { id: 'q1', requirement_ids: ['r1'] },
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredMust.map(r => r.id)).toContain('r2');
    expect(result.uncoveredMust.map(r => r.id)).toContain('r4');
  });

  test('identifies uncovered nice-to-have requirements', () => {
    const questions = [
      { id: 'q1', requirement_ids: ['r1', 'r2', 'r4'] },
    ];
    const result = checkCoverage(requirements, questions);
    expect(result.uncoveredMust).toHaveLength(0);
    expect(result.uncoveredNice.map(r => r.id)).toContain('r3');
  });

  test('handles empty questions array', () => {
    const result = checkCoverage(requirements, []);
    expect(result.uncoveredMust).toHaveLength(3); // r1, r2, r4
    expect(result.uncoveredNice).toHaveLength(1); // r3
  });

  test('handles empty requirements array', () => {
    const result = checkCoverage([], [{ id: 'q1', requirement_ids: ['r1'] }]);
    expect(result.uncoveredMust).toHaveLength(0);
    expect(result.uncoveredNice).toHaveLength(0);
  });
});
