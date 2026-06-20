require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

module.exports = {
  port: parseInt(process.env.PORT, 10) || 8001,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-in-env',
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  services: {
    frameExtractor: process.env.FRAME_EXTRACTOR_URL || 'http://127.0.0.1:5003',
    ocr:            process.env.OCR_SERVICE_URL      || 'http://127.0.0.1:5000',
    yolo:           process.env.YOLO_SERVICE_URL     || 'http://127.0.0.1:5002',
    syncEngine:     process.env.SYNC_ENGINE_URL      || 'http://127.0.0.1:5004',
    correlation:    process.env.CORRELATION_URL      || 'http://127.0.0.1:5005',
    reportGenerator:process.env.REPORT_GENERATOR_URL || 'http://127.0.0.1:5006',
  },
};
