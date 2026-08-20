# PredictArena

PredictArena is a dark, high-density sports prediction dashboard built for quickly scanning real upcoming matches and understanding the model behind each probability. It covers Europe’s major football leagues, NBA, tennis, CODM Africa, and EA FC Africa without presenting probabilities as betting odds.

## What is included

- Real upcoming match schedules from [TheSportsDB](https://www.thesportsdb.com/), refreshed through a server-side API route
- A football league selector for the Premier League, La Liga, Serie A, Bundesliga, Ligue 1, and Champions League
- Win/draw/loss, over/under, likely score, and confidence predictions
- A transparent football Poisson model with expected-goal inputs, score matrix, factors, sample size, and caveats
- Sport-specific basketball margin and tennis form models
- Community-labelled CODM Africa and EA FC Africa fixtures when no reliable public schedule API is available
- Knowledge Test mode with generated history question pools, sport selection, score tracking, and a local-storage leaderboard
- Responsive sportsbook-inspired interface with probability chips rather than wagers or stakes

## Data and prediction approach

`GET /api/matches` loads each supported league’s active season plus a historical sample. Football fixtures pass through a Poisson goal model; NBA fixtures use a margin model; tennis uses a form model. Predictions are informational estimates, not betting advice.

The public TheSportsDB test key (`123`) works for development. Set `THE_SPORTS_DB_API_KEY` in production if you have a paid key. CODM Africa and EA FC Africa are deliberately marked as community-maintained because their public historical coverage is not deep enough to imply false certainty.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verify

```bash
npm run lint
npm run build
```

## Why African esports is here

I wanted CODM and EA FC competition in Africa represented beside the world’s biggest leagues, not buried as an afterthought. PredictArena treats the limits of the available data honestly while making space for those scenes to become first-class parts of the product.
