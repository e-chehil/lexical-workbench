/**
 * Lexical Workbench 2.0 — in-memory lexical index.
 *
 * Builds the Form hub, typed adjacency, and the columnar ObservationStore (official + derived
 * metrics) from source snapshots. Pure TypeScript: no DOM, no IndexedDB — runnable in a
 * Web Worker, Node tests and scripts alike.
 */
import { formKey, kindOf, refs, searchKey, type EntityKind, type EntityRef, type SourceId } from '../domain/ids.ts';
import { createObservationStore, METRICS, type MetricId, type ObservationStore } from '../domain/metrics.ts';
import type {
  BncFamily,
  BncMember,
  BncSnapshot,
  CetEntry,
  CetSnapshot,
  CocaHeadword,
  CocaLemmaPosRecord,
  CocaSnapshot,
  FormNode,
  LexicalRelation,
} from '../domain/types.ts';

export interface SourceSnapshots {
  coca?: CocaSnapshot;
  bnc?: BncSnapshot;
  cet?: CetSnapshot;
}

export class LexicalIndex {
  readonly forms = new Map<EntityRef, FormNode>();
  readonly cocaRecords = new Map<EntityRef, CocaLemmaPosRecord>();
  readonly cocaHeadwords = new Map<EntityRef, CocaHeadword>();
  readonly bncFamilies = new Map<EntityRef, BncFamily>();
  readonly bncMembers = new Map<EntityRef, BncMember>();
  readonly cetEntries = new Map<EntityRef, CetEntry>();
  readonly obs: ObservationStore = createObservationStore();
  readonly snapshots: SourceSnapshots;

  private searchKeyIndex: Map<string, EntityRef[]> | null = null;

  constructor(snapshots: SourceSnapshots) {
    this.snapshots = snapshots;
    if (snapshots.coca) this.ingestCoca(snapshots.coca);
    if (snapshots.bnc) this.ingestBnc(snapshots.bnc);
    if (snapshots.cet) this.ingestCet(snapshots.cet);
  }

  // ------------------------------------------------------------------ ingest

  private formNode(surface: string, source: SourceId): FormNode {
    const ref = refs.form(surface);
    let node = this.forms.get(ref);
    if (!node) {
      node = {
        ref,
        key: formKey(surface),
        surfaces: [],
        cocaHeadwordRef: null,
        bncMemberRefs: [],
        bncFamilyHeadedRef: null,
        cetLinks: [],
      };
      this.forms.set(ref, node);
    }
    if (!node.surfaces.some((s) => s.source === source && s.surface === surface)) {
      node.surfaces.push({ source, surface });
    }
    return node;
  }

  private ingestCoca(coca: CocaSnapshot): void {
    const o = this.obs;
    for (const r of coca.records) {
      this.cocaRecords.set(r.ref, r);
      o['coca2020.lp_freq'].set(r.ref, r.freq);
      o['coca2020.lp_rank'].set(r.ref, r.rank);
    }
    const ranked: { ref: EntityRef; sum: number; best: number }[] = [];
    for (const h of coca.headwords) {
      this.cocaHeadwords.set(h.ref, h);
      const node = this.formNode(h.headword, 'coca2020');
      node.cocaHeadwordRef ??= h.ref; // case collisions are reported by the adapter
      let sum = 0;
      let best = Infinity;
      for (const lp of h.lemmaPosRefs) {
        const rec = this.cocaRecords.get(lp)!;
        sum += rec.freq;
        best = Math.min(best, rec.rank);
      }
      o['coca2020.hw_freq_sum'].set(h.ref, sum);
      o['coca2020.hw_best_lp_rank'].set(h.ref, best);
      o['coca2020.hw_pos_count'].set(h.ref, h.lemmaPosRefs.length);
      for (const lp of h.lemmaPosRefs) {
        const rec = this.cocaRecords.get(lp)!;
        o['coca2020.lp_share_of_headword'].set(lp, sum > 0 ? rec.freq / sum : 0);
      }
      ranked.push({ ref: h.ref, sum, best });
    }
    // Derived headword rank: sum desc, tie → best official rank asc (unique ⇒ deterministic).
    ranked.sort((a, b) => b.sum - a.sum || a.best - b.best);
    ranked.forEach((r, i) => o['coca2020.hw_rank'].set(r.ref, i + 1));
  }

