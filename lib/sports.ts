export type SportId = "all" | "football" | "basketball" | "tennis" | "codm" | "eafc";

export type Team = {
  name: string;
  short: string;
  colors: [string, string];
  badge?: string;
};

export type Prediction = {
  label: string;
  value: string;
  featured?: boolean;
  explanation?: string;
};

export type ModelFactor = {
  label: string;
  value: string;
  strength: number;
  tone: "positive" | "negative" | "neutral";
  detail: string;
};

export type ScoreCell = {
  home: number;
  away: number;
  probability: number;
};

export type ModelDetails = {
  method: string;
  version: string;
  expectedHome?: number;
  expectedAway?: number;
  expectedTotal?: number;
  sampleSize: number;
  topScoreline?: string;
  factors: ModelFactor[];
  scoreMatrix?: ScoreCell[];
  caveat: string;
};

export type Match = {
  id: string;
  sport: Exclude<SportId, "all">;
  leagueId?: string;
  league: string;
  leagueShort: string;
  date: string;
  time: string;
  kickoffISO: string;
  venue?: string;
  home: Team;
  away: Team;
  probabilities: number[];
  predictions: Prediction[];
  confidence: number;
  model: ModelDetails;
  source: "live-api" | "community" | "fallback";
  sourceLabel: string;
  featured?: boolean;
};

export type HistoricalEvent = {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
};

export type FootballModelResult = Pick<Match, "probabilities" | "predictions" | "confidence" | "model">;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const factorial = (value: number) => {
  let result = 1;
  for (let current = 2; current <= value; current += 1) result *= current;
  return result;
};

const poisson = (goals: number, lambda: number) =>
  (Math.exp(-lambda) * Math.pow(lambda, goals)) / factorial(goals);

const toPercentages = (values: number[]) => {
  const sum = values.reduce((total, value) => total + value, 0) || 1;
  const normalized = values.map((value) => Math.round((value / sum) * 100));
  const difference = 100 - normalized.reduce((total, value) => total + value, 0);
  const largestIndex = normalized.indexOf(Math.max(...normalized));
  normalized[largestIndex] += difference;
  return normalized;
};

const teamRecord = (team: string, history: HistoricalEvent[]) => {
  let games = 0;
  let scored = 0;
  let conceded = 0;
  let points = 0;
  for (const event of history) {
    if (event.homeTeam === team) {
      games += 1;
      scored += event.homeScore;
      conceded += event.awayScore;
      points += event.homeScore > event.awayScore ? 3 : event.homeScore === event.awayScore ? 1 : 0;
    } else if (event.awayTeam === team) {
      games += 1;
      scored += event.awayScore;
      conceded += event.homeScore;
      points += event.awayScore > event.homeScore ? 3 : event.awayScore === event.homeScore ? 1 : 0;
    }
  }
  return { games, scored, conceded, points };
};

