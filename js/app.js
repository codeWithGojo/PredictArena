// ========== NAV ==========
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById('section-' + id).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === id);
  });
  if (id === 'football') { loadFootballStandings(); loadFootballMatches(); }
  if (id === 'nba') loadNbaMatches();
  if (id === 'codm') renderCodm();
  if (id === 'eafc') renderEafc();
}

// ========== API ==========
const SS = 'https://sportscore.com/api/widget';
async function fetchJSON(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) { console.error(e); return null; }
}

// ========== FOOTBALL ==========
document.getElementById('leagueSelect')?.addEventListener('change', () => {
  loadFootballStandings(); loadFootballMatches();
});

async function loadFootballStandings() {
  const slug = document.getElementById('leagueSelect').value;
  const el = document.getElementById('footballStandings');
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-faint)">Loading...</div>';
  const data = await fetchJSON(`${SS}/standings/?sport=football&slug=${slug}`);
  if (!data || !data.standings?.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-dim)">Standings unavailable right now. Try again later.</div>';
    return;
  }
  let rows = data.standings[0]?.rows || data.standings;
  let html = `<table class="standings-table"><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>`;
  rows.slice(0,20).forEach((row,i) => {
    const team = row.team?.name || row.name || 'Team';
    html += `<tr>
      <td style="color:var(--text-faint)">${row.position||row.rank||i+1}</td>
      <td style="font-weight:500">${team}</td>
      <td>${row.played||row.p||'-'}</td>
      <td>${row.won||row.w||'-'}</td>
      <td>${row.draw||row.d||'-'}</td>
      <td>${row.lost||row.l||'-'}</td>
      <td>${row.goal_diff||row.gd||'-'}</td>
      <td style="font-weight:700;color:var(--red-bright)">${row.points||row.pts||'-'}</td>
    </tr>`;
  });
  el.innerHTML = html + '</tbody></table>';
}

async function loadFootballMatches() {
  const el = document.getElementById('footballMatches');
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-faint)">Loading...</div>';
  const data = await fetchJSON(`${SS}/matches/?sport=football&limit=20`);
  if (!data?.matches?.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-dim)">No matches returned.</div>';
    return;
  }
  el.innerHTML = data.matches.slice(0,14).map(m => {
    const home = m.home?.name || m.home_team || 'Home';
    const away = m.away?.name || m.away_team || 'Away';
    const score = m.home_score != null ? `${m.home_score} - ${m.away_score}` : 'vs';
    const hStr = (0.9 + (home.length % 9)/28).toFixed(2);
    const aStr = (0.9 + (away.length % 9)/28).toFixed(2);
    return `<div class="match-card" onclick="showFootballPred('${home.replace(/'/g,"\\'")}','${away.replace(/'/g,"\\'")}',${hStr},${aStr})">
      <div><div style="font-weight:600">${home} <span style="color:var(--text-faint);font-weight:400;margin:0 6px">${score}</span> ${away}</div>
      <div style="font-size:0.75rem;color:var(--text-faint);margin-top:4px">${m.status||'scheduled'}</div></div>
      <div style="color:var(--red-bright);font-size:0.85rem;font-weight:500">Predict →</div>
    </div>`;
  }).join('');
}

