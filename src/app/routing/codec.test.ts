/**
 * Hash route codec tests (PRODUCT_SPEC §2).
 *
 * The codec is the only place that turns a `LexQuery` into a URL, so these tests pin the round
 * trip for real-world queries — including Unicode spellings, `in_refs` sets, metric sorts and
 * paging — and the fallbacks that keep a hand-edited link usable.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRoute, encodeRoute, isLexQuery, isSameRoute, isWorkspaceId, WORKSPACES, type AppRoute } from './codec.ts';
import type { LexQuery } from '../../v2/index.ts';

const ROUTE_CASES: { name: string; route: AppRoute }[] = [
  {
    name: 'plain workspace',
    route: { workspace: 'explore' },
  },
  {
    name: 'prefix text with paging and sort',
    route: {
      workspace: 'explore',
      query: {
        kind: 'form',
        text: { q: 'work', mode: 'prefix' },
        sort: [{ by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' }],
        page: { offset: 200, limit: 200 },
      },
    },
  },
  {
    name: 'Unicode diacritics (café)',
    route: {
      workspace: 'explore',
      query: { kind: 'form', text: { q: 'café', mode: 'exact' } },
      ref: 'f:café',
    },
  },
  {
    name: 'Unicode apostrophe and space (coup d’état)',
    route: {
      workspace: 'family',
      query: { kind: 'bnc_family', text: { q: "coup d'état", mode: 'contains' } },
    },
  },
  {
    name: 'static set (in_refs) crossing sources',
    route: {
      workspace: 'explore',
      query: {
        kind: 'form',
        filters: [{ type: 'in_refs', refs: ['f:work', 'bnc25k:fam:go', 'cet2016:ent:work'] }],
      },
      ref: 'bnc25k:fam:go',
    },
  },
  {
    name: 'metric range + learning status + aggregates',
    route: {
      workspace: 'study',
      query: {
        kind: 'coca_lemma_pos',
        filters: [
          { type: 'metric_range', metric: 'coca2020.lp_rank', max: 5000 },
          { type: 'learning_status', statuses: ['unrated', 'learning'], resolution: 'effective' },
        ],
        aggregates: [{ metric: 'coca2020.lp_freq', op: 'sum' }],
      },
    },
  },
  {
    name: 'COCA record with a printed pipe-free headword and Ref casing',
    route: {
      workspace: 'explore',
      query: { kind: 'coca_lemma_pos', text: { q: 'TRUE', mode: 'exact' } },
      ref: 'coca2020:lp:TRUE|adjective',
    },
  },
];

test('codec: every route round-trips through the hash', () => {
  for (const { name, route } of ROUTE_CASES) {
    const encoded = encodeRoute(route);
    assert.ok(encoded.startsWith('#/'), `${name}: ${encoded}`);
    assert.deepEqual(decodeRoute(encoded), route, name);
    // URLs must be hash-only and free of spaces/percent-decoded surprises.
    assert.ok(!encoded.includes(' '), `${name}: no raw spaces`);
  }
});

test('codec: the encoded query is base64url and does not leak the raw JSON', () => {
  const route: AppRoute = { workspace: 'explore', query: { kind: 'form', text: { q: 'coup d\'état', mode: 'prefix' } } };
  const encoded = encodeRoute(route);
  const q = new URLSearchParams(encoded.split('?')[1]).get('q')!;
  assert.match(q, /^[A-Za-z0-9_-]+$/, 'base64url alphabet only');
  assert.ok(!decodeURIComponent(encoded).includes('coup'), 'readable spellings are not in the URL');
});

test('codec: unknown or empty input falls back to Explore', () => {
  assert.deepEqual(decodeRoute('#/nope'), { workspace: 'explore' });
  assert.deepEqual(decodeRoute(''), { workspace: 'explore' });
  assert.deepEqual(decodeRoute(undefined), { workspace: 'explore' });
  assert.deepEqual(decodeRoute('#/'), { workspace: 'explore' });
  assert.deepEqual(decodeRoute('#/EXPLORE'), { workspace: 'explore' });
  assert.deepEqual(decodeRoute('/study'), { workspace: 'study' }, 'accepts a hash without the leading #');
  assert.ok(WORKSPACES.every((w) => isWorkspaceId(w)));
  assert.ok(!isWorkspaceId('legacy'), 'the legacy app has been removed');
});

test('codec: a removed legacy route falls back to Explore', () => {
  assert.deepEqual(decodeRoute('#/legacy'), { workspace: 'explore' });
});

test('codec: unreadable query or ref is dropped instead of throwing', () => {
  assert.deepEqual(decodeRoute('#/explore?q=not-base64!!'), { workspace: 'explore' });
  assert.deepEqual(decodeRoute(`#/explore?q=${btoa('{not json')}`), { workspace: 'explore' });
  assert.deepEqual(decodeRoute(`#/explore?q=${toBase64Url(JSON.stringify({ kind: 'nope' }))}`), { workspace: 'explore' });
  assert.deepEqual(decodeRoute('#/explore?ref=%7Bbroken'), { workspace: 'explore' }, 'invalid ref is dropped');
  assert.deepEqual(decodeRoute('#/explore?ref=not-a-ref'), { workspace: 'explore' });
  // A valid ref next to an invalid query keeps the ref.
  assert.deepEqual(decodeRoute('#/explore?q=x&ref=f%3Awork'), { workspace: 'explore', ref: 'f:work' });
});

test('codec: query validation accepts the protocol and rejects wrong shapes', () => {
  assert.ok(isLexQuery({ kind: 'form' }));
  assert.ok(
    isLexQuery({
      kind: 'bnc_member',
      filters: [
        { type: 'metric_range', metric: 'bnc25k.member_freq', min: 10, max: 100 },
        { type: 'multi_family', value: true },
      ],
      sort: [{ by: 'spelling', dir: 'desc' }],
      page: { offset: 0, limit: 50 },
    })
  );
  assert.ok(!isLexQuery({ kind: 'form', text: { q: 'x', mode: 'fuzzy' } }));
  assert.ok(!isLexQuery({ kind: 'form', text: { mode: 'exact' } }));
  assert.ok(!isLexQuery({ kind: 'form', filters: [{ type: 'unknown_filter' }] }));
  assert.ok(!isLexQuery({ kind: 'form', sort: [{ by: 'metric', dir: 'asc' }] }), 'metric sort needs an id');
  // An id the registry does not know would throw inside a label renderer, so it is refused here.
  assert.ok(!isLexQuery({ kind: 'form', sort: [{ by: 'metric', metric: 'coca2020.hp_rank', dir: 'asc' }] }));
  assert.ok(!isLexQuery({ kind: 'form', filters: [{ type: 'metric_range', metric: 'nope.metric', max: 5 }] }));
  assert.ok(!isLexQuery({ kind: 'form', aggregates: [{ metric: 'nope.metric', op: 'sum' }] }));
  assert.ok(isLexQuery({ kind: 'form', sort: [{ by: 'metric', metric: 'coca2020.hw_rank', dir: 'asc' }] }));
  assert.ok(!isLexQuery({ kind: 'form', page: { offset: -1, limit: 10 } }));
  assert.ok(!isLexQuery({ kind: 'form', page: { offset: 0, limit: 1.5 } }));
  assert.ok(!isLexQuery([]));
  assert.ok(!isLexQuery(null));
});

test('codec: route equality ignores key order but keeps page state', () => {
  const a: AppRoute = { workspace: 'explore', query: { kind: 'form', page: { offset: 0, limit: 20 } } };
  const b: AppRoute = { workspace: 'explore', query: { page: { limit: 20, offset: 0 }, kind: 'form' } };
  assert.ok(isSameRoute(a, b), 'same state encoded twice must not create a history entry');
  assert.ok(!isSameRoute(a, { workspace: 'study', query: a.query }));
  assert.ok(!isSameRoute(a, { ...a, ref: 'f:work' }));
});

/** Local copy of the codec's base64url encoder for the malformed-input cases. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const textQuery: LexQuery = { kind: 'form', text: { q: 'x', mode: 'prefix' } };
assert.ok(isLexQuery(textQuery));