export function runFootballPoisson(
  homeTeam: string,
  awayTeam: string,
  history: HistoricalEvent[],
): FootballModelResult {
  const validHistory = history.filter((event) =>
    Number.isFinite(event.homeScore) && Number.isFinite(event.awayScore),
  );
  const leagueGames = Math.max(validHistory.length, 1);
  const leagueHomeAverage = validHistory.length
    ? validHistory.reduce((total, event) => total + event.homeScore, 0) / leagueGames
    : 1.45;
  const leagueAwayAverage = validHistory.length
    ? validHistory.reduce((total, event) => total + event.awayScore, 0) / leagueGames
    : 1.15;

  const home = teamRecord(homeTeam, validHistory);
  const away = teamRecord(awayTeam, validHistory);
  const priorGames = 4;
  const leagueTeamGoalAverage = (leagueHomeAverage + leagueAwayAverage) / 2;
  const homeScoringRate = (home.scored + leagueTeamGoalAverage * priorGames) / (home.games + priorGames);
  const homeConcedingRate = (home.conceded + leagueTeamGoalAverage * priorGames) / (home.games + priorGames);
  const awayScoringRate = (away.scored + leagueTeamGoalAverage * priorGames) / (away.games + priorGames);
  const awayConcedingRate = (away.conceded + leagueTeamGoalAverage * priorGames) / (away.games + priorGames);

  const homeAttack = homeScoringRate / Math.max(leagueTeamGoalAverage, 0.5);
  const awayAttack = awayScoringRate / Math.max(leagueTeamGoalAverage, 0.5);
  const homeDefence = homeConcedingRate / Math.max(leagueTeamGoalAverage, 0.5);
  const awayDefence = awayConcedingRate / Math.max(leagueTeamGoalAverage, 0.5);
  const expectedHome = clamp(leagueHomeAverage * homeAttack * awayDefence, 0.35, 3.8);
  const expectedAway = clamp(leagueAwayAverage * awayAttack * homeDefence, 0.25, 3.4);

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let over15 = 0;
  let over25 = 0;
  let under35 = 0;
  let bothScore = 0;
  let capturedMass = 0;
  let bestProbability = 0;
  let topScoreline = "0–0";
  const scoreMatrix: ScoreCell[] = [];

  for (let homeGoals = 0; homeGoals <= 8; homeGoals += 1) {
    for (let awayGoals = 0; awayGoals <= 8; awayGoals += 1) {
      const probability = poisson(homeGoals, expectedHome) * poisson(awayGoals, expectedAway);
      capturedMass += probability;
      if (homeGoals > awayGoals) homeWin += probability;
      else if (homeGoals === awayGoals) draw += probability;
      else awayWin += probability;
      if (homeGoals + awayGoals >= 2) over15 += probability;
      if (homeGoals + awayGoals >= 3) over25 += probability;
      if (homeGoals + awayGoals <= 3) under35 += probability;
      if (homeGoals > 0 && awayGoals > 0) bothScore += probability;
      if (probability > bestProbability) {
        bestProbability = probability;
        topScoreline = `${homeGoals}–${awayGoals}`;
      }
      if (homeGoals <= 4 && awayGoals <= 4) {
        scoreMatrix.push({ home: homeGoals, away: awayGoals, probability: Math.round(probability * 1000) / 10 });
      }
    }
  }

  const outcomeProbabilities = toPercentages([homeWin, draw, awayWin]);
  const percentage = (value: number) => `${Math.round((value / capturedMass) * 100)}%`;
  const doubleChanceHome = Math.round(((homeWin + draw) / capturedMass) * 100);
  const doubleChanceAway = Math.round(((awayWin + draw) / capturedMass) * 100);
  const outcomeLabels = [
    { label: `${homeTeam} win`, value: `${outcomeProbabilities[0]}%`, probability: outcomeProbabilities[0] },
    { label: "Draw", value: `${outcomeProbabilities[1]}%`, probability: outcomeProbabilities[1] },
    { label: `${awayTeam} win`, value: `${outcomeProbabilities[2]}%`, probability: outcomeProbabilities[2] },
  ];
  const strongestOutcome = [...outcomeLabels].sort((a, b) => b.probability - a.probability)[0];
  const predictions: Prediction[] = [
    ...outcomeLabels.map((outcome) => ({
      label: outcome.label,
      value: outcome.value,
      featured: outcome.label === strongestOutcome.label,
      explanation: "Full-time 1X2 outcome from the Poisson score matrix.",
    })),
    { label: "Home or draw", value: `${doubleChanceHome}%`, explanation: "The combined probability of a home win or draw." },
    { label: "Away or draw", value: `${doubleChanceAway}%`, explanation: "The combined probability of an away win or draw." },
    { label: "Over 1.5 goals", value: percentage(over15), explanation: "Probability of at least two total goals." },
    { label: "Over 2.5 goals", value: percentage(over25), explanation: "Probability of at least three total goals." },
    { label: "Under 3.5 goals", value: percentage(under35), explanation: "Probability of no more than three total goals." },
    { label: "Both teams score", value: percentage(bothScore), explanation: "Probability that both teams score once or more." },
    { label: "Most likely score", value: topScoreline, explanation: "The single highest-probability cell in the score matrix." },
  ];

  const outcomeGap = [...outcomeProbabilities].sort((a, b) => b - a)[0] - [...outcomeProbabilities].sort((a, b) => b - a)[1];
  const teamSample = home.games + away.games;
  const confidence = Math.round(clamp(48 + validHistory.length * 0.65 + teamSample * 1.1 + outcomeGap * 0.35, 51, 86));
  const homeForm = home.games ? (home.points / (home.games * 3)) * 100 : 50;
  const awayForm = away.games ? (away.points / (away.games * 3)) * 100 : 50;

  return {
    probabilities: outcomeProbabilities,
    predictions,
    confidence,
    model: {
      method: "Poisson goal model",
      version: "PA-Poisson 1.2",
      expectedHome: Math.round(expectedHome * 100) / 100,
      expectedAway: Math.round(expectedAway * 100) / 100,
      expectedTotal: Math.round((expectedHome + expectedAway) * 100) / 100,
      sampleSize: validHistory.length,
      topScoreline,
      scoreMatrix,
      factors: [
        {
          label: `${homeTeam} attack`,
          value: `${homeAttack.toFixed(2)}× league`,
          strength: Math.round(clamp(homeAttack * 55, 12, 100)),
          tone: homeAttack >= 1 ? "positive" : "negative",
          detail: `${home.games || 0} available historical matches, shrunk toward the league average to avoid overreacting.`,
        },
        {
          label: `${awayTeam} attack`,
          value: `${awayAttack.toFixed(2)}× league`,
          strength: Math.round(clamp(awayAttack * 55, 12, 100)),
          tone: awayAttack >= 1 ? "positive" : "negative",
          detail: `${away.games || 0} available historical matches, with the same low-sample adjustment.`,
        },
        {
          label: "Recent points rate",
          value: `${Math.round(homeForm)}% · ${Math.round(awayForm)}%`,
          strength: Math.round((homeForm + awayForm) / 2),
          tone: homeForm > awayForm ? "positive" : homeForm < awayForm ? "negative" : "neutral",
          detail: "Share of available league points earned in the matches present in the feed sample.",
        },
        {
          label: "League goal baseline",
          value: `${leagueHomeAverage.toFixed(2)} · ${leagueAwayAverage.toFixed(2)}`,
          strength: Math.round(clamp(((leagueHomeAverage + leagueAwayAverage) / 3.2) * 100, 20, 100)),
          tone: "neutral",
          detail: "Average home and away goals in the historical league sample. This carries the home-field effect.",
        },
      ],
      caveat: teamSample < 6
        ? "Cold-start model: one or both teams have little history in the returned sample, so league averages carry more weight."
        : "The score distribution is based on recent league scoring rates. Injuries, lineups and red cards are not yet model inputs.",
    },
  };
}

