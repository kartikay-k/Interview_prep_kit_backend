const express = require('express');
const { requireAuth } = require('../middleware/auth');
const PracticeSession = require('../models/PracticeSession');
const Kit = require('../models/Kit');

const router = express.Router();
router.use(requireAuth);

// GET /api/practice/:kitId/next — get ordered flashcards for next session
router.get('/:kitId/next', async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.kitId, userId: req.user._id }).lean();
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });

    // Get all past results for this kit
    const sessions = await PracticeSession.find({ kitId: req.params.kitId, userId: req.user._id }).lean();

    // Aggregate confidence scores per card (lower avg = prioritise first)
    const scores = {};
    for (const session of sessions) {
      for (const result of session.results) {
        if (!scores[result.flashcardId]) scores[result.flashcardId] = { sum: 0, count: 0 };
        scores[result.flashcardId].sum += result.confidence;
        scores[result.flashcardId].count += 1;
      }
    }

    const flashcards = kit.flashcards || [];
    const ordered = [...flashcards].sort((a, b) => {
      const avgA = scores[a.id] ? scores[a.id].sum / scores[a.id].count : 0;
      const avgB = scores[b.id] ? scores[b.id].sum / scores[b.id].count : 0;
      return avgA - avgB; // unseen/low-confidence first
    });

    const coveredIds = new Set(sessions.flatMap(s => s.results.map(r => r.flashcardId)));

    res.json({ flashcards: ordered, coveredIds: [...coveredIds] });
  } catch (err) { next(err); }
});

// POST /api/practice/:kitId/session — save a practice session
router.post('/:kitId/session', async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.kitId, userId: req.user._id }).lean();
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });

    const { results } = req.body;
    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'results array is required' } });
    }

    const session = await PracticeSession.create({
      userId: req.user._id,
      kitId: req.params.kitId,
      results,
      completedAt: new Date(),
    });

    res.status(201).json({ session });
  } catch (err) { next(err); }
});

// GET /api/practice/:kitId/stats — coverage stats
router.get('/:kitId/stats', async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.kitId, userId: req.user._id }).lean();
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });

    const sessions = await PracticeSession.find({ kitId: req.params.kitId, userId: req.user._id }).lean();
    const scores = {};
    for (const session of sessions) {
      for (const result of session.results) {
        if (!scores[result.flashcardId]) scores[result.flashcardId] = [];
        scores[result.flashcardId].push(result.confidence);
      }
    }

    const total = (kit.flashcards || []).length;
    const covered = Object.keys(scores).length;

    const cardStats = (kit.flashcards || []).map(fc => ({
      id: fc.id,
      front: fc.front,
      avgConfidence: scores[fc.id]
        ? scores[fc.id].reduce((a, b) => a + b, 0) / scores[fc.id].length
        : null,
      reviewCount: scores[fc.id] ? scores[fc.id].length : 0,
    }));

    res.json({ total, covered, cardStats });
  } catch (err) { next(err); }
});

module.exports = router;
