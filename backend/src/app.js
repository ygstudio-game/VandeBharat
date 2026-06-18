require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const websocketPlugin = require('@fastify/websocket');
const config = require('./config');
const prisma = require('./db/client');
const wsGateway = require('./services/wsGateway');

fastify.register(cors, {
  origin: config.frontendUrl,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});

// 2 GB limit — train inspection videos can be large
fastify.register(multipart, {
  limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 10 },
});

fastify.register(websocketPlugin);

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
fastify.register(require('./routes/health'),       { prefix: '/api/health' });
fastify.register(require('./routes/config'),       { prefix: '/api/config' });
fastify.register(require('./routes/coaches'),      { prefix: '/api/coaches' });
fastify.register(require('./routes/ocrResults'),   { prefix: '/api/ocr-results' });
fastify.register(require('./routes/analytics'),    { prefix: '/api/analytics' });
fastify.register(require('./routes/cameraHealth'), { prefix: '/api/cameras' });

// WebSocket endpoint — clients connect here for live pipeline events
fastify.register(async function wsRoutes(app) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    wsGateway.addGlobal(socket);

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'subscribe' && msg.sessionId) {
          wsGateway.join(msg.sessionId, socket);
        }
      } catch (_) {}
    });

    socket.on('close', () => wsGateway.leaveAll(socket));
    socket.on('error', () => wsGateway.leaveAll(socket));
  });
});

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

module.exports = fastify;
