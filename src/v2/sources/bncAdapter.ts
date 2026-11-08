/**
 * BNC/COCA 25k word-family list adapter (v2).
 *
 * Fixes the legacy parseBncCoca hazard: when a family headword is absent from its own member
 * list, v1 inserted the headword as a member carrying the FAMILY total as its form frequency.
 * v2 never fabricates a member; it records `headwordIsMember=false` and a diagnostic.
 */
import { formKey, refs } from '../domain/ids.ts';
import { SourceFormatError, type BncFamily, type BncMember, type BncSnapshot, type SourceDiagnostic } from '../domain/types.ts';

const MEMBER_ITEM = /^(.*?)\s*\((\d+)\)$/;

export function parseBncFamilies(rawText: string): BncSnapshot {
  const lines = rawText.replace(/^\uFEFF/, '').split(/\r?\n/);
  const families: BncFamily[] = [];
  const members: BncMember[] = [];
  const diagnostics: SourceDiagnostic[] = [];
  const diag = (severity: SourceDiagnostic['severity'], code: string, message: string, subject?: string) =>
    diagnostics.push({ source: 'bnc25k', severity, code, message, subject });
  const seenFamily = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && /^list\b/i.test(line)) continue; // header
    const cols = line.split('\t');
    if (cols.length < 4) {
      diag('error', 'bnc.malformed_line', `expected 4 tab-separated columns, got ${cols.length}`, line.slice(0, 80));
      continue;
    }
    const bandLabel = cols[0].trim();
    const bandMatch = /^(\d+)k$/i.exec(bandLabel);
    const headword = cols[1].trim();
    const totalText = cols[3].trim();
    if (!bandMatch || !headword || !/^\d+$/.test(totalText)) {
      diag('error', 'bnc.malformed_line', 'invalid band, headword or total', line.slice(0, 80));
      continue;
    }
    if (seenFamily.has(headword)) {
      diag('error', 'bnc.duplicate_family', 'family headword repeated; later line skipped', headword);
      continue;
    }
    seenFamily.add(headword);
    const band = Number(bandMatch[1]);
    const totalFrequency = Number(totalText);
    const famRef = refs.bncFamily(headword);
    const relatedRaw = cols[2].trim().replace(/^"|"$/g, '');
    const famMembers: BncMember[] = [];
    const seenForm = new Set<string>();
    let memberFrequencySum = 0;

    for (const item of relatedRaw ? relatedRaw.split(/,\s*/) : []) {
      const m = MEMBER_ITEM.exec(item.trim());
      if (!m) {
        diag('error', 'bnc.unparsed_member', `cannot parse member "${item}"`, headword);
        continue;
      }
      const form = m[1].trim();
      const fk = formKey(form);
      if (seenForm.has(fk)) {
        // Never sum: two printed values for one spelling inside one family is a source anomaly.
        diag('warning', 'bnc.duplicate_member', `form "${form}" repeated within family; later value ignored`, headword);
        continue;
      }
      seenForm.add(fk);
      const frequency = Number(m[2]);
      memberFrequencySum += frequency;
      famMembers.push({
        ref: refs.bncMember(headword, form),
        familyRef: famRef,
        formRef: refs.form(form),
        form,
        frequency,
        isFamilyHeadword: form === headword,
      });
    }

    const headwordIsMember = famMembers.some((mm) => mm.isFamilyHeadword);
    if (!headwordIsMember) {
      diag(
        'warning',
        'bnc.headword_not_member',
        'family headword is not printed in its member list; no member created and no frequency attributed to it',
        headword
      );
    }
    if (memberFrequencySum !== totalFrequency) {
      diag('warning', 'bnc.sum_mismatch', `member sum ${memberFrequencySum} ≠ official total ${totalFrequency}`, headword);
    }
    families.push({
      ref: famRef,
      formRef: refs.form(headword),
      headword,
      band,
      bandLabel,
      totalFrequency,
      memberFrequencySum,
      headwordIsMember,
      memberRefs: famMembers.map((mm) => mm.ref),
    });
    members.push(...famMembers);
  }
  if (families.length === 0) throw new SourceFormatError('bnc25k', 'no valid family lines found');
  return { source: 'bnc25k', families, members, diagnostics };
}
