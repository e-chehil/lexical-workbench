/** RFC 4180 round-trip: commas, quotes, embedded newlines and Chinese survive. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, escapeCsvField, parseCsvLine, splitCsvRecords } from '../util/csv.ts';

test('CSV: escaping and parsing round-trip special fields', () => {
  const fields = ['plain', 'with, comma', 'with "quote"', 'line\nbreak', '中文，标签', ''];
  const line = fields.map(escapeCsvField).join(',');
  assert.deepEqual(parseCsvLine(line), fields.map((field) => field.trim()));
});

test('CSV: multiline records stay one record and tab-delimited input auto-detects', () => {
  const raw = 'a,"b\nc",d\r\n1\t2\t3\r\n';
  const records = splitCsvRecords(raw);
  assert.equal(records.length, 2);
  assert.deepEqual(parseCsvLine(records[0]), ['a', 'b\nc', 'd']);
  assert.deepEqual(parseCsvLine(records[1]), ['1', '2', '3']);
});

test('CSV: buildCsv writes a BOM, header and escaped rows', () => {
  const text = buildCsv(['target', 'label'], [['f:work', 'work, verb'], ['f:quote', 'say "hi"']]);
  assert.ok(text.startsWith('\uFEFF'));
  const records = splitCsvRecords(text.slice(1));
  assert.deepEqual(parseCsvLine(records[0]), ['target', 'label']);
  assert.deepEqual(parseCsvLine(records[1]), ['f:work', 'work, verb']);
  assert.deepEqual(parseCsvLine(records[2]), ['f:quote', 'say "hi"']);
});
