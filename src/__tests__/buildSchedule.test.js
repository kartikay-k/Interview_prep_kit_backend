const { buildSchedule } = require('../pipeline/steps/buildSchedule');

const mockRequirements = [
  { id: 'r1', text: 'React', kind: 'technical', priority: 'must' },
  { id: 'r2', text: 'Node.js', kind: 'technical', priority: 'must' },
  { id: 'r3', text: 'Team player', kind: 'behavioural', priority: 'nice' },
];

const mockQuestions = [
  { id: 'q1', category: 'technical', difficulty: 3, requirement_ids: ['r1'] },
  { id: 'q2', category: 'technical', difficulty: 2, requirement_ids: ['r2'] },
  { id: 'q3', category: 'behavioural', difficulty: 1, requirement_ids: ['r3'] },
  { id: 'q4', category: 'system-design', difficulty: 3, requirement_ids: ['r1', 'r2'] },
  { id: 'q5', category: 'company-fit', difficulty: 1, requirement_ids: [] },
];

describe('buildSchedule', () => {
  test('produces exactly the requested number of days', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 3);
    expect(schedule.days_available).toBe(3);
    expect(schedule.days.length).toBe(3);
  });

  test('works with 1 day', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 1);
    expect(schedule.days.length).toBe(1);
    expect(schedule.days[0].day).toBe(1);
    const allQIds = schedule.days.flatMap(d => d.question_ids);
    expect(allQIds.length).toBe(mockQuestions.length);
  });

  test('works with 60 days (more days than questions)', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 60);
    expect(schedule.days.length).toBe(60);
    const allQIds = schedule.days.flatMap(d => d.question_ids);
    expect(allQIds.length).toBe(mockQuestions.length);
  });

  test('all question_ids in schedule exist in input questions', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 5);
    const validIds = new Set(mockQuestions.map(q => q.id));
    schedule.days.forEach(day => {
      day.question_ids.forEach(id => {
        expect(validIds.has(id)).toBe(true);
      });
    });
  });

  test('minutes are integers, not floats', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 5);
    schedule.days.forEach(day => {
      expect(Number.isInteger(day.minutes)).toBe(true);
    });
  });

  test('must-have questions appear before non-must questions', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 5);
    // q1 and q4 cover must-haves — they should land before q5 (company-fit, no must req)
    // Find day of q1 (must) vs q5 (no must req)
    const dayOf = (id) => schedule.days.findIndex(d => d.question_ids.includes(id)) + 1;
    const mustDay1 = dayOf('q1');
    const niceDay = dayOf('q5');
    expect(mustDay1).toBeLessThanOrEqual(niceDay);
  });

  test('each day has a focus string', () => {
    const schedule = buildSchedule(mockQuestions, mockRequirements, 3);
    schedule.days.forEach(day => {
      expect(typeof day.focus).toBe('string');
      expect(day.focus.length).toBeGreaterThan(0);
    });
  });
});
