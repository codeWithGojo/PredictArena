export type QuizSport = "Football" | "Basketball" | "Tennis" | "CODM" | "EA FC";

export type GeneratedQuestion = {
  id: string;
  category: QuizSport;
  prompt: string;
  options: string[];
  answer: string;
  note: string;
  difficulty: "Easy" | "Medium" | "Hard";
  era: string;
};

type Fact = Omit<GeneratedQuestion, "id" | "category" | "options"> & { wrong: string[] };

export const QUESTION_POOL_SIZES: Record<QuizSport, number> = {
  Football: 2000,
  Basketball: 2000,
  Tennis: 2000,
  CODM: 100,
  "EA FC": 100,
};

const leadIns = [
  "History check:", "Quick recall:", "From the archive:", "Era test:", "Record book:",
  "Classic knowledge:", "Timeline round:", "Champions round:", "Deep cut:", "Legacy check:",
  "Back in time:", "Trophy cabinet:", "Name the winner:", "One for the historians:", "Memory test:",
  "The old-school round:", "Past and present:", "Archive question:", "Big-stage history:", "Hall of fame:",
  "Before your prediction:", "Know the era:", "Title history:", "Fast history:", "No guessing:",
];

const footballWorldCups: Array<[string, string]> = [
  ["1930", "Uruguay"], ["1934", "Italy"], ["1938", "Italy"], ["1950", "Uruguay"],
  ["1954", "West Germany"], ["1958", "Brazil"], ["1962", "Brazil"], ["1966", "England"],
  ["1970", "Brazil"], ["1974", "West Germany"], ["1978", "Argentina"], ["1982", "Italy"],
  ["1986", "Argentina"], ["1990", "West Germany"], ["1994", "Brazil"], ["1998", "France"],
  ["2002", "Brazil"], ["2006", "Italy"], ["2010", "Spain"], ["2014", "Germany"],
  ["2018", "France"], ["2022", "Argentina"],
];

const championsLeague: Array<[string, string]> = [
  ["2000", "Real Madrid"], ["2001", "Bayern Munich"], ["2002", "Real Madrid"], ["2003", "AC Milan"],
  ["2004", "Porto"], ["2005", "Liverpool"], ["2006", "Barcelona"], ["2007", "AC Milan"],
  ["2008", "Manchester United"], ["2009", "Barcelona"], ["2010", "Inter Milan"], ["2011", "Barcelona"],
  ["2012", "Chelsea"], ["2013", "Bayern Munich"], ["2014", "Real Madrid"], ["2015", "Barcelona"],
  ["2016", "Real Madrid"], ["2017", "Real Madrid"], ["2018", "Real Madrid"], ["2019", "Liverpool"],
  ["2020", "Bayern Munich"], ["2021", "Chelsea"], ["2022", "Real Madrid"], ["2023", "Manchester City"],
  ["2024", "Real Madrid"],
];

const premierLeague: Array<[string, string]> = [
  ["1999–00", "Manchester United"], ["2000–01", "Manchester United"], ["2001–02", "Arsenal"], ["2002–03", "Manchester United"],
  ["2003–04", "Arsenal"], ["2004–05", "Chelsea"], ["2005–06", "Chelsea"], ["2006–07", "Manchester United"],
  ["2007–08", "Manchester United"], ["2008–09", "Manchester United"], ["2009–10", "Chelsea"], ["2010–11", "Manchester United"],
  ["2011–12", "Manchester City"], ["2012–13", "Manchester United"], ["2013–14", "Manchester City"], ["2014–15", "Chelsea"],
  ["2015–16", "Leicester City"], ["2016–17", "Chelsea"], ["2017–18", "Manchester City"], ["2018–19", "Manchester City"],
  ["2019–20", "Liverpool"], ["2020–21", "Manchester City"], ["2021–22", "Manchester City"], ["2022–23", "Manchester City"],
  ["2023–24", "Manchester City"],
];

