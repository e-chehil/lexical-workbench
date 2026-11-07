/**
 * Formats an exact frequency value in a compact, scannable string for list rows
 * while preserving exact distinctions between >0, explicit 0, variant-linked null, and unmatched null.
 */
export function formatCompactFrequency(
  freq: number | null,
  inBnc?: boolean,
  bncLinkedViaVariant?: boolean
): string {
  if (freq === null) {
    if (bncLinkedViaVariant) {
      return '无独立频次';
    }
    return '未收录';
  }

  if (freq === 0) {
    return inBnc === false ? '未收录' : '0';
  }

  if (freq >= 1_000_000) {
    return `${(freq / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  if (freq >= 10_000) {
    return `${(freq / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return freq.toLocaleString();
}

/**
 * Computes the intra-family share percentage (0 - 100) for a word form.
 * Returns null if the word has no independent form frequency or if familyFrequency <= 0.
 */
export function getIntraFamilySharePct(
  formFrequency: number | null,
  familyFrequency: number | null,
  inBnc?: boolean,
  bncLinkedViaVariant?: boolean
): number | null {
  if (
    bncLinkedViaVariant ||
    inBnc === false ||
    formFrequency === null ||
    familyFrequency === null ||
    familyFrequency <= 0
  ) {
    return null;
  }
  const pct = (formFrequency / familyFrequency) * 100;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

/**
 * Formats a concise role + intra-family share summary for list views,
 * e.g. "词头 · 占族 63%" or "派生 · 占族 19%" or "变体关联 · 族3词".
 */
export function formatFamilyRoleAndShare(
  isHeadword: boolean,
  familyMemberCount: number | null,
  formFrequency: number | null,
  familyFrequency: number | null,
  inBnc?: boolean,
  bncLinkedViaVariant?: boolean
): string {
  if (!inBnc && !bncLinkedViaVariant && familyMemberCount === null) {
    return '大纲独立词';
  }
  if (bncLinkedViaVariant || formFrequency === null) {
    return `关联词族 · 族${familyMemberCount ?? 1}词`;
  }
  const roleLabel = isHeadword ? '词头' : '派生';
  const sharePct = getIntraFamilySharePct(
    formFrequency,
    familyFrequency,
    inBnc,
    bncLinkedViaVariant
  );
  if (sharePct !== null && (familyMemberCount ?? 1) > 1) {
    return `${roleLabel} · 占族 ${sharePct}%`;
  }
  return `${roleLabel} · 族${familyMemberCount ?? 1}词`;
}
