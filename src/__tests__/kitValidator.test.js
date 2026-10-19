const { validateKitStructure } = require('../utils/kitValidator');

const validKit = {
  source: {
    company: 'Acme Corp',
    company_url: 'https://acme.com',
    role: 'Software Engineer',
    location: 'Remote',
    jd_chars: 1500,
    researched_at: '2026-01-01T00:00:00Z',
    pages_used: ['https://acme.com'],
  },
  company_brief: {
    summary: 'Acme Corp builds widgets.',
    what_they_do: 'They build widgets for enterprise clients.',
    sources: ['https://acme.com'],
  },
  role: {
    title: 'Software Engineer',
    seniority: 'senior',
    responsibilities: ['Build features', 'Review code'],
    requirements: [
      { id: 'r1', text: '5+ years React', kind: 'technical', priority: 'must' },
      { id: 'r2', text: 'Team player', kind: 'behavioural', priority: 'nice' },
    ],
  },
  questions: [
    { id: 'q1', requirement_ids: ['r1'], category: 'technical', prompt: 'Explain React hooks.', answer_outline: 'Cover useState, useEffect.', difficulty: 2 },
    { id: 'q2', requirement_ids: ['r2'], category: 'behavioural', prompt: 'Tell me about a time...', answer_outline: 'STAR format.', difficulty: 1 },
  ],
  flashcards: [
    { id: 'f1', front: 'What are React hooks?', back: 'Functions that let you use state in functional components.', requirement_ids: ['r1'] },
  ],
  schedule: {
    days_available: 3,
    days: [
      { day: 1, focus: 'Technical questions', question_ids: ['q1'], minutes: 30 },
      { day: 2, focus: 'Behavioural questions', question_ids: ['q2'], minutes: 30 },
      { day: 3, focus: 'Review', question_ids: [], minutes: 30 },
    ],
  },
  coverage: { uncovered_requirement_ids: [], passes: 1 },
};

describe('validateKitStructure', () => {
  test('accepts a valid kit', () => {
    expect(() => validateKitStructure(validKit)).not.toThrow();
  });

  test('rejects kit missing source', () => {
    const kit = { ...validKit, source: undefined };
    expect(() => validateKitStructure(kit)).toThrow();
  });

  test('rejects invalid requirement priority', () => {
    const kit = { ...validKit, role: { ...validKit.role, requirements: [{ id: 'r1', text: 'test', kind: 'technical', priority: 'required' }] } };
    expect(() => validateKitStructure(kit)).toThrow();
  });

  test('rejects invalid question category', () => {
    const kit = {
      ...validKit,
      questions: [{ id: 'q1', requirement_ids: [], category: 'random', prompt: 'Test', answer_outline: 'Test', difficulty: 1 }],
    };
    expect(() => validateKitStructure(kit)).toThrow();
  });

  test('rejects float minutes', () => {
    const kit = {
      ...validKit,
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: 'Test', question_ids: [], minutes: 30.5 }],
      },
    };
    expect(() => validateKitStructure(kit)).toThrow();
  });

  test('rejects schedule referencing non-existent question id', () => {
    const kit = {
      ...validKit,
      schedule: {
        days_available: 1,
        days: [{ day: 1, focus: 'Test', question_ids: ['q999'], minutes: 30 }],
      },
    };
    expect(() => validateKitStructure(kit)).toThrow();
  });
});