const nbaChampions: Array<[string, string]> = [
  ["2000", "Los Angeles Lakers"], ["2001", "Los Angeles Lakers"], ["2002", "Los Angeles Lakers"], ["2003", "San Antonio Spurs"],
  ["2004", "Detroit Pistons"], ["2005", "San Antonio Spurs"], ["2006", "Miami Heat"], ["2007", "San Antonio Spurs"],
  ["2008", "Boston Celtics"], ["2009", "Los Angeles Lakers"], ["2010", "Los Angeles Lakers"], ["2011", "Dallas Mavericks"],
  ["2012", "Miami Heat"], ["2013", "Miami Heat"], ["2014", "San Antonio Spurs"], ["2015", "Golden State Warriors"],
  ["2016", "Cleveland Cavaliers"], ["2017", "Golden State Warriors"], ["2018", "Golden State Warriors"], ["2019", "Toronto Raptors"],
  ["2020", "Los Angeles Lakers"], ["2021", "Milwaukee Bucks"], ["2022", "Golden State Warriors"], ["2023", "Denver Nuggets"],
  ["2024", "Boston Celtics"], ["2025", "Oklahoma City Thunder"],
];

const nbaMvps: Array<[string, string]> = [
  ["1999–00", "Shaquille O’Neal"], ["2000–01", "Allen Iverson"], ["2001–02", "Tim Duncan"], ["2002–03", "Tim Duncan"],
  ["2003–04", "Kevin Garnett"], ["2004–05", "Steve Nash"], ["2005–06", "Steve Nash"], ["2006–07", "Dirk Nowitzki"],
  ["2007–08", "Kobe Bryant"], ["2008–09", "LeBron James"], ["2009–10", "LeBron James"], ["2010–11", "Derrick Rose"],
  ["2011–12", "LeBron James"], ["2012–13", "LeBron James"], ["2013–14", "Kevin Durant"], ["2014–15", "Stephen Curry"],
  ["2015–16", "Stephen Curry"], ["2016–17", "Russell Westbrook"], ["2017–18", "James Harden"], ["2018–19", "Giannis Antetokounmpo"],
  ["2019–20", "Giannis Antetokounmpo"], ["2020–21", "Nikola Jokić"], ["2021–22", "Nikola Jokić"], ["2022–23", "Joel Embiid"],
  ["2023–24", "Nikola Jokić"], ["2024–25", "Shai Gilgeous-Alexander"],
];

const finalsMvps: Array<[string, string]> = [
  ["2000", "Shaquille O’Neal"], ["2001", "Shaquille O’Neal"], ["2002", "Shaquille O’Neal"], ["2003", "Tim Duncan"],
  ["2004", "Chauncey Billups"], ["2005", "Tim Duncan"], ["2006", "Dwyane Wade"], ["2007", "Tony Parker"],
  ["2008", "Paul Pierce"], ["2009", "Kobe Bryant"], ["2010", "Kobe Bryant"], ["2011", "Dirk Nowitzki"],
  ["2012", "LeBron James"], ["2013", "LeBron James"], ["2014", "Kawhi Leonard"], ["2015", "Andre Iguodala"],
  ["2016", "LeBron James"], ["2017", "Kevin Durant"], ["2018", "Kevin Durant"], ["2019", "Kawhi Leonard"],
  ["2020", "LeBron James"], ["2021", "Giannis Antetokounmpo"], ["2022", "Stephen Curry"], ["2023", "Nikola Jokić"],
  ["2024", "Jaylen Brown"], ["2025", "Shai Gilgeous-Alexander"],
];

