# Lexical Workbench 2.0 — Data Audit

> Every number in this file is produced by `npm run audit:v2` (`scripts/audit-v2.ts`), which parses the
> **complete** source files with the v2 adapters and writes the machine-readable result to
> `docs/v2/data-audit.generated.json`. The key figures are asserted in `src/v2/tests/*.test.ts`, so a
> change in data or adapters breaks the build instead of silently drifting.
>
> Labels used below: **[F] fact** = read directly from a source file; **[C] computed** = derived by our
> code with a stated rule; **[I] inference** = interpretation, not verified against an external authority.

Audit date: 2026-11-08. Branch `feat/lexical-workbench-v2`.

## 1. Source files

| Source id | File | Unit of a primary record |
| --- | --- | --- |
| `coca2020` | `public/data/coca_freq.json` (8,579,302 bytes, no BOM) | headword (lemma) + PoS |
| `bnc25k` | `public/data/BNC_COCA_lists.txt` | word family (headword + member word forms) |
| `cet2016` | `public/data/CET2016.txt` | official syllabus line (entry) with expanded spellings |

`coca_freq.json` was moved from the project root to `public/data/` so it is served and cached like the
other two lists.

## 2. COCA 2020 (top 60k lemma+PoS)

### 2.1 Structure and integrity [F]

