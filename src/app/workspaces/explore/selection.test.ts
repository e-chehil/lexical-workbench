/**
 * Selection → learning target tests (PRODUCT_SPEC §3.1 acceptance 6, ADR-006).
 *
 * A status action must hit exactly the records the selected rows denote: `f:` for a Form, `lp:` for
 * a COCA PoS row, the Form for a headword/member row. Aggregates (family, CET entry) have no single
 * target and must be reported as skipped rather than silently mapped to something else.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { refs, type EntityRowDTO, type EntityKind, type EntityRef } from '../../../v2/index.ts';
import { refsBetween, targetForRow, targetsForRows, targetsToFormRefs } from './selection.ts';

const row = (ref: EntityRef, kind: EntityKind, formRef: EntityRef | null): Pick<EntityRowDTO, 'ref' | 'kind' | 'formRef'> => ({
  ref,
  kind,
  formRef,
});

test('selection: each kind maps to the same target `defaultTargetFor` would produce', () => {
  assert.equal(targetForRow(row('f:work', 'form', 'f:work')), 'f:work');
  assert.equal(targetForRow(row('coca2020:hw:work', 'coca_headword', 'f:work')), 'f:work');
  assert.equal(targetForRow(row('bnc25k:mem:work|worked', 'bnc_member', 'f:worked')), 'f:worked');
  assert.equal(targetForRow(row('coca2020:lp:work|noun', 'coca_lemma_pos', 'f:work')), 'lp:work|noun');
  // Printed uppercase headwords keep their case in the ref but the target key is lowercased.
  assert.equal(targetForRow(row('coca2020:lp:TRUE|adjective', 'coca_lemma_pos', 'f:true')), 'lp:true|adjective');
  // Aggregates have no single target.
  assert.equal(targetForRow(row('bnc25k:fam:work', 'bnc_family', null)), null);
  assert.equal(targetForRow(row('cet2016:ent:work', 'cet_entry', null)), null);
});

test('selection: rows collapse to distinct targets and aggregates are reported', () => {
  const rows = [
    row('coca2020:hw:work', 'coca_headword', 'f:work'),
    row('f:work', 'form', 'f:work'),
    row('coca2020:lp:work|noun', 'coca_lemma_pos', 'f:work'),
    row('bnc25k:fam:work', 'bnc_family', null),
    row('cet2016:ent:work', 'cet_entry', null),
  ];

  const mapping = targetsForRows(rows);
  assert.deepEqual(mapping.targets, ['f:work', 'lp:work|noun']);
  assert.deepEqual(mapping.skipped, ['bnc25k:fam:work', 'cet2016:ent:work']);
});

test('selection: three mastered rows become three records with one batch (acceptance 6 shape)', () => {
  const rows = [
    row(refs.form('work'), 'form', refs.form('work')),
    row(refs.form('worked'), 'form', refs.form('worked')),
    row(refs.form('works'), 'form', refs.form('works')),
  ];
  const { targets, skipped } = targetsForRows(rows);
  assert.deepEqual(targets, ['f:work', 'f:worked', 'f:works']);
  assert.equal(skipped.length, 0);
  assert.equal(new Set(targets).size, 3, 'three distinct targets, one batch id at the store');
});

test('selection: Shift range is inclusive, clamped and order-independent', () => {
  const refsList = ['f:a', 'f:b', 'f:c', 'f:d'];
  assert.deepEqual(refsBetween(refsList, 1, 2), ['f:b', 'f:c']);
  assert.deepEqual(refsBetween(refsList, 2, 1), ['f:b', 'f:c']);
  assert.deepEqual(refsBetween(refsList, -5, 1), ['f:a', 'f:b']);
  assert.deepEqual(refsBetween(refsList, 3, 99), ['f:d']);
  assert.deepEqual(refsBetween([], 0, 3), []);
});

test('selection: a PoS target projects to its Form for collection comparison', () => {
  assert.deepEqual(targetsToFormRefs(['f:work', 'lp:work|noun', 'lp:work|verb']), ['f:work', 'f:work', 'f:work']);
});
