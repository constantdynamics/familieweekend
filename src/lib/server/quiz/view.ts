/**
 * What each role gets to see (SPEC §4.6 and §7.3), as pure functions. The
 * secrecy rules live here, in one place:
 *
 * - Question text, options and photo only from the phase "open".
 * - The right answer, the explanation and other teams' answers only from
 *   "onthuld". Before that a team only shows whether it answered.
 * - Notes and subjects never reach a phone; they are for the quizmaster.
 * - In listening mode meekijkers (and visitors) get no question at all, only
 *   "Luister goed". Captains keep the question and the answers.
 */
import { isGivenAnswer, parseAnswer, readCorrect, scoreTeams, type StoredAnswer, type TeamScore } from "./answers";
import { consoleButtons, effectivePhase, findQuestion, findRound, jokerAllowed, playableRounds, positionLabel } from "./engine";
import { correctLabel, valueLabel } from "./labels";
import type { AnswerBook, QuizStanding } from "./scores";
import type {
  ConsoleQuestion,
  ConsoleTeam,
  ConsoleView,
  EngineState,
  QuizContent,
  QuizQuestion,
  QuizView,
  TeamColor,
  ViewerRole,
  ViewQuestion,
  ViewStanding,
} from "./types";
import { JOKER_FACTOR } from "@/lib/shared/scoring";

export type TeamRow = {
  id: string;
  name: string;
  color: TeamColor;
  /** A captain device is logged in. */
  hasDevice: boolean;
  /** The name to show in "Sanne heeft gekozen". */
  captainName: string | null;
};

export type Viewer = {
  role: ViewerRole;
  teamId: string | null;
  captainTakenOver: boolean;
  suggestCaptainLogin: boolean;
};

/** Phases in which the current question is on the phones at all. */
export function questionIsOut(state: EngineState, now: number): boolean {
  const phase = effectivePhase(state, now);
  return state.mode === "quiz" && (phase === "open" || phase === "gesloten" || phase === "onthuld");
}

/** Listening mode: meekijkers and visitors only see "Luister goed" until the reveal. */
export function listensOnly(state: EngineState, now: number, role: ViewerRole): boolean {
  return questionIsOut(state, now) && effectivePhase(state, now) !== "onthuld" && state.listening && role !== "captain";
}

/** Whether this viewer may receive the question (and so a signed link to its photo). */
export function viewerSeesQuestion(state: EngineState, now: number, role: ViewerRole): boolean {
  return questionIsOut(state, now) && !listensOnly(state, now, role);
}

function standingsView(standings: readonly QuizStanding[], teams: readonly TeamRow[]): ViewStanding[] {
  const byId = new Map(teams.map((team) => [team.id, team]));
  return standings.flatMap((row) => {
    const team = byId.get(row.teamId);
    return team
      ? [{ teamId: row.teamId, name: team.name, color: team.color, place: row.place, shared: row.shared, twelfths: row.twelfths, jokerRound: row.jokerRound }]
      : [];
  });
}

function withJoker(score: TeamScore, joker: boolean): number {
  return joker ? score.twelfths * JOKER_FACTOR : score.twelfths;
}

export type PhoneViewInput = {
  env: "live" | "test";
  version: number;
  now: number;
  state: EngineState;
  lockClosed: boolean;
  content: QuizContent | null;
  teams: readonly TeamRow[];
  /** Answers to the current question, per team id. */
  answers: Readonly<Record<string, StoredAnswer>>;
  /** Quiz jokers: team id → round number. */
  jokers: Readonly<Record<string, number>>;
  /** Needed on the interim standing and at the end. */
  standings: readonly QuizStanding[] | null;
  viewer: Viewer;
  /** A signed link, made by the caller only when `viewerSeesQuestion` says so. */
  photoUrl: string | null;
  /** echt_of_ai: "Oom Kees, Team Oranje". */
  submitter: string | null;
};

