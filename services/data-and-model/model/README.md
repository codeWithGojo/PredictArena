# PredictArena model upgrade

All changes in this branch are under `services/data-and-model/model/`. No ingestion, frontend, legacy application model, infrastructure or contract files were edited. Tests are colocated here to satisfy the explicit request to add core model tests while editing only model-owned files. This is a task-specific exception to the contract's general docs-and-tests ownership rule.

## Usage

Node 22.18+ or Node 24 runs this package without dependencies, compilation or network access:

```sh
cd services/data-and-model/model
npm test
npm run backtest
node backtest/run.ts --development
node backtest/run.ts --output backtest/current-results.json
node backtest/run.ts --recorded /path/to/recorded-inputs.json
```

```ts
import { predict } from './engine.ts';
const detail = predict(input, {
  id: workerAssignedPredictionId,
  generatedAt: workerAssignedUtcTimestamp,
  isStale: workerComputedStaleness,
});
```

`predict` is a deterministic pure function. It does not mutate input, read a clock, allocate random IDs, fetch data, train a persistent model, or access the filesystem. The worker supplies publication metadata and remains responsible for the hash/version of the actual input, archival storage, refreshed eligibility and staleness on reads. The code computes strengths from the supplied bounded history only.

Input/output follow API_CONTRACT.md sections 4 and 8. The return is exactly `{ summary, analysis }`, with fraction-valued win probabilities and heuristic confidence. Football returns expected goal rates and 25 unrenormalized 0..4 score cells. Basketball scores are `(total +/- margin)/2`. Tennis `expectedScore` remains null. No HTTP envelope is generated inside the model.

`history[].surface` is an optional, backward-compatible **model input extension** needed to use player-specific surface records. Section 8 only specifies the target's optional surface. Until the contract owner and ingestion producer supply verified historical surfaces, the model reports `SURFACE_NOT_USED` and uses its general record. The contract itself was not changed. No surface is inferred from a player's name or nationality. `bestOf` is accepted but is not used, and is disclosed in warnings.

The legacy application still uses `lib/sports.ts`. The new worker must explicitly import this engine after the contract's integration gates. The frontend track must exclude backend packages from its root build before integration. This branch does not deploy or alter live predictions. `legacy.ts` pins the original implementation from commit `bb18ff4c35fabba335763b127de6450a1b2f45e2`; its mathematics and percentage rounding are retained for the comparator.

## Models

- Football default `PA-Poisson 1.2 adapter 2.1`: the shipped goal-rate Poisson model, retained after the multi-season comparison below. Decay, Dixon-Coles, opponent-adjusted fitting, injuries and health adjustments are off by default. The original four-match shrinkage and home/away league rates remain.
- Optional strength model: league goal baselines with a 20-match prior, opponent-adjusted attack/defence, configurable home advantage, team shrinkage, time decay and Dixon-Coles. Neutral targets use the mean fitted home/away baseline. Correlation is constrained to keep cells nonnegative. A 0..50 score grid captures effectively all mass at the capped rates. `PREVIOUS_FOOTBALL` reproduces the former v2; `SELECTED_FOOTBALL` is the frozen earlier-selected research candidate.
- Experimental football health is off by default. With explicit opt-in in strength mode, use the latest unambiguous observations no older than seven days. Out/doubtful athletes contribute 0.025/0.0125 attack penalties capped at 0.20; availability contributes `0.30 * (1 - availabilityScore)`. Use the larger penalty to avoid overlap; opponent scoring rate increases by half the penalty. These are unvalidated bounded assumptions, not estimated player effects. Unknown, stale, future and null observations contribute no adjustment.
- Basketball `PA-Margin 2.0`: 180-day decayed scoring margins, zero margin for unknown teams, coefficient 0.70, +3.1 non-neutral home advantage, capped rest differential at 0.5 points per day, and logistic scale 8. Expected totals use the decayed competition total. The settings were selected on 2013/14 development results over a declared 216-candidate grid, then committed before evaluating 2014/15. The initial four-match shrinkage candidate performed worse and was rejected on development results.
- Tennis `PA-Tennis 2.0`: blend of decayed smoothed win-rate logits and sequential Elo, both with 120-day half-life. Surface-specific win rates blend in only when both players have evidence on that surface. Rest differential changes log odds by 0.10 per capped day. Equal-completion-time Elo updates are simultaneous. No tennis home advantage or invented set-score distribution.
- Rest uses a recent eligible team-health observation when supplied; otherwise it uses the time since the participant's last eligible completed match. It is a proxy based on the available competition sample, not a full travel or workload model. If either participant has no rest evidence, both receive zero rest adjustment. The optional third argument `{restAdjustment:false}` is used for tennis archives without exact match timestamps.
- Confidence combines the weaker participant's sample coverage with the top-two outcome gap. It is **not a calibrated probability of correctness**. Fewer than five matches for either participant emits `LOW_SAMPLE`.

