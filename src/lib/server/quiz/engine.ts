/**
 * The quiz as a state machine (SPEC §4.6), as pure functions: the console
 * buttons in their fixed order, the round screens, the interim standing,
 * "Nog 10 seconden!", "Ga terug naar vorige vraag" and the intermezzo. The
 * database layer (store.ts) locks live_state, calls `transition` and writes
 * the result, so every rule here is unit-tested without a database.
 *
 * One quiz walks through these screens, per round with questions:
 *
 *   rondescherm → open → gesloten → onthuld → (next question: open …)
 *   → tussenstand → next round's rondescherm … → einde
 *
 * Rounds without questions are skipped.
 */
import type { EngineState, QuizContent, QuizPhase, QuizQuestion, QuizRound } from "./types";

/** "Nog 10 seconden!" */
export const COUNTDOWN_MS = 10_000;

export type Command =
  | { type: "start"; quizId: string }
  | { type: "hervat" }
  | { type: "pauze" }
  | { type: "toon" }
  | { type: "sluit" }
  | { type: "onthul" }
  | { type: "volgende" }
  | { type: "volgendeRonde" }
  | { type: "vorige" }
  | { type: "nog10" }
  | { type: "luister"; on: boolean }
  | { type: "intermezzo" }
  | { type: "terugNaarQuiz" }
  | { type: "afsluiten" };

export type CommandType = Command["type"];

export type Transition =
  | {
      ok: true;
      state: EngineState;
      /** A question that opened with this step (for games_started_at). */
      opened: string | null;
    }
  | { ok: false; error: string };

/** What the console saw when the quizmaster tapped: a double tap must not skip a question. */
export type Expectation = { phase: QuizPhase | null; questionId: string | null; roundNo: number | null };

export function playableRounds(content: QuizContent): QuizRound[] {
  return content.rounds.filter((round) => round.questions.length > 0);
}

export function findRound(content: QuizContent, number: number | null): QuizRound | null {
  if (number === null) return null;
  return content.rounds.find((round) => round.number === number) ?? null;
}

export function findQuestion(
  content: QuizContent,
  questionId: string | null,
): { round: QuizRound; question: QuizQuestion; index: number } | null {
  if (!questionId) return null;
  for (const round of content.rounds) {
    const index = round.questions.findIndex((question) => question.id === questionId);
    if (index >= 0) return { round, question: round.questions[index], index };
  }
  return null;
}

/** The phase everyone sees: an open question whose ten seconds ran out is closed. */
export function effectivePhase(state: EngineState, now: number): QuizPhase | null {
  if (state.phase === "open" && state.countdownUntil !== null && now >= state.countdownUntil) return "gesloten";
  return state.phase;
}

/** The state with the effective phase written in, ready to store. */
export function normalize(state: EngineState, now: number): EngineState {
  const phase = effectivePhase(state, now);
  if (phase === state.phase) return state;
  return { ...state, phase, countdownUntil: null };
}

/** May a captain answer this question right now? Only while it is open and the ten seconds have not run out. */
export function answerAllowed(state: EngineState, questionId: string, now: number): boolean {
  return (
    state.mode === "quiz" &&
    state.phase === "open" &&
    state.questionId === questionId &&
    (state.countdownUntil === null || now < state.countdownUntil)
  );
}

/** A joker goes on the round whose round screen is showing, before its first question opens. */
export function jokerAllowed(state: EngineState, roundNo: number): boolean {
  return state.mode === "quiz" && state.phase === "rondescherm" && state.roundNo === roundNo && state.questionId === null;
}

/** Null when the console still saw the state as it is now. */
export function checkExpectation(state: EngineState, expect: Expectation | null, command: Command): string | null {
  if (!expect) return null;
  const stale = "De quiz is intussen verder gegaan. Kijk even naar het scherm en probeer het opnieuw.";
  // Closing is safe to repeat: when the ten seconds already closed the question, it stays closed.
  if (command.type === "sluit" && expect.questionId === state.questionId && (state.phase === "gesloten" || state.phase === "open")) {
    return null;
  }
  if (expect.phase !== state.phase || expect.questionId !== state.questionId || expect.roundNo !== state.roundNo) return stale;
  return null;
}

function roundScreen(state: EngineState, round: QuizRound): EngineState {
  return {
    ...state,
    mode: "quiz",
    roundNo: round.number,
    questionId: null,
    phase: "rondescherm",
    listening: round.listening,
    countdownUntil: null,
  };
}

function nextPlayableRound(content: QuizContent, after: number): QuizRound | null {
  return playableRounds(content).find((round) => round.number > after) ?? null;
}

function previousPlayableRound(content: QuizContent, before: number): QuizRound | null {
  return playableRounds(content).filter((round) => round.number < before).at(-1) ?? null;
}

