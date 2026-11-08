/**
 * Lexical Workbench 2.0 — identifiers and spelling keys.
 *
 * ADR-003: every identifier is derived from source-defined spellings, never from file line
 * numbers, array positions or frequency ranks. See docs/v2/ARCHITECTURE.md §4.
 */

export type SourceId = 'coca2020' | 'bnc25k' | 'cet2016';

export const SOURCE_IDS: readonly SourceId[] = ['coca2020', 'bnc25k', 'cet2016'];

/** Entity kinds addressable by the query protocol. */
export type EntityKind =
  | 'form'
  | 'coca_headword'
  | 'coca_lemma_pos'
  | 'bnc_family'
  | 'bnc_member'
  | 'cet_entry';

export const ENTITY_KINDS: readonly EntityKind[] = [
  'form',
  'coca_headword',
  'coca_lemma_pos',
  'bnc_family',
  'bnc_member',
  'cet_entry',
];

/**
 * String reference to any entity. Always build with `refs.*` and decode with `parseRef`.
 * Format (prefix is fixed, remainder is the key):
 *   f:<formKey>                         Form (cross-source spelling hub)
 *   coca2020:hw:<raw headword>          COCA source headword
 *   coca2020:lp:<raw headword>|<pos>    COCA headword + PoS record
 *   bnc25k:fam:<family headword>        BNC/COCA 25k word family
 *   bnc25k:mem:<family headword>|<form> BNC family membership slot
 *   cet2016:ent:<headword display>      CET2016 official entry (line)
 * Learning targets additionally use:
 *   lp:<formKey>|<pos>                  source-neutral lemma+PoS learning target
 */
export type EntityRef = string;

/** A learning target is either a Form ref (`f:`) or a lemma+PoS target ref (`lp:`). */
export type TargetRef = `f:${string}` | `lp:${string}`;

const PREFIX: Record<EntityKind, string> = {
  form: 'f:',
  coca_headword: 'coca2020:hw:',
  coca_lemma_pos: 'coca2020:lp:',
  bnc_family: 'bnc25k:fam:',
  bnc_member: 'bnc25k:mem:',
  cet_entry: 'cet2016:ent:',
};

/** Characters reserved as separators inside composite keys. */
export const KEY_SEPARATOR = '|';

/**
 * Form key: the cross-source orthographic identity.
 * NFC → trim → collapse internal whitespace → locale-independent lowercase.
 * Diacritics, hyphens, apostrophes, slashes and ampersands are PRESERVED
 * (café ≠ cafe, e-mail ≠ email; such pairs become *candidate* relations only).
 */
export function formKey(surface: string): string {
  return surface.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Search key: formKey with combining diacritics removed. ONLY for text search and
 * candidate detection; never used as an identity.
 */
export function searchKey(surface: string): string {
  return formKey(surface).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
}

function assertNoSeparator(part: string, what: string): void {
  if (part.includes(KEY_SEPARATOR)) {
    throw new Error(`${what} "${part}" contains reserved separator "${KEY_SEPARATOR}"`);
  }
}

export const refs = {
  form(surfaceOrKey: string): EntityRef {
    return PREFIX.form + formKey(surfaceOrKey);
  },
  cocaHeadword(rawHeadword: string): EntityRef {
    return PREFIX.coca_headword + rawHeadword;
  },
  cocaLemmaPos(rawHeadword: string, pos: string): EntityRef {
    assertNoSeparator(rawHeadword, 'COCA headword');
    return `${PREFIX.coca_lemma_pos}${rawHeadword}${KEY_SEPARATOR}${pos}`;
  },
  bncFamily(familyHeadword: string): EntityRef {
    return PREFIX.bnc_family + familyHeadword;
  },
  bncMember(familyHeadword: string, form: string): EntityRef {
    assertNoSeparator(familyHeadword, 'BNC family headword');
    return `${PREFIX.bnc_member}${familyHeadword}${KEY_SEPARATOR}${form}`;
  },
  cetEntry(headwordDisplay: string): EntityRef {
    return PREFIX.cet_entry + headwordDisplay.normalize('NFC');
  },
  formTarget(surfaceOrKey: string): TargetRef {
    return `f:${formKey(surfaceOrKey)}`;
  },
  lemmaPosTarget(surfaceOrKey: string, pos: string): TargetRef {
    const key = formKey(surfaceOrKey);
    assertNoSeparator(key, 'lemma key');
    return `lp:${key}${KEY_SEPARATOR}${pos}`;
  },
};

export interface ParsedRef {
  kind: EntityKind | 'lemma_pos_target';
  /** Everything after the prefix. */
  key: string;
  /** Composite parts: [headword, pos] / [familyHeadword, form] / [formKey, pos]. */
  parts: string[];
}

export function parseRef(ref: string): ParsedRef {
  if (ref.startsWith('lp:')) {
    const key = ref.slice(3);
    return { kind: 'lemma_pos_target', key, parts: splitOnce(key) };
  }
  for (const kind of ENTITY_KINDS) {
    const p = PREFIX[kind];
    if (ref.startsWith(p)) {
      const key = ref.slice(p.length);
      const composite = kind === 'coca_lemma_pos' || kind === 'bnc_member';
      return { kind, key, parts: composite ? splitOnce(key) : [key] };
    }
  }
  throw new Error(`Unrecognised entity ref: ${ref}`);
}

export function kindOf(ref: string): EntityKind {
  const parsed = parseRef(ref);
  if (parsed.kind === 'lemma_pos_target') {
    throw new Error(`${ref} is a learning target ref, not an entity ref`);
  }
  return parsed.kind;
}

function splitOnce(key: string): string[] {
  const i = key.indexOf(KEY_SEPARATOR);
  return i < 0 ? [key] : [key.slice(0, i), key.slice(i + 1)];
}
