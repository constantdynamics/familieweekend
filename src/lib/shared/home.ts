/**
 * Thuis during the weekend (SPEC §4.1): what `/api/thuis` sends and the pure
 * rules that turn it into sentences and tiles. The phone decides with its own
 * clock what is going on, so a screen can be tested at any moment.
 */
import { bijElkaar } from "./tekst";
import { dayKey, itemsOnDay, itemState, nextItems, type ProgramItem, weekendDayNumber, whenText } from "./program";
import type { TeamColor } from "./teams";
import { formatTime } from "./time";

export type LiveMode = "rust" | "quiz" | "intermezzo" | "ceremonie";

export type JokerState = {
  /** The team played it. */
  used: boolean;
  /** "ronde 4" or the name of the zeskamp game, once it is played. */
  detail: string | null;
  /** The quiz or the zeskamp is over without it: it no longer matters. */
  over: boolean;
};

/** A team of the names on this phone, as Thuis shows it. */
export type OwnTeam = {
  id: string;
  name: string;
  color: TeamColor;
  /** The names on this phone in this team (what the app calls them). */
  members: string[];
  /** What the app calls the captain of this team, if there is one. */
  captain: string | null;
  /** This phone is the captain (team device or one of its names). */
  youAreCaptain: boolean;
  jokers: { quiz: JokerState; zeskamp: JokerState };
};

/** One team on the team screen. */
export type TeamView = {
  id: string;
  name: string;
  color: TeamColor;
  captain: string | null;
  members: { id: string; name: string; captain: boolean; jij: boolean }[];
  jokers: { quiz: JokerState; zeskamp: JokerState };
  /** One of the names on this phone plays here. */
  jij: boolean;
};

export type TeamsView = {
  /** This phone sees the teams (released, or the admin). */
  toon: boolean;
  /** The family sees them too (for the admin's note). */
  familieZiet: boolean;
  teams: TeamView[];
  /** Names that are not in a team yet. */
  zonderTeam: number;
};

export type ThuisData = {
  /** False: the family still sees the app of phase 1 (fase2Live is off). */
  toon: boolean;
  env: "live" | "test";
  /** Null while the program is not released for this phone. */
  programma: ProgramItem[] | null;
  live: { mode: LiveMode; lockClosed: boolean; gamesStarted: boolean };
  teamsZichtbaar: boolean;
  teams: OwnTeam[];
};

const NBSP = " ";

/** "Het is zover! Dag 1 van de Spelen, het is 14:00" */
export function headerLine(now: number, startAt: string, items: readonly ProgramItem[] | null): string {
  const day = weekendDayNumber(now, startAt);
  const time = formatTime(new Date(now));
  const motherDay = (items ?? []).some((item) => item.kind === "moederdag" && dayKey(item.startsAt) === dayKey(now));
  const lead = day <= 1 ? "Het is zover! " : motherDay ? "Fijne Moederdag! " : "";
  return `${lead}Dag ${Math.max(1, day)} van de Spelen, het is${NBSP}${time}`;
}

export type LiveBanner = { title: string; text: string; href: string };

/** "De quiz is begonnen", kijk mee: while something takes over the phones. */
export function liveBanner(mode: LiveMode): LiveBanner | null {
  if (mode === "quiz") return { title: "De quiz is begonnen", text: "Kijk mee, je team heeft je nodig", href: "/quiz" };
  if (mode === "intermezzo") {
    return { title: "Het intermezzo is begonnen", text: "Steen, papier, schaar: kijk mee", href: "/quiz" };
  }
  if (mode === "ceremonie") {
    return { title: "De prijsuitreiking is begonnen", text: "Kijk mee: wie wint de Spelen?", href: "/ceremonie" };
  }
  return null;
}

export type Tile = { key: "quiz" | "zeskamp" | "score"; href: string; title: string; text: string };

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * The tiles of the owner's menu choice: Quiz on the day of the quiz (or while
 * it runs), Zeskamp on the day of the zeskamp, Score once the Spelen started.
 */
