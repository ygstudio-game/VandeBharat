const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const router = Router();
const prisma = new PrismaClient();

const OCR_URL = process.env.OCR_SERVICE_URL || 'http://localhost:5000';

// POST /api/dev/ocr/run
// Body: { session_id, frame_ids: string[] }
// Calls OCR service for each frame, saves result to dev_ocr_runs, returns per-frame detail.
router.post('/run', async (req, res, next) => {
  try {
    const { session_id, frame_ids } = req.body;
    if (!session_id || !Array.isArray(frame_ids) || frame_ids.length === 0) {
      return res.status(400).json({ error: 'session_id and frame_ids[] required' });
    }

    const frames = await prisma.frame.findMany({
      where: { id: { in: frame_ids }, session_id },
      select: { id: true, cloudinary_url: true, trigger_id: true },
    });

    const results = await Promise.all(
      frames.map(async (frame) => {
        let serviceResult = null;
        let error = null;

        try {
          const { data } = await axios.post(
            `${OCR_URL}/ocr`,
            {
              frame_url: frame.cloudinary_url,
              frame_id: frame.id,
              trigger_id: Number(frame.trigger_id),
              session_id,
            },
            { timeout: 30000 }
          );
          serviceResult = data;
        } catch (err) {
          error = err.response?.data || err.message;
        }

        // Save to dev_ocr_runs regardless of outcome
        await prisma.devOcrRun.create({
          data: {
            session_id,
            frame_id: frame.id,
            final_number: serviceResult?.coach_number ?? null,
            confidence: serviceResult?.confidence ?? null,
            pass_used: serviceResult?.pass_used ?? null,
            roi_used: serviceResult?.roi_used ?? null,
            is_valid: serviceResult?.is_valid ?? false,
            raw_response: serviceResult ?? (error ? { error } : null),
          },
        });

        return {
          frame_id: frame.id,
          trigger_id: Number(frame.trigger_id),
          cloudinary_url: frame.cloudinary_url,
          result: serviceResult,
          error,
        };
      })
    );

    res.json({ session_id, runs: results });
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/ocr/runs/:session_id — history of dev OCR runs for a session
router.get('/runs/:session_id', async (req, res, next) => {
  try {
    const runs = await prisma.devOcrRun.findMany({
      where: { session_id: req.params.session_id },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