| Check | Result |
| --- | --- |
| Root | JSON array of 53,951 objects, each exactly `{headword, content}` |
| Records | 60,000 objects, each exactly `{PoS, Rank, Freq}` |
| Types | `Rank` and `Freq` are **strings** in all 60,000 records; all match `^[0-9]+$` (0 invalid) |
| Distinct headwords | 53,951 (no headword repeated across objects) |
| Case collisions between headwords | 0 (no two headwords differ only by case) |
| Duplicate PoS within one headword | 0 |
| Rank | min 1, max 60,000, 60,000 distinct values → continuous, no gaps, no duplicates |
| Freq sum | 892,945,569 |
| Freq vs rank | monotone: 0 adjacent pairs where a larger rank has a larger Freq |
| Equal Freq | 48,173 adjacent rank pairs share the same Freq; the source still gives them distinct ranks (the tie order is the source's own and is kept) |
| Extremes | rank 1 `the` article 50,033,612; rank 60,000 `dustbuster` noun 45 |
| Ordering | objects are ordered by their best rank; `content` within an object is ordered by rank |
| Whitespace / empty / non-ASCII headwords | 0 / 0 / 0 |

Adapter diagnostics on the real file: 0 errors, 0 warnings, 6 `info:coca.uppercase_headword`.

### 2.2 PoS distribution [F counts, C shares]

| PoS (as printed) | Records | Freq sum | Share of 892,945,569 |
| --- | ---: | ---: | ---: |
| noun | 28,348 | 197,556,944 | 22.12% |
| verb | 5,917 | 177,114,763 | 19.83% |
| preposition | 181 | 99,308,492 | 11.12% |
| article | 17 | 91,781,119 | 10.28% |
| pronoun | 71 | 73,320,820 | 8.21% |
| adjective | 21,998 | 65,015,923 | 7.28% |
| adverb | 2,816 | 60,574,970 | 6.78% |
| conjunction | 62 | 55,764,457 | 6.25% |
| determiner | 41 | 31,231,960 | 3.50% |
| +infinitive | 3 | 16,771,837 | 1.88% |
| negation | 2 | 9,941,334 | 1.11% |
| number | 327 | 8,357,697 | 0.94% |
| interjection | 216 | 4,225,080 | 0.47% |
| existential | 1 | 1,980,173 | 0.22% |

The 14 labels are kept **verbatim** (`CocaPos` in `src/v2/domain/types.ts`); an unknown label is an
adapter error, never silently remapped.

Special PoS explicitly recorded by the source [F]:

- `+infinitive`: `to` (rank 6), `a`, `tae`
- `negation`: `n't` (rank 20, 5,285,354), `not`
- `existential`: `there`
- `article` (17 records) includes possessives and others: `the, a, his, my, your, their, her, our, no,
  every, its, mine, thy, his/her, yer, thine, her/his` — this is the source's tagset, not ours.

### 2.3 Multi-PoS headwords [F]

5,627 headwords have more than one record. Distribution of records per headword:
1 → 48,324; 2 → 5,272; 3 → 299; 4 → 46; 5 → 9; 6 → 1 (`like`).

Most frequent PoS combinations: noun+verb 2,786; adjective+noun 2,069; adjective+noun+verb 165;
adjective+adverb 156; adjective+verb 100; adjective+adverb+noun 36; adverb+noun 25;
noun+preposition+verb 24; adverb+preposition 23; adjective+adverb+noun+verb 22.

### 2.4 Rank-band distribution [F/C]

| Official ranks | Records | Freq sum | Share | Freq range |
| --- | ---: | ---: | ---: | --- |
| 1–1,000 | 1,000 | 695,117,371 | 77.85% | 96,853 – 50,033,612 |
| 1,001–2,000 | 1,000 | 65,559,807 | 7.34% | 44,682 – 96,840 |
| 2,001–5,000 | 3,000 | 68,858,915 | 7.71% | 12,072 – 44,658 |
| 5,001–10,000 | 5,000 | 33,425,127 | 3.74% | 3,710 – 12,066 |
| 10,001–20,000 | 10,000 | 19,522,684 | 2.19% | 976 – 3,708 |
| 20,001–30,000 | 10,000 | 6,164,165 | 0.69% | 370 – 976 |
| 30,001–40,000 | 10,000 | 2,504,645 | 0.28% | 162 – 370 |
| 40,001–50,000 | 10,000 | 1,173,015 | 0.13% | 83 – 162 |
| 50,001–60,000 | 10,000 | 619,840 | 0.07% | 45 – 83 |

Shares are relative to the **listed** 60k records, not to the COCA corpus size (the corpus total is not
in the file; see §6).

### 2.5 Special spellings [F]

| Class | Headwords | Examples |
| --- | ---: | --- |
| hyphen | 9,811 | long-term, e-mail, so-called, t-shirt, well-being |
| slash | 58 | and/or, he/she, his/her, s/he, i/o, either/or, yes/no |
| digit | 30 | mid-1990s, mid-20s, mid-19th, early-20th-century |
| apostrophe | 27 | n't, ma'am, o'clock, qur'an, y'all, bull's-eye, rock'n'roll, s'more |
| uppercase | 6 | TRUE, FALSE, R&D, B&B, non-Intervention, neo-Colonial |
| ampersand | 2 | R&D, B&B |
| space | 1 | climate change |
| non-ASCII | 0 | — |

### 2.6 Probe words [F + C]

| Query | COCA records (PoS rank freq) | hw_freq_sum [C] | hw_rank [C] | BNC membership (family band member_freq / family_total) | CET |
| --- | --- | ---: | ---: | --- | --- |
| work | verb 115 854,095; noun 207 456,169 | 1,310,264 | 85 | work 1k 90,756 / 168,597 | entry `work` headword CET4 |
| like | prep 73 1,583,444; verb 154 614,691; conj 762 127,828; adj 1,346 70,955; adv 1,496 63,748; noun 4,768 12,976 | 2,473,642 | 48 | like 1k 151,970 / 156,796 | `like¹`, `like²` |
| running | adjective 3,262 23,050; noun 4,456 14,396 (**no verb record**) | 37,446 | 2,130 | run 1k 14,066 / 53,862 | derivative of `run` |
| ability | noun 789 122,943 | 122,943 | 785 | able 1k 9,113 / 47,760 | derivative of `able` |
| abilities | — (not a COCA lemma) | — | — | able 1k 1,334 / 47,760 | — |
| go | verb 31 3,546,732 | 3,546,732 | 30 | go 1k 87,890 / 244,339 | `go` |
| went | — (inflection counted under `go`) | — | — | go 1k 45,876 / 244,339 | — |
| TRUE | adjective 414 235,467 | 235,467 | 427 | true 1k 17,803 / 21,448 | `true` |
| FALSE | adjective 2,107 41,580 | 41,580 | 1,985 | false 3k 3,626 / 4,454 | `false` |
| R&D | noun 24,379 623 | 623 | 21,611 | — | — |
| n't | negation 20 5,285,354 | 5,285,354 | 20 | — | — |
| climate change | noun 29,067 403 | 403 | 25,812 | — | — |
| grannies | — | — | — | grandfather 1k 17 / 7,211 **and** granny 6k 45 / 660 | — |
| may | verb 127 757,742; noun 1,096 88,994 | 846,736 | 119 | may 1k 128,063 / 128,063 | `May` and `may` (two entries) |
| color / colour | color: noun 607, verb 5,152; colour: — | 171,570 / — | 574 / — | both in family `colour` 1k (color 116, colour 11,840) | `colo(u)r` (color headword, colour variant) |

Derived rank differs from official rank at the very top [C]: `and` conjunction has official rank 3, but
headword `to` (+infinitive 16,770,155 + preposition 9,232,572 = 26,002,727) exceeds `and`
(24,778,098 + noun 220), so derived headword ranks are the 1, be 2, to 3, and 4.

## 3. BNC/COCA 25k families [F]

| Check | Result |
| --- | --- |
| Family lines | 25,002 in 25 bands (1k–25k) |
| Member slots | 76,126; distinct member forms 76,125 |
| Multi-family form | exactly one: `grannies` ∈ grandfather (1k, 17) and granny (6k, 45) |
| Explicit `(0)` slots | 7,947 |
| Headword absent from own member list | **0 families** |
| Σ member freq ≠ family total | **0 families**; Σ member freq = Σ family totals = 92,709,170 |
| Duplicate family headword / duplicate member in a family | 0 / 0 |
| Case | no uppercase letters in any form |
| Hyphen / apostrophe / space / digit / slash in forms | 0 each |
| Non-ASCII forms | 94 (café, régime, naïve, führer …) |

**Legacy parser review (`src/data/parser.ts → parseBncCoca`)** [C]:

1. If a family headword is not printed among its members, v1 inserts it as a member whose
   `frequency = totalFrequency` (the family total). This would assign a family-level figure to a single
   form. The shipped file has 0 such families, so current numbers are not corrupted, but any custom or
   future list would be. **v2 (`bncAdapter.ts`) never creates the member**; it sets
   `headwordIsMember=false` and emits `bnc.headword_not_member` (tested with a synthetic line).
2. v1 **adds** the frequencies when the same spelling appears twice in one family; v2 keeps the first
   value and reports `bnc.duplicate_member`.
3. v1 `LexiconWordItem.familyId/formFrequency/familyFrequency` describe only the **first** family met
   (grannies → grandfather, 17); the granny membership is only in `bncMemberships`. v2 has no "primary
   family": both memberships are first-class `BncMember` entities.
4. v1 family ids `bnc_<band>_<head>_<lineIndex>` depend on line order. v2 uses `bnc25k:fam:<headword>`.

## 4. CET2016 [F/C]

| Check | Result |
| --- | --- |
| Entries (lines) | 5,377 = 4,114 CET4 + 1,263 CET6 (★) |
| Form links (entry → spelling, deduplicated per line) | 8,107 (v1 counted 8,110 expanded references; 3 spellings occur twice on the same line) |
| Distinct spellings, case-sensitive | 8,018 |
| Distinct forms (case-folded) | 8,014 |
| Case collisions inside CET | Biblical/biblical, Internet/internet, March/march, May/may |
| Forms belonging to more than one entry | 89 (homographs bank¹/bank², bound¹²³; aesthetic/esthetic …) |
| Uppercase forms | 45 (AIDS, April, BBQ, Bible, Christmas, I, Internet, May …) |
| Multi-word | 6: according to, baby boom, baby boomer, coup d'état, ought to, owing to |
| Other | `apt.` (dot), cliché / résumé / coup d'état (non-ASCII) |

## 5. Cross-source alignment — exact, on the Form unit [C]

**Rule.** Matching is performed only on the *Form key*: `NFC → trim → collapse spaces → toLowerCase`.
Diacritics, hyphens, apostrophes, slashes and `&` are preserved. A match means "these source units
use the same spelling"; it does **not** claim the units are the same lexeme.

### 5.1 Set sizes and Venn regions (full data, no sampling)

| | Forms |
| --- | ---: |
| Union of all forms | **94,954** |
| COCA headwords | 53,951 |
| BNC member forms | 76,125 |
| CET forms | 8,014 |

| Region | Forms |
| --- | ---: |
| COCA ∩ BNC ∩ CET | 7,716 |
| COCA ∩ BNC only | 27,428 |
| COCA ∩ CET only | 184 |
| BNC ∩ CET only | 92 |
| COCA only | 18,623 |
| BNC only | 40,889 |
| CET only | 22 |

Pairwise intersections: COCA∩BNC 35,144 · COCA∩CET 7,900 · BNC∩CET 7,808.

Case-sensitive (no folding) intersections for comparison: COCA∩BNC 35,142 · COCA∩CET 7,858 ·
BNC∩CET 7,781. The difference is caused by 44 forms printed with different case across sources
(TRUE/true, FALSE/false, May/may, I/i, TV/tv, AIDS/aids, month and weekday names, Christian,
Internet …).

### 5.2 COCA side

- Headwords whose spelling is a BNC **family headword**: 18,774.
- Headwords whose spelling is only a BNC **non-head member**: 16,370 (e.g. `ability` ∈ able).
- Headwords with **no BNC form**: 18,807, by spelling class: hyphen 9,771 · plain letters 8,918 ·
  slash 58 · digit 30 · apostrophe 27 · ampersand 2 · space 1.
- Highest-frequency COCA headwords without a BNC form: n't, oh, american, uh, shit, online,
  christian, fuck, english, weekend, fucking, european, huh, french, indian, chinese, british, um,
  website, african, wow, russian, muslim, german, ah, classroom, soviet, forever, pm, israeli.
  [I] The Nation 25k lists keep proper nouns, marginal words (interjections, swear words) and
  transparent compounds in separate lists that are not part of this file; recent words (online,
  website) may also be absent from the families.

### 5.3 BNC side

- Family headwords that are COCA headwords: 18,774; not: 6,228.
- Member forms that are not COCA headwords: 40,981 (7,026 of them only ever printed as `(0)`).
  [I] Most are inflections and derivations (went, abilities, worked); COCA is lemmatised, so their
  occurrences are counted inside their lemma's record. They are *not* missing data and must not be
  given a COCA value.

### 5.4 CET side

- CET forms not in COCA: 114. CET forms not in BNC: 206. CET only (in neither): 22 —
  BBQ, Celcius, Christ, according to, apt., autobiographic, baby boom, baby boomer, counteraction,
  coup d'état, distressful, easy-going, instalation, knowhow, obtainment, ought to, owing to,
  passerby, reconciliatory, résumé, sobre, therapeutical.
- README v1 states "189 CET forms not in BNC". Re-running v1 `buildLexiconDatabase` and counting
  distinct `inCet && !inBnc` words gives **206**, identical to v2. The 189 came from v1's incremental
  diagnostic counters (172 + 17), which undercount. v2 counts sets, not events.

### 5.5 COCA Top-N: records vs headwords [C]

| N | distinct headwords among top-N records | headwords with hw_rank ≤ N | top-N records whose form is in BNC | … in CET |
| ---: | ---: | ---: | ---: | ---: |
| 1,000 | 898 | 1,000 | 994 | 985 |
| 2,000 | 1,769 | 2,000 | 1,971 | 1,947 |
| 3,000 | 2,626 | 3,000 | 2,935 | 2,860 |
| 5,000 | 4,333 | 5,000 | 4,843 | 4,619 |
| 10,000 | 8,634 | 10,000 | 9,464 | 7,674 |
| 20,000 | 17,412 | 20,000 | 18,015 | 9,705 |
| 60,000 | 53,951 | 53,951 | 40,327 | 10,825 |

"Top 1000 COCA" is therefore ambiguous: 1,000 records ≠ 1,000 headwords. UI must say which.

### 5.6 Cross-tab: COCA derived headword rank × BNC band of the same spelling [C]

Band = minimum band among families containing the spelling as a member; `none` = not a BNC form.

| hw_rank bucket | headwords | none | 1k | 2k | 3k | 4k–9k | 10k–25k |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1–1,000 | 1,000 | 8 | 761 | 189 | 41 | 1 | 0 |
| 1,001–2,000 | 1,000 | 31 | 353 | 379 | 230 | 6 | 1 |
| 2,001–3,000 | 1,000 | 42 | 164 | 335 | 403 | 56 | 0 |
| 3,001–5,000 | 2,000 | 92 | 254 | 359 | 492 | 796 | 7 |
| 5,001–10,000 | 5,000 | 495 | 528 | 504 | 513 | 2,880 | 80 |
| 10,001–20,000 | 10,000 | 1,832 | 761 | 703 | 657 | 3,968 | 2,079 |
| 20,001–30,000 | 10,000 | 3,299 | 549 | 513 | 460 | 1,726 | 3,453 |
| 30,001–40,000 | 10,000 | 4,691 | 353 | 361 | 295 | 1,215 | 3,085 |
| 40,001–53,951 | 13,951 | 8,317 | 283 | 318 | 272 | 1,254 | 3,507 |

[I] A low-frequency COCA lemma can sit in a 1k BNC family because the family band reflects the
**whole family's** frequency (e.g. a rare derivative of a common headword). This table is a
legitimate cross-analysis of two ordinal positions; it is not a comparison of frequencies.

## 6. Anomalies and caveats

| # | Observation | Type | Handling |
| --- | --- | --- | --- |
| A1 | `TRUE`, `FALSE` uppercase in COCA | F; [I] likely spreadsheet coercion | Kept verbatim in `CocaLemmaPosRecord.headword`; matched through Form key `true`/`false` |
| A2 | `and` has a `noun` record (rank 36,203, 220); `a` has `+infinitive` | F; [I] tagging artefacts | Kept; they are source facts. Never filtered silently |
| A3 | `article` covers possessives (his, my, their…) | F | PoS labels displayed verbatim; no remapping |
| A4 | `his/her`, `and/or`… are single COCA headwords | F | One Form each; no split into components |
| A5 | 48,173 adjacent equal-Freq pairs | F | Official rank order kept; derived ranks use documented tie-breaks |
| A6 | COCA corpus size (denominator) is not in the file | F | No per-million normalisation; shares are "of listed records" |
| A7 | COCA lists only the top 60k records | F | Missing record ≠ zero frequency; `hw_freq_sum` is a lower bound |
| A8 | `color` (COCA) vs `colour` (BNC/CET) | F | Separate Forms; linked only through BNC family `colour` and CET entry `colo(u)r` source facts |
| A9 | 92 diacritic pairs (cafe/café, resume/résumé…) | C | `candidate_diacritic_variant` relations; never merged |
| A10 | 525 hyphen/joined pairs (e-mail/email, co-worker/coworker…) | C | `candidate_hyphen_variant` relations; never merged |

## 7. Statistical interpretation rules (summary; normative text in ARCHITECTURE.md §6)

- BNC per-form frequency, BNC family total, Nation band, COCA lemma+PoS freq/rank and COCA derived
  headword values are **different metrics** with their own ids. They are never stored in one field.
- BNC and COCA counts come from different corpora, units (word form vs lemma+PoS) and unknown
  denominators here; their ratio is meaningless and no API computes it.
- Cross-source set operations are only performed after projecting all inputs to one entity kind
  (default `form`).

## 8. Associations NOT established (insufficient evidence)

- **BNC member form → COCA lemma** for non-lemma forms (went → go, abilities → ability). Our sources
  contain no inflection table; BNC families mix inflection and derivation. v2 links only identical
  spellings; it never assigns a member to a COCA lemma.
- **COCA PoS → BNC member.** BNC gives no PoS, so `work (noun)` cannot be mapped to a BNC slot.
- **CET homograph number → COCA PoS.** `like¹`/`like²` cannot be mapped to preposition/verb without a
  dictionary.
- **UK/US spelling equivalence** beyond what BNC families or CET lines state as source facts.
- **Sense-level frequencies.** No source provides them.
- **Hyphen/diacritic variants** remain candidates until a reviewed mapping source exists.