export function homeTiles(items: readonly ProgramItem[] | null, now: number, live: ThuisData["live"]): Tile[] {
  const today = itemsOnDay(items ?? [], dayKey(now));
  const all = items ?? [];
  const tiles: Tile[] = [];

  const quiz = today.filter((item) => item.kind === "quiz");
  const quizRunning = live.mode === "quiz" || live.mode === "intermezzo";
  if (quiz.length > 0 || quizRunning) {
    let text = "Kijk mee met je team";
    const upcoming = quiz.find((item) => itemState(item, all, now) === "straks");
    if (quizRunning) text = "Nu bezig, kijk mee";
    else if (upcoming) text = capitalise(whenText(Date.parse(upcoming.startsAt), now));
    tiles.push({ key: "quiz", href: "/quiz", title: "Quiz", text });
  }

  const games = today.filter((item) => item.kind === "zeskamp");
  if (games.length > 0) {
    let text = "Spellen en uitslagen";
    const running = games.some((item) => itemState(item, all, now) === "nu");
    const upcoming = games.find((item) => itemState(item, all, now) === "straks");
    if (running) text = "Nu bezig";
    else if (upcoming) text = capitalise(whenText(Date.parse(upcoming.startsAt), now));
    tiles.push({ key: "zeskamp", href: "/zeskamp", title: "Zeskamp", text });
  }

  if (live.gamesStarted) {
    tiles.push({ key: "score", href: "/score", title: "Score", text: live.lockClosed ? "Op slot" : "De stand van de Spelen" });
  }
  return tiles;
}

/** "Het scorebord is op slot tot de prijsuitreiking, vanavond om 20:30." */
export function lockSentence(items: readonly ProgramItem[] | null, now: number): string {
  const ceremony = nextItems(
    (items ?? []).filter((item) => item.kind === "prijsuitreiking"),
    now,
    1,
  )[0];
  if (!ceremony) return "Het scorebord is op slot tot de prijsuitreiking.";
  return `Het scorebord is op slot tot de prijsuitreiking, ${whenText(Date.parse(ceremony.startsAt), now)}.`;
}

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} en ${names.at(-1)}`;
}

/** "Jij speelt bij Team Mosterd" */
export function teamLine(team: OwnTeam): string {
  if (team.members.length === 0) return `Jij bent captain van ${team.name}`;
  if (team.members.length === 1) return `Jij speelt bij ${team.name}`;
  return `${list(team.members)} spelen bij ${team.name}`;
}

/** "Captain Sanne heeft de joker nog voor de zeskamp" */
export function jokerLine(team: OwnTeam): string {
  const open = (["quiz", "zeskamp"] as const).filter((kind) => !team.jokers[kind].used && !team.jokers[kind].over);
  const usedBoth = team.jokers.quiz.used && team.jokers.zeskamp.used;
  if (open.length === 0) return usedBoth ? "Jullie jokers zijn allebei ingezet" : "Jullie jokers zijn op";
  const wie = team.youAreCaptain ? "Jij hebt" : team.captain ? `Captain ${team.captain} heeft` : "Jullie hebben";
  const what = open.length === 2 ? "de jokers nog voor de quiz en de zeskamp" : `de joker nog voor de ${open[0]}`;
  return bijElkaar(`${wie} ${what}`, 0);
}

/** "Joker voor de quiz: ingezet in ronde 4" */
export function jokerStatus(kind: "quiz" | "zeskamp", joker: JokerState): string {
  const label = kind === "quiz" ? "Quizjoker" : "Zeskampjoker";
  if (joker.used) {
    if (!joker.detail) return `${label}: ingezet`;
    return kind === "quiz" ? `${label}: ingezet in ${joker.detail}` : `${label}: ingezet bij ${joker.detail}`;
  }
  if (joker.over) return `${label}: niet gebruikt`;
  return `${label}: nog te spelen`;
}
