/**
 * Simple but detailed prediction engine
 * Works for football (1X2 + score), NBA (moneyline style), CODM (team win %)
 */

// Basic factorial for Poisson
function factorial(n) {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

// Poisson probability mass function
function poissonP(k, lambda) {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

/**
 * Football-style prediction
 * homeAttack, homeDefence, awayAttack, awayDefence are relative strengths (0.6 - 1.6 typical)
 * Returns detailed object
 */
function predictFootball(homeName, awayName, homeStrength = 1.0, awayStrength = 1.0, homeAdv = 0.25) {
  // Expected goals
  const homeXG = Math.max(0.4, (homeStrength * 1.35) + homeAdv);
  const awayXG = Math.max(0.3, awayStrength * 1.15);

  // Score probabilities (0-5 goals)
  const scoreMatrix = [];
  let homeWin = 0, draw = 0, awayWin = 0;
  let mostLikely = { home: 0, away: 0, p: 0 };

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

  // Over/Under 2.5
  let over25 = 0;
  scoreMatrix.forEach(s => {
    if (s.h + s.a > 2.5) over25 += s.p;
  });

  // Normalize (floating point safety)
  const total = homeWin + draw + awayWin;
  homeWin /= total; draw /= total; awayWin /= total;
  over25 = Math.min(0.95, over25);

  // Confidence (how one-sided or clear the top score is)
  const confidence = Math.round((mostLikely.p * 100 + Math.abs(homeWin - awayWin) * 40) * 0.7);

  return {
    homeName,
    awayName,
    homeWin: Math.round(homeWin * 100),
    draw: Math.round(draw * 100),
    awayWin: Math.round(awayWin * 100),
    predictedScore: `${mostLikely.home} - ${mostLikely.away}`,
    predictedScoreProb: Math.round(mostLikely.p * 100),
    over25: Math.round(over25 * 100),
    under25: Math.round((1 - over25) * 100),
    homeXG: homeXG.toFixed(2),
    awayXG: awayXG.toFixed(2),
    confidence: Math.min(92, Math.max(38, confidence))
  };
}

/**
 * NBA style (no draws really, just win %)
 */
function predictNBA(homeName, awayName, homeStrength = 1.0, awayStrength = 1.0) {
  // Simple logistic based on strength difference + home court (~3-4 point equivalent)
  const diff = (homeStrength - awayStrength) + 0.12; // home boost
  const homeWinP = 1 / (1 + Math.exp(-diff * 3.2));
  const awayWinP = 1 - homeWinP;

  // Rough expected scores (league average ~112)
  const homeScore = Math.round(110 + (homeStrength - 1) * 18 + 3);
  const awayScore = Math.round(110 + (awayStrength - 1) * 18);

  return {
    homeName,
    awayName,
    homeWin: Math.round(homeWinP * 100),
    awayWin: Math.round(awayWinP * 100),
    predictedScore: `${homeScore} - ${awayScore}`,
    confidence: Math.min(88, Math.max(45, Math.round(Math.abs(homeWinP - 0.5) * 160 + 40)))
  };
}

/**
 * CODM (best of series style, pure team strength)
 */
function predictCodm(teamA, teamB) {
  const strA = teamA.strength;
  const strB = teamB.strength;
  const diff = (strA - strB) / 20; // scale

  const pA = 1 / (1 + Math.exp(-diff * 2.8));
  const pB = 1 - pA;

  // Series win probability approximation (Bo5)
  // Simple: higher chance for stronger team to take series
  const seriesA = Math.round(pA * 100);
  const seriesB = 100 - seriesA;

  return {
    teamA: teamA.name,
    teamB: teamB.name,
    winA: seriesA,
    winB: seriesB,
    confidence: Math.min(90, Math.max(50, Math.round(Math.abs(pA - 0.5) * 140 + 55))),
    formA: teamA.form,
    formB: teamB.form,
    noteA: teamA.note,
    noteB: teamB.note
  };
}

// Helper to turn form array into visual dots
function formHtml(form) {
  return form.map(r => {
    if (r === "W") return `<span class="inline-block w-5 h-5 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400 text-center leading-5">W</span>`;
    if (r === "L") return `<span class="inline-block w-5 h-5 rounded text-xs font-bold bg-rose-500/20 text-rose-400 text-center leading-5">L</span>`;
    return `<span class="inline-block w-5 h-5 rounded text-xs font-bold bg-slate-500/20 text-slate-400 text-center leading-5">D</span>`;
  }).join(" ");
}
