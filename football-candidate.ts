import type { FootballConfig } from './football.ts';
// Selected using earlier seasons only. It remains opt-in after losing the later test.
export const SELECTED_FOOTBALL: FootballConfig = Object.freeze({mode:'strength',homeAdvantage:true,halfLifeDays:null,priorMatches:6,rhoPenalty:null});
