const Redis = require('ioredis');
const config = require('../config');

let client = null;

function getRedis() {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });
    client.on('error', (err) => {
      console.error({ msg: 'Redis connection error', error: err.message });
    });
  }
  return client;
}

module.exports = { getRedis };
