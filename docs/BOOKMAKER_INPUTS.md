# SportyBet screenshot import, 7 October 2026

The reviewed transcription is `data/sportybet-screenshots-2026-10-07.json`.
Screenshot clocks span 17:35–17:39; Nigeria kickoff times are interpreted as
Africa/Lagos (UTC+1). They are captured quotes, not live or closing odds.

## Reconciliation

- 133 unique bookmaker fixture IDs were transcribed across the screenshots.
- 113 ordered pairs match the existing feed through reviewed provider IDs and
  expected home/away names. Thirty scheduled kickoffs differ from the screenshots.
- 110 matched fixtures have complete, visible green 1X2 prices.
- Portugal, Scotland and Saudi Arabia add 17 dated, market-only fixtures, 16 priced.
- Three Saudi rows have cropped dates and remain unimported pending date review.
- Four rows have an obscured price and no quote is guessed: Sunderland–Brighton,
  Monaco–Toulouse, Shakhtar–AEK, Al Hilal–Al Ittihad.
- Partial bottom rows without a complete pairing were not transcribed.

Corrections apply only to the reviewed occurrence. A later provider reschedule
is not rolled back. Applying the import repeatedly does not duplicate fixtures.
Both the scheduled source and public cached-feed response apply the overlay.
Original forecast probability vectors and publication times remain immutable.

## Prediction inputs and slips

The bookmaker basis is a separate 1X2 market baseline: each reciprocal price is
normalized by the sum of all three reciprocals, removing the quoted overround.
It is not presented as a calibrated history-model improvement. The history model
remains selectable and its forecasts are preserved.

Bookmaker slips choose each game's strongest normalized market probability and
combine **captured decimal prices**, one outcome per fixture. The estimated-odds
mode continues to use history-model probabilities. Goals and double-chance
prices are never synthesized from 1X2 quotes. Market-only fixtures have zero
history coverage and are excluded from history-model performance statistics.

Bookmaker snapshots may change before kickoff. Dates and source are displayed
with picks. User-edited prices are not labelled as captured prices when copied.

## All-market and matchweek selection

The slip builder defaults to all available markets. It compares captured 1X2
options, double-chance probabilities derived by summing mutually exclusive 1X2
outcomes, and eligible history-model goals/BTTS options. Double-chance prices are
unknown: their target contribution is explicitly estimated as 1 / probability.
Market-type controls also let the user restrict the pool before choosing the
strongest option per game. Each fixture still contributes at most one selection.
The captured-prices-only mode remains limited to the recorded 1X2 quotes.

Both the predictions feed and slip builder default to the actual current Lagos
calendar week, Monday through Sunday. Next week and all upcoming weeks require
an explicit filter selection. Featured cards use the same week as the feed.
There is no fallback to the next available week when the selected week is empty.
Saved slips retain their selections; a notice identifies games outside the
currently selected matchweek until the user generates a replacement.
