import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dedupeReason } from '../backend/src/customer-dedupe.js';
import { encryptSensitive, decryptSensitive, maskPhone, normalizePhone } from '../backend/src/crypto-utils.js';

test('dedupe matches exact email', () => {
  const reason = dedupeReason({ email: 'a@x.com' }, { email: 'a@x.com' });
  assert.equal(reason, 'email');
});

test('dedupe matches normalized phone', () => {
  const reason = dedupeReason({ phone: '(555) 111-2222' }, { phone: '555-111-2222' });
  assert.equal(reason, 'normalized_phone');
  assert.equal(normalizePhone('(555) 111-2222'), '5551112222');
});

test('encryption and masking behave as expected', () => {
  const enc = encryptSensitive('123 Main St');
  assert.equal(typeof enc, 'string');
  assert.equal(enc.includes('123 Main St'), false);
  assert.equal(decryptSensitive(enc), '123 Main St');
  assert.equal(maskPhone('5551112222'), '***-***-2222');
});

test('crypto utils fail fast when APP_AES_KEY is missing', () => {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', "import './backend/src/crypto-utils.js'"],
    {
      cwd: new URL('..', import.meta.url),
      env: {},
      encoding: 'utf8',
    }
  );

  assert.equal(result.status === 0, false);
  assert.match(result.stderr, /APP_AES_KEY is required/);
});
