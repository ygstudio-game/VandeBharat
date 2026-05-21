const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const FormData = require('form-data');

const router = Router();
const prisma = new PrismaClient();

const YOLO_URL = process.env.YOLO_SERVICE_URL || 'http://localhost:5002';

async function downloadFrameBuffer(url) {
  const { data } = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
  return Buffer.from(data);
}

// POST /api/dev/yolo/run
// Body: { session_id, frame_ids: string[], model: 'defect' | 'train_number' }
// Downloads each frame from Cloudinary, POSTs as multipart to YOLO, saves to dev_yolo_runs.
router.post('/run', async (req, res, next) => {
  try {
    const { session_id, frame_ids, model = 'defect' } = req.body;
    if (!session_id || !Array.isArray(frame_ids) || frame_ids.length === 0) {
      return res.status(400).json({ error: 'session_id and frame_ids[] required' });
    }

    const endpoint =
      model === 'train_number'
        ? `${YOLO_URL}/api/yolo/predict_train_number`
        : `${YOLO_URL}/api/yolo/predict`;

    const frames = await prisma.frame.findMany({
      where: { id: { in: frame_ids }, session_id },
      select: { id: true, cloudinary_url: true, trigger_id: true },
    });

    const results = await Promise.all(
      frames.map(async (frame) => {
        let serviceResult = null;
        let error = null;

        try {
          const buffer = await downloadFrameBuffer(frame.cloudinary_url);
          const form = new FormData();
          form.append('file', buffer, { filename: `frame_${frame.id}.jpg`, contentType: 'image/jpeg' });

          const { data } = await axios.post(endpoint, form, {
            headers: form.getHeaders(),
            timeout: 30000,
          });
          serviceResult = data;
        } catch (err) {
          error = err.response?.data || err.message;
        }

        await prisma.devYoloRun.create({
          data: {
            session_id,
            frame_id: frame.id,
            detections_json: serviceResult ?? (error ? { error } : null),
          },
        });

        return {
          frame_id: frame.id,
          trigger_id: Number(frame.trigger_id),
          cloudinary_url: frame.cloudinary_url,
          model,
          result: serviceResult,
          error,
        };
      })
    );

    res.json({ session_id, model, runs: results });
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/yolo/runs/:session_id
router.get('/runs/:session_id', async (req, res, next) => {
  try {
    const runs = await prisma.devYoloRun.findMany({
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