  private ingestBnc(bnc: BncSnapshot): void {
    const o = this.obs;
    for (const f of bnc.families) {
      this.bncFamilies.set(f.ref, f);
      o['bnc25k.family_total'].set(f.ref, f.totalFrequency);
      o['bnc25k.family_band'].set(f.ref, f.band);
      this.formNode(f.headword, 'bnc25k').bncFamilyHeadedRef = f.ref;
    }
    for (const m of bnc.members) {
      this.bncMembers.set(m.ref, m);
      o['bnc25k.member_freq'].set(m.ref, m.frequency);
      const fam = this.bncFamilies.get(m.familyRef)!;
      if (fam.totalFrequency > 0) o['bnc25k.member_share_of_family'].set(m.ref, m.frequency / fam.totalFrequency);
      this.formNode(m.form, 'bnc25k').bncMemberRefs.push(m.ref);
    }
  }

  private ingestCet(cet: CetSnapshot): void {
    for (const e of cet.entries) {
      this.cetEntries.set(e.ref, e);
      for (const link of e.links) this.formNode(link.surface, 'cet2016').cetLinks.push(link);
    }
  }

  // ------------------------------------------------------------------ lookup

  has(ref: EntityRef): boolean {
    return this.mapFor(kindOf(ref)).has(ref);
  }

  /** All refs of a kind in deterministic source order. */
  listRefs(kind: EntityKind): EntityRef[] {
    return Array.from(this.mapFor(kind).keys());
  }

  getForm(surfaceOrKey: string): FormNode | undefined {
    return this.forms.get(refs.form(surfaceOrKey));
  }

  sourcesOfForm(formRef: EntityRef): Set<SourceId> {
    const n = this.forms.get(formRef);
    const s = new Set<SourceId>();
    if (!n) return s;
    if (n.cocaHeadwordRef) s.add('coca2020');
    if (n.bncMemberRefs.length) s.add('bnc25k');
    if (n.cetLinks.length) s.add('cet2016');
    return s;
  }

  /** Human label for any ref (raw source spelling, never a computed name). */
  label(ref: EntityRef): string {
    switch (kindOf(ref)) {
      case 'form': {
        const n = this.forms.get(ref);
        return n ? n.surfaces[0]?.surface ?? n.key : ref;
      }
      case 'coca_headword':
        return this.cocaHeadwords.get(ref)?.headword ?? ref;
      case 'coca_lemma_pos': {
        const r = this.cocaRecords.get(ref);
        return r ? `${r.headword} (${r.pos})` : ref;
      }
      case 'bnc_family':
        return this.bncFamilies.get(ref)?.headword ?? ref;
      case 'bnc_member': {
        const m = this.bncMembers.get(ref);
        return m ? `${m.form} ∈ ${this.bncFamilies.get(m.familyRef)?.headword}` : ref;
      }
      case 'cet_entry':
        return this.cetEntries.get(ref)?.display ?? ref;
    }
  }

  /** Raw observation attached directly to `ref`. null = not observed (never coerced to 0). */
  getObservation(metric: MetricId, ref: EntityRef): number | null {
    return this.obs[metric].get(ref) ?? null;
  }

  /**
   * Metric value for an entity of ANY kind using the documented lift rules
   * (docs/v2/CONTRACTS.md §5.3). Returns null when no rule applies.
   * Family totals are never lifted to forms or members.
   */
  metricValue(ref: EntityRef, metric: MetricId): number | null {
    const def = METRICS[metric];
    const kind = kindOf(ref);
    if (kind === def.targetKind) return this.getObservation(metric, ref);

    switch (kind) {
      case 'form': {
        const n = this.forms.get(ref);
        if (!n) return null;
        if (def.targetKind === 'coca_headword') return n.cocaHeadwordRef ? this.getObservation(metric, n.cocaHeadwordRef) : null;
        if (metric === 'bnc25k.family_band') {
          // min band over families that contain this form as a member
          let best: number | null = null;
          for (const mRef of n.bncMemberRefs) {
            const b = this.getObservation('bnc25k.family_band', this.bncMembers.get(mRef)!.familyRef);
            if (b !== null && (best === null || b < best)) best = b;
          }
          return best;
        }
        if (metric === 'bnc25k.member_freq') {
          // max over memberships; multi-membership is flagged in UI (grannies)
          let best: number | null = null;
          for (const mRef of n.bncMemberRefs) {
            const v = this.getObservation('bnc25k.member_freq', mRef);
            if (v !== null && (best === null || v > best)) best = v;
          }
          return best;
        }
        return null;
      }
      case 'coca_lemma_pos': {
        const r = this.cocaRecords.get(ref);
        if (!r) return null;
        if (def.targetKind === 'coca_headword') return this.getObservation(metric, r.headwordRef);
        return this.metricValue(r.formRef, metric);
      }
      case 'coca_headword': {
        const h = this.cocaHeadwords.get(ref);
        return h ? this.metricValue(h.formRef, metric) : null;
      }
      case 'bnc_member': {
        const m = this.bncMembers.get(ref);
        if (!m) return null;
        if (metric === 'bnc25k.family_band') return this.getObservation(metric, m.familyRef);
        if (def.source === 'coca2020') return this.metricValue(m.formRef, metric);
        return null;
      }
      case 'cet_entry': {
        const e = this.cetEntries.get(ref);
        const head = e?.links[0];
        if (!head) return null;
        return metric === 'bnc25k.member_freq' ? null : this.metricValue(head.formRef, metric);
      }
      case 'bnc_family':
        return null;
    }
  }