function showFootballPred(home, away, hStr, aStr) {
  const panel = document.getElementById('footballPredictionPanel');
  panel.classList.remove('hidden');
  const p = predictFootball(home, away, +hStr, +aStr);
  panel.innerHTML = `
    <h2 style="margin:0 0 20px;font-size:1.1rem;text-align:center">${p.homeName} <span style="color:var(--text-faint)">vs</span> ${p.awayName}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;margin-bottom:20px;">
      <div style="background:var(--surface-2);border-radius:12px;padding:16px"><div style="font-size:1.8rem;font-weight:700;color:var(--red-bright)">${p.homeWin}%</div><div style="font-size:0.75rem;color:var(--text-faint)">Home</div></div>
      <div style="background:var(--surface-2);border-radius:12px;padding:16px"><div style="font-size:1.8rem;font-weight:700">${p.draw}%</div><div style="font-size:0.75rem;color:var(--text-faint)">Draw</div></div>
      <div style="background:var(--surface-2);border-radius:12px;padding:16px"><div style="font-size:1.8rem;font-weight:700;color:#fca5a5">${p.awayWin}%</div><div style="font-size:0.75rem;color:var(--text-faint)">Away</div></div>
    </div>
    <div class="prob-bar" style="margin-bottom:20px">
      <div style="width:${p.homeWin}%;background:var(--red)"></div>
      <div style="width:${p.draw}%;background:#52525b"></div>
      <div style="width:${p.awayWin}%;background:#fca5a5"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div style="background:var(--surface-2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:0.75rem;color:var(--text-faint)">Most likely score</div>
        <div style="font-size:1.5rem;font-weight:700;margin-top:4px">${p.predictedScore}</div>
      </div>
      <div style="background:var(--surface-2);border-radius:12px;padding:16px;text-align:center">
        <div style="font-size:0.75rem;color:var(--text-faint)">Over / Under 2.5</div>
        <div style="font-size:1.1rem;font-weight:600;margin-top:4px"><span style="color:#4ade80">O ${p.over25}%</span> · <span style="color:#f87171">U ${p.under25}%</span></div>
      </div>
    </div>
    <div style="text-align:center"><span style="background:rgba(239,68,68,0.12);color:var(--red-bright);padding:6px 14px;border-radius:99px;font-size:0.85rem;">Confidence ${p.confidence}%</span></div>
  `;
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ========== NBA ==========
async function loadNbaMatches() {
  const el = document.getElementById('nbaMatches');
  el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-faint)">Loading...</div>';
  const data = await fetchJSON(`${SS}/matches/?sport=basketball&limit=16`);
  if (!data?.matches?.length) {
    el.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-dim)">No NBA matches right now.</div>';
    return;
  }
  el.innerHTML = data.matches.slice(0,12).map(m => {
    const home = m.home?.name || 'Home';
    const away = m.away?.name || 'Away';
    const score = m.home_score != null ? `${m.home_score} - ${m.away_score}` : 'vs';
    const hStr = (0.95 + (home.length % 8)/30).toFixed(2);
    const aStr = (0.95 + (away.length % 8)/30).toFixed(2);
    return `<div class="match-card" onclick="showNbaPred('${home.replace(/'/g,"\\'")}','${away.replace(/'/g,"\\'")}',${hStr},${aStr})">
      <div><div style="font-weight:600">${home} <span style="color:var(--text-faint);margin:0 6px">${score}</span> ${away}</div>
      <div style="font-size:0.75rem;color:var(--text-faint);margin-top:4px">${m.status||'scheduled'}</div></div>
      <div style="color:var(--red-bright);font-size:0.85rem;font-weight:500">Predict →</div>
    </div>`;
  }).join('');
}

function showNbaPred(home, away, hStr, aStr) {
  const panel = document.getElementById('nbaPredictionPanel');
  panel.classList.remove('hidden');
  const p = predictNBA(home, away, +hStr, +aStr);
  panel.innerHTML = `
    <h2 style="margin:0 0 20px;font-size:1.1rem;text-align:center">${p.homeName} <span style="color:var(--text-faint)">vs</span> ${p.awayName}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:center;margin-bottom:20px;">
      <div style="background:var(--surface-2);border-radius:12px;padding:20px"><div style="font-size:2rem;font-weight:700;color:var(--red-bright)">${p.homeWin}%</div><div style="font-size:0.8rem;color:var(--text-faint)">Home Win</div></div>
      <div style="background:var(--surface-2);border-radius:12px;padding:20px"><div style="font-size:2rem;font-weight:700;color:#fca5a5">${p.awayWin}%</div><div style="font-size:0.8rem;color:var(--text-faint)">Away Win</div></div>
    </div>
    <div class="prob-bar" style="margin-bottom:20px">
      <div style="width:${p.homeWin}%;background:var(--red)"></div>
      <div style="width:${p.awayWin}%;background:#fca5a5"></div>
    </div>
    <div style="background:var(--surface-2);border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
      <div style="font-size:0.75rem;color:var(--text-faint)">Projected score</div>
      <div style="font-size:1.5rem;font-weight:700;margin-top:4px">${p.predictedScore}</div>
    </div>
    <div style="text-align:center"><span style="background:rgba(239,68,68,0.12);color:var(--red-bright);padding:6px 14px;border-radius:99px;font-size:0.85rem;">Confidence ${p.confidence}%</span></div>
  `;
  panel.scrollIntoView({behavior:'smooth',block:'nearest'});
}

// ========== CODM ==========
function renderCodm() {
  const grid = document.getElementById('codmTeams');
  const selA = document.getElementById('codmTeamA');
  const selB = document.getElementById('codmTeamB');
  grid.innerHTML = CODM_TEAMS.map(t => `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="font-weight:700">${t.name}</div>
      <div style="font-size:0.75rem;color:var(--text-faint);margin-top:2px">${t.region}</div>
      <div style="display:flex;gap:4px;margin-top:10px">${formHtml(t.form)}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin-top:8px">${t.note}</div>
      <div style="margin-top:8px;font-size:0.85rem">Strength <span style="color:var(--red-bright);font-weight:600">${t.strength}</span></div>
    </div>`).join('');
  selA.innerHTML = selB.innerHTML = CODM_TEAMS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  if (CODM_TEAMS.length > 1) selB.selectedIndex = 1;
}

