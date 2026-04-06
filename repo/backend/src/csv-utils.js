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
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i+1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      current.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i+1] === '\n') i++;
      current.push(field);
      rows.push(current);
      field = '';
      current = [];
    } else {
      field += c;
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  if (!rows.length) return [];
  const headers = rows[0].map((x) => x.trim());
  const outRows = [];
  for (let j = 1; j < rows.length; j++) {
    if (rows[j].length === 1 && !rows[j][0]) continue; // Skip empty trailing lines
    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = (rows[j][idx] ?? '').trim();
    });
    outRows.push(rowObj);
  }
  return outRows;
}

export function toCsv(rows, headers) {
  const escapeField = (val) => {
    if (val == null) return '';
    const str = String(val);
    if (/[,\n\r"]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const h = headers.map(escapeField).join(',');
  const body = rows.map((r) => headers.map((k) => escapeField(r[k])).join(',')).join('\n');
  return `${h}\n${body}\n`;
}