export function runBasketballMarginModel(
  homeTeam: string,
  awayTeam: string,
  history: HistoricalEvent[],
): FootballModelResult {
  const validHistory = history.filter((event) => Number.isFinite(event.homeScore) && Number.isFinite(event.awayScore));
  const home = teamRecord(homeTeam, validHistory);
  const away = teamRecord(awayTeam, validHistory);
  const homeDiff = home.games ? (home.scored - home.conceded) / home.games : 0;
  const awayDiff = away.games ? (away.scored - away.conceded) / away.games : 0;
  const projectedMargin = clamp((homeDiff - awayDiff) * 0.55 + 3.1, -18, 18);
  const homeProbability = Math.round((1 / (1 + Math.exp(-projectedMargin / 6.8))) * 100);
  const awayProbability = 100 - homeProbability;
  const historicalTotal = validHistory.length
    ? validHistory.reduce((total, event) => total + event.homeScore + event.awayScore, 0) / validHistory.length
    : 222;
  const expectedTotal = Math.round(historicalTotal * 10) / 10;
  const topIsHome = homeProbability >= awayProbability;
  const teamSample = home.games + away.games;
  const confidence = Math.round(clamp(50 + validHistory.length * 0.7 + Math.abs(homeProbability - awayProbability) * 0.25, 52, 82));
  return {
    probabilities: [homeProbability, awayProbability],
    confidence,
    predictions: [
      { label: `${homeTeam} win`, value: `${homeProbability}%`, featured: topIsHome, explanation: "Two-way win probability from projected scoring margin." },
      { label: `${awayTeam} win`, value: `${awayProbability}%`, featured: !topIsHome, explanation: "Two-way win probability from projected scoring margin." },
      { label: "Projected margin", value: `${projectedMargin >= 0 ? "+" : ""}${projectedMargin.toFixed(1)} home`, explanation: "Expected home scoring margin after the home-court adjustment." },
      { label: "Projected total", value: `${expectedTotal}`, explanation: "Blended points total from the returned league sample." },
      { label: "Close game", value: `${Math.round(clamp(100 - Math.abs(projectedMargin) * 6, 12, 88))}%`, explanation: "Probability proxy for a finish within roughly two possessions." },
    ],
    model: {
      method: "Scoring-margin logistic",
      version: "PA-Margin 1.0",
      expectedTotal,
      sampleSize: validHistory.length,
      factors: [
        { label: `${homeTeam} point differential`, value: `${homeDiff >= 0 ? "+" : ""}${homeDiff.toFixed(1)}`, strength: Math.round(clamp(50 + homeDiff * 3, 10, 95)), tone: homeDiff >= 0 ? "positive" : "negative", detail: `${home.games} matching games in the current feed sample.` },
        { label: `${awayTeam} point differential`, value: `${awayDiff >= 0 ? "+" : ""}${awayDiff.toFixed(1)}`, strength: Math.round(clamp(50 + awayDiff * 3, 10, 95)), tone: awayDiff >= 0 ? "positive" : "negative", detail: `${away.games} matching games in the current feed sample.` },
        { label: "Home-court adjustment", value: "+3.1 pts", strength: 58, tone: "positive", detail: "A conservative baseline added before the logistic win conversion." },
      ],
      caveat: teamSample < 5
        ? "Limited team history was returned, so this read leans heavily on a neutral margin and home-court baseline."
        : "The model uses score margins, not player availability or confirmed lineups.",
    },
  };
}