/** The quiz as one phone sees it. */
export function buildQuizView(input: PhoneViewInput): QuizView {
  const { state, content, now, viewer } = input;
  const phase = effectivePhase(state, now);
  const active = content !== null && state.quizId === content.id;
  const status: QuizView["status"] = !active ? "rust" : state.mode === "quiz" ? "quiz" : state.mode === "intermezzo" ? "intermezzo" : "rust";
  const ownTeam = viewer.teamId ? (input.teams.find((team) => team.id === viewer.teamId) ?? null) : null;
  const jokers = input.teams
    .filter((team) => Object.hasOwn(input.jokers, team.id))
    .map((team) => ({ teamId: team.id, name: team.name, color: team.color, round: input.jokers[team.id] }))
    .sort((a, b) => a.round - b.round);

  const base: QuizView = {
    v: input.version,
    env: input.env,
    status,
    phase: active ? phase : null,
    title: active ? content.title : null,
    round: null,
    nextRound: null,
    questionAt: null,
    question: null,
    luisterGoed: false,
    countdownMs: null,
    me: {
      role: viewer.role,
      team: ownTeam ? { id: ownTeam.id, name: ownTeam.name, color: ownTeam.color } : null,
      captainName: ownTeam?.captainName ?? null,
      captainTakenOver: viewer.captainTakenOver,
      suggestCaptainLogin: viewer.suggestCaptainLogin,
      canAnswer: false,
      canJoker: false,
      answer: null,
      teamAnswered: false,
    },
    teams: input.teams.map((team) => ({
      id: team.id,
      name: team.name,
      color: team.color,
      answered: false,
      jokerRound: Object.hasOwn(input.jokers, team.id) ? input.jokers[team.id] : null,
      result: null,
    })),
    answeredCount: 0,
    jokers,
    standings: null,
    standingsHidden: false,
  };
  if (!active) return base;

  const rounds = playableRounds(content);
  const round = findRound(content, state.roundNo);
  const roundIndex = round ? rounds.findIndex((r) => r.number === round.number) : -1;
  if (round && roundIndex >= 0) {
    base.round = {
      number: round.number,
      index: roundIndex + 1,
      total: rounds.length,
      title: round.title,
      intro: round.intro,
      questionCount: round.questions.length,
      listeningRound: round.listening,
    };
  }

  if (phase === "tussenstand" || phase === "einde") {
    if (input.lockClosed) base.standingsHidden = true;
    else if (input.standings) base.standings = standingsView(input.standings, input.teams);
    if (phase === "tussenstand" && round) {
      const next = rounds.find((r) => r.number > round.number);
      if (next) base.nextRound = { number: next.number, title: next.title, intermezzoFirst: round.intermezzoAfter };
    }
  }

  if (status === "quiz" && phase === "rondescherm" && round && viewer.role === "captain" && ownTeam) {
    base.me.canJoker = jokerAllowed(state, round.number) && !Object.hasOwn(input.jokers, ownTeam.id);
  }

  const found = findQuestion(content, state.questionId);
  if (!questionIsOut(state, now) || !found) return base;

  const question = found.question;
  const revealed = phase === "onthuld";
  base.teams = base.teams.map((team) => ({
    ...team,
    answered: isGivenAnswer(question, input.answers[team.id]?.answer),
  }));
  base.answeredCount = base.teams.filter((team) => team.answered).length;
  if (ownTeam) base.me.teamAnswered = base.teams.some((team) => team.id === ownTeam.id && team.answered);
  if (viewer.role === "captain" && ownTeam) base.me.answer = parseAnswer(question, input.answers[ownTeam.id]?.answer);
  base.me.canAnswer = viewer.role === "captain" && ownTeam !== null && phase === "open";
  if (phase === "open" && state.countdownUntil !== null) base.countdownMs = Math.max(0, state.countdownUntil - now);

  base.questionAt = { number: found.index + 1, count: found.round.questions.length };

  if (listensOnly(state, now, viewer.role)) {
    base.luisterGoed = true;
    return base;
  }

  const correct = revealed ? readCorrect(question) : null;
  const view: ViewQuestion = {
    id: question.id,
    number: found.index + 1,
    count: found.round.questions.length,
    kind: question.kind,
    text: question.text,
    options: question.options,
    unit: question.unit,
    scale: question.scale,
    photoUrl: input.photoUrl,
    photoCredit: question.photoUploadId ? question.photoCredit : null,
    submitter: input.submitter,
    correct,
    explanation: revealed ? question.explanation : null,
  };
  base.question = view;

  if (revealed) {
    const scores = scoreTeams(question, input.answers, input.teams.map((team) => team.id));
    base.teams = base.teams.map((team) => {
      const score = scores[team.id];
      const joker = team.jokerRound === found.round.number;
      return {
        ...team,
        result: {
          twelfths: score.twelfths,
          twelfthsWithJoker: withJoker(score, joker),
          correct: score.correct,
          answer: score.answer,
          distanceKm: score.distanceKm ?? null,
          difference: score.difference ?? null,
          corrected: score.override !== null,
        },
      };
    });
    if (ownTeam) base.me.answer = base.teams.find((team) => team.id === ownTeam.id)?.result?.answer ?? base.me.answer;
  }
  return base;
}

