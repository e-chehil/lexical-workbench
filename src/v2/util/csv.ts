/**
 * RFC 4180 CSV helpers (moved from the v1 utility layer for T11 export).
 *
 * - `splitCsvRecords` keeps newlines inside quoted fields;
 * - `parseCsvLine` auto-detects tab or comma outside quotes;
 * - `escapeCsvField` quotes only when required and doubles embedded quotes.
 */

export function splitCsvRecords(rawText: string): string[] {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const records: string[] = [];
  let current = '';
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuotes) {
      current += ch;
      if (ch === '"') {
        if (i + 1 < normalized.length && normalized[i + 1] === '"') {
          current += normalized[i + 1];
          i++;
        } else {
          inQuotes = false;
          atFieldStart = false;
        }
      }
    } else if (ch === '"' && atFieldStart) {
      inQuotes = true;
      atFieldStart = false;
      current += ch;
    } else if (ch === '\n') {
      records.push(current);
      current = '';
      atFieldStart = true;
    } else if (ch === ',' || ch === '\t') {
      current += ch;
      atFieldStart = true;
    } else {
      if (ch !== ' ') atFieldStart = false;
      current += ch;
    }
  }
  if (current.length > 0) records.push(current);
  return records;
}

export function parseCsvLine(line: string, delimiter?: ',' | '\t'): string[] {
  let effectiveDelimiter: ',' | '\t' = delimiter || ',';
  if (!delimiter) {
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === '\t') {
        effectiveDelimiter = '\t';
        break;
      }
    }
  }

  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }
    if (ch === '"' && current.trim() === '') {
      inQuotes = true;
      current = '';
      i++;
      continue;
    }
    if (ch === effectiveDelimiter) {
      fields.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += ch;
    i++;
  }
  fields.push(current.trim());
  return fields;
}

export function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** One CSV document line, fields escaped. */
export function csvRow(values: readonly (string | number | null | undefined)[]): string {
  return values.map(escapeCsvField).join(',');
}

/** Full document with a UTF-8 BOM so spreadsheet apps open Chinese headers correctly. */
export function buildCsv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return `\uFEFF${[csvRow(header), ...rows.map(csvRow)].join('\r\n')}\r\n`;
}