const wimbledonMen: Array<[string, string]> = [
  ["2000", "Pete Sampras"], ["2001", "Goran Ivanišević"], ["2002", "Lleyton Hewitt"], ["2003", "Roger Federer"],
  ["2004", "Roger Federer"], ["2005", "Roger Federer"], ["2006", "Roger Federer"], ["2007", "Roger Federer"],
  ["2008", "Rafael Nadal"], ["2009", "Roger Federer"], ["2010", "Rafael Nadal"], ["2011", "Novak Djokovic"],
  ["2012", "Roger Federer"], ["2013", "Andy Murray"], ["2014", "Novak Djokovic"], ["2015", "Novak Djokovic"],
  ["2016", "Andy Murray"], ["2017", "Roger Federer"], ["2018", "Novak Djokovic"], ["2019", "Novak Djokovic"],
  ["2021", "Novak Djokovic"], ["2022", "Novak Djokovic"], ["2023", "Carlos Alcaraz"], ["2024", "Carlos Alcaraz"],
  ["2025", "Jannik Sinner"],
];

const wimbledonWomen: Array<[string, string]> = [
  ["2000", "Venus Williams"], ["2001", "Venus Williams"], ["2002", "Serena Williams"], ["2003", "Serena Williams"],
  ["2004", "Maria Sharapova"], ["2005", "Venus Williams"], ["2006", "Amélie Mauresmo"], ["2007", "Venus Williams"],
  ["2008", "Venus Williams"], ["2009", "Serena Williams"], ["2010", "Serena Williams"], ["2011", "Petra Kvitová"],
  ["2012", "Serena Williams"], ["2013", "Marion Bartoli"], ["2014", "Petra Kvitová"], ["2015", "Serena Williams"],
  ["2016", "Serena Williams"], ["2017", "Garbiñe Muguruza"], ["2018", "Angelique Kerber"], ["2019", "Simona Halep"],
  ["2021", "Ashleigh Barty"], ["2022", "Elena Rybakina"], ["2023", "Markéta Vondroušová"], ["2024", "Barbora Krejčíková"],
  ["2025", "Iga Świątek"],
];

const australianOpenMen: Array<[string, string]> = [
  ["2000", "Andre Agassi"], ["2001", "Andre Agassi"], ["2002", "Thomas Johansson"], ["2003", "Andre Agassi"],
  ["2004", "Roger Federer"], ["2005", "Marat Safin"], ["2006", "Roger Federer"], ["2007", "Roger Federer"],
  ["2008", "Novak Djokovic"], ["2009", "Rafael Nadal"], ["2010", "Roger Federer"], ["2011", "Novak Djokovic"],
  ["2012", "Novak Djokovic"], ["2013", "Novak Djokovic"], ["2014", "Stan Wawrinka"], ["2015", "Novak Djokovic"],
  ["2016", "Novak Djokovic"], ["2017", "Roger Federer"], ["2018", "Roger Federer"], ["2019", "Novak Djokovic"],
  ["2020", "Novak Djokovic"], ["2021", "Novak Djokovic"], ["2022", "Rafael Nadal"], ["2023", "Novak Djokovic"],
  ["2024", "Jannik Sinner"],
];

function historyFacts(name: string, items: Array<[string, string]>, era: string): Fact[] {
  const possibleAnswers = Array.from(new Set(items.map(([, winner]) => winner)));
  return items.map(([year, winner], index) => ({
    prompt: `Who won ${name} in ${year}?`,
    answer: winner,
    wrong: possibleAnswers.filter((answer) => answer !== winner).slice(index % Math.max(possibleAnswers.length - 3, 1)).concat(possibleAnswers).filter((answer, answerIndex, all) => answer !== winner && all.indexOf(answer) === answerIndex).slice(0, 3),
    note: `${winner} is recorded as the ${name} champion for ${year}.`,
    difficulty: index < 8 ? "Easy" : index < 18 ? "Medium" : "Hard",
    era,
  }));
}

