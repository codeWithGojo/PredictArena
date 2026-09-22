import type { Competition, FootballProvider, ProviderFixture, StandingRow } from "./types";
/** Reserved adapter boundary for Opta or Stats Perform until a licence exists. */
export class PremiumFootballProvider implements FootballProvider {
  readonly name = "premium-football";
  async getFixtures(competition: Competition): Promise<ProviderFixture[]> { void competition; throw new Error("Premium football provider is not configured"); }
  async getStandings(competition: Competition, season: string): Promise<StandingRow[]> { void competition; void season; throw new Error("Premium football provider is not configured"); }
}
