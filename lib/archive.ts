export type ArchivedForecast = { fixture_id: string; league: string; league_id: string; home: string; away: string; kickoff_at: string; published_at: string; model_version: string; probabilities: number[]; confidence: number; strongest_outcome: "home" | "draw" | "away"; fixture_results?: { home_score: number; away_score: number; observed_at: string } | null };
export type Performance = { published: number; settled: number; correct: number; winRate: number | null; brier: number | null; logLoss: number | null; since: string | null; calibration: { bucket: number; count: number; expected: number; actual: number }[] };
export function forecastOutcome(p: number[]): "home" | "draw" | "away" { return (["home", "draw", "away"] as const)[p.indexOf(Math.max(...p))] ?? "home"; }
export function resultOutcome(home: number, away: number) { return home > away ? "home" : home < away ? "away" : "draw"; }
export function validProbabilities(p: unknown): p is number[] { return Array.isArray(p) && p.length === 3 && p.every(x => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 100) && Math.abs(p.reduce((a, b) => a + b, 0) - 100) < 0.01; }
export function forecastEligible(m: { sport: string; source: string; kickoffISO: string; probabilities: unknown; model: { sampleSize: number } }, now: number) { return m.sport === "football" && m.source === "live-api" && Date.parse(m.kickoffISO) > now && m.model.sampleSize >= 10 && validProbabilities(m.probabilities); }
export function scoreForecast(p: number[], home: number, away: number) {
 if (!validProbabilities(p) || !Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) throw new Error("Invalid forecast or result");
 const actual = home > away ? 0 : home < away ? 2 : 1;
 return { correct: forecastOutcome(p) === resultOutcome(home, away), brier: p.reduce((sum, x, i) => sum + (x / 100 - (i === actual ? 1 : 0)) ** 2, 0), logLoss: -Math.log(Math.max(0.000001, p[actual] / 100)) };
}
const text = (v: string) => v.replaceAll("\\", "\\\\").replaceAll("\r", "").replaceAll("\n", "\\n").replaceAll(",", "\\,").replaceAll(";", "\\;");
const date = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
export function matchCalendar(m: { id: string; home: { name: string }; away: { name: string }; league: string; kickoffISO: string }, now = new Date()) {
 const start = new Date(m.kickoffISO);
 if (!Number.isFinite(start.getTime())) throw new Error("Invalid kickoff");
 return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PredictArena//Match reminder//EN", "BEGIN:VEVENT", `UID:${text(m.id)}@predictarena`, `DTSTAMP:${date(now)}`, `DTSTART:${date(start)}`, `DTEND:${date(new Date(start.getTime() + 7200000))}`, `SUMMARY:${text(`${m.home.name} vs ${m.away.name}`)}`, `DESCRIPTION:${text(`${m.league}. Recheck the kickoff time before the match.`)}`, "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:Match starts in 30 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR", ""].join("\r\n");
}
