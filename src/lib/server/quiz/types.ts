/**
 * Types of the quiz (SPEC §4.6). No `server-only` here on purpose: screens
 * import these types (and only types) to read the API responses. Quiz
 * content itself never leaves the server except through the role-aware
 * views in view.ts.
 */
import type { LatLng, MapScale } from "@/lib/shared/geo";
import type { Answer, QuestionType } from "@/lib/shared/quizScoring";
import type { TeamColor } from "@/lib/shared/teams";

export type { Answer, LatLng, MapScale, QuestionType, TeamColor };

export type QuizPhase = "rondescherm" | "open" | "gesloten" | "onthuld" | "tussenstand" | "einde";
export type LiveMode = "rust" | "quiz" | "intermezzo" | "ceremonie";

export const QUESTION_TYPES = [
  "meerkeuze",
  "waar_niet_waar",
  "wie_van_ons",
  "schatting",
  "schatting_bereik",
  "kaart",
  "echt_of_ai",
] as const satisfies readonly QuestionType[];

/** Types whose captain picks one of 2 to 4 options (the tiles A to D). */
export const CHOICE_TYPES = ["meerkeuze", "wie_van_ons", "schatting_bereik"] as const;

export function isChoiceType(kind: QuestionType): kind is (typeof CHOICE_TYPES)[number] {
  return (CHOICE_TYPES as readonly string[]).includes(kind);
}

/**
 * The right answer as stored in quiz_questions.correct (jsonb): an index
 * for the choice types, true or false, "echt" or "ai", a number, or a place.
 */
export type CorrectValue = number | boolean | "echt" | "ai" | LatLng;

/** One question as stored. */
export type QuizQuestion = {
  id: string;
  roundId: string;
  sort: number;
  extId: string | null;
  kind: QuestionType;
  text: string;
  /** The tiles of meerkeuze, wie_van_ons and schatting_bereik. */
  options: string[] | null;
  correct: unknown;
  unit: string | null;
  scale: MapScale | null;
  explanation: string | null;
  photoUploadId: string | null;
  /**
   * The photo the phones get. Echt of AI with a fun-fact photo shows the
   * version chosen in the photo admin (uploads.quiz_variant); otherwise the
   * same as photoUploadId.
   */
  displayPhotoId?: string | null;
  photoCredit: string | null;
  /** Names of participants with prior knowledge, as given by hand. */
  subjects: string[];
  /** Only for the quizmaster ("Start op Spotify: …"). */
  note: string | null;
};

export type QuizRound = {
  id: string;
  quizId: string;
  number: number;
  title: string;
  intro: string | null;
  listening: boolean;
  intermezzoAfter: boolean;
  maxPoints: number | null;
  /** Sorted by `sort`. */
  questions: QuizQuestion[];
};

export type QuizContent = {
  id: string;
  title: string;
  isDemo: boolean;
  /** Sorted by number. */
  rounds: QuizRound[];
};

/** The part of valk.live_state the quiz engine reads and writes. */
export type EngineState = {
  mode: LiveMode;
  quizId: string | null;
  roundNo: number | null;
  questionId: string | null;
  phase: QuizPhase | null;
  listening: boolean;
  /** Epoch milliseconds, or null without "Nog 10 seconden!". */
  countdownUntil: number | null;
};

/* ------------------------------------------------------------------------ */
/* What the phones get (GET /api/quiz/state).                                */
/* ------------------------------------------------------------------------ */

export type ViewerRole = "captain" | "meekijker" | "bezoeker";

export type ViewTeam = {
  id: string;
  name: string;
  color: TeamColor;
  /** Answered the current question (no answer content before the reveal). */
  answered: boolean;
  /** The round of this team's quiz joker, or null. */
  jokerRound: number | null;
  /** Only after the reveal. */
  result: ViewResult | null;
};

export type ViewResult = {
  /** Points for this question in twelfths, joker not included. */
  twelfths: number;
  /** The same with the joker of this round doubled. */
  twelfthsWithJoker: number;
  correct: boolean;
  answer: Answer | null;
  distanceKm: number | null;
  difference: number | null;
  corrected: boolean;
};

export type ViewQuestion = {
  id: string;
  /** 1-based position in the round. */
  number: number;
  count: number;
  kind: QuestionType;
  text: string;
  options: string[] | null;
  unit: string | null;
  scale: MapScale | null;
  photoUrl: string | null;
  photoCredit: string | null;
  /** echt_of_ai: who sent the photo in, "Oom Kees, Team Oranje". */
  submitter: string | null;
  /** Only after the reveal. */
  correct: CorrectValue | null;
  explanation: string | null;
};

