const express = require('express');
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const Kit = require('../models/Kit');
const { kitQueue } = require('../utils/queue');
const { validateKitStructure } = require('../utils/kitValidator');

const router = express.Router();
router.use(requireAuth);

const createSchema = z.object({
  jobDescription: z.string().min(10),
  companyUrl: z.string().url(),
  daysAvailable: z.number().int().min(1).max(365),
});

// GET /api/kits — list user's kits
router.get('/', async (req, res, next) => {
  try {
    const kits = await Kit.find({ userId: req.user._id })
      .select('status progress error source role.title companyUrl daysAvailable createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ kits });
  } catch (err) { next(err); }
});

// POST /api/kits — create a new kit
router.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);

    // Check for duplicate (same user, same JD + company)
    const existing = await Kit.findOne({
      userId: req.user._id,
      jobDescription: data.jobDescription,
      companyUrl: data.companyUrl,
      status: { $in: ['complete', 'pending', 'researching', 'generating'] },
    }).lean();
    if (existing) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_KIT', message: 'A kit for this job description and company already exists' },
        kitId: existing._id,
      });
    }

    const kit = await Kit.create({
      userId: req.user._id,
      jobDescription: data.jobDescription,
      companyUrl: data.companyUrl,
      daysAvailable: data.daysAvailable,
      status: 'pending',
    });

    // Add to queue instead of running immediately
    const queueSize = kitQueue.getQueueSize();
    const isProcessing = kitQueue.isProcessing();
    
    console.log(`[api] Kit ${kit._id} created. Queue status: ${isProcessing ? 'processing' : 'idle'}, queue size: ${queueSize}`);
    
    // Queue the kit generation (don't await - let it process in background)
    kitQueue.add(kit._id.toString(), data.jobDescription, data.companyUrl, data.daysAvailable)
      .catch(err => console.error('Queue error for kit', kit._id, err.message));

    // Return info about queue position if there's a wait
    const responseData = { 
      kitId: kit._id,
      message: queueSize > 0 || isProcessing 
        ? `Kit queued for generation. Position in queue: ${queueSize + (isProcessing ? 1 : 0)}. Please wait, this may take a few minutes.`
        : 'Kit generation started'
    };

    res.status(201).json(responseData);
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: err.errors[0].message } });
    }
    next(err);
  }
});

// GET /api/kits/:id — get a single kit
router.get('/:id', async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
    res.json({ kit });
  } catch (err) { next(err); }
});

// DELETE /api/kits/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const kit = await Kit.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /api/kits/:id — update kit content (edits from builder)
router.patch('/:id', async (req, res, next) => {
  try {
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.user._id });
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });

    const allowed = ['company_brief', 'role', 'questions', 'flashcards', 'schedule'];
    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        kit[field] = req.body[field];
      }
    }
    await kit.save();
    res.json({ kit });
  } catch (err) { next(err); }
});

// POST /api/kits/:id/regenerate — regenerate one section
router.post('/:id/regenerate', async (req, res, next) => {
  try {
    const { section } = req.body; // 'company_brief' | 'questions:{category}' | 'schedule'
    if (!section) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'section is required' } });
    }
    const kit = await Kit.findOne({ _id: req.params.id, userId: req.user._id });
    if (!kit) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
    if (kit.status === 'generating' || kit.status === 'researching') {
      return res.status(409).json({ error: { code: 'ALREADY_GENERATING', message: 'Kit is already being generated' } });
    }

    const { regenerateSection } = require('../pipeline');
    regenerateSection(kit, section)
      .catch(err => console.error('Regen error for kit', kit._id, err.message));

    res.json({ success: true, message: `Regenerating section: ${section}` });
  } catch (err) { next(err); }
});

module.exports = router;
