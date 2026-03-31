import crypto from 'crypto';
import argon2 from 'argon2';
import { query } from './db.js';
import {
  isAdminSessionExpired,
  lockoutUntil,
  shouldLockout,
} from './security.js';
import { roleLabelFor, roleMatches } from './roles.js';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function login(username, password) {
  const userRes = await query(
    `
    SELECT u.id, u.username, u.password_hash, u.failed_attempts, u.locked_until, u.is_active,
           r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.username = $1
    `,
    [username]
  );

  if (!userRes.rows.length) {
    return { ok: false, statusCode: 401, message: 'Invalid credentials' };
  }

  const user = userRes.rows[0];
  const now = new Date();
  if (!user.is_active) {
    return { ok: false, statusCode: 403, message: 'User disabled' };
  }

  if (user.locked_until && new Date(user.locked_until) > now) {
    return {
      ok: false,
      statusCode: 423,
      message: 'Account temporarily locked',
      lockedUntil: user.locked_until,
    };
  }

  const valid = await argon2.verify(user.password_hash, password);
  if (!valid) {
    const nextAttempts = Number(user.failed_attempts || 0) + 1;
    const lockUntil = shouldLockout(nextAttempts) ? lockoutUntil(now) : null;
    await query(
      `UPDATE users
       SET failed_attempts = $2,
           locked_until = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, nextAttempts, lockUntil]
    );
    return { ok: false, statusCode: 401, message: 'Invalid credentials' };
  }

  await query(
    `UPDATE users
     SET failed_attempts = 0,
         locked_until = NULL,
         last_login_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [user.id]
  );

  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const sessionRes = await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [user.id, tokenHash, expiresAt]
  );

  return {
    ok: true,
    token: rawToken,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      role_label: roleLabelFor(user.role),
    },
    sessionId: sessionRes.rows[0].id,
  };
}

export async function authenticate(request, reply) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing auth token' });
    return;
  }

  const rawToken = authHeader.slice(7).trim();
  const tokenHash = hashToken(rawToken);
  const sessionRes = await query(
    `
    SELECT s.id AS session_id, s.user_id, s.last_activity_at, s.expires_at, s.revoked_at,
           u.username, u.is_active, r.name AS role
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    JOIN roles r ON r.id = u.role_id
    WHERE s.token_hash = $1
    `,
    [tokenHash]
  );

  if (!sessionRes.rows.length) {
    reply.code(401).send({ error: 'Invalid session' });
    return;
  }

  const session = sessionRes.rows[0];
  const now = new Date();
  if (!session.is_active || session.revoked_at || new Date(session.expires_at) < now) {
    reply.code(401).send({ error: 'Session expired' });
    return;
  }

  if (roleMatches(session.role, ['Administrator']) && isAdminSessionExpired(session.last_activity_at, now)) {
    await query('UPDATE user_sessions SET revoked_at = NOW() WHERE id = $1', [
      session.session_id,
    ]);
    reply.code(401).send({ error: 'Admin idle timeout exceeded' });
    return;
  }

  await query('UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1', [
    session.session_id,
  ]);

  request.user = {
    id: session.user_id,
    username: session.username,
    role: session.role,
    role_label: roleLabelFor(session.role),
    sessionId: session.session_id,
  };
}

export function authorize(roles = []) {
  return async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Unauthenticated' });
    }
    if (!roleMatches(request.user.role, roles)) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
  };
}

export async function revokeSession(token) {
  const tokenHash = hashToken(token);
  await query('UPDATE user_sessions SET revoked_at = NOW() WHERE token_hash = $1', [
    tokenHash,
  ]);
}

export async function audit(actorUserId, action, entityType, entityId, details = {}) {
  await query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [actorUserId, action, entityType, String(entityId), details]
  );
}