export function runTennisFormModel(
  playerOne: string,
  playerTwo: string,
  history: HistoricalEvent[],
): FootballModelResult {
  const validHistory = history.filter((event) => Number.isFinite(event.homeScore) && Number.isFinite(event.awayScore));
  const playerRecord = (player: string) => {
    let matches = 0;
    let wins = 0;
    let setsWon = 0;
    let setsLost = 0;
    for (const event of validHistory) {
      if (event.homeTeam === player) {
        matches += 1;
        setsWon += event.homeScore;
        setsLost += event.awayScore;
        if (event.homeScore > event.awayScore) wins += 1;
      } else if (event.awayTeam === player) {
        matches += 1;
        setsWon += event.awayScore;
        setsLost += event.homeScore;
        if (event.awayScore > event.homeScore) wins += 1;
      }
    }
    return { matches, wins, setsWon, setsLost };
  };
  const one = playerRecord(playerOne);
  const two = playerRecord(playerTwo);
  const priorMatches = 5;
  const oneRate = (one.wins + priorMatches * 0.5) / (one.matches + priorMatches);
  const twoRate = (two.wins + priorMatches * 0.5) / (two.matches + priorMatches);
  const logitDifference = Math.log(oneRate / (1 - oneRate)) - Math.log(twoRate / (1 - twoRate));
  const firstProbability = Math.round(clamp((1 / (1 + Math.exp(-logitDifference))) * 100, 20, 80));
  const secondProbability = 100 - firstProbability;
  const firstSets = (one.setsWon + 3) / Math.max(one.setsWon + one.setsLost + 6, 1);
  const secondSets = (two.setsWon + 3) / Math.max(two.setsWon + two.setsLost + 6, 1);
  const longMatch = Math.round(clamp(72 - Math.abs(firstProbability - secondProbability) * 0.8, 28, 72));
  const confidence = Math.round(clamp(50 + validHistory.length * 0.6 + (one.matches + two.matches) * 1.2, 51, 78));
  const firstFavoured = firstProbability >= secondProbability;
  return {
    probabilities: [firstProbability, secondProbability],
    confidence,
    predictions: [
      { label: `${playerOne} win`, value: `${firstProbability}%`, featured: firstFavoured, explanation: "Two-way win probability from each player's available match record." },
      { label: `${playerTwo} win`, value: `${secondProbability}%`, featured: !firstFavoured, explanation: "Two-way win probability from each player's available match record." },
      { label: "Long match", value: `${longMatch}%`, explanation: "A closeness proxy for the match reaching a deciding or extended set." },
      { label: `${playerOne} set share`, value: `${Math.round(firstSets * 100)}%`, explanation: "Smoothed share of sets won in the returned sample." },
      { label: `${playerTwo} set share`, value: `${Math.round(secondSets * 100)}%`, explanation: "Smoothed share of sets won in the returned sample." },
    ],
    model: {
      method: "Tennis form logistic",
      version: "PA-Tennis 1.0",
      sampleSize: validHistory.length,
      factors: [
        { label: `${playerOne} match form`, value: `${Math.round(oneRate * 100)}%`, strength: Math.round(oneRate * 100), tone: oneRate >= 0.5 ? "positive" : "negative", detail: `${one.matches} player matches found; a five-match neutral prior limits cold-start swings.` },
        { label: `${playerTwo} match form`, value: `${Math.round(twoRate * 100)}%`, strength: Math.round(twoRate * 100), tone: twoRate >= 0.5 ? "positive" : "negative", detail: `${two.matches} player matches found with the same smoothing.` },
        { label: "Match closeness", value: `${longMatch}%`, strength: longMatch, tone: "neutral", detail: "Higher when the two smoothed win rates are close together." },
      ],
      caveat: "Surface, draw strength, retirement risk and current fitness are not yet included, so tennis confidence is capped below 80%.",
    },
  };
}

export function colorsFromName(name: string): [string, string] {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  const hue = hash % 360;
  return [`hsl(${hue} 66% 46%)`, `hsl(${(hue + 48) % 360} 58% 70%)`];
}

export function shortName(name: string) {
  const ignored = new Set(["fc", "cf", "club", "the", "de"]);
  const words = name.split(/\s+/).filter((word) => word && !ignored.has(word.toLowerCase()));
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((word) => word[0]).join("").toUpperCase();
}