/* ------------------------------------------------------------------------ */
/* The quizmaster's console.                                                 */
/* ------------------------------------------------------------------------ */

export type ConsoleViewInput = {
  env: "live" | "test";
  version: number;
  now: number;
  state: EngineState;
  content: QuizContent | null;
  quizzes: ConsoleView["quizzes"];
  teams: readonly TeamRow[];
  /** All answers to the questions of this quiz in this environment. */
  answers: AnswerBook;
  jokers: Readonly<Record<string, number>>;
  standings: readonly QuizStanding[];
  fairnessLines: Readonly<Record<number, string>>;
  /** Upload id → "Oom Kees, Team Oranje". */
  submitters: Readonly<Record<string, string>>;
  photoUrl: string | null;
  reviewId: string | null;
  canRestart: boolean;
  botsAllowed: boolean;
};

function consoleQuestion(content: QuizContent, question: QuizQuestion, photoUrl: string | null, submitters: Readonly<Record<string, string>>): ConsoleQuestion {
  const found = findQuestion(content, question.id);
  const correct = readCorrect(question);
  return {
    id: question.id,
    roundNo: found?.round.number ?? 0,
    number: (found?.index ?? 0) + 1,
    count: found?.round.questions.length ?? 0,
    kind: question.kind,
    text: question.text,
    options: question.options,
    correctChoice: typeof correct === "number" && question.kind !== "schatting" ? correct : null,
    correctLabel: correctLabel(question),
    unit: question.unit,
    scale: question.scale,
    explanation: question.explanation,
    note: question.note,
    photoUrl,
    photoCredit: question.photoCredit,
    submitter: question.photoUploadId ? (submitters[question.photoUploadId] ?? null) : null,
    subjects: question.subjects,
  };
}

function consoleTeams(
  question: QuizQuestion | null,
  roundNo: number | null,
  input: ConsoleViewInput,
  showAnswers: boolean,
  showPoints: boolean,
): ConsoleTeam[] {
  const stored = question && Object.hasOwn(input.answers, question.id) ? input.answers[question.id] : {};
  const scores = question ? scoreTeams(question, stored, input.teams.map((team) => team.id)) : null;
  return input.teams.map((team) => {
    const jokerRound = Object.hasOwn(input.jokers, team.id) ? input.jokers[team.id] : null;
    const score = scores?.[team.id] ?? null;
    const answered = question ? isGivenAnswer(question, stored[team.id]?.answer) : false;
    const joker = jokerRound !== null && jokerRound === roundNo;
    return {
      id: team.id,
      name: team.name,
      color: team.color,
      hasDevice: team.hasDevice,
      captainName: team.captainName,
      jokerRound,
      answered,
      answerLabel: question && showAnswers ? (answered ? valueLabel(question, score?.answer ?? null) : "geen antwoord") : null,
      twelfths: score && showPoints ? withJoker(score, joker) : null,
      computed: score && showPoints ? score.computed : null,
      override: score && showPoints ? score.override : null,
      distanceKm: score && showPoints ? (score.distanceKm ?? null) : null,
    };
  });
}

