import fs from 'fs/promises';

export const MAX_CSV_SIZE_BYTES = 20 * 1024 * 1024;

export async function readCsvFile(path) {
  const st = await fs.stat(path);
  if (st.size > MAX_CSV_SIZE_BYTES) {
    throw new Error('CSV file exceeds 20MB limit');
  }
  return fs.readFile(path, 'utf8');
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map((x) => x.trim());
  const rows = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(',').map((x) => x.trim());
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows, headers) {
  const h = headers.join(',');
  const body = rows.map((r) => headers.map((k) => String(r[k] ?? '')).join(',')).join('\n');
  return `${h}\n${body}\n`;
}
