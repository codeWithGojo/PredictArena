# PredictArena

Dark + blue pure-frontend sports prediction site.

## Features
- Football (Europe Top 5 leagues) – standings + matches + detailed score predictions
- NBA – matches + win probability + projected score
- CODM Africa – curated teams + series win predictions
- Poisson-based football model (win/draw/loss %, most likely score, Over/Under 2.5)
- Fully client-side (no backend)

## How to run
1. Open `index.html` in any modern browser.
2. Or enable GitHub Pages on this repo for a live link.
3. Or deploy to Netlify / Vercel.

## Files
```
PredictArena/
├── index.html
├── css/style.css
├── js/
│   ├── app.js
│   └── predictions.js
└── data/codm.js
```

## Notes
- Live data from SportScore (free, CORS-open).
- CODM data curated from recent African tournaments (Carry1st, Kon10dr, etc.).
- Predictions are statistical models for analysis/entertainment only.

Built by Favour Imegu (codeWithGojo).