const footballFixed: Fact[] = [
  { prompt: "Which nation has won the most men’s FIFA World Cups?", answer: "Brazil", wrong: ["Germany", "Italy", "Argentina"], note: "Brazil holds the men’s record with five titles.", difficulty: "Easy", era: "All-time" },
  { prompt: "Which club has won the most European Cup/Champions League titles?", answer: "Real Madrid", wrong: ["AC Milan", "Liverpool", "Bayern Munich"], note: "Real Madrid leads the competition’s all-time title table.", difficulty: "Easy", era: "All-time" },
  { prompt: "Who is the Champions League’s all-time leading scorer?", answer: "Cristiano Ronaldo", wrong: ["Lionel Messi", "Robert Lewandowski", "Karim Benzema"], note: "Cristiano Ronaldo leads UEFA’s all-time Champions League scoring list.", difficulty: "Easy", era: "All-time" },
  { prompt: "Which team completed the 2003–04 Premier League season unbeaten?", answer: "Arsenal", wrong: ["Chelsea", "Manchester United", "Liverpool"], note: "Arsenal’s 2003–04 side became known as The Invincibles.", difficulty: "Easy", era: "2000s" },
  { prompt: "Which country hosted the first men’s World Cup in 1930?", answer: "Uruguay", wrong: ["Brazil", "Italy", "France"], note: "Uruguay hosted and won the inaugural tournament.", difficulty: "Medium", era: "1930s" },
  { prompt: "How many points is a league win worth under the standard system?", answer: "3", wrong: ["1", "2", "4"], note: "A win earns three points; a draw earns one.", difficulty: "Easy", era: "Rules" },
  { prompt: "What is the maximum number of players one team starts with on the pitch?", answer: "11", wrong: ["9", "10", "12"], note: "A standard football team starts with eleven players.", difficulty: "Easy", era: "Rules" },
  { prompt: "Which goalkeeper won the 1963 Ballon d’Or?", answer: "Lev Yashin", wrong: ["Gordon Banks", "Dino Zoff", "Sepp Maier"], note: "Lev Yashin remains the only goalkeeper to win the Ballon d’Or.", difficulty: "Hard", era: "1960s" },
];

const basketballFixed: Fact[] = [
  { prompt: "How long is the NBA shot clock?", answer: "24 seconds", wrong: ["20 seconds", "25 seconds", "30 seconds"], note: "NBA possessions use a 24-second shot clock.", difficulty: "Easy", era: "Rules" },
  { prompt: "How many points is a shot worth from beyond the arc?", answer: "3", wrong: ["1", "2", "4"], note: "A made field goal beyond the three-point line is worth three.", difficulty: "Easy", era: "Rules" },
  { prompt: "Who is the NBA’s all-time leading scorer?", answer: "LeBron James", wrong: ["Kareem Abdul-Jabbar", "Michael Jordan", "Karl Malone"], note: "LeBron James passed Kareem Abdul-Jabbar for the career scoring record.", difficulty: "Easy", era: "All-time" },
  { prompt: "Which player won six NBA Finals MVP awards?", answer: "Michael Jordan", wrong: ["LeBron James", "Magic Johnson", "Tim Duncan"], note: "Michael Jordan won Finals MVP in each of Chicago’s six title runs.", difficulty: "Medium", era: "1990s" },
];

const tennisFixed: Fact[] = [
  { prompt: "Which Grand Slam is played on grass?", answer: "Wimbledon", wrong: ["US Open", "Australian Open", "Roland-Garros"], note: "Wimbledon is the only Grand Slam played on grass.", difficulty: "Easy", era: "Rules" },
  { prompt: "What is a score of zero called in tennis?", answer: "Love", wrong: ["Nil", "Blank", "Duck"], note: "Zero points in a tennis game is called love.", difficulty: "Easy", era: "Rules" },
  { prompt: "Which Grand Slam is played on clay?", answer: "Roland-Garros", wrong: ["Wimbledon", "US Open", "Australian Open"], note: "Roland-Garros uses red clay courts.", difficulty: "Easy", era: "Rules" },
  { prompt: "Who completed the calendar-year Grand Slam in men’s singles in 1969?", answer: "Rod Laver", wrong: ["Roy Emerson", "Björn Borg", "John Newcombe"], note: "Rod Laver won all four majors in 1969.", difficulty: "Hard", era: "1960s" },
  { prompt: "Which player won 14 men’s singles titles at Roland-Garros?", answer: "Rafael Nadal", wrong: ["Novak Djokovic", "Roger Federer", "Björn Borg"], note: "Rafael Nadal’s fourteen titles are a men’s singles record at one major.", difficulty: "Easy", era: "All-time" },
];

