/**
 * CET2016 syllabus adapter (v2). Reuses the battle-tested v1 token expansion
 * (src/data/parser.ts → parseCet2016) and maps it onto v2 entities.
 */
import { parseCet2016 } from '../../data/parser.ts';
import { refs } from '../domain/ids.ts';
import { SourceFormatError, type CetEntry, type CetFormLink, type CetSnapshot, type SourceDiagnostic } from '../domain/types.ts';

export function parseCetSyllabus(rawText: string): CetSnapshot {
  const { entries: legacy } = parseCet2016(rawText);
  if (legacy.length === 0) throw new SourceFormatError('cet2016', 'no entries found');
  const diagnostics: SourceDiagnostic[] = [];
  const seen = new Set<string>();
  const entries: CetEntry[] = [];

  for (const e of legacy) {
    const ref = refs.cetEntry(e.headwordDisplay);
    if (seen.has(ref)) {
      diagnostics.push({
        source: 'cet2016',
        severity: 'error',
        code: 'cet.duplicate_entry_key',
        message: 'two entries share the same headword display; later entry skipped',
        subject: e.headwordDisplay,
      });
      continue;
    }
    seen.add(ref);
    const links: CetFormLink[] = [];
    const seenForm = new Set<string>();
    for (const m of e.members) {
      m.expandedForms.forEach((surface, idx) => {
        const formRef = refs.form(surface);
        // Same spelling may be produced twice on one line (e.g. by expansion); keep first role.
        if (seenForm.has(formRef)) return;
        seenForm.add(formRef);
        links.push({
          entryRef: ref,
          formRef,
          surface,
          rawMember: m.rawText,
          role: m.isRepresentative ? (idx === 0 ? 'headword' : 'variant') : idx === 0 ? 'derivative' : 'variant',
          level: m.isCet6Star ? 'CET6' : 'CET4',
          homographNumber: m.homographNumber,
          expansionRule: m.expansionRule,
        });
      });
    }
    entries.push({ ref, display: e.headwordDisplay, level: e.level, rawLine: e.rawLine, links });
  }
  return { source: 'cet2016', entries, diagnostics };
}
