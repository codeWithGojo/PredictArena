const SS = "https://sportscore.com/api/widget";

function show(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("on"));
  document.getElementById("s-" + id).classList.add("on");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.s === id));
  if (id === "football") { loadStandings(); loadMatches(); }
  if (id === "nba") loadNba();
  if (id === "codm") renderCodm();
  if (id === "eafc") renderEafc();
}

async function getJSON(url) {
  try { const r = await fetch(url); if (!r.ok) throw 0; return await r.json(); }
  catch { return null; }
}

document.getElementById("league")?.addEventListener("change", () => { loadStandings(); loadMatches(); });

async function loadStandings() {
  const slug = document.getElementById("league").value;
  const el = document.getElementById("standings");
  el.innerHTML = '<div class="center faint" style="padding:32px">Loading...</div>';
  const data = await getJSON(`${SS}/standings/?sport=football&slug=${slug}`);
  if (!data?.standings?.length) {
    el.innerHTML = '<div class="center muted" style="padding:32px">Standings unavailable. Try again later.</div>';
    return;
  }
  const rows = data.standings[0]?.rows || data.standings;
  let html = `<table><thead><tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GD</th><th>Pts</th></tr></thead><tbody>`;
  rows.slice(0, 20).forEach((r, i) => {
    const t = r.team?.name || r.name || "Team";
    html += `<tr>
      <td class="faint">${r.position || r.rank || i + 1}</td>
      <td style="font-weight:500">${t}</td>
      <td>${r.played || r.p || "-"}</td>
      <td>${r.won || r.w || "-"}</td>
      <td>${r.draw || r.d || "-"}</td>
      <td>${r.lost || r.l || "-"}</td>
      <td>${r.goal_diff || r.gd || "-"}</td>
      <td style="font-weight:700;color:var(--red2)">${r.points || r.pts || "-"}</td>
    </tr>`;
  });
  el.innerHTML = html + "</tbody></table>";
}

async function loadMatches() {
  const el = document.getElementById("matches");
  el.innerHTML = '<div class="center faint" style="padding:32px">Loading...</div>';
  const data = await getJSON(`${SS}/matches/?sport=football&limit=20`);
  if (!data?.matches?.length) {
    el.innerHTML = '<div class="center muted" style="padding:32px">No matches returned.</div>';
    return;
  }
  el.innerHTML = data.matches.slice(0, 14).map(m => {
    const home = m.home?.name || m.home_team || "Home";
    const away = m.away?.name || m.away_team || "Away";
    const score = m.home_score != null ? `${m.home_score} - ${m.away_score}` : "vs";
    const hs = (0.9 + (home.length % 9) / 28).toFixed(2);
    const as = (0.9 + (away.length % 9) / 28).toFixed(2);
    return `<div class="match" onclick="footPred('${esc(home)}','${esc(away)}',${hs},${as})">
      <div><div style="font-weight:600">${home} <span class="faint" style="margin:0 6px;font-weight:400">${score}</span> ${away}</div>
      <div class="meta">${m.status || "scheduled"}</div></div>
      <div class="go">Predict →</div>
    </div>`;
  }).join("");
}

