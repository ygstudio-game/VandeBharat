const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const prisma = require('../db/client');
const { signToken } = require('../auth/jwt');
const { authenticate } = require('../middleware/auth');
const { logAction } = require('../services/auditLog');

async function authRoutes(fastify) {
  // POST /api/auth/login { email, password, totp_code? }
  fastify.post('/login', async (req, reply) => {
    const { email, password, totp_code } = req.body || {};
    if (!email || !password) {
      reply.status(400);
      return { error: 'email and password are required' };
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const ip = req.ip;

    // Constant-shape failure: don't reveal whether the email exists.
    if (!user || !user.is_active) {
      await logAction({ action: 'LOGIN_FAILED', metadata: { email, reason: 'no_such_user_or_inactive' }, ip });
      reply.status(401);
      return { error: 'Invalid email or password' };
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      await logAction({ userId: user.id, action: 'LOGIN_FAILED', metadata: { reason: 'bad_password' }, ip });
      reply.status(401);
      return { error: 'Invalid email or password' };
    }

    if (user.totp_enabled) {
      if (!totp_code) {
        reply.status(401);
        return { error: 'TOTP code required', requires_2fa: true };
      }
      const totpOk = authenticator.verify({ token: totp_code, secret: user.totp_secret });
      if (!totpOk) {
        await logAction({ userId: user.id, action: 'LOGIN_FAILED', metadata: { reason: 'bad_totp' }, ip });
        reply.status(401);
        return { error: 'Invalid 2FA code' };
      }
    }

    await prisma.user.update({ where: { id: user.id }, data: { last_login_at: new Date() } });
    await logAction({ userId: user.id, action: 'LOGIN_SUCCESS', ip });

    const token = signToken(user);
    return {
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, totp_enabled: user.totp_enabled },
    };
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: authenticate }, async (req) => {
    return { user: req.user };
  });

  // POST /api/auth/2fa/setup — generates a secret + QR, NOT enabled until /2fa/verify confirms a code
  fastify.post('/2fa/setup', { preHandler: authenticate }, async (req) => {
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: req.user.id }, data: { totp_secret: secret, totp_enabled: false } });

    const otpauthUrl = authenticator.keyuri(req.user.email, 'VandeInspect AI', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    await logAction({ userId: req.user.id, action: '2FA_SETUP_STARTED', ip: req.ip });
    return { secret, otpauth_url: otpauthUrl, qr_data_url: qrDataUrl };
  });

  // POST /api/auth/2fa/verify { code } — confirms the code matches, flips totp_enabled on
  fastify.post('/2fa/verify', { preHandler: authenticate }, async (req, reply) => {
    const { code } = req.body || {};
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });

    if (!user.totp_secret) {
      reply.status(400);
      return { error: 'Call /2fa/setup first' };
    }

    const ok = authenticator.verify({ token: code, secret: user.totp_secret });
    if (!ok) {
      reply.status(400);
      return { error: 'Invalid code' };
    }

    await prisma.user.update({ where: { id: req.user.id }, data: { totp_enabled: true } });
    await logAction({ userId: req.user.id, action: '2FA_ENABLED', ip: req.ip });
    return { success: true, totp_enabled: true };
  });

  // POST /api/auth/2fa/disable
  fastify.post('/2fa/disable', { preHandler: authenticate }, async (req) => {
    await prisma.user.update({ where: { id: req.user.id }, data: { totp_enabled: false, totp_secret: null } });
    await logAction({ userId: req.user.id, action: '2FA_DISABLED', ip: req.ip });
    return { success: true, totp_enabled: false };
  });
}

module.exports = authRoutes;