The football correction is inspired by Dixon and Coles, [Modelling Association Football Scores and Inefficiencies in the Football Betting Market](https://doi.org/10.1111/1467-9876.00065). This implementation uses shrinkage-based iterative strength fitting and penalized correlation fitting, not a claim to reproduce the paper's complete maximum-likelihood estimator.

## Input safeguards

The engine rejects invalid target times and requires `asOf <= generatedAt < startsAt`. History must have valid canonical UTC timestamps, `startsAt < completedAt <= observedAt <= asOf`, valid nonnegative integer scores, the same competition and sport unit, and no target fixture. Unknown/malformed dates are dropped rather than guessed. Latest eligible revisions are deduplicated by fixture ID; conflicting equal-timestamp revisions are dropped. Selection is deterministic: completedAt then fixtureId, most recent 200, within 365 days. Zero eligible history returns null estimates and `NO_HISTORY`.

Upstream still must provide regulation-only football scores, overtime-inclusive basketball finals and completed non-retired tennis matches. The contract input has no retirement, cancellation or historical neutral-venue flag, so these facts cannot be recovered from scores alone.

<!-- FOOTBALL_RESULTS_START -->
## Football investigation and default decision

**The old shipped football model is the default again.** The frozen candidate reduced the previous upgrade's regression but still lost to the old model on later-season pooled log loss and Brier. No football accuracy improvement over the shipped model is demonstrated. Live code outside this folder was not changed.

### Protocol

- Dataset: 5,320 real results across seven Premier League and La Liga seasons, 380 matches per league-season. 2018/19 is warm-up. The remaining 4,560 matches are scored, with zero skips.
- Hyperparameter development: 2019/20 and 2020/21. Fixed 27-configuration grid: half-life off/90/180 days; team prior 0/2/6 equivalent matches; Dixon-Coles penalty off/100/400. Larger penalty shrinks correlation more strongly toward zero. No league-specific settings.
- Selection/validation: 2021/22 and 2022/23. Compare the grid, legacy, previous v2 and fixed ablations by pooled log loss. All four earlier seasons are development data, not untouched tests. Their selected-model metrics are optimistic.
- Freeze the candidate before reading later metrics. Evaluate 2023/24 and 2024/25. Premier League 2023/24 was already known and is diagnostic, not fresh. La Liga 2023/24 and both 2024/25 leagues form the fresh subset of 1,140 matches.
- Walk-forward: refit before each date on the latest 200 eligible same-league results within 365 days. Earlier outcomes within test seasons update strengths only after availability, never hyperparameters. No random split, cross-league team fitting or outcome-based target filtering.
- Date-only results become available next midnight. Cutoff is one millisecond before the target date, conservatively excluding same-day results and prior-day results arriving exactly at that midnight. True historical observedAt snapshots and health data are unavailable.
- Primary score is natural-log loss; Brier is the summed three-class convention. The old comparator retains integer percentage rounding. Confidence remains heuristic.
- Protocol transparency: the first selection script considered only the tuning winner, legacy and v2. It was corrected to include the complete already-declared grid and ablations after inspecting earlier-season validation diagnostics, before reading later metrics. An initial test file had been computed automatically but not inspected. This is validation-stage protocol development, not preregistration. The temporary checkout was subsequently lost; the same grid, splits and settings were restored and rerun. No configurations were changed in response to test outcomes.
- Release fallback: retain legacy when the one frozen candidate loses to it on pooled later log loss. Do not search test ablations for another candidate. This release decision uses the test comparison; it is not another untouched accuracy estimate.

The earlier-selection winner retains opponent adjustment, home advantage and six-match shrinkage, with **decay and Dixon-Coles off**. It is opt-in as `SELECTED_FOOTBALL`. Runtime `DEFAULT_FOOTBALL` is legacy after the candidate's later loss. Machine-readable split rules, data/source hashes, all 27 candidates, per-season ablations, calibration, and the release decision are under `backtest/football/`.

### Full results

Candidate means the fixed earlier-selected configuration, not the restored runtime default. The default's outcome probabilities equal Old. Lower is better. Each league-season row has 380 matches. All losses are retained.

| Stage | League | Season | Old LL | Previous v2 LL | Candidate LL | Old Brier | Previous v2 Brier | Candidate Brier | Candidate LL vs old |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Tuning | La Liga | 2019/20 | 1.013294 | 1.015294 | 1.012447 | 0.609565 | 0.609253 | 0.608565 | Win |
| Tuning | PL | 2019/20 | 0.998082 | 0.996520 | 0.995489 | 0.594897 | 0.594849 | 0.593581 | Win |
| Tuning | La Liga | 2020/21 | 1.011419 | 1.017663 | 1.014830 | 0.604753 | 0.609850 | 0.607115 | Loss |
| Tuning | PL | 2020/21 | 1.031843 | 1.030545 | 1.032624 | 0.615731 | 0.616148 | 0.616956 | Loss |
| Selection | La Liga | 2021/22 | 1.028229 | 1.029179 | 1.024468 | 0.616624 | 0.617586 | 0.613867 | Win |
| Selection | PL | 2021/22 | 0.977585 | 0.980878 | 0.975911 | 0.581326 | 0.583065 | 0.580108 | Win |
| Selection | La Liga | 2022/23 | 1.020269 | 1.016331 | 1.012969 | 0.610119 | 0.608795 | 0.605436 | Win |
| Selection | PL | 2022/23 | 0.995357 | 0.987963 | 0.984646 | 0.594947 | 0.588921 | 0.587206 | Win |
| Later | La Liga | 2023/24 | 0.989253 | 0.997679 | 0.989324 | 0.591339 | 0.596230 | 0.590725 | Loss |
| Later (known) | PL | 2023/24 | 0.955507 | 0.962356 | 0.955669 | 0.563659 | 0.568772 | 0.564114 | Loss |
| Later | La Liga | 2024/25 | 0.979122 | 0.991877 | 0.981467 | 0.581437 | 0.590114 | 0.582511 | Loss |
| Later | PL | 2024/25 | 0.990897 | 0.996811 | 0.992122 | 0.592057 | 0.595597 | 0.592367 | Loss |

| Pooled split | N | Old LL | Previous v2 LL | Candidate LL | Old Brier | Previous v2 Brier | Candidate Brier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tuning | 1520 | 1.013660 | 1.015006 | 1.013847 | 0.606236 | 0.607525 | 0.606554 |
| Selection | 1520 | 1.005360 | 1.003588 | 0.999499 | 0.600754 | 0.599592 | 0.596654 |
| Later | 1520 | 0.978695 | 0.987181 | 0.979645 | 0.582123 | 0.587678 | 0.582429 |
| Fresh later subset | 1140 | 0.986424 | 0.995456 | 0.987637 | 0.588278 | 0.593980 | 0.588534 |

### Closing-odds benchmark

This is a retrospective accuracy benchmark, not a betting or profitability test. It compares the unchanged default model with Pinnacle closing 1X2 decimal odds (`PSCH`, `PSCD`, `PSCA`) from the same football-data.co.uk CSVs and the same 4,560 scored walk-forward fixtures. For every fixture, implied probabilities are calculated as `1 / odds` and proportionally normalized to sum to one, removing that market's overround. The blend is a fixed 50:50 arithmetic average of the default model and de-vigged bookmaker probabilities. It was not fit or selected on these outcomes. Lower is better.

| Scope | Forecast | N | Log loss | Brier |
| --- | --- | --- | --- | --- |
| All scored seasons | Default model | 4560 | 0.999238 | 0.596371 |
| All scored seasons | De-vigged bookmaker | 4560 | 0.962666 | 0.571069 |
| All scored seasons | Fixed 50:50 blend | 4560 | 0.973607 | 0.578595 |
| Later | Default model | 1520 | 0.978695 | 0.582123 |
| Later | De-vigged bookmaker | 1520 | 0.940787 | 0.556506 |
| Later | Fixed 50:50 blend | 1520 | 0.953236 | 0.564512 |
| Fresh later subset | Default model | 1140 | 0.986424 | 0.588278 |
| Fresh later subset | De-vigged bookmaker | 1140 | 0.954533 | 0.566726 |
| Fresh later subset | Fixed 50:50 blend | 1140 | 0.964026 | 0.572699 |

The de-vigged bookmaker wins every reported scope on both metrics. The fixed blend improves on the default model but remains behind the bookmaker, so it does not change the default model. All 4,560 walk-forward fixtures had a complete Pinnacle closing-odds triplet; none were excluded.

| League | Season | N | Default LL | Bookmaker LL | Blend LL | Default Brier | Bookmaker Brier | Blend Brier |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| La Liga | 2019/20 | 380 | 1.013294 | 0.976529 | 0.986832 | 0.609565 | 0.584194 | 0.590716 |
| PL | 2019/20 | 380 | 0.998082 | 0.972153 | 0.975533 | 0.594897 | 0.574427 | 0.578170 |
| La Liga | 2020/21 | 380 | 1.011419 | 0.979546 | 0.987847 | 0.604753 | 0.580485 | 0.587475 |
| PL | 2020/21 | 380 | 1.031843 | 0.997052 | 1.007175 | 0.615731 | 0.592143 | 0.598964 |
| La Liga | 2021/22 | 380 | 1.028229 | 0.988742 | 1.001137 | 0.616624 | 0.589006 | 0.598032 |
| PL | 2021/22 | 380 | 0.977585 | 0.936732 | 0.949810 | 0.581326 | 0.554334 | 0.562810 |
| La Liga | 2022/23 | 380 | 1.020269 | 0.975939 | 0.991915 | 0.610119 | 0.581034 | 0.591738 |
| PL | 2022/23 | 380 | 0.995357 | 0.962152 | 0.970089 | 0.594947 | 0.571183 | 0.577190 |
| La Liga | 2023/24 | 380 | 0.989253 | 0.950861 | 0.963981 | 0.591339 | 0.565841 | 0.574011 |
| PL | 2023/24 | 380 | 0.955507 | 0.899550 | 0.920867 | 0.563659 | 0.525848 | 0.539951 |
| La Liga | 2024/25 | 380 | 0.979122 | 0.946325 | 0.957444 | 0.581437 | 0.559258 | 0.566484 |
| PL | 2024/25 | 380 | 0.990897 | 0.966412 | 0.970652 | 0.592057 | 0.575079 | 0.577602 |

Paired candidate-minus-old 95% bootstrap intervals (2,000 seeded league/date-block resamples): later log loss [-0.002056, 0.003848], Brier [-0.001785, 0.002272]; fresh-subset log loss [-0.00234, 0.004589]. All span zero. These are descriptive intervals: repeated teams and overlapping windows leave dependence beyond date blocks. No statistical improvement or equivalence claim is justified.

### Component ablation

The first five rows add one component at a time. The last four remove one component from previous v2 to expose interactions. All strength fits retain the same 20-match league-goal prior and hard numerical bounds. No shrinkage means no team-strength prior, not removal of every safeguard. The old model already includes home advantage and four-match shrinkage; opponent-adjusted fitting is the common base of this ablation.

| Configuration | Tuning LL | Tuning Brier | Selection LL | Selection Brier | Later LL | Later Brier |
| --- | --- | --- | --- | --- | --- | --- |
| strength_only | 1.039428 | 0.621442 | 1.038113 | 0.619837 | 0.994816 | 0.593298 |
| plus_home | 1.028000 | 0.613237 | 1.017237 | 0.606333 | 0.980062 | 0.583025 |
| plus_decay | 1.031424 | 0.614502 | 1.024969 | 0.611175 | 0.985247 | 0.586727 |
| plus_dc | 1.031665 | 0.614416 | 1.025211 | 0.611339 | 0.984629 | 0.586392 |
| plus_shrinkage | 1.015006 | 0.607525 | 1.003588 | 0.599592 | 0.987181 | 0.587678 |
| v2_without_home | 1.027006 | 0.615792 | 1.022694 | 0.613020 | 0.999108 | 0.596007 |
| v2_without_decay | 1.013641 | 0.606460 | 0.999731 | 0.596806 | 0.978866 | 0.582033 |
| v2_without_dc | 1.015054 | 0.607476 | 1.003291 | 0.599409 | 0.987756 | 0.587954 |
| v2_without_shrinkage | 1.031665 | 0.614416 | 1.025211 | 0.611339 | 0.984629 | 0.586392 |

- Home advantage helps on all three pooled splits in both the incremental and removal comparisons.
- The 90-day decay hurts on all three splits. The existing 200-match competition window already limits history; additional decay removes effective sample weight.
- Dixon-Coles has a small, context-dependent effect: it hurts the incremental earlier-season chain but helps later. Removing it from v2 helps selection but hurts later. That later result is reported, not used to retune.
- Six-match shrinkage helps tuning/selection substantially, but hurts later within the 90-day-decay chain. Regularisation is not universally beneficial. The earlier-selected no-decay candidate retains six-match shrinkage; the restored legacy default retains its original four-match prior.

The original Premier League 2023/24 result reproduces exactly: old 0.955507, previous v2 0.962356. Diagnostic component removals on that known season:

| Configuration | Log loss | Brier |
| --- | --- | --- |
| previous_v2 | 0.962356 | 0.568772 |
| v2_without_decay | 0.954420 | 0.563342 |
| v2_without_dc | 0.963521 | 0.569481 |
| v2_without_shrinkage | 0.954110 | 0.561145 |
| v2_without_home | 0.973415 | 0.576817 |
| candidate | 0.955669 | 0.564114 |

The ablations identify aggressive decay and its interaction with shrinkage as contributors to the regression. They do not support blaming a probability-normalization bug or claiming a universally optimal half-life. The remaining gap against legacy also includes opponent adjustment, league priors, bounds and output rounding, so it cannot be attributed to one component.

### Draw calibration

No calibrator is fitted on test outcomes. Bins are fixed 0.10 intervals, left inclusive; the final interval includes 1. Empty bins remain null in JSON and are omitted here. Bin counts differ between models.

| Model | N | Mean predicted draw | Observed draw rate | Draw Brier | Bin ECE |
| --- | --- | --- | --- | --- | --- |
| Old/default | 1520 | 0.233480 | 0.249342 | 0.185633 | 0.028546 |
| Previous v2 | 1520 | 0.241078 | 0.249342 | 0.185639 | 0.024535 |
| Candidate | 1520 | 0.235981 | 0.249342 | 0.185522 | 0.025024 |

| Draw bin | Old N | Old predicted | Old observed | Candidate N | Candidate predicted | Candidate observed |
| --- | --- | --- | --- | --- | --- | --- |
| [0.0, 0.1) | 11 | 0.080909 | 0.090909 | 9 | 0.089508 | 0.111111 |
| [0.1, 0.2) | 273 | 0.162234 | 0.168498 | 277 | 0.171307 | 0.166065 |
| [0.2, 0.3) | 1090 | 0.241349 | 0.270642 | 1117 | 0.244424 | 0.270367 |
| [0.3, 0.4) | 145 | 0.318759 | 0.255172 | 116 | 0.318964 | 0.258621 |
| [0.4, 0.5) | 1 | 0.420000 | 0.000000 | 1 | 0.412034 | 0.000000 |

| League | Season | N | Old draw forecast | Candidate draw forecast | Observed draws | Old draw Brier | Candidate draw Brier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| la-liga | 2023/24 | 380 | 0.249737 | 0.251217 | 0.281579 | 0.201811 | 0.201259 |
| la-liga | 2024/25 | 380 | 0.249368 | 0.250706 | 0.255263 | 0.188469 | 0.188404 |
| premier-league | 2023/24 | 380 | 0.214500 | 0.218012 | 0.215789 | 0.169361 | 0.169364 |
| premier-league | 2024/25 | 380 | 0.220316 | 0.223991 | 0.244737 | 0.182889 | 0.183061 |

The old model forecasts 23.35% draws versus 24.93% observed; the candidate forecasts 23.60%. Both underpredict overall, but overpredict in the 30%-40% bin. The candidate's slightly better draw Brier does not offset worse overall log loss. Bin ECE is descriptive and sensitive to binning and sample size. Full per-fold and fresh-only calibration is in JSON.

### Defaults and reproduction

```ts
import { predict } from './engine.ts';
import { SELECTED_FOOTBALL } from './football-candidate.ts';
import { PREVIOUS_FOOTBALL } from './football.ts';

predict(input, publication); // Legacy default; no health adjustments.
predict(input, publication, { football: SELECTED_FOOTBALL }); // Opt-in candidate.
predict(input, publication, { football: PREVIOUS_FOOTBALL }); // Previous losing v2.
predict(input, publication, {
  football: { ...SELECTED_FOOTBALL, halfLifeDays: 180, rhoPenalty: 100 },
  experimentalFootballHealth: true, // Unvalidated, off by default.
});
```

In strength mode, `homeAdvantage: false`, `halfLifeDays: null`, `rhoPenalty: null`, and `priorMatches: 0` disable their components. Legacy mode rejects mixed strength-model settings. Injuries and team-health adjustments require explicit opt-in in strength mode and emit `EXPERIMENTAL_HEALTH_ADJUSTMENT`. They have no measured benefit in these archives.

The legacy adapter preserves shipped outcome probabilities and rounded goal estimates. Its display score grid is reconstructed from those rounded goal estimates; small differences from rounded outcome probabilities are expected. Factor strengths are converted to 0..1, and confidence remains the contract adapter's heuristic. Legacy has no neutral-venue support; such inputs emit `LEGACY_NEUTRAL_VENUE_NOT_SUPPORTED`. This is not a validation of neutral cup matches.

```sh
npm run backtest:football:select
npm run backtest:football
npm run backtest:football:odds
python backtest/football/render_results.py
npm test
# Reproduce the original football v2 benchmark:
node backtest/run.ts --previous-football
# Optional rebuild from cached source CSVs, downloading only missing files:
python backtest/football/prepare.py /path/to/source-csvs
```

The selection stage reads only earlier-season scores and writes a frozen selection report. The test stage verifies protocol/model/data fingerprints and records the release decision. Neither script silently changes runtime defaults. Tests assert that the checked-in candidate matches selection and the runtime default matches the release decision. Source and normalized-data hashes make the replay auditable.

Other football leagues, European cups, neutral venues, actual historical feed availability, expected-score calibration and injury effects remain unvalidated. No profitability claim is made. The 200-match/365-day contract window is unchanged.

<!-- FOOTBALL_RESULTS_END -->

## Original archived holdout results (previous v2)

Lower is better. Brier is the mean **sum across outcome classes** of squared errors, so binary Brier is twice the common one-column binary convention. Log loss uses natural logarithms. Old scores use the actual shipped integer percentage outputs. The comparison therefore includes removal of old output rounding along with model changes.

| Holdout | Matches | Old log loss | New log loss | Old Brier | New Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| Premier League 2023/24 | 380 | 0.955507 | 0.962356 | 0.563659 | 0.568772 |
| NBA 2014/15 | 1,309 | 0.621234 | 0.617268 | 0.432507 | 0.428723 |
| ATP 2023 | 2,674 | 0.681337 | 0.677771 | 0.488481 | 0.485139 |

Basketball and tennis improved on these samples. **Football worsened on both metrics; no football accuracy gain is demonstrated.** Keep the football upgrade experimental until stronger out-of-sample evidence supports promotion. Existing live behavior was not changed.

Paired new-minus-old log-loss 95% bootstrap intervals: football `[-0.007266, 0.020384]`, basketball `[-0.007154, -0.000453]`, tennis `[-0.005818, -0.001398]`. The report also includes Brier intervals. These use 1,000 deterministic paired date-block resamples, tournament blocks for tennis. They are descriptive uncertainty estimates for the selected samples, not proof of improvement across leagues or eras; model windows overlap and dates may remain dependent.

Machine-readable evidence: `backtest/results.json`, `backtest/development-results.json`, `backtest/basketball-calibration.json`. Those archived parameters were fixed before their original holdout evaluation; the new football protocol and decisions are documented separately above. No holdout tuning or match filtering based on outcomes was performed. Both models receive the identical eligible history and are scored on every qualifying target. Warm-up requires 50 competition results; all holdout targets qualify. The comparator includes cold starts instead of hiding difficult examples.

## Replay precision and limitations

These are real historical results, **not synthetic scores**, but the archives do not contain historical observedAt snapshots. `backtest/run.ts` has a clearly separate retrospective date-replay path; it reconstructs approximate availability exclusively for offline benchmarking:

- Football/NBA results become available the next midnight. Targets are evaluated one millisecond before their date starts, which conservatively excludes prior-day results arriving at exactly that midnight as well as all same-day results. The engine never applies this inference to production input.
- Tennis only gives a tournament date. All results from that tournament are held back for 21 days; no within-tournament result is used for another match in the same tournament. Tennis fatigue is disabled in this backtest. This cannot validate the fatigue coefficient or reproduce a true match-by-match pre-match archive.
- The recorded-input path accepts JSON `[{input, outcome}]` with genuine contract timestamps. Outcome index is home/draw/away = 0/1/2 for football, home/away = 0/1 otherwise. Use one sport per report. It performs no timestamp inference. Use licensed recorded input snapshots for a deployment-quality evaluation.
- The original archive covers one holdout competition-season per sport. The football extension above adds Premier League and La Liga seasons. NBA data is old; other domestic football leagues and European cups remain untested.
- The 200-match **competition-wide** contract limit leaves 2,455 of 2,674 ATP targets with fewer than five matches for at least one player. Surface was usable in 940 targets. A participant-specific history contract could improve coverage, but is outside this branch.
- No historical health/injury observations exist here, so football health effects are unit-tested assumptions, not measured accuracy improvements. Partial league history can misestimate rest; travel, lineup quality, pace, player minutes, opponent-adjusted basketball strength and retirement risk are not modeled.
- No bookmaker odds or profitability claims. Football draw calibration is reported above; other calibration claims are not made. No demonstrated improvement in expected-score errors, because this backtest measures outcome log loss and Brier only.

## Reproduce the archived datasets

`backtest/data/provenance.json` records original source URLs and SHA-256 hashes plus normalized-dataset hashes. Source credit and dataset-specific licenses are in `backtest/data/NOTICE.md`. The tennis benchmark carries a non-commercial source license and is not a production feed.

To rebuild normalized results from separately downloaded copies of the exact source files:

```sh
python backtest/prepare.py /path/to/source-files
python backtest/calibrate_basketball.py
```

Both scripts are offline and have no network calls. `prepare.py` retains results, stable IDs and available surface metadata, removes incomplete tennis results, and assigns tennis player order by numeric ID rather than by winner. No ranks, published Elo, bookmaker forecasts or target outcomes enter pre-match features. Unit tests verify the included data checksums and unique fixture IDs as well as the core math and contract behavior.
