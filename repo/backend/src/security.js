export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const ADMIN_IDLE_TIMEOUT_MINUTES = 20;

export function shouldLockout(failedAttempts) {
  return failedAttempts >= MAX_FAILED_ATTEMPTS;
}

export function lockoutUntil(now = new Date()) {
  const until = new Date(now);
  until.setMinutes(until.getMinutes() + LOCKOUT_MINUTES);
  return until;
}

export function isAdminSessionExpired(lastActivityAt, now = new Date()) {
  if (!lastActivityAt) {
    return true;
  }
  const diffMs = now.getTime() - new Date(lastActivityAt).getTime();
  return diffMs > ADMIN_IDLE_TIMEOUT_MINUTES * 60 * 1000;
}