/** After an interim standing: the next round's round screen, or the end. */
function afterRound(state: EngineState, content: QuizContent): EngineState {
  const next = nextPlayableRound(content, state.roundNo ?? 0);
  if (next) return roundScreen(state, next);
  const last = playableRounds(content).at(-1);
  return { ...state, mode: "quiz", roundNo: last?.number ?? state.roundNo, questionId: null, phase: "einde", countdownUntil: null };
}

const NOT_RUNNING = "De quiz loopt nu niet.";

/**
 * One console step. `state` must already be normalised (see `normalize`).
 * Returns the new state, or a Dutch reason why the step is not possible.
 */
export function transition(state: EngineState, content: QuizContent | null, command: Command, now: number): Transition {
  const ok = (next: EngineState, opened: string | null = null): Transition => ({ ok: true, state: next, opened });
  const fail = (error: string): Transition => ({ ok: false, error });

  if (command.type === "start") {
    if (state.mode !== "rust") return fail("Er loopt al iets. Stop dat eerst.");
    if (!content || content.id !== command.quizId) return fail("Deze quiz bestaat niet meer.");
    const first = playableRounds(content)[0];
    if (!first) return fail("Deze quiz heeft nog geen vragen.");
    return ok(roundScreen({ ...state, quizId: content.id }, first));
  }

  if (!content || state.quizId !== content.id) return fail("Er is geen quiz gekozen.");

  if (command.type === "hervat") {
    if (state.mode !== "rust") return fail("De quiz loopt al.");
    if (state.phase === null) return fail("Er is nog niets om mee verder te gaan. Start de quiz.");
    const round = findRound(content, state.roundNo);
    if (!round || (state.questionId !== null && !findQuestion(content, state.questionId))) {
      return fail("De ronde of vraag van daarnet bestaat niet meer. Begin de quiz opnieuw.");
    }
    return ok({ ...state, mode: "quiz", countdownUntil: null });
  }

  if (command.type === "terugNaarQuiz") {
    if (state.mode !== "intermezzo") return fail("Het intermezzo loopt nu niet.");
    return ok(afterRound(state, content));
  }

  if (command.type === "luister") {
    if (state.mode === "rust") return fail(NOT_RUNNING);
    return ok({ ...state, listening: command.on });
  }

  if (state.mode !== "quiz") return fail(state.mode === "intermezzo" ? "Eerst terug naar de quiz." : NOT_RUNNING);

  const round = findRound(content, state.roundNo);
  const found = findQuestion(content, state.questionId);

  switch (command.type) {
    case "pauze":
      return ok({ ...state, mode: "rust", countdownUntil: null });

    case "toon": {
      if (state.phase !== "rondescherm" || !round) return fail("Een nieuwe ronde begint met Toon vraag.");
      const first = round.questions[0];
      if (!first) return fail("Deze ronde heeft nog geen vragen.");
      return ok({ ...state, questionId: first.id, phase: "open", countdownUntil: null }, first.id);
    }

    case "sluit":
      if (state.phase !== "open" && state.phase !== "gesloten") return fail("Er staat geen vraag open.");
      return ok({ ...state, phase: "gesloten", countdownUntil: null });

    case "onthul":
      if (state.phase === "open") return fail("Sluit eerst de vraag.");
      if (state.phase !== "gesloten") return fail("Er is niets om te onthullen.");
      return ok({ ...state, phase: "onthuld", countdownUntil: null });

    case "volgende": {
      if (state.phase !== "onthuld" || !found) return fail("Onthul eerst het antwoord.");
      const next = found.round.questions[found.index + 1];
      if (next) return ok({ ...state, questionId: next.id, phase: "open", countdownUntil: null }, next.id);
      return ok({ ...state, roundNo: found.round.number, questionId: null, phase: "tussenstand", countdownUntil: null });
    }

    case "volgendeRonde":
      if (state.phase !== "tussenstand") return fail("Maak eerst deze ronde af.");
      return ok(afterRound(state, content));

    case "intermezzo":
      if (state.phase !== "tussenstand") return fail("Het intermezzo past tussen twee rondes, bij de tussenstand.");
      return ok({ ...state, mode: "intermezzo", countdownUntil: null });

    case "nog10":
      if (state.phase !== "open") return fail("Er staat geen vraag open.");
      if (state.countdownUntil !== null) return fail("De tien seconden lopen al.");
      return ok({ ...state, countdownUntil: now + COUNTDOWN_MS });

    case "afsluiten":
      if (state.phase !== "einde") return fail("De quiz is nog niet klaar.");
      return ok({ ...state, mode: "rust", countdownUntil: null });

    case "vorige":
      return previous(state, content, round, found);
  }
}

/**
 * "Ga terug naar vorige vraag". Back to the previous question (revealed),
 * never back to a round screen whose first question already opened: the
 * jokers of a round are fixed from then on.
 */
