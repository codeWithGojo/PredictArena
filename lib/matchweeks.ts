// Calendar weeks use Lagos dates, so a Sunday night UTC kickoff can belong to Monday's week.
export function matchweekStart(kickoffISO: string): string {
  const kickoff = new Date(kickoffISO);
  if (!Number.isFinite(kickoff.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(kickoff);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const day = new Date(Date.UTC(value("year"), value("month") - 1, value("day")));
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}

export function matchweekLabel(start: string): string {
  const monday = new Date(`${start}T00:00:00.000Z`);
  if (!Number.isFinite(monday.getTime())) return "Unknown week";
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const label = (date: Date) => new Intl.DateTimeFormat("en-NG", {
    timeZone: "UTC", day: "numeric", month: "short",
  }).format(date);
  return `${label(monday)} – ${label(sunday)}${monday.getUTCFullYear() !== sunday.getUTCFullYear() ? ` ${sunday.getUTCFullYear()}` : ""}`;
}
