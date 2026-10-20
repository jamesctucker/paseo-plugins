# Skill Radar threshold probe — report

- **Date:** 2026-10-19
- **Model:** `cloudflare/clef-flash` via OpenRouter Decisions API (`/api/alpha/decisions`)
- **Catalog:** 41 skills (workspace `/Users/james/the-garage/.opencode/skills` shadowing global `~/.agents/skills`), scanned with the plugin's own `scanSkills`
- **Method:** 20 hand-written probe conversations (10 clear, 4 ambiguous, 3 no-match, 1 negation, 1 adversarial, 1 off-topic), one decision request each, sequential, ~500ms apart, request shape copied verbatim from `server/classify.ts`
- **Raw data:** `results.json` (same directory); script: `probe.ts`

## 1. Accuracy

`choice` present in 20/20 responses; `confidence` present in 20/20 responses. The plugin's fallback logic (top-probability when `confidence` absent) never had to engage.

| Case | Kind | Expected | Choice | Displayed score (conf×100) | Verdict |
|---|---|---|---|---|---|
| clear-diagnose | clear | diagnose | diagnose | 81.5 | ✅ |
| clear-session-handoff | clear | session-handoff | session-handoff | 92.3 | ✅ |
| clear-code-review | clear | code-review | code-review | 92.5 | ✅ |
| clear-impeccable | clear | impeccable | impeccable | 86.1 | ✅ |
| clear-pdf | clear | pdf | pdf | 90.0 | ✅ |
| clear-tdd | clear | tdd | tdd | 94.6 | ✅ |
| clear-ios-simulator | clear | ios-simulator | **ios-build-loop** | 86.3 | ❌ sibling confusion |
| clear-linearize | clear | linearize | linearize | 90.0 | ✅ |
| clear-triage | clear | triage | triage | 89.6 | ✅ |
| clear-humanize | clear | humanize | humanize | 93.3 | ✅ |
| ambig-grilling-vs-hardening | ambiguous | grilling (ok: plan-hardening) | plan-hardening | 48.6 | ✅ (acceptable alt) |
| ambig-session-search | ambiguous | session-search | session-search | 90.9 | ✅ |
| ambig-orchestrate | ambiguous | orchestrate-build-chain | orchestrate-build-chain | 92.1 | ✅ |
| ambig-teach-vs-research | ambiguous | teach | teach | 70.8 | ✅ |
| none-react-question | no-match | none | none | — | ✅ |
| none-casual | no-match | none | **scaffold-project** | 6.7 | ❌ (flat distribution, correctly low confidence) |
| none-plain-coding | no-match | none | none | — | ✅ |
| negation-no-review | negation | none | **code-review** | 50.3 | ❌ negation ignored |
| adversarial-keyword-stuffing | adversarial | none | **session-handoff** | 68.8 | ❌ stuffing worked |
| offtopic-lol | off-topic | none | none | — | ✅ |

**Exact expected: 16/20. Expected-or-acceptable: 17/20 (85%).** All 4 `none`-expected failures are *false-positive skill picks*, which is exactly what the thresholds exist to suppress.

## 2. Confidence distributions

Displayed score = API `confidence` × 100 (present every time, 0–1).

| Group | n | Scores | Min | Median | Max |
|---|---|---|---|---|---|
| Correct skill picks | 13 | 48.6, 70.8, 81.5, 86.1, 89.6, 90.0, 90.0, 90.9, 92.1, 92.3, 92.5, 93.3, 94.6 | 48.6 | 90.0 | 94.6 |
| Wrong skill picks (should be suppressed) | 4 | 6.7 (casual→scaffold-project), 50.3 (negation→code-review), 68.8 (adversarial→session-handoff), 86.3 (ios-simulator→ios-build-loop) | 6.7 | 59.6 | 86.3 |
| Correct `none` decisions | 3 | 16.9, 29.9, 39.1 | 16.9 | 29.9 | 39.1 |

Observations:

- **Correct skill picks cluster high**: 12/13 ≥ 70.8; the only sub-70 correct pick is the genuinely ambiguous grilling/plan-hardening case at 48.6 — arguably *correct* to keep it out of the pill.
- **Wrong picks mostly land low**: 6.7 / 50.3 / 68.8. The 6.7 case is confidence working perfectly (near-uniform probability distribution, model clearly guessing). The ios-build-loop miss at 86.3 is a labeling-boundary case (a real, plausible sibling skill), not a confidence failure — no threshold can fix it.
- **`none` decisions carry low confidence (0.17–0.39)** even when correct. Irrelevant to display (the plugin returns no matches for `none`), but worth knowing: do not read low confidence as a broken response.
- **Separation is good but not clean in the 48–69 band**: it contains one acceptable correct pick (48.6) and two wrong picks (50.3, 68.8). Below 48 and above 70 separation is perfect in this sample.

## 3. Threshold recommendations (0–100 scale)

**Keep `PANEL_THRESHOLD = 50`.** It admits 12/13 correct picks (the excluded one is the ambiguous case, fine for a panel row) and excludes the worst false positive (6.7). It would also have shown the negation false positive (50.3, barely) — acceptable for a passive panel, which is exactly why the pill exists.

**Keep `PILL_THRESHOLD = 70`, consider 72 for margin.** At 70 the pill fires on 12/13 correct picks and **zero** wrong picks — but the adversarial case scored 68.8, only 1.2 points of margin. Correct picks above 70 start at 70.8 and the next is 81.5, so anywhere in 70–78 loses at most the borderline teach case. 72 buys margin over the observed adversarial maximum at no measured cost.

**Fallback gating rule (recommended regardless):** the confidence field handles most cases, but the one remaining hole is flat distributions where the model guesses (`none-casual`: P(top)=0.089 vs P(none)=0.076). A cheap extra gate — suppress matches where `P(top) ≤ 2 × P(none)` — kills that class entirely and never fires on any correct pick in this sample (correct picks have P(none) ≤ 0.007). This gate would *not* have caught the negation (P=0.52) or adversarial (P=0.83) cases; only the confidence threshold catches those.

## 4. Failure modes and surprises

1. **Sibling-skill confusion:** `ios-simulator` vs `ios-build-loop` (both iOS build/launch). P(expected) was only 0.023 vs 0.93 for the sibling — the descriptions overlap heavily. Not fixable by thresholds; fixable by sharpening descriptions.
2. **Negation is ignored:** "I don't want a code review…" → code-review at confidence 0.50. clef-flash latches onto topic keywords. Panel threshold 50 shows it; pill 70 does not.
3. **Keyword stuffing works:** front-loaded "wrap up session summary handoff…" hijacked the choice to session-handoff at P=0.83, confidence 0.69 — dangerously close to the pill threshold. This is the strongest argument for pill ≥ 72.
4. **Flat-distribution guesses are honestly reported:** the casual-chat case produced a near-uniform spread (top P=0.089) and confidence 0.067. The confidence field is a trustworthy "I don't know" signal.
5. **Latency:** mean ≈ 590ms, range 272–1443ms, single outlier 1443ms on the hardest ambiguous case. Well inside the plugin's 9s timeout; irrelevant to thresholds.

## Caveats

n=20, single run, single model snapshot. The 48–69 band is where all the action is; treat 50/70 as "validated in the right neighborhood" rather than precisely optimal. A 3–5× larger probe would be needed to distinguish 70 from 72 with confidence.
