"""Offline historical benchmark preparation. Never called by ingestion or the engine.

Usage: python prepare.py PATH_TO_DOWNLOADED_SOURCE_FILES
Requires the five source filenames listed in SOURCES. Standard library only.
Archives have no observedAt. Output retains date precision explicitly; run.ts applies
documented retrospective availability assumptions, never production timestamps.
"""
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).parent / 'data'
SOURCES = {
    'football-2223.csv': 'https://www.football-data.co.uk/mmz4281/2223/E0.csv',
    'source-0.csv': 'https://www.football-data.co.uk/mmz4281/2324/E0.csv',
    'source-2.csv': 'https://raw.githubusercontent.com/fivethirtyeight/data/master/nba-elo/nbaallelo.csv',
    'tennis-2022.csv': 'https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_matches_2022.csv',
    'tennis-2023.csv': 'https://raw.githubusercontent.com/Kadantte/tennis_atp/master/atp_matches_2023.csv',
}

def save(name, rows):
    rows.sort(key=lambda r: (r['date'], r['id']))
    (ROOT / name).write_text(json.dumps(rows, separators=(',', ':')) + '\n')
    print(name, len(rows))

def prepare(source_dir):
    provenance = []
    for filename, url in SOURCES.items():
        raw = (source_dir / filename).read_bytes()
        provenance.append({'file': filename, 'url': url, 'sha256': hashlib.sha256(raw).hexdigest()})
    football, basketball, tennis = [], [], []
    for filename, season in [('football-2223.csv', '2022'), ('source-0.csv', '2023')]:
        for r in csv.DictReader((source_dir / filename).open(encoding='utf-8-sig')):
            if not r.get('FTHG') or not r.get('FTAG'): continue
            date = dt.datetime.strptime(r['Date'], '%d/%m/%Y').date().isoformat()
            h, a = r['HomeTeam'], r['AwayTeam']
            football.append({'id': f'football:archive:{date}:{h}:{a}', 'date': date, 'season': season,
                'home': f'football:archive:{h}', 'away': f'football:archive:{a}',
                'homeScore': int(r['FTHG']), 'awayScore': int(r['FTAG'])})
    for r in csv.DictReader((source_dir / 'source-2.csv').open()):
        if r['lg_id'] != 'NBA' or r['year_id'] not in ('2014','2015') or r['game_location'] != 'H': continue
        basketball.append({'id': 'basketball:archive:' + r['game_id'],
            'date': dt.datetime.strptime(r['date_game'], '%m/%d/%Y').date().isoformat(),
            'season': str(int(r['year_id']) - 1), 'home': 'basketball:archive:' + r['team_id'],
            'away': 'basketball:archive:' + r['opp_id'], 'homeScore': int(r['pts']), 'awayScore': int(r['opp_pts'])})
    excluded_tennis = 0
    for year in (2022, 2023):
        for r in csv.DictReader((source_dir / f'tennis-{year}.csv').open()):
            # No walkovers, retirements, Davis Cup ties, qualifiers or unfinished score strings.
            tokens = r['score'].split()
            if r['tourney_level'] not in ('A','M','G','F') or not tokens or any(not re.fullmatch(r'\d+-\d+(?:\(\d+\))?', s) for s in tokens):
                excluded_tennis += 1; continue
            sets = [tuple(map(int, re.match(r'(\d+)-(\d+)', s).groups())) for s in tokens]
            w = sum(a > b for a,b in sets); l = sum(a < b for a,b in sets)
            if w != int(r['best_of']) // 2 + 1 or l >= w: excluded_tennis += 1; continue
            # IDs sorted independent of outcome. Never encode winner as player one.
            first = int(r['winner_id']) < int(r['loser_id'])
            h, a = (r['winner_id'],r['loser_id']) if first else (r['loser_id'],r['winner_id'])
            date = dt.datetime.strptime(r['tourney_date'], '%Y%m%d').date().isoformat()
            tennis.append({'id': f"tennis:archive:{r['tourney_id']}:{r['match_num']}:{h}:{a}", 'date': date,
                'season': str(year), 'home': 'tennis:archive:' + h, 'away': 'tennis:archive:' + a,
                'homeScore': w if first else l, 'awayScore': l if first else w,
                'surface': r['surface'].lower() if r['surface'] else None, 'bestOf': int(r['best_of'])})
    ROOT.mkdir(parents=True,exist_ok=True)
    save('football.json',football); save('basketball.json',basketball); save('tennis.json',tennis)
    manifest = {'sources':provenance, 'tennisExcludedRows':excluded_tennis,
        'note':'Historical result dates only. No genuine observation, health or injury timestamps. See README for replay assumptions.',
        'datasets':{name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in ['football.json','basketball.json','tennis.json']}}
    (ROOT/'provenance.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__ == '__main__': prepare(Path(sys.argv[1]))
