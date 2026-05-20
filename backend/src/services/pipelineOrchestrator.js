// Phase 1+: orchestrate frame_extractor → OCR → sync_engine → YOLO → correlation → report_generator
const axios = require('axios');
const config = require('../config');
const prisma = require('../db/client');

async function runPipeline(sessionId) {
  // Placeholder — implemented phase by phase
  console.log(`Pipeline triggered for session ${sessionId}`);
}

module.exports = { runPipeline };