export type ViewStanding = {
  teamId: string;
  name: string;
  color: TeamColor;
  place: number;
  shared: boolean;
  twelfths: number;
  jokerRound: number | null;
};

export type QuizView = {
  v: number;
  env: "live" | "test";
  /** What the quiz screen shows: nothing running, the quiz, or the intermezzo. */
  status: "rust" | "quiz" | "intermezzo";
  phase: QuizPhase | null;
  title: string | null;
  round: {
    number: number;
    /** 1-based among the rounds with questions. */
    index: number;
    total: number;
    title: string;
    intro: string | null;
    questionCount: number;
    listeningRound: boolean;
  } | null;
  /** The next round on the interim standing. */
  nextRound: { number: number; title: string; intermezzoFirst: boolean } | null;
  /** "vraag 2 van 10", also in listening mode where the question itself stays away. */
  questionAt: { number: number; count: number } | null;
  question: ViewQuestion | null;
  /** Meekijkers in listening mode only see "Luister goed". */
  luisterGoed: boolean;
  countdownMs: number | null;
  me: {
    role: ViewerRole;
    team: { id: string; name: string; color: TeamColor } | null;
    /** The name of this team's captain, for "Sanne heeft gekozen". */
    captainName: string | null;
    captainTakenOver: boolean;
    /** This device has a captain's name but is not the team device yet. */
    suggestCaptainLogin: boolean;
    canAnswer: boolean;
    canJoker: boolean;
    /** The captain's own answer; never for meekijkers before the reveal. */
    answer: Answer | null;
    teamAnswered: boolean;
  };
  teams: ViewTeam[];
  answeredCount: number;
  jokers: { teamId: string; name: string; color: TeamColor; round: number }[];
  standings: ViewStanding[] | null;
  /** The scoreboard is locked: the interim standing stays a secret. */
  standingsHidden: boolean;
};

/* ------------------------------------------------------------------------ */
/* What the quizmaster gets (GET /api/quiz/console, admin only).             */
/* ------------------------------------------------------------------------ */

export type ConsoleButtonView = { command: string; label: string };

export type ConsoleQuestion = {
  id: string;
  roundNo: number;
  number: number;
  count: number;
  kind: QuestionType;
  text: string;
  options: string[] | null;
  /** Index of the right tile, for marking it "goed". */
  correctChoice: number | null;
  correctLabel: string;
  unit: string | null;
  scale: MapScale | null;
  explanation: string | null;
  note: string | null;
  photoUrl: string | null;
  photoCredit: string | null;
  submitter: string | null;
  subjects: string[];
};

export type ConsoleTeam = {
  id: string;
  name: string;
  color: TeamColor;
  /** A captain device is logged in for this team. */
  hasDevice: boolean;
  captainName: string | null;
  jokerRound: number | null;
  answered: boolean;
  /** From the moment the question closes. */
  answerLabel: string | null;
  /** After the reveal (or for a correction): points of this question. */
  twelfths: number | null;
  computed: number | null;
  override: number | null;
  distanceKm: number | null;
};

export type ConsoleStanding = ViewStanding & { rounds: { round: number; twelfths: number; joker: boolean }[] };

export type ConsoleView = {
  v: number;
  env: "live" | "test";
  mode: LiveMode;
  phase: QuizPhase | null;
  quiz: { id: string; title: string; isDemo: boolean } | null;
  /** The quizzes the console can start in this environment. */
  quizzes: { id: string; title: string; isDemo: boolean; questions: number }[];
  position: string | null;
  round: { number: number; title: string; intro: string | null; listeningRound: boolean; intermezzoAfter: boolean } | null;
  listening: boolean;
  question: ConsoleQuestion | null;
  /** What comes next, so the quizmaster can get the music ready. */
  upNext: { number: number; text: string; note: string | null } | null;
  countdownMs: number | null;
  buttons: { main: ConsoleButtonView | null; extra: ConsoleButtonView[]; canGoBack: boolean; canCountdown: boolean };
  teams: ConsoleTeam[];
  answeredCount: number;
  fairness: string | null;
  standings: ConsoleStanding[];
  /** Questions that have answers or are current, for "Corrigeer punten". */
  played: { id: string; label: string }[];
  /** The question picked for a correction (?vraag=…), with the points per team. */
  review: { question: ConsoleQuestion; teams: ConsoleTeam[] } | null;
  /** Where "Ga verder" picks up, when the quiz was paused. */
  resume: string | null;
  canRestart: boolean;
  botsAllowed: boolean;
};
