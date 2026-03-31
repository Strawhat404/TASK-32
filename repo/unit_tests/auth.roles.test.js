import test from 'node:test';
import assert from 'node:assert/strict';
import { roleLabelFor, roleMatches } from '../backend/src/roles.js';

test('role labels map internal backend roles to prompt-facing names', () => {
  assert.equal(roleLabelFor('admin'), 'Administrator');
  assert.equal(roleLabelFor('host'), 'Store Manager');
  assert.equal(roleLabelFor('user'), 'Customer/Member');
  assert.equal(roleLabelFor('Administrator'), 'Administrator');
});

test('role matching accepts prompt-facing aliases for authorization checks', () => {
  assert.equal(roleMatches('host', ['Store Manager']), true);
  assert.equal(roleMatches('user', ['Customer/Member']), true);
  assert.equal(roleMatches('Store Manager', ['Store Manager']), true);
  assert.equal(roleMatches('moderator', ['Administrator']), false);
});
