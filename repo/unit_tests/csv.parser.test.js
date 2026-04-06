import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseCsv, toCsv } from '../backend/src/csv-utils.js';

describe('CSV Parser', () => {
  test('handles basic CSV', () => {
    const text = 'id,name\n1,Alice\n2,Bob';
    assert.deepStrictEqual(parseCsv(text), [{ id: '1', name: 'Alice' }, { id: '2', name: 'Bob' }]);
  });

  test('handles quotes and commas', () => {
    const text = 'id,name,note\n1,"Alice, Jr.",hello\n2,Bob,"a ""quote"""';
    assert.deepStrictEqual(parseCsv(text), [
      { id: '1', name: 'Alice, Jr.', note: 'hello' },
      { id: '2', name: 'Bob', note: 'a "quote"' }
    ]);
  });

  test('handles newlines in quotes', () => {
    const text = 'id,note\n1,"hello\nworld"';
    assert.deepStrictEqual(parseCsv(text), [{ id: '1', note: 'hello\nworld' }]);
  });

  test('toCsv quotes fields when needed', () => {
    const rows = [{ id: '1', text: 'a,b\nc' }];
    assert.strictEqual(toCsv(rows, ['id', 'text']), 'id,text\n1,"a,b\nc"\n');
  });
});