function runCodmPrediction() {
  const a = CODM_TEAMS.find(t => t.id === document.getElementById('codmTeamA').value);
  const b = CODM_TEAMS.find(t => t.id === document.getElementById('codmTeamB').value);
  if (a.id === b.id) return alert('Pick two different teams');
  const p = predictEsports(a, b);
  document.getElementById('codmResult').innerHTML = `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:16px;padding:24px;">
      <div style="text-align:center;font-weight:700;font-size:1.1rem;margin-bottom:20px">${p.teamA} <span style="color:var(--text-faint)">vs</span> ${p.teamB}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center;margin-bottom:16px;">
        <div><div style="font-size:2rem;font-weight:700;color:var(--red-bright)">${p.winA}%</div><div style="font-size:0.8rem;color:var(--text-faint)">${p.teamA}</div><div style="display:flex;justify-content:center;gap:4px;margin-top:8px">${formHtml(p.formA)}</div></div>
        <div><div style="font-size:2rem;font-weight:700;color:#fca5a5">${p.winB}%</div><div style="font-size:0.8rem;color:var(--text-faint)">${p.teamB}</div><div style="display:flex;justify-content:center;gap:4px;margin-top:8px">${formHtml(p.formB)}</div></div>
      </div>
      <div class="prob-bar" style="margin-bottom:16px"><div style="width:${p.winA}%;background:var(--red)"></div><div style="width:${p.winB}%;background:#fca5a5"></div></div>
      <div style="text-align:center;font-size:0.85rem;color:var(--text-dim)">Confidence <span style="color:var(--red-bright)">${p.confidence}%</span> · Based on recent African tournament results</div>
    </div>`;
}

// ========== EA FC ==========
function renderEafc() {
  const grid = document.getElementById('eafcPlayers');
  const selA = document.getElementById('eafcPlayerA');
  const selB = document.getElementById('eafcPlayerB');
  grid.innerHTML = EAFC_PLAYERS.map(t => `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:12px;padding:16px;">
      <div style="font-weight:700">${t.name}</div>
      <div style="font-size:0.75rem;color:var(--text-faint);margin-top:2px">${t.region}</div>
      <div style="display:flex;gap:4px;margin-top:10px">${formHtml(t.form)}</div>
      <div style="font-size:0.8rem;color:var(--text-dim);margin-top:8px">${t.note}</div>
      <div style="margin-top:8px;font-size:0.85rem">Strength <span style="color:var(--red-bright);font-weight:600">${t.strength}</span></div>
    </div>`).join('');
  selA.innerHTML = selB.innerHTML = EAFC_PLAYERS.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  if (EAFC_PLAYERS.length > 1) selB.selectedIndex = 1;
}

function runEafcPrediction() {
  const a = EAFC_PLAYERS.find(t => t.id === document.getElementById('eafcPlayerA').value);
  const b = EAFC_PLAYERS.find(t => t.id === document.getElementById('eafcPlayerB').value);
  if (a.id === b.id) return alert('Pick two different players');
  const p = predictEsports(a, b);
  document.getElementById('eafcResult').innerHTML = `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:16px;padding:24px;">
      <div style="text-align:center;font-weight:700;font-size:1.1rem;margin-bottom:20px">${p.teamA} <span style="color:var(--text-faint)">vs</span> ${p.teamB}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;text-align:center;margin-bottom:16px;">
        <div><div style="font-size:2rem;font-weight:700;color:var(--red-bright)">${p.winA}%</div><div style="font-size:0.8rem;color:var(--text-faint)">${p.teamA}</div><div style="display:flex;justify-content:center;gap:4px;margin-top:8px">${formHtml(p.formA)}</div></div>
        <div><div style="font-size:2rem;font-weight:700;color:#fca5a5">${p.winB}%</div><div style="font-size:0.8rem;color:var(--text-faint)">${p.teamB}</div><div style="display:flex;justify-content:center;gap:4px;margin-top:8px">${formHtml(p.formB)}</div></div>
      </div>
      <div class="prob-bar" style="margin-bottom:16px"><div style="width:${p.winA}%;background:var(--red)"></div><div style="width:${p.winB}%;background:#fca5a5"></div></div>
      <div style="text-align:center;font-size:0.85rem;color:var(--text-dim)">Confidence <span style="color:var(--red-bright)">${p.confidence}%</span> · Based on eAFCON & FC Pro Africa results</div>
    </div>`;
}

// INIT
document.addEventListener('DOMContentLoaded', () => showSection('home'));
