"""Render the README's measured football section from reports. No model fitting."""
import json
from pathlib import Path
R=Path(__file__).resolve().parent
s=json.loads((R/'selection.json').read_text());t=json.loads((R/'test-results.json').read_text());o=json.loads((R/'odds-benchmark.json').read_text())
def num(x):return f'{x:.6f}'
def table(headers,rows):return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(map(str,row))+' |' for row in rows])
def selected(name):return next(c for c in s['candidates'] if c['name']==name)['results']
def tested(name):return next(c for c in t['results'] if c['name']==name)['results']
def seasons(r):return {(v['league'],v['season']):v for v in r['bySeason']}
blocks=[('Tuning',s['tuningOld'],next(c for c in s['diagnostics'] if c['name']=='plus_shrinkage')['tuning'],s['tuningWinner']),
        ('Selection',selected('old'),selected('previous_v2'),selected(s['winner']['name'])),
        ('Later',tested('old'),tested('previous_v2'),tested('candidate'))]
text='''<!-- FOOTBALL_RESULTS_START -->
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

'''
rows=[]
for stage,old,prior,new in blocks:
    a,b,c=map(seasons,[old,prior,new])
    for key in sorted(a,key=lambda k:(k[1],k[0])):
        x,y,z=a[key],b[key],c[key]
        rows.append([stage+(' (known)' if key==('premier-league','2023') else ''),'PL' if key[0]=='premier-league' else 'La Liga',key[1]+'/'+str(int(key[1])+1)[2:],
                     num(x['logLoss']),num(y['logLoss']),num(z['logLoss']),num(x['brier']),num(y['brier']),num(z['brier']),'Loss' if z['logLoss']>x['logLoss'] else 'Win'])
text+=table(['Stage','League','Season','Old LL','Previous v2 LL','Candidate LL','Old Brier','Previous v2 Brier','Candidate Brier','Candidate LL vs old'],rows)+'\n\n'
rows=[]
for stage,old,prior,new in blocks:
    a,b,c=[r['pooled'] for r in [old,prior,new]]
    rows.append([stage,a['n'],num(a['logLoss']),num(b['logLoss']),num(c['logLoss']),num(a['brier']),num(b['brier']),num(c['brier'])])
a,c=t['freshOnly']['old']['pooled'],t['freshOnly']['new']['pooled']
freshv2=[v for v in tested('previous_v2')['bySeason'] if not(v['league']=='premier-league' and v['season']=='2023')]
rows.append(['Fresh later subset',a['n'],num(a['logLoss']),num(sum(r['logLoss'] for r in freshv2)/3),num(c['logLoss']),num(a['brier']),num(sum(r['brier'] for r in freshv2)/3),num(c['brier'])])
text+=table(['Pooled split','N','Old LL','Previous v2 LL','Candidate LL','Old Brier','Previous v2 Brier','Candidate Brier'],rows)+'\n\n'
text+='''### Closing-odds benchmark

This is a retrospective accuracy benchmark, not a betting or profitability test. It compares the unchanged default model with Pinnacle closing 1X2 decimal odds (`PSCH`, `PSCD`, `PSCA`) from the same football-data.co.uk CSVs and the same 4,560 scored walk-forward fixtures. For every fixture, implied probabilities are calculated as `1 / odds` and proportionally normalized to sum to one, removing that market's overround. The blend is a fixed 50:50 arithmetic average of the default model and de-vigged bookmaker probabilities. It was not fit or selected on these outcomes. Lower is better.

'''
def oddsreport(name, values):
    return [name,values['n'],num(values['logLoss']),num(values['brier'])]
allodds={name:value['pooled'] for name,value in o['results'].items()}
laterodds={}
freshodds={}
for name,value in o['results'].items():
    later=[v for v in value['bySeason'] if int(v['season'])>=2023]
    fresh=[v for v in later if not(v['league']=='premier-league' and v['season']=='2023')]
    avg=lambda rs,key:sum(v[key]*v['n'] for v in rs)/sum(v['n'] for v in rs)
    laterodds[name]={'n':sum(v['n'] for v in later),'logLoss':avg(later,'logLoss'),'brier':avg(later,'brier')}
    freshodds[name]={'n':sum(v['n'] for v in fresh),'logLoss':avg(fresh,'logLoss'),'brier':avg(fresh,'brier')}
rows=[]
for label,results in [('All scored seasons',allodds),('Later',laterodds),('Fresh later subset',freshodds)]:
    for name,title in [('defaultModel','Default model'),('bookmaker','De-vigged bookmaker'),('blend50','Fixed 50:50 blend')]:
        r=results[name];rows.append([label,title,r['n'],num(r['logLoss']),num(r['brier'])])
text+=table(['Scope','Forecast','N','Log loss','Brier'],rows)+'\n\n'
text+='The de-vigged bookmaker wins every reported scope on both metrics. The fixed blend improves on the default model but remains behind the bookmaker, so it does not change the default model. All 4,560 walk-forward fixtures had a complete Pinnacle closing-odds triplet; none were excluded.\n\n'
rows=[]
byseason={name:{(v['league'],v['season']):v for v in result['bySeason']} for name,result in o['results'].items()}
for key in sorted(byseason['defaultModel'],key=lambda k:(k[1],k[0])):
    default,book,blend=byseason['defaultModel'][key],byseason['bookmaker'][key],byseason['blend50'][key]
    rows.append(['PL' if key[0]=='premier-league' else 'La Liga',key[1]+'/'+str(int(key[1])+1)[2:],default['n'],num(default['logLoss']),num(book['logLoss']),num(blend['logLoss']),num(default['brier']),num(book['brier']),num(blend['brier'])])
