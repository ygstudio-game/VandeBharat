require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const config = require('./config');
const prisma = require('./db/client');

fastify.register(cors, {
  origin: config.frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
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

fastify.register(require('./routes/sessions'),  { prefix: '/api/sessions' });
fastify.register(require('./routes/dashboard'), { prefix: '/api/dashboard' });

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

module.exports = fastify;