export function buildConsoleView(input: ConsoleViewInput): ConsoleView {
  const { state, content, now } = input;
  const phase = effectivePhase(state, now);
  const active = content !== null && state.quizId === content.id;
  const round = active ? findRound(content, state.roundNo) : null;
  const found = active ? findQuestion(content, state.questionId) : null;
  const questionOut = active && found !== null && (phase === "open" || phase === "gesloten" || phase === "onthuld");
  const current = questionOut && found ? found.question : null;

  let upNext: ConsoleView["upNext"] = null;
  if (active && round && phase === "rondescherm" && round.questions[0]) {
    upNext = { number: 1, text: round.questions[0].text, note: round.questions[0].note };
  } else if (found && phase === "onthuld") {
    const next = found.round.questions[found.index + 1];
    if (next) upNext = { number: found.index + 2, text: next.text, note: next.note };
  }

  const played: ConsoleView["played"] = [];
  if (active) {
    for (const r of content.rounds) {
      r.questions.forEach((question, index) => {
        const hasAnswers = Object.keys(input.answers[question.id] ?? {}).length > 0;
        if (hasAnswers || question.id === state.questionId) {
          played.push({ id: question.id, label: `Ronde ${r.number}, vraag ${index + 1}: ${question.text}` });
        }
      });
    }
  }

  let review: ConsoleView["review"] = null;
  const reviewFound = active && input.reviewId ? findQuestion(content, input.reviewId) : null;
  if (active && reviewFound) {
    review = {
      question: consoleQuestion(content, reviewFound.question, null, input.submitters),
      teams: consoleTeams(reviewFound.question, reviewFound.round.number, input, true, true),
    };
  }

  const standingRows = standingsView(input.standings, input.teams);
  const byTeam = new Map(input.standings.map((row) => [row.teamId, row]));

  return {
    v: input.version,
    env: input.env,
    mode: state.mode,
    phase: active ? phase : null,
    quiz: active ? { id: content.id, title: content.title, isDemo: content.isDemo } : null,
    quizzes: input.quizzes,
    position: active ? positionLabel({ ...state, phase }, content) : null,
    round: round
      ? { number: round.number, title: round.title, intro: round.intro, listeningRound: round.listening, intermezzoAfter: round.intermezzoAfter }
      : null,
    listening: state.listening,
    question: current && content ? consoleQuestion(content, current, input.photoUrl, input.submitters) : null,
    upNext,
    countdownMs: phase === "open" && state.countdownUntil !== null ? Math.max(0, state.countdownUntil - now) : null,
    buttons: consoleButtons({ ...state, phase }, active ? content : null),
    teams: consoleTeams(current, round?.number ?? null, input, phase === "gesloten" || phase === "onthuld", phase === "onthuld"),
    answeredCount: current
      ? input.teams.filter((team) => isGivenAnswer(current, input.answers[current.id]?.[team.id]?.answer)).length
      : 0,
    fairness: round ? (input.fairnessLines[round.number] ?? null) : null,
    standings: standingRows.map((row) => ({
      ...row,
      rounds: (byTeam.get(row.teamId)?.rounds ?? []).map((r) => ({ round: r.round, twelfths: r.twelfths, joker: r.joker })),
    })),
    played,
    review,
    resume:
      active && state.mode === "rust" && state.phase !== null && state.phase !== "einde"
        ? (positionLabel({ ...state, phase }, content) ?? "waar je was")
        : null,
    canRestart: input.canRestart,
    botsAllowed: input.botsAllowed,
  };
}
