// ========== NAVIGATION ==========
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
  document.getElementById(`section-${id}`).classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === id);
  });

  // Lazy load data
  if (id === 'football') {
    loadFootballStandings();
    loadFootballMatches();
  }
  if (id === 'nba') loadNbaMatches();
  if (id === 'codm') renderCodmTeams();
}

function toggleMobile() {
  document.getElementById('mobileMenu').classList.toggle('hidden');
}

document.getElementById('mobileMenuBtn').addEventListener('click', toggleMobile);

// ========== SPORTSCORE HELPERS ==========
const SS_BASE = 'https://sportscore.com/api/widget';

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

// ========== FOOTBALL ==========
const leagueSelect = document.getElementById('leagueSelect');
leagueSelect.addEventListener('change', () => {
  loadFootballStandings();
  loadFootballMatches();
});

async function loadFootballStandings() {
  const slug = leagueSelect.value;
  const container = document.getElementById('footballStandings');
  container.innerHTML = `<div class="text-center py-8 text-slate-500">Loading ${slug} standings...</div>`;

  const data = await fetchJSON(`${SS_BASE}/standings/?sport=football&slug=${slug}`);
  
  if (!data || !data.standings || !data.standings.length) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400">
        <p>Could not load live standings right now.</p>
        <p class="text-sm mt-2">SportScore may be rate-limited or the slug changed. Try refreshing later.</p>
      </div>`;
    return;
  }

  let rows = data.standings;
  if (data.standings[0] && data.standings[0].rows) {
    rows = data.standings[0].rows;
  }

  let html = `
    <table class="standings-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>P</th>
          <th>W</th>
          <th>D</th>
          <th>L</th>
          <th>GD</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>`;

  rows.slice(0, 20).forEach((row, i) => {
    const team = row.team?.name || row.name || row.team_name || 'Team';
    const pos = row.position || row.rank || (i + 1);
    const played = row.played || row.matches || row.p || '-';
    const won = row.won || row.wins || row.w || '-';
    const draw = row.draw || row.draws || row.d || '-';
    const lost = row.lost || row.losses || row.l || '-';
    const gd = row.goal_diff || row.gd || row.goalsDiff || '-';
    const pts = row.points || row.pts || '-';

    html += `
      <tr>
        <td class="font-medium text-slate-400">${pos}</td>
        <td class="font-medium">${team}</td>
        <td>${played}</td>
        <td>${won}</td>
        <td>${draw}</td>
        <td>${lost}</td>
        <td>${gd}</td>
        <td class="font-bold text-blue-400">${pts}</td>
      </tr>`;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;
}

async function loadFootballMatches() {
  const container = document.getElementById('footballMatches');
  container.innerHTML = `<div class="text-center py-8 text-slate-500">Loading matches...</div>`;

  const data = await fetchJSON(`${SS_BASE}/matches/?sport=football&limit=25`);

  if (!data || !data.matches || !data.matches.length) {
    container.innerHTML = `
      <div class="text-center py-6 text-slate-400">
        <p>No match data returned.</p>
        <p class="text-sm mt-1">You can still use the prediction engine manually later.</p>
      </div>`;
    return;
  }

  let matches = data.matches;
  let html = '';
  matches.slice(0, 15).forEach(m => {
    const home = m.home?.name || m.home_team || m.team1 || 'Home';
    const away = m.away?.name || m.away_team || m.team2 || 'Away';
    const status = m.status || m.state || 'scheduled';
    const score = (m.home_score != null) ? `${m.home_score} - ${m.away_score}` : 'vs';
    const time = m.start_time || m.date || m.time || '';

    const homeStr = 0.85 + (home.length % 10) / 30;
    const awayStr = 0.85 + (away.length % 10) / 30;

    html += `
      <div class="match-card" onclick="showFootballPrediction('${home.replace(/'/g, "\\'")}', '${away.replace(/'/g, "\\'")}', ${homeStr.toFixed(2)}, ${awayStr.toFixed(2)})">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <span class="font-semibold">${home}</span>
            <span class="text-slate-500 text-sm">${score}</span>
            <span class="font-semibold">${away}</span>
          </div>
          <div class="text-xs text-slate-500 mt-1">${status} · ${time}</div>
        </div>
        <div class="text-blue-400 text-sm font-medium">Predict →</div>
      </div>`;
  });

  container.innerHTML = html || '<p class="text-slate-500">No matches found.</p>';
}

function showFootballPrediction(home, away, hStr, aStr) {
  const panel = document.getElementById('footballPredictionPanel');
  const content = document.getElementById('footballPredictionContent');
  panel.classList.remove('hidden');

  const pred = predictFootball(home, away, hStr, aStr);

  content.innerHTML = `
    <div class="text-center mb-6">
      <div class="text-xl font-bold">${pred.homeName} <span class="text-slate-500">vs</span> ${pred.awayName}</div>
      <div class="text-sm text-slate-400 mt-1">Expected goals: ${pred.homeXG} – ${pred.awayXG}</div>
    </div>

    <div class="grid grid-cols-3 gap-3 mb-6 text-center">
      <div class="bg-arena-800 rounded-xl p-4">
        <div class="text-2xl font-bold text-blue-400">${pred.homeWin}%</div>
        <div class="text-xs text-slate-400 mt-1">Home Win</div>
      </div>
      <div class="bg-arena-800 rounded-xl p-4">
        <div class="text-2xl font-bold text-slate-300">${pred.draw}%</div>
        <div class="text-xs text-slate-400 mt-1">Draw</div>
      </div>
      <div class="bg-arena-800 rounded-xl p-4">
        <div class="text-2xl font-bold text-cyan-400">${pred.awayWin}%</div>
        <div class="text-xs text-slate-400 mt-1">Away Win</div>
      </div>
    </div>

    <div class="prob-bar mb-6">
      <div style="width:${pred.homeWin}%; background:#3b82f6"></div>
      <div style="width:${pred.draw}%; background:#64748b"></div>
      <div style="width:${pred.awayWin}%; background:#22d3ee"></div>
    </div>

    <div class="grid sm:grid-cols-2 gap-4">
      <div class="bg-arena-800/70 rounded-xl p-4">
        <div class="text-sm text-slate-400">Most likely score</div>
        <div class="text-2xl font-bold mt-1">${pred.predictedScore}</div>
        <div class="text-xs text-slate-500">${pred.predictedScoreProb}% probability</div>
      </div>
      <div class="bg-arena-800/70 rounded-xl p-4">
        <div class="text-sm text-slate-400">Over / Under 2.5</div>
        <div class="text-lg font-bold mt-1">
          <span class="text-emerald-400">O ${pred.over25}%</span> · 
          <span class="text-rose-400">U ${pred.under25}%</span>
        </div>
      </div>
    </div>

    <div class="mt-5 text-center">
      <span class="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm">
        Confidence: ${pred.confidence}%
      </span>
    </div>
  `;

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========== NBA ==========
async function loadNbaMatches() {
  const container = document.getElementById('nbaMatches');
  container.innerHTML = `<div class="text-center py-8 text-slate-500">Loading NBA matches...</div>`;

  const data = await fetchJSON(`${SS_BASE}/matches/?sport=basketball&limit=20`);

  if (!data || !data.matches || !data.matches.length) {
    container.innerHTML = `<div class="text-center py-6 text-slate-400">Could not load NBA matches right now.</div>`;
    return;
  }

  let html = '';
  data.matches.slice(0, 12).forEach(m => {
    const home = m.home?.name || m.home_team || 'Home';
    const away = m.away?.name || m.away_team || 'Away';
    const status = m.status || 'scheduled';
    const score = (m.home_score != null) ? `${m.home_score} - ${m.away_score}` : 'vs';

    const homeStr = 0.9 + (home.length % 8) / 25;
    const awayStr = 0.9 + (away.length % 8) / 25;

    html += `
      <div class="match-card" onclick="showNbaPrediction('${home.replace(/'/g, "\\'")}', '${away.replace(/'/g, "\\'")}', ${homeStr.toFixed(2)}, ${awayStr.toFixed(2)})">
        <div class="flex-1">
          <div class="flex items-center gap-3">
            <span class="font-semibold">${home}</span>
            <span class="text-slate-500 text-sm">${score}</span>
            <span class="font-semibold">${away}</span>
          </div>
          <div class="text-xs text-slate-500 mt-1">${status}</div>
        </div>
        <div class="text-blue-400 text-sm font-medium">Predict →</div>
      </div>`;
  });

  container.innerHTML = html;
}

function showNbaPrediction(home, away, hStr, aStr) {
  const panel = document.getElementById('nbaPredictionPanel');
  const content = document.getElementById('nbaPredictionContent');
  panel.classList.remove('hidden');

  const pred = predictNBA(home, away, hStr, aStr);

  content.innerHTML = `
    <div class="text-center mb-6">
      <div class="text-xl font-bold">${pred.homeName} <span class="text-slate-500">vs</span> ${pred.awayName}</div>
    </div>

    <div class="grid grid-cols-2 gap-4 mb-6 text-center">
      <div class="bg-arena-800 rounded-xl p-5">
        <div class="text-3xl font-bold text-blue-400">${pred.homeWin}%</div>
        <div class="text-sm text-slate-400 mt-1">Home Win</div>
      </div>
      <div class="bg-arena-800 rounded-xl p-5">
        <div class="text-3xl font-bold text-cyan-400">${pred.awayWin}%</div>
        <div class="text-sm text-slate-400 mt-1">Away Win</div>
      </div>
    </div>

    <div class="prob-bar mb-6">
      <div style="width:${pred.homeWin}%; background:#3b82f6"></div>
      <div style="width:${pred.awayWin}%; background:#22d3ee"></div>
    </div>

    <div class="bg-arena-800/70 rounded-xl p-4 text-center">
      <div class="text-sm text-slate-400">Projected score</div>
      <div class="text-2xl font-bold mt-1">${pred.predictedScore}</div>
    </div>

    <div class="mt-5 text-center">
      <span class="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-sm">
        Confidence: ${pred.confidence}%
      </span>
    </div>
  `;

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ========== CODM ==========
function renderCodmTeams() {
  const container = document.getElementById('codmTeams');
  const selectA = document.getElementById('codmTeamA');
  const selectB = document.getElementById('codmTeamB');

  let cards = '';
  let options = '';

  CODM_TEAMS.forEach(t => {
    cards += `
      <div class="bg-arena-800/60 border border-arena-700 rounded-xl p-4">
        <div class="font-bold">${t.name}</div>
        <div class="text-xs text-slate-400 mt-0.5">${t.region}</div>
        <div class="flex items-center gap-1 mt-2">${formHtml(t.form)}</div>
        <div class="text-xs text-slate-500 mt-2">${t.note}</div>
        <div class="mt-2 text-sm">
          Strength: <span class="text-blue-400 font-semibold">${t.strength}</span>
        </div>
      </div>`;

    options += `<option value="${t.id}">${t.name}</option>`;
  });

  container.innerHTML = cards;
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  if (CODM_TEAMS.length > 1) selectB.selectedIndex = 1;
}

function runCodmPrediction() {
  const idA = document.getElementById('codmTeamA').value;
  const idB = document.getElementById('codmTeamB').value;

  if (idA === idB) {
    alert('Pick two different teams');
    return;
  }

  const teamA = CODM_TEAMS.find(t => t.id === idA);
  const teamB = CODM_TEAMS.find(t => t.id === idB);

  const pred = predictCodm(teamA, teamB);
  const result = document.getElementById('codmPredictionResult');
  result.classList.remove('hidden');

  result.innerHTML = `
    <div class="bg-arena-800/80 border border-arena-700 rounded-2xl p-6">
      <div class="text-center mb-5">
        <div class="text-lg font-bold">${pred.teamA} <span class="text-slate-500">vs</span> ${pred.teamB}</div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-5 text-center">
        <div>
          <div class="text-3xl font-bold text-blue-400">${pred.winA}%</div>
          <div class="text-sm text-slate-400">${pred.teamA} series win</div>
          <div class="flex justify-center gap-1 mt-2">${formHtml(pred.formA)}</div>
        </div>
        <div>
          <div class="text-3xl font-bold text-cyan-400">${pred.winB}%</div>
          <div class="text-sm text-slate-400">${pred.teamB} series win</div>
          <div class="flex justify-center gap-1 mt-2">${formHtml(pred.formB)}</div>
        </div>
      </div>

      <div class="prob-bar mb-4">
        <div style="width:${pred.winA}%; background:#3b82f6"></div>
        <div style="width:${pred.winB}%; background:#22d3ee"></div>
      </div>

      <div class="text-center text-sm text-slate-400">
        Confidence: <span class="text-blue-400 font-medium">${pred.confidence}%</span>
      </div>
      <p class="text-xs text-slate-500 text-center mt-3">Based on relative strength ratings from recent African tournaments. Best-of series approximation.</p>
    </div>
  `;
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  showSection('home');
});