function footPred(home, away, hs, as) {
  const p = predictFootball(home, away, +hs, +as);
  const panel = document.getElementById("foot-panel");
  panel.style.display = "block";
  panel.innerHTML = `
    <h2 class="center mb" style="font-size:1.1rem">${p.home} <span class="faint">vs</span> ${p.away}</h2>
    <div class="row2 mb" style="grid-template-columns:1fr 1fr 1fr">
      <div class="stat"><div class="num" style="color:var(--red2)">${p.homeWin}%</div><div class="lbl">Home</div></div>
      <div class="stat"><div class="num">${p.draw}%</div><div class="lbl">Draw</div></div>
      <div class="stat"><div class="num" style="color:#fca5a5">${p.awayWin}%</div><div class="lbl">Away</div></div>
    </div>
    <div class="bar mb"><i style="width:${p.homeWin}%;background:var(--red)"></i><i style="width:${p.draw}%;background:#52525b"></i><i style="width:${p.awayWin}%;background:#fca5a5"></i></div>
    <div class="row2 mb">
      <div class="stat"><div class="lbl">Most likely score</div><div class="num" style="font-size:1.4rem;margin-top:4px">${p.score}</div></div>
      <div class="stat"><div class="lbl">Over / Under 2.5</div><div style="margin-top:6px;font-weight:600"><span style="color:#4ade80">O ${p.over}%</span> · <span style="color:#f87171">U ${p.under}%</span></div></div>
    </div>
    <div class="center"><span style="background:rgba(239,68,68,.12);color:var(--red2);padding:6px 14px;border-radius:99px;font-size:.85rem">Confidence ${p.confidence}%</span></div>`;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function loadNba() {
  const el = document.getElementById("nba-matches");
  el.innerHTML = '<div class="center faint" style="padding:32px">Loading...</div>';
  const data = await getJSON(`${SS}/matches/?sport=basketball&limit=16`);
  if (!data?.matches?.length) {
    el.innerHTML = '<div class="center muted" style="padding:32px">No NBA matches right now.</div>';
    return;
  }
  el.innerHTML = data.matches.slice(0, 12).map(m => {
    const home = m.home?.name || "Home", away = m.away?.name || "Away";
    const score = m.home_score != null ? `${m.home_score} - ${m.away_score}` : "vs";
    const hs = (0.95 + (home.length % 8) / 30).toFixed(2);
    const as = (0.95 + (away.length % 8) / 30).toFixed(2);
    return `<div class="match" onclick="nbaPred('${esc(home)}','${esc(away)}',${hs},${as})">
      <div><div style="font-weight:600">${home} <span class="faint" style="margin:0 6px">${score}</span> ${away}</div>
      <div class="meta">${m.status || "scheduled"}</div></div>
      <div class="go">Predict →</div>
    </div>`;
  }).join("");
}

function nbaPred(home, away, hs, as) {
  const p = predictNBA(home, away, +hs, +as);
  const panel = document.getElementById("nba-panel");
  panel.style.display = "block";
  panel.innerHTML = `
    <h2 class="center mb" style="font-size:1.1rem">${p.home} <span class="faint">vs</span> ${p.away}</h2>
    <div class="row2 mb">
      <div class="stat"><div class="num" style="color:var(--red2)">${p.homeWin}%</div><div class="lbl">Home Win</div></div>
      <div class="stat"><div class="num" style="color:#fca5a5">${p.awayWin}%</div><div class="lbl">Away Win</div></div>
    </div>
    <div class="bar mb"><i style="width:${p.homeWin}%;background:var(--red)"></i><i style="width:${p.awayWin}%;background:#fca5a5"></i></div>
    <div class="stat mb"><div class="lbl">Projected score</div><div class="num" style="font-size:1.4rem;margin-top:4px">${p.score}</div></div>
    <div class="center"><span style="background:rgba(239,68,68,.12);color:var(--red2);padding:6px 14px;border-radius:99px;font-size:.85rem">Confidence ${p.confidence}%</span></div>`;
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderCodm() {
  document.getElementById("codm-teams").innerHTML = CODM_TEAMS.map(t => `
    <div class="team-card">
      <div class="name">${t.name}</div>
      <div class="reg">${t.region}</div>
      <div style="display:flex;gap:4px;margin-top:8px">${formHtml(t.form)}</div>
      <div class="note">${t.note}</div>
      <div class="str">Strength <b>${t.strength}</b></div>
    </div>`).join("");
  const opts = CODM_TEAMS.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
  document.getElementById("codm-a").innerHTML = opts;
  document.getElementById("codm-b").innerHTML = opts;
  document.getElementById("codm-b").selectedIndex = 1;
}

function runCodm() {
  const a = CODM_TEAMS.find(t => t.id === document.getElementById("codm-a").value);
  const b = CODM_TEAMS.find(t => t.id === document.getElementById("codm-b").value);
  if (a.id === b.id) return alert("Pick two different teams");
  const p = predictEsports(a, b);
  document.getElementById("codm-result").innerHTML = espResult(p);
}

function renderEafc() {
  document.getElementById("eafc-players").innerHTML = EAFC_PLAYERS.map(t => `
    <div class="team-card">
      <div class="name">${t.name}</div>
      <div class="reg">${t.region}</div>
      <div style="display:flex;gap:4px;margin-top:8px">${formHtml(t.form)}</div>
      <div class="note">${t.note}</div>
      <div class="str">Strength <b>${t.strength}</b></div>
    </div>`).join("");
  const opts = EAFC_PLAYERS.map(t => `<option value="${t.id}">${t.name}</option>`).join("");
  document.getElementById("eafc-a").innerHTML = opts;
  document.getElementById("eafc-b").innerHTML = opts;
  document.getElementById("eafc-b").selectedIndex = 1;
}

function runEafc() {
  const a = EAFC_PLAYERS.find(t => t.id === document.getElementById("eafc-a").value);
  const b = EAFC_PLAYERS.find(t => t.id === document.getElementById("eafc-b").value);
  if (a.id === b.id) return alert("Pick two different players");
  const p = predictEsports(a, b);
  document.getElementById("eafc-result").innerHTML = espResult(p);
}

function espResult(p) {
  return `<div class="card" style="margin-top:18px;border-color:rgba(239,68,68,.3)">
    <div class="center" style="font-weight:700;font-size:1.05rem;margin-bottom:16px">${p.a} <span class="faint">vs</span> ${p.b}</div>
    <div class="row2 mb">
      <div class="stat"><div class="num" style="color:var(--red2)">${p.winA}%</div><div class="lbl">${p.a}</div><div style="display:flex;justify-content:center;gap:4px;margin-top:8px">${formHtml(p.formA)}</div></div>
      <div class="stat"><div class="num" style="color:#fca5a5">${p.winB}%</div><div class="lbl">${p.b}</div><div style="display:flex;justify-content:center;gap:4px;margin-top:8px">${formHtml(p.formB)}</div></div>
    </div>
    <div class="bar mb"><i style="width:${p.winA}%;background:var(--red)"></i><i style="width:${p.winB}%;background:#fca5a5"></i></div>
    <div class="center muted" style="font-size:.85rem">Confidence <span style="color:var(--red2)">${p.confidence}%</span></div>
  </div>`;
}

function esc(s) { return s.replace(/'/g, "\\'"); }

document.addEventListener("DOMContentLoaded", () => show("home"));
