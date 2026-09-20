"""Normalize cached source CSVs, downloading only missing files. Not a production feed."""
import csv
import hashlib
import io
import json
from pathlib import Path
import sys
from datetime import datetime
from urllib.request import urlopen
R=Path(__file__).resolve().parent
cache=Path(sys.argv[1]);cache.mkdir(parents=True,exist_ok=True)
rows=[];sources=[]
for year in range(2018,2025):
    for code,league in [('E0','premier-league'),('SP1','la-liga')]:
        name=f'{code}-{year}.csv';path=cache/name
        url=f'https://football-data.co.uk/mmz4281/{year%100:02}{(year+1)%100:02}/{code}.csv'
        if not path.exists():
            with urlopen(url,timeout=60) as response:path.write_bytes(response.read())
        raw=path.read_bytes();batch=[]
        for r in csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))):
            if not r.get('Date') or not r.get('FTHG') or not r.get('FTAG'):continue
            date=datetime.strptime(r['Date'],'%d/%m/%Y' if len(r['Date'])==10 else '%d/%m/%y').date().isoformat()
            batch.append(dict(id=f'{code}:{date}:{r["HomeTeam"]}:{r["AwayTeam"]}',league=league,season=str(year),date=date,
                              home=r['HomeTeam'],away=r['AwayTeam'],homeScore=int(r['FTHG']),awayScore=int(r['FTAG'])))
        assert len(batch)==380,(name,len(batch))
        rows+=batch;sources.append(dict(file=name,url=url,sha256=hashlib.sha256(raw).hexdigest(),matches=len(batch)))
rows.sort(key=lambda r:(r['date'],r['id']))
assert len({r['id'] for r in rows})==len(rows)
data=(json.dumps(rows,separators=(',',':'))+'\n').encode()
(R/'results-data.json').write_bytes(data)
(R/'provenance.json').write_text(json.dumps(dict(sources=sources,datasetSha256=hashlib.sha256(data).hexdigest(),matches=len(rows),
    note='Retrospective date-only results; no historical observation snapshots. Scores only, no odds.'),indent=2)+'\n')
print(f'Prepared {len(rows)} results.')
