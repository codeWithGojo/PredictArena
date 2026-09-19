# PredictArena model upgrade

All changes in this branch are under `services/data-and-model/model/`. No ingestion, frontend, legacy application model, infrastructure or contract files were edited. Tests are colocated here to satisfy the explicit request to add core model tests while editing only model-owned files. This is a task-specific exception to the contract's general docs-and-tests ownership rule.

## Usage

Node 22.18+ or Node 24 runs this package without dependencies, compilation or network access:

```sh
cd services/data-and-model/model
npm test
npm run backtest
node backtest/run.ts --development
node backtest/run.ts --output backtest/results.json
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

- Football `PA-DixonColes 2.0`: 90-day half-life, league home/away goal baselines with 20-match prior, opponent-adjusted attack and defensive concession strengths with a six-match neutral prior, and a regularized fitted Dixon-Coles low-score correlation. The correlation is constrained so every score probability stays nonnegative. A 0..50 grid captures effectively all mass at the model's capped rates. Neutral targets use the mean home/away baseline.
- Optional football health: latest unambiguous observations no older than seven days; unknown or future observations contribute no adjustment. Each out/doubtful athlete contributes 0.025/0.0125 to the attack penalty, capped at 0.20. Availability contributes `0.30 * (1 - availabilityScore)`. Use the larger penalty to avoid adding overlapping feeds; the opponent's scoring rate increases by half the penalty. These are bounded heuristic assumptions, **not empirically estimated injury effects**. No individual player importance is inferred. Both missing and explicit null inputs work.
- Basketball `PA-Margin 2.0`: 180-day decayed scoring margins, zero margin for unknown teams, coefficient 0.70, +3.1 non-neutral home advantage, capped rest differential at 0.5 points per day, and logistic scale 8. Expected totals use the decayed competition total. The settings were selected on 2013/14 development results over a declared 216-candidate grid, then committed before evaluating 2014/15. The initial four-match shrinkage candidate performed worse and was rejected on development results.
- Tennis `PA-Tennis 2.0`: blend of decayed smoothed win-rate logits and sequential Elo, both with 120-day half-life. Surface-specific win rates blend in only when both players have evidence on that surface. Rest differential changes log odds by 0.10 per capped day. Equal-completion-time Elo updates are simultaneous. No tennis home advantage or invented set-score distribution.
- Rest uses a recent eligible team-health observation when supplied; otherwise it uses the time since the participant's last eligible completed match. It is a proxy based on the available competition sample, not a full travel or workload model. If either participant has no rest evidence, both receive zero rest adjustment. The optional third argument `{restAdjustment:false}` is used for tennis archives without exact match timestamps.
- Confidence combines the weaker participant's sample coverage with the top-two outcome gap. It is **not a calibrated probability of correctness**. Fewer than five matches for either participant emits `LOW_SAMPLE`.

The football correction is inspired by Dixon and Coles, [Modelling Association Football Scores and Inefficiencies in the Football Betting Market](https://doi.org/10.1111/1467-9876.00065). This implementation uses shrinkage-based iterative strength fitting and penalized correlation fitting, not a claim to reproduce the paper's complete maximum-likelihood estimator.

## Input safeguards

The engine rejects invalid target times and requires `asOf <= generatedAt < startsAt`. History must have valid canonical UTC timestamps, `startsAt < completedAt <= observedAt <= asOf`, valid nonnegative integer scores, the same competition and sport unit, and no target fixture. Unknown/malformed dates are dropped rather than guessed. Latest eligible revisions are deduplicated by fixture ID; conflicting equal-timestamp revisions are dropped. Selection is deterministic: completedAt then fixtureId, most recent 200, within 365 days. Zero eligible history returns null estimates and `NO_HISTORY`.

Upstream still must provide regulation-only football scores, overtime-inclusive basketball finals and completed non-retired tennis matches. The contract input has no retirement, cancellation or historical neutral-venue flag, so these facts cannot be recovered from scores alone.

## Measured holdout results

Lower is better. Brier is the mean **sum across outcome classes** of squared errors, so binary Brier is twice the common one-column binary convention. Log loss uses natural logarithms. Old scores use the actual shipped integer percentage outputs. The comparison therefore includes removal of old output rounding along with model changes.

| Holdout | Matches | Old log loss | New log loss | Old Brier | New Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| Premier League 2023/24 | 380 | 0.955507 | 0.962356 | 0.563659 | 0.568772 |
| NBA 2014/15 | 1,309 | 0.621234 | 0.617268 | 0.432507 | 0.428723 |
| ATP 2023 | 2,674 | 0.681337 | 0.677771 | 0.488481 | 0.485139 |

Basketball and tennis improved on these samples. **Football worsened on both metrics; no football accuracy gain is demonstrated.** Keep the football upgrade experimental until stronger out-of-sample evidence supports promotion. Existing live behavior was not changed.

Paired new-minus-old log-loss 95% bootstrap intervals: football `[-0.007266, 0.020384]`, basketball `[-0.007154, -0.000453]`, tennis `[-0.005818, -0.001398]`. The report also includes Brier intervals. These use 1,000 deterministic paired date-block resamples, tournament blocks for tennis. They are descriptive uncertainty estimates for the selected samples, not proof of improvement across leagues or eras; model windows overlap and dates may remain dependent.

Machine-readable evidence: `backtest/results.json`, `backtest/development-results.json`, `backtest/basketball-calibration.json`. Parameters are fixed before holdout evaluation. No holdout tuning or match filtering based on outcomes was performed. Both models receive the identical eligible history and are scored on every qualifying target. Warm-up requires 50 competition results; all holdout targets qualify. The comparator includes cold starts instead of hiding difficult examples.

## Replay precision and limitations

These are real historical results, **not synthetic scores**, but the archives do not contain historical observedAt snapshots. `backtest/run.ts` has a clearly separate retrospective date-replay path; it reconstructs approximate availability exclusively for offline benchmarking:

- Football/NBA results become available the next midnight. Targets are evaluated one millisecond before their date starts, which conservatively excludes prior-day results arriving at exactly that midnight as well as all same-day results. The engine never applies this inference to production input.
- Tennis only gives a tournament date. All results from that tournament are held back for 21 days; no within-tournament result is used for another match in the same tournament. Tennis fatigue is disabled in this backtest. This cannot validate the fatigue coefficient or reproduce a true match-by-match pre-match archive.
- The recorded-input path accepts JSON `[{input, outcome}]` with genuine contract timestamps. Outcome index is home/draw/away = 0/1/2 for football, home/away = 0/1 otherwise. Use one sport per report. It performs no timestamp inference. Use licensed recorded input snapshots for a deployment-quality evaluation.
- Only one holdout competition-season per sport is measured. NBA data is old. Football's other domestic leagues and European cups are not evaluated.
- The 200-match **competition-wide** contract limit leaves 2,455 of 2,674 ATP targets with fewer than five matches for at least one player. Surface was usable in 940 targets. A participant-specific history contract could improve coverage, but is outside this branch.
- No historical health/injury observations exist here, so football health effects are unit-tested assumptions, not measured accuracy improvements. Partial league history can misestimate rest; travel, lineup quality, pace, player minutes, opponent-adjusted basketball strength and retirement risk are not modeled.
- No bookmaker odds, calibration audit or profitability claims. No demonstrated improvement in expected-score errors, because this backtest measures outcome log loss and Brier only.

## Reproduce the archived datasets

`backtest/data/provenance.json` records original source URLs and SHA-256 hashes plus normalized-dataset hashes. Source credit and dataset-specific licenses are in `backtest/data/NOTICE.md`. The tennis benchmark carries a non-commercial source license and is not a production feed.

To rebuild normalized results from separately downloaded copies of the exact source files:

```sh
python backtest/prepare.py /path/to/source-files
python backtest/calibrate_basketball.py
```

Both scripts are offline and have no network calls. `prepare.py` retains results, stable IDs and available surface metadata, removes incomplete tennis results, and assigns tennis player order by numeric ID rather than by winner. No ranks, published Elo, bookmaker forecasts or target outcomes enter pre-match features. Unit tests verify the included data checksums and unique fixture IDs as well as the core math and contract behavior.
