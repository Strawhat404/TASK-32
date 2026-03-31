import test from 'node:test';
import assert from 'node:assert/strict';
import { GRADE_THRESHOLDS, gradeForScore, mergeRounds, weightedAggregation } from '../backend/src/scoring.js';
import { parseExpiryDateToEndOfDay } from '../backend/src/coding-rule-utils.js';
import { scanContentForDlp } from '../backend/src/dlp.js';

test('weighted aggregation with average-fill', () => {
  const score = weightedAggregation({
    metrics: { a: 80, b: null },
    weights: { a: 0.7, b: 0.3 },
    strategy: 'average-fill',
  });
  assert.equal(score > 0, true);
});

test('multi-round merge averages rounds', () => {
  assert.equal(mergeRounds([70, 90]), 80);
});

test('grade mapping is deterministic', () => {
  assert.deepEqual(GRADE_THRESHOLDS[0], { min: 90, grade: 'A' });
  assert.equal(gradeForScore(95), 'A');
  assert.equal(gradeForScore(80), 'B');
  assert.equal(gradeForScore(70), 'C');
  assert.equal(gradeForScore(60), 'D');
  assert.equal(gradeForScore(59.99), 'F');
});

test('coding rule expiry snaps to 11:59 PM UTC', () => {
  const d = parseExpiryDateToEndOfDay('04/02/2026');
  assert.equal(d.toISOString(), '2026-04-02T23:59:00.000Z');
});

test('dlp scans ssn and malware signatures offline', () => {
  assert.equal(scanContentForDlp('SSN 123-45-6789').status, 'rejected');
  assert.equal(scanContentForDlp('X5O!P%@AP').status, 'quarantined');
  assert.equal(scanContentForDlp('normal content').status, 'accepted');
});
