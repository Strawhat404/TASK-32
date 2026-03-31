import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADMIN_IDLE_TIMEOUT_MINUTES,
  isAdminSessionExpired,
  lockoutUntil,
  shouldLockout,
} from '../backend/src/security.js';

test('locks out only when attempts reach threshold', () => {
  assert.equal(shouldLockout(4), false);
  assert.equal(shouldLockout(5), true);
});

test('lockoutUntil adds 15 minutes', () => {
  const base = new Date('2026-03-30T10:00:00Z');
  const until = lockoutUntil(base);
  assert.equal(until.toISOString(), '2026-03-30T10:15:00.000Z');
});

test('admin idle timeout uses 20 minute threshold', () => {
  const now = new Date('2026-03-30T10:30:00Z');
  const activeAt = new Date('2026-03-30T10:11:00Z');
  const staleAt = new Date('2026-03-30T10:09:00Z');

  assert.equal(ADMIN_IDLE_TIMEOUT_MINUTES, 20);
  assert.equal(isAdminSessionExpired(activeAt, now), false);
  assert.equal(isAdminSessionExpired(staleAt, now), true);
});
