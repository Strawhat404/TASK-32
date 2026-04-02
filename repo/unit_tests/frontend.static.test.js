import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_SRC = path.resolve(__dirname, '../frontend/src');

function readFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...readFiles(fullPath));
    } else if (/\.(js|svelte|ts|json|css|html)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

test('frontend contains no AuthView references', () => {
  const contents = readFiles(FRONTEND_SRC).map((file) => fs.readFileSync(file, 'utf8'));
  for (const content of contents) {
    assert.equal(/AuthView/.test(content), false);
  }
});

test('frontend API calls do not use localhost:3443 or absolute https API URLs', () => {
  const contents = readFiles(FRONTEND_SRC).map((file) => fs.readFileSync(file, 'utf8'));
  for (const content of contents) {
    assert.equal(/localhost:3443/.test(content), false);
    assert.equal(/https:\/\/[^"'`\s]*\/api/.test(content), false);
  }
});
