"""Select basketball hyperparameters on 2013/14 only, never the 2014/15 holdout.

Offline standard-library script. Evaluates a declared finite grid, reports every
candidate, and does not edit engine defaults. Formula mirrors engine.ts; final
development results from run.ts verify the selected candidate numerically.
"""
import datetime as dt
import itertools
import json
import math
from pathlib import Path

ROOT = Path(__file__).parent
rows = json.loads((ROOT/'data/basketball.json').read_text())
for row in rows: row['day'] = dt.date.fromisoformat(row['date']).toordinal()

features = {half_life:[] for half_life in (45,90,180)}
for target in rows:
    if target['season'] != '2013': continue
    # Same next-day availability, one-millisecond pre-start cutoff and 200-row cap.
    history = [r for r in rows if target['day']-365 <= r['day'] < target['day']-1][-200:]
    if len(history)<50:continue
    for half_life in features:
        records = []
        for team in [target['home'],target['away']]:
            relevant=[r for r in history if team in [r['home'],r['away']]]
            weight=margin=0
            for r in relevant:
                w=2**(-(target['day']-r['day']-1-1/86400000)/half_life)
                weight+=w; margin+=w*(r['homeScore']-r['awayScore'])*(1 if r['home']==team else -1)
            rest=min(3,target['day']-relevant[-1]['day']-1) if relevant else None
            records.append((weight,margin,rest))
        features[half_life].append((records,target['homeScore']>target['awayScore']))

candidates=[]
for half_life,prior,scale,coefficient,rest_coefficient in itertools.product(features,(0,1,2,4),(5.5,6.8,8),(.55,.7),(.5,.75,1)):
    loss=brier=0
    for (h,a),won in features[half_life]:
        hm=h[1]/(h[0]+prior) if h[0]+prior else 0
        am=a[1]/(a[0]+prior) if a[0]+prior else 0
        rest=h[2]-a[2] if h[2] is not None and a[2] is not None else 0
        margin=max(-30,min(30,(hm-am)*coefficient+3.1+rest*rest_coefficient))
        p=1/(1+math.exp(-margin/scale))
        loss-=math.log(p if won else 1-p);brier+=2*(p-int(won))**2
    n=len(features[half_life])
    candidates.append(dict(halfLife=half_life,prior=prior,scale=scale,marginCoefficient=coefficient,restCoefficient=rest_coefficient,n=n,logLoss=loss/n,brier=brier/n))
candidates.sort(key=lambda c:c['logLoss'])
report={'selection':'Minimum development log loss; no holdout inspection','season':'2013/14','candidates':len(candidates),'selected':candidates[0],'gridResults':candidates}
(ROOT/'basketball-calibration.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='gridResults'},indent=2))
