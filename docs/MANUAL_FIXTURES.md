# Manual football fixtures

For now, the simplest controlled entry method is a reviewed GitHub edit. Edit `data/manual-football-fixtures.json`, open a pull request, and merge it. Vercel's Git integration then deploys the updated schedule. Do not add a public write endpoint or put an administrator password in the browser.

The file is a JSON array. For example:

```json
[
  {
    "id": "pl-2026-09-28-ars-che",
    "leagueId": "39",
    "startsAt": "2026-09-28T19:00:00.000Z",
    "home": "Arsenal",
    "away": "Chelsea",
    "venue": "Emirates Stadium"
  }
]
```

`startsAt` must be a future UTC ISO timestamp (`Z`). A Lagos kickoff at 20:00 WAT is 19:00 UTC. `id` must be unique and contain only letters, digits or hyphens. The teams must use the same names as the historical API-Football results (the model normalizes case and spaces, not aliases). `venue` is optional. Supported `leagueId` values are `39` Premier League, `140` La Liga, `135` Serie A, `78` Bundesliga, `61` Ligue 1, and `2` Champions League. Remove old entries in a later PR to keep the file tidy; past fixtures are automatically hidden.

A manual fixture is a schedule entry, not a completed result. The model looks for completed results from the existing API-Football feed in that league. If there is no eligible historical data (for example, the provider is unavailable), the fixture appears as **Awaiting history** and no probability is invented. The current feed looks back 60 days; matching teams and league history matter. The model's results are informational estimates, not guarantees.

The upgraded engine is used for football, basketball and tennis. Football intentionally retains its previously shipped Poisson default: the experimental strength candidate did not beat it on the held-out multi-season benchmark. Basketball and tennis use the v2 research models. The providers give kickoff and final score but not the time each result first became visible. The adapter conservatively treats a final result as available no earlier than four hours after kickoff and the next UTC midnight; this is an inference, not a verified observation timestamp. It must be replaced with a timestamped ingestion record for audit-grade retrospective evaluation.
