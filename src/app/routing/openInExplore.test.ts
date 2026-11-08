/**
 * "Open in Explore" mapping tests (PRODUCT_SPEC §2 universal contract).
 *
 * A set of entities must always produce the same query: the shared kind when the refs agree,
 * the Form hub when they cross sources, and `in_refs` in both cases so the result set is exact.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { commonKind, queryForRefs, routeForQuery, routeForRefs } from './openInExplore.ts';
import { decodeRoute, encodeRoute } from './codec.ts';

test('openInExplore: one kind keeps that kind, mixed kinds project to the Form hub', () => {
  assert.equal(commonKind(['bnc25k:mem:go|went', 'bnc25k:mem:go|goes']), 'bnc_member');
  assert.equal(commonKind(['f:work', 'coca2020:hw:work']), null);
  assert.equal(commonKind([]), null);

  assert.deepEqual(queryForRefs(['bnc25k:mem:go|went']), {
    kind: 'bnc_member',
    filters: [{ type: 'in_refs', refs: ['bnc25k:mem:go|went'] }],
  });
  assert.deepEqual(queryForRefs(['f:work', 'cet2016:ent:work']), {
    kind: 'form',
    filters: [{ type: 'in_refs', refs: ['f:work', 'cet2016:ent:work'] }],
  });
  assert.deepEqual(queryForRefs(['f:work'], 'form'), { kind: 'form', filters: [{ type: 'in_refs', refs: ['f:work'] }] });
});

test('openInExplore: an empty set stays linkable and selects nothing', () => {
  const query = queryForRefs([]);
  assert.equal(query.kind, 'form');
  assert.deepEqual(query.filters, [{ type: 'in_refs', refs: [] }]);
});

test('openInExplore: routes land on Explore and survive the codec', () => {
  const route = routeForRefs(['bnc25k:fam:go']);
  assert.equal(route.workspace, 'explore');
  assert.deepEqual(decodeRoute(encodeRoute(route)), route);

  const dynamic = routeForQuery({ kind: 'cet_entry', filters: [{ type: 'cet_level', levels: ['CET6'] }] });
  assert.deepEqual(decodeRoute(encodeRoute(dynamic)), dynamic);
});