function previous(
  state: EngineState,
  content: QuizContent,
  round: QuizRound | null,
  found: ReturnType<typeof findQuestion>,
): Transition {
  const reveal = (question: QuizQuestion, of: QuizRound): Transition => ({
    ok: true,
    state: { ...state, roundNo: of.number, questionId: question.id, phase: "onthuld", countdownUntil: null },
    opened: null,
  });
  switch (state.phase) {
    case "open":
    case "gesloten":
    case "onthuld": {
      if (!found) return { ok: false, error: "Er is geen vorige vraag." };
      const earlier = found.round.questions[found.index - 1];
      if (!earlier) {
        return { ok: false, error: "Dit is de eerste vraag van de ronde. Terug naar het rondescherm kan niet: de jokers liggen vast." };
      }
      return reveal(earlier, found.round);
    }
    case "tussenstand": {
      const last = round?.questions.at(-1);
      if (!round || !last) return { ok: false, error: "Er is geen vorige vraag." };
      return reveal(last, round);
    }
    case "rondescherm": {
      const before = previousPlayableRound(content, state.roundNo ?? 0);
      if (!before) return { ok: false, error: "Dit is de eerste ronde." };
      return {
        ok: true,
        state: { ...state, roundNo: before.number, questionId: null, phase: "tussenstand", listening: before.listening, countdownUntil: null },
        opened: null,
      };
    }
    case "einde": {
      const last = playableRounds(content).at(-1);
      if (!last) return { ok: false, error: "Er is geen vorige vraag." };
      return {
        ok: true,
        state: { ...state, roundNo: last.number, questionId: null, phase: "tussenstand", listening: last.listening, countdownUntil: null },
        opened: null,
      };
    }
    default:
      return { ok: false, error: "Er is geen vorige vraag." };
  }
}

export type ConsoleButton = { command: CommandType; label: string };

/**
 * The buttons the console offers in this state, in the fixed order of the
 * SPEC: Toon vraag, Sluit de vraag, Onthul het antwoord, Volgende vraag.
 */
export function consoleButtons(
  state: EngineState,
  content: QuizContent | null,
): { main: ConsoleButton | null; extra: ConsoleButton[]; canGoBack: boolean; canCountdown: boolean } {
  const none = { main: null, extra: [], canGoBack: false, canCountdown: false };
  if (!content || state.quizId !== content.id || state.mode === "rust" || state.mode === "ceremonie") return none;
  if (state.mode === "intermezzo") return { ...none, main: { command: "terugNaarQuiz", label: "Terug naar de quiz" } };

  const round = findRound(content, state.roundNo);
  const found = findQuestion(content, state.questionId);
  const back = previous(state, content, round, found).ok;
  switch (state.phase) {
    case "rondescherm":
      return { main: { command: "toon", label: "Toon vraag 1" }, extra: [], canGoBack: back, canCountdown: false };
    case "open":
      return {
        main: { command: "sluit", label: "Sluit de vraag" },
        extra: [],
        canGoBack: back,
        canCountdown: state.countdownUntil === null,
      };
    case "gesloten":
      return { main: { command: "onthul", label: "Onthul het antwoord" }, extra: [], canGoBack: back, canCountdown: false };
    case "onthuld": {
      const next = found ? found.round.questions[found.index + 1] : undefined;
      return {
        main: next ? { command: "volgende", label: "Volgende vraag" } : { command: "volgende", label: "Naar de tussenstand" },
        extra: [],
        canGoBack: back,
        canCountdown: false,
      };
    }
    case "tussenstand": {
      const next = nextPlayableRound(content, state.roundNo ?? 0);
      const main = next
        ? { command: "volgendeRonde" as const, label: `Start ronde ${next.number}` }
        : { command: "volgendeRonde" as const, label: "Naar de eindstand" };
      return { main, extra: [{ command: "intermezzo", label: "Start het intermezzo" }], canGoBack: back, canCountdown: false };
    }
    case "einde":
      return { main: { command: "afsluiten", label: "Sluit de quiz af" }, extra: [], canGoBack: back, canCountdown: false };
    default:
      return none;
  }
}

/** "Ronde 2 van 5, vraag 4 van 10" */
export function positionLabel(state: EngineState, content: QuizContent | null): string | null {
  if (!content) return null;
  const rounds = playableRounds(content);
  const index = rounds.findIndex((round) => round.number === state.roundNo);
  if (index < 0) return null;
  const roundPart = `Ronde ${index + 1} van ${rounds.length}`;
  const found = findQuestion(content, state.questionId);
  if (found && (state.phase === "open" || state.phase === "gesloten" || state.phase === "onthuld")) {
    return `${roundPart}, vraag ${found.index + 1} van ${found.round.questions.length}`;
  }
  return roundPart;
}