const codmFacts: Fact[] = [
  { prompt: "What is the 2026 competitive Hardpoint score limit?", answer: "250", wrong: ["200", "225", "300"], note: "The official 2026 setting lists a 250-point Hardpoint limit.", difficulty: "Medium", era: "2026 rules" },
  { prompt: "What is the 2026 Search & Destroy round-win limit?", answer: "9", wrong: ["6", "7", "8"], note: "The official 2026 setting uses a nine-round win limit.", difficulty: "Hard", era: "2026 rules" },
  { prompt: "Which mode is played on Map 1 of the standard best-of-five order?", answer: "Hardpoint", wrong: ["Control", "Search & Destroy", "Domination"], note: "The official order starts with Hardpoint.", difficulty: "Easy", era: "2026 rules" },
  { prompt: "Which mode is played on Map 2 of the standard best-of-five order?", answer: "Search & Destroy", wrong: ["Hardpoint", "Control", "Domination"], note: "Map 2 is Search & Destroy.", difficulty: "Easy", era: "2026 rules" },
  { prompt: "Which mode is played on Map 3 of the standard best-of-five order?", answer: "Control", wrong: ["Hardpoint", "Search & Destroy", "Frontline"], note: "The middle map of the standard series is Control.", difficulty: "Easy", era: "2026 rules" },
  { prompt: "How many map wins secure a best-of-five series?", answer: "3", wrong: ["2", "4", "5"], note: "The first team to three map wins takes a best-of-five.", difficulty: "Easy", era: "Competition" },
  { prompt: "Which map is in the 2026 Hardpoint pool?", answer: "Summit", wrong: ["Coastal", "Meltdown", "Raid"], note: "Summit appears in the official Hardpoint pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Hardpoint pool?", answer: "Hacienda", wrong: ["Tunisia", "Slums", "Standoff"], note: "Hacienda appears in the official Hardpoint pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Hardpoint pool?", answer: "Combine", wrong: ["Firing Range", "Coastal", "Raid"], note: "Combine appears in the official Hardpoint pool.", difficulty: "Hard", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Hardpoint pool?", answer: "Takeoff", wrong: ["Meltdown", "Slums", "Crossroads Strike"], note: "Takeoff appears in the official Hardpoint pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Hardpoint pool?", answer: "Arsenal", wrong: ["Tunisia", "Raid", "Coastal"], note: "Arsenal appears in the official Hardpoint pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Search & Destroy pool?", answer: "Tunisia", wrong: ["Summit", "Combine", "Raid"], note: "Tunisia appears in the official Search & Destroy pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Search & Destroy pool?", answer: "Firing Range", wrong: ["Hacienda", "Takeoff", "Standoff"], note: "Firing Range appears in the official Search & Destroy pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Search & Destroy pool?", answer: "Coastal", wrong: ["Summit", "Arsenal", "Raid"], note: "Coastal appears in the official Search & Destroy pool.", difficulty: "Hard", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Search & Destroy pool?", answer: "Slums", wrong: ["Combine", "Takeoff", "Crossroads Strike"], note: "Slums appears in the official Search & Destroy pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Search & Destroy pool?", answer: "Meltdown", wrong: ["Hacienda", "Arsenal", "Raid"], note: "Meltdown appears in the official Search & Destroy pool.", difficulty: "Hard", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Control pool?", answer: "Raid", wrong: ["Summit", "Tunisia", "Arsenal"], note: "Raid appears in the official Control pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Control pool?", answer: "Standoff", wrong: ["Combine", "Coastal", "Takeoff"], note: "Standoff appears in the official Control pool.", difficulty: "Medium", era: "2026 map pool" },
  { prompt: "Which map is in the 2026 Control pool?", answer: "Crossroads Strike", wrong: ["Firing Range", "Slums", "Hacienda"], note: "Crossroads Strike appears in the official Control pool.", difficulty: "Hard", era: "2026 map pool" },
  { prompt: "How many teams will play at the 2026 World Championship Finals?", answer: "16", wrong: ["12", "20", "24"], note: "The official 2026 format gives the Finals sixteen teams.", difficulty: "Medium", era: "2026 format" },
];

const eaFcFacts: Fact[] = [
  { prompt: "Which console is the supported platform for FC Pro 26?", answer: "PlayStation 5", wrong: ["Xbox Series X", "PC", "Nintendo Switch"], note: "The FC Pro 26 rules name PlayStation 5 as the supported platform.", difficulty: "Easy", era: "FC Pro 26" },
  { prompt: "Which Ultimate Team level was required for the FC Pro Open by October 2025?", answer: "Division 5", wrong: ["Division 2", "Division 3", "Division 7"], note: "The official eligibility rules required at least Division 5.", difficulty: "Hard", era: "FC Pro 26" },
  { prompt: "Which account security feature must FC Pro competitors enable?", answer: "Two-factor authentication", wrong: ["A public profile", "Voice verification", "A paid membership"], note: "The official rules require two-factor authentication on the EA Account.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which mode hosts FC Pro Live Events?", answer: "Ultimate Team", wrong: ["Career Mode", "Clubs", "Kick Off"], note: "FC Pro Live Events are played inside Ultimate Team.", difficulty: "Easy", era: "FC Pro 26" },
  { prompt: "Which third-party account is used for FC Pro tournament registration?", answer: "Battlefy", wrong: ["FACEIT", "Challengermode", "Start.gg"], note: "Players register for relevant events through Battlefy.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which gameplay preset is tuned for online competition?", answer: "Competitive Gameplay", wrong: ["Authentic Gameplay", "Career Simulation", "Classic Gameplay"], note: "EA describes Competitive Gameplay as the responsive online preset.", difficulty: "Easy", era: "FC 26" },
  { prompt: "Which gameplay preset targets realistic offline tempo?", answer: "Authentic Gameplay", wrong: ["Competitive Gameplay", "Arcade Gameplay", "Tournament Gameplay"], note: "Authentic Gameplay is designed around offline realism.", difficulty: "Easy", era: "FC 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "Premier League", wrong: ["J1 League", "Saudi Pro League", "Liga MX"], note: "The official rules list the Premier League among FC Pro partner leagues.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "Bundesliga", wrong: ["Brasileirão", "A-League", "Scottish Premiership"], note: "The official rules list the Bundesliga among FC Pro partner leagues.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "LALIGA", wrong: ["Liga Portugal", "Belgian Pro League", "Süper Lig"], note: "The official rules list LALIGA among FC Pro partner leagues.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "Ligue 1", wrong: ["Liga Portugal", "J1 League", "Super League Greece"], note: "The official rules list Ligue 1 among FC Pro partner leagues.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "Serie A", wrong: ["Liga MX", "Ekstraklasa", "Allsvenskan"], note: "The official rules list Serie A among FC Pro partner leagues.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "MLS", wrong: ["USL Championship", "Liga MX", "Canadian Premier League"], note: "The official rules list MLS among FC Pro partner leagues.", difficulty: "Medium", era: "FC Pro 26" },
  { prompt: "Which partner league is listed in the FC Pro circuit?", answer: "Eredivisie", wrong: ["Belgian Pro League", "Danish Superliga", "Eliteserien"], note: "The official rules list Eredivisie among FC Pro partner leagues.", difficulty: "Hard", era: "FC Pro 26" },
  { prompt: "Which House Rule makes all players reach maximum chemistry?", answer: "Max Chemistry", wrong: ["Mystery Ball", "No Rules", "Survival"], note: "Max Chemistry is one of the official Ultimate Team House Rules.", difficulty: "Easy", era: "Ultimate Team" },
  { prompt: "Which House Rule removes fouls and offsides?", answer: "No Rules", wrong: ["Swaps", "Survival", "Classic Match"], note: "No Rules changes the normal restrictions for the match.", difficulty: "Easy", era: "Ultimate Team" },
  { prompt: "Which House Rule removes a player from the scoring team after each goal?", answer: "Survival", wrong: ["Long Range", "Mystery Ball", "First To"], note: "Survival reduces the scoring team after goals.", difficulty: "Medium", era: "Ultimate Team" },
  { prompt: "Which mode is built around a persistent user-created club and squad?", answer: "Ultimate Team", wrong: ["Kick Off", "Training Centre", "Tournament"], note: "Ultimate Team centres on building and developing your club.", difficulty: "Easy", era: "EA FC" },
  { prompt: "What does SBC stand for in Ultimate Team?", answer: "Squad Building Challenge", wrong: ["Season Bonus Card", "Skill-Based Competition", "Squad Balance Cap"], note: "SBC is short for Squad Building Challenge.", difficulty: "Easy", era: "Ultimate Team" },
  { prompt: "Which mode lets a user manage a club across seasons offline?", answer: "Career Mode", wrong: ["Rivals", "Draft", "Moments"], note: "Manager Career is the long-form offline management mode.", difficulty: "Easy", era: "EA FC" },
];

const factBanks: Record<QuizSport, Fact[]> = {
  Football: [
    ...historyFacts("the men’s FIFA World Cup", footballWorldCups, "World Cup"),
    ...historyFacts("the UEFA Champions League", championsLeague, "2000s–2020s"),
    ...historyFacts("the Premier League", premierLeague, "Premier League era"),
    ...footballFixed,
  ].slice(0, 80),
  Basketball: [
    ...historyFacts("the NBA championship", nbaChampions, "2000s–2020s"),
    ...historyFacts("the NBA regular-season MVP award", nbaMvps, "2000s–2020s"),
    ...historyFacts("the NBA Finals MVP award", finalsMvps, "2000s–2020s"),
    ...basketballFixed,
  ].slice(0, 80),
  Tennis: [
    ...historyFacts("Wimbledon men’s singles", wimbledonMen, "2000s–2020s"),
    ...historyFacts("Wimbledon women’s singles", wimbledonWomen, "2000s–2020s"),
    ...historyFacts("Australian Open men’s singles", australianOpenMen, "2000s–2020s"),
    ...tennisFixed,
  ].slice(0, 80),
  CODM: codmFacts,
  "EA FC": eaFcFacts,
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: number) {
  const random = seededRandom(seed);
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

export function questionAt(sport: QuizSport, index: number): GeneratedQuestion {
  const bank = factBanks[sport];
  const safeIndex = ((index % QUESTION_POOL_SIZES[sport]) + QUESTION_POOL_SIZES[sport]) % QUESTION_POOL_SIZES[sport];
  const fact = bank[safeIndex % bank.length];
  const variant = Math.floor(safeIndex / bank.length) % leadIns.length;
  return {
    id: `${sport.toLowerCase().replace(/\s+/g, "-")}-${safeIndex}`,
    category: sport,
    prompt: `${leadIns[variant]} ${fact.prompt}`,
    options: shuffle([fact.answer, ...fact.wrong.slice(0, 3)], safeIndex * 97 + sport.length),
    answer: fact.answer,
    note: fact.note,
    difficulty: fact.difficulty,
    era: fact.era,
  };
}

export function getQuizQuestions(sport: QuizSport, count = 10, seed = Date.now()) {
  const size = QUESTION_POOL_SIZES[sport];
  const random = seededRandom(seed);
  const chosen = new Set<number>();
  while (chosen.size < Math.min(count, size)) chosen.add(Math.floor(random() * size));
  return Array.from(chosen).map((index) => questionAt(sport, index));
}