text+=table(['League','Season','N','Default LL','Bookmaker LL','Blend LL','Default Brier','Bookmaker Brier','Blend Brier'],rows)+'\n\n'
text+='Paired candidate-minus-old 95% bootstrap intervals (2,000 seeded league/date-block resamples): later log loss '+str([round(x,6) for x in t['paired95Interval']['logLoss']])+', Brier '+str([round(x,6) for x in t['paired95Interval']['brier']])+'; fresh-subset log loss '+str([round(x,6) for x in t['freshOnly']['paired95Interval']['logLoss']])+'. All span zero. These are descriptive intervals: repeated teams and overlapping windows leave dependence beyond date blocks. No statistical improvement or equivalence claim is justified.\n\n'
text+='''### Component ablation

The first five rows add one component at a time. The last four remove one component from previous v2 to expose interactions. All strength fits retain the same 20-match league-goal prior and hard numerical bounds. No shrinkage means no team-strength prior, not removal of every safeguard. The old model already includes home advantage and four-match shrinkage; opponent-adjusted fitting is the common base of this ablation.

'''
rows=[]
for r in s['diagnostics']:
    a,b,c=r['tuning']['pooled'],r['selection']['pooled'],tested(r['name'])['pooled']
    rows.append([r['name'],num(a['logLoss']),num(a['brier']),num(b['logLoss']),num(b['brier']),num(c['logLoss']),num(c['brier'])])
text+=table(['Configuration','Tuning LL','Tuning Brier','Selection LL','Selection Brier','Later LL','Later Brier'],rows)+'\n\n'
text+='''- Home advantage helps on all three pooled splits in both the incremental and removal comparisons.
- The 90-day decay hurts on all three splits. The existing 200-match competition window already limits history; additional decay removes effective sample weight.
- Dixon-Coles has a small, context-dependent effect: it hurts the incremental earlier-season chain but helps later. Removing it from v2 helps selection but hurts later. That later result is reported, not used to retune.
- Six-match shrinkage helps tuning/selection substantially, but hurts later within the 90-day-decay chain. Regularisation is not universally beneficial. The earlier-selected no-decay candidate retains six-match shrinkage; the restored legacy default retains its original four-match prior.

The original Premier League 2023/24 result reproduces exactly: old 0.955507, previous v2 0.962356. Diagnostic component removals on that known season:

'''
rows=[]
for name in ['previous_v2','v2_without_decay','v2_without_dc','v2_without_shrinkage','v2_without_home','candidate']:
    r=seasons(tested(name))[('premier-league','2023')];rows.append([name,num(r['logLoss']),num(r['brier'])])
text+=table(['Configuration','Log loss','Brier'],rows)+'\n\n'
text+='The ablations identify aggressive decay and its interaction with shrinkage as contributors to the regression. They do not support blaming a probability-normalization bug or claiming a universally optimal half-life. The remaining gap against legacy also includes opponent adjustment, league priors, bounds and output rounding, so it cannot be attributed to one component.\n\n### Draw calibration\n\nNo calibrator is fitted on test outcomes. Bins are fixed 0.10 intervals, left inclusive; the final interval includes 1. Empty bins remain null in JSON and are omitted here. Bin counts differ between models.\n\n'
a=tested('old')['pooled']['drawCalibration'];b=tested('previous_v2')['pooled']['drawCalibration'];c=tested('candidate')['pooled']['drawCalibration']
text+=table(['Model','N','Mean predicted draw','Observed draw rate','Draw Brier','Bin ECE'],[[name,r['n'],num(r['meanPredicted']),num(r['observed']),num(r['drawBrier']),num(r['ece'])] for name,r in [('Old/default',a),('Previous v2',b),('Candidate',c)]])+'\n\n'
rows=[]
for x,y in zip(a['bins'],c['bins']):
    if not x['n'] and not y['n']:continue
    fmt=lambda v:'n/a' if v is None else num(v)
    rows.append([f"[{x['lower']:.1f}, {x['upper']:.1f})",x['n'],fmt(x['predicted']),fmt(x['observed']),y['n'],fmt(y['predicted']),fmt(y['observed'])])
text+=table(['Draw bin','Old N','Old predicted','Old observed','Candidate N','Candidate predicted','Candidate observed'],rows)+'\n\n'
rows=[];olds,news=seasons(tested('old')),seasons(tested('candidate'))
for key in sorted(olds):
    a,b=olds[key]['drawCalibration'],news[key]['drawCalibration']
    rows.append([key[0],key[1]+'/'+str(int(key[1])+1)[2:],a['n'],num(a['meanPredicted']),num(b['meanPredicted']),num(a['observed']),num(a['drawBrier']),num(b['drawBrier'])])
text+=table(['League','Season','N','Old draw forecast','Candidate draw forecast','Observed draws','Old draw Brier','Candidate draw Brier'],rows)+'\n\n'
text+='''The old model forecasts 23.35% draws versus 24.93% observed; the candidate forecasts 23.60%. Both underpredict overall, but overpredict in the 30%-40% bin. The candidate's slightly better draw Brier does not offset worse overall log loss. Bin ECE is descriptive and sensitive to binning and sample size. Full per-fold and fresh-only calibration is in JSON.

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

<!-- FOOTBALL_RESULTS_END -->'''
p=R.parent.parent/'README.md';original=p.read_text()
if '<!-- FOOTBALL_RESULTS_START -->' in original:
    a=original.index('<!-- FOOTBALL_RESULTS_START -->');b=original.index('<!-- FOOTBALL_RESULTS_END -->')+len('<!-- FOOTBALL_RESULTS_END -->');original=original[:a]+text+original[b:]
else:original=original.replace('## Measured holdout results',text+'\n\n## Original archived holdout results (previous v2)')
p.write_text(original)
print('Updated README from measured results.')
