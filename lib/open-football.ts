export type OpenFixture = {
  fixture?: { id?: number | string; date?: string; venue?: { name?: string }; status?: { short?: string } };
  league?: { id?: number; name?: string; season?: number };
  teams?: { home?: { name?: string; logo?: string }; away?: { name?: string; logo?: string } };
  goals?: { home?: number | null; away?: number | null };
};

export type OpenEvent = {
  id?: string | number;
  date?: string;
  season?: { year?: number } | number;
  status?: { type?: { state?: string; completed?: boolean; name?: string } };
  competitions?: Array<{
    venue?: { fullName?: string };
    competitors?: Array<{
      homeAway?: string;
      score?: string | number | null;
      team?: { name?: string; displayName?: string; logo?: string };
    }>;
  }>;
};

export function openEventToFixture(event: OpenEvent, config: { id: string; name: string }): OpenFixture | null {
  const competition = event.competitions?.[0];
  const home = competition?.competitors?.find((team) => team.homeAway === "home");
  const away = competition?.competitors?.find((team) => team.homeAway === "away");
  if (!event.id || !event.date || !(home?.team?.name || home?.team?.displayName) ||
    !(away?.team?.name || away?.team?.displayName)) return null;
  const completed = event.status?.type?.state === "post" && event.status.type.completed === true;
  const score = (value: string | number | null | undefined) => {
    if (value == null || !/^\d+$/.test(String(value))) return null;
    return Number(value);
  };
  return {
    fixture: { id: event.id, date: event.date,
      venue: { name: competition?.venue?.fullName }, status: { short: completed ? "FT" : event.status?.type?.state === "pre" ? "NS" : "LIVE" } },
    league: { id: Number(config.id), name: config.name,
      season: typeof event.season === "number" ? event.season : event.season?.year },
    teams: { home: { name: home.team.name || home.team.displayName, logo: home.team.logo },
      away: { name: away.team.name || away.team.displayName, logo: away.team.logo } },
    goals: { home: completed ? score(home.score) : null, away: completed ? score(away.score) : null },
  };
}

