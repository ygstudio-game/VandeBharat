require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const config = require('./config');
const prisma = require('./db/client');

fastify.register(cors, {
  origin: config.frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// 2 GB limit — train inspection videos can be large
fastify.register(multipart, {
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 10 },
});

fastify.get('/health', async (request, reply) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', db: 'connected', timestamp: new Date().toISOString() };
  } catch (err) {
    reply.status(503);
    return { status: 'error', db: 'disconnected', error: err.message };
  }
});

fastify.register(require('./routes/sessions'),     { prefix: '/api/sessions' });
fastify.register(require('./routes/intelligence'), { prefix: '/api/sessions' });
fastify.register(require('./routes/reports'),      { prefix: '/api/sessions' });
fastify.register(require('./routes/dashboard'),    { prefix: '/api/dashboard' });

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

module.exports = fastify;
