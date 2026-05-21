const { Router } = require('express');
const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const router = Router();
const prisma = new PrismaClient();

const SYNC_URL = process.env.SYNC_SERVICE_URL || 'http://localhost:5004';

// POST /api/dev/sync/run
// Body: { session_id }
// Calls sync engine — note: this WILL update pipeline_stages and coaches in the DB,
// identical to how the main pipeline calls it.
router.post('/run', async (req, res, next) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    let serviceResult = null;
    let error = null;

    try {
      const { data } = await axios.post(
        `${SYNC_URL}/sync`,
        { session_id },
        { timeout: 60000 }
      );
      serviceResult = data;
    } catch (err) {
      error = err.response?.data || err.message;
    }

    await prisma.devSyncRun.create({
      data: {
        session_id,
        output_json: serviceResult ?? (error ? { error } : null),
      },
    });

    if (error) return res.status(502).json({ session_id, error });
    res.json({ session_id, result: serviceResult });
  } catch (err) {
    next(err);
  }
});

// GET /api/dev/sync/runs/:session_id
router.get('/runs/:session_id', async (req, res, next) => {
  try {
    const runs = await prisma.devSyncRun.findMany({
      where: { session_id: req.params.session_id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    res.json(runs);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
