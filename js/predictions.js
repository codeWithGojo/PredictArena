/**
 * PredictArena prediction engine
 * Football: Poisson model
 * NBA / CODM / EA FC: strength-based logistic
 */

function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonP(k, lambda) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function predictFootball(homeName, awayName, homeStrength = 1.0, awayStrength = 1.0, homeAdv = 0.28) {
  const homeXG = Math.max(0.45, (homeStrength * 1.38) + homeAdv);
  const awayXG = Math.max(0.35, awayStrength * 1.18);

  let homeWin = 0, draw = 0, awayWin = 0;
  let mostLikely = { home: 0, away: 0, p: 0 };
  const scoreMatrix = [];

  for (let h = 0; h <= 5; h++) {
    for (let a = 0; a <= 5; a++) {
      const p = poissonP(h, homeXG) * poissonP(a, awayXG);
      scoreMatrix.push({ h, a, p });
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (p > mostLikely.p) mostLikely = { home: h, away: a, p };
    }
  }

  let over25 = 0;
  scoreMatrix.forEach(s => { if (s.h + s.a > 2.5) over25 += s.p; });

  const total = homeWin + draw + awayWin;
  homeWin /= total; draw /= total; awayWin /= total;

  const confidence = Math.min(92, Math.max(40, Math.round((mostLikely.p * 100 + Math.abs(homeWin - awayWin) * 45) * 0.72)));

  return {
    homeName, awayName,
    homeWin: Math.round(homeWin * 100),
    draw: Math.round(draw * 100),
    awayWin: Math.round(awayWin * 100),
    predictedScore: `${mostLikely.home} - ${mostLikely.away}`,
    predictedScoreProb: Math.round(mostLikely.p * 100),
    over25: Math.round(over25 * 100),
    under25: Math.round((1 - over25) * 100),
    homeXG: homeXG.toFixed(2),
    awayXG: awayXG.toFixed(2),
    confidence
  };
}

function predictNBA(homeName, awayName, homeStrength = 1.0, awayStrength = 1.0) {
  const diff = (homeStrength - awayStrength) + 0.13;
  const homeWinP = 1 / (1 + Math.exp(-diff * 3.4));
  const homeScore = Math.round(111 + (homeStrength - 1) * 17 + 3.5);
  const awayScore = Math.round(111 + (awayStrength - 1) * 17);

  return {
    homeName, awayName,
    homeWin: Math.round(homeWinP * 100),
    awayWin: Math.round((1 - homeWinP) * 100),
    predictedScore: `${homeScore} - ${awayScore}`,
    confidence: Math.min(88, Math.max(48, Math.round(Math.abs(homeWinP - 0.5) * 155 + 45)))
  };
}

function predictEsports(a, b) {
  const diff = (a.strength - b.strength) / 18;
  const pA = 1 / (1 + Math.exp(-diff * 2.9));
  return {
    teamA: a.name,
    teamB: b.name,
    winA: Math.round(pA * 100),
    winB: Math.round((1 - pA) * 100),
    confidence: Math.min(91, Math.max(52, Math.round(Math.abs(pA - 0.5) * 145 + 55))),
    formA: a.form,
    formB: b.form,
    noteA: a.note,
    noteB: b.note,
    regionA: a.region,
    regionB: b.region
  };
}

function formHtml(form) {
  return form.map(r => {
    if (r === "W") return `<span class="form-w">W</span>`;
    if (r === "L") return `<span class="form-l">L</span>`;
    return `<span class="form-d">D</span>`;
  }).join(" ");
}