  // ------------------------------------------------------------------ relations

  /** Typed relations touching `ref`, generated from adjacency (source facts + computed). */
  getRelations(ref: EntityRef): LexicalRelation[] {
    const out: LexicalRelation[] = [];
    const kind = kindOf(ref);
    const spelling = (unit: EntityRef, surface: string, form: EntityRef, source: SourceId) =>
      out.push({
        type: surface === formKey(surface) ? 'spelling_exact' : 'spelling_casefold',
        from: unit,
        to: form,
        provenance: 'computed',
        source,
        evidence: surface,
      });
    if (kind === 'form') {
      const n = this.forms.get(ref);
      if (!n) return out;
      if (n.cocaHeadwordRef) spelling(n.cocaHeadwordRef, this.cocaHeadwords.get(n.cocaHeadwordRef)!.headword, ref, 'coca2020');
      for (const m of n.bncMemberRefs) spelling(m, this.bncMembers.get(m)!.form, ref, 'bnc25k');
      for (const l of n.cetLinks) spelling(l.entryRef, l.surface, ref, 'cet2016');
      out.push(...this.candidateRelationsOf(ref));
    } else if (kind === 'coca_headword') {
      for (const lp of this.cocaHeadwords.get(ref)?.lemmaPosRefs ?? [])
        out.push({ type: 'coca_headword_has_record', from: ref, to: lp, provenance: 'source', source: 'coca2020' });
    } else if (kind === 'bnc_family') {
      for (const m of this.bncFamilies.get(ref)?.memberRefs ?? [])
        out.push({ type: 'bnc_family_has_member', from: ref, to: m, provenance: 'source', source: 'bnc25k' });
    } else if (kind === 'cet_entry') {
      for (const l of this.cetEntries.get(ref)?.links ?? [])
        out.push({ type: 'cet_entry_has_form', from: ref, to: l.formRef, provenance: 'source', source: 'cet2016', evidence: l.role });
    }
    return out;
  }

  /** Candidate orthographic relations (diacritics / hyphenation). Never merged automatically. */
  candidateRelationsOf(formRef: EntityRef): LexicalRelation[] {
    const n = this.forms.get(formRef);
    if (!n) return [];
    const idx = this.getSearchKeyIndex();
    const out: LexicalRelation[] = [];
    for (const other of idx.get(searchKey(n.key)) ?? []) {
      if (other !== formRef) out.push({ type: 'candidate_diacritic_variant', from: formRef, to: other, provenance: 'candidate' });
    }
    if (n.key.includes('-')) {
      const joined = this.forms.get(refs.form(n.key.replace(/-/g, '')));
      if (joined) out.push({ type: 'candidate_hyphen_variant', from: formRef, to: joined.ref, provenance: 'candidate' });
    }
    return out;
  }

  private getSearchKeyIndex(): Map<string, EntityRef[]> {
    if (!this.searchKeyIndex) {
      const idx = new Map<string, EntityRef[]>();
      for (const n of this.forms.values()) {
        const k = searchKey(n.key);
        const list = idx.get(k);
        if (list) list.push(n.ref);
        else idx.set(k, [n.ref]);
      }
      this.searchKeyIndex = idx;
    }
    return this.searchKeyIndex;
  }

  /** Forms whose search key (diacritic-insensitive) equals the query's search key. */
  findFormsBySearchKey(text: string): EntityRef[] {
    return this.getSearchKeyIndex().get(searchKey(text)) ?? [];
  }

  private mapFor(kind: EntityKind): Map<EntityRef, unknown> {
    switch (kind) {
      case 'form':
        return this.forms;
      case 'coca_headword':
        return this.cocaHeadwords;
      case 'coca_lemma_pos':
        return this.cocaRecords;
      case 'bnc_family':
        return this.bncFamilies;
      case 'bnc_member':
        return this.bncMembers;
      case 'cet_entry':
        return this.cetEntries;
    }
  }
}

export function buildLexicalIndex(snapshots: SourceSnapshots): LexicalIndex {
  return new LexicalIndex(snapshots);
}
