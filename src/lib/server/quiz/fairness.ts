/**
 * The fairness check (SPEC §4.6 "Eerlijkheidscheck") for a stored quiz.
 * Subjects are participant names (as in the quiz file); a wie_van_ons
 * question counts for the name of its right option, an echt_of_ai question
 * for the one who sent the photo in. Pure; the names and teams come from
 * the database.
 */
import { autoSubjects, fairnessCheck, type FairnessReport } from "@/lib/shared/fairness";
import { readCorrect } from "./answers";
import type { QuizContent, QuizQuestion } from "./types";

export type FairnessPerson = { name: string; nickname: string | null; teamId: string | null };
export type FairnessTeam = { id: string; name: string };

/** Names compare without case and extra spaces. */
export function nameKey(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/** The names with prior knowledge for one question, as typed (no doubles). */
export function subjectsOf(question: QuizQuestion, submitter: string | null): string[] {
  const correct = readCorrect(question);
  const names = autoSubjects({
    type: question.kind,
    options: (question.options ?? []).map((option) => ({ participantId: option })),
    correct: typeof correct === "number" ? correct : null,
    submitterId: submitter,
    subjects: question.subjects,
  });
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = nameKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type QuizFairness = FairnessReport & {
  /** "Voorkennis per team: Oranje 2, Mosterd 2, Avocado 2, Petrol 2" for the whole quiz. */
  line: string;
  /** The same per round. */
  roundLines: Record<number, string>;
};

/** Short team names for the lines: "Team Oranje" reads as "Oranje". */
export function shortTeamName(name: string): string {
  return name.replace(/^(proef)?team\s+/i, "").trim() || name;
}

export function fairnessFor(
  content: QuizContent,
  people: readonly FairnessPerson[],
  teams: readonly FairnessTeam[],
  submitters: Readonly<Record<string, string>>,
): QuizFairness {
  const teamOf: Record<string, string> = {};
  for (const person of people) {
    if (!person.teamId) continue;
    teamOf[nameKey(person.name)] = person.teamId;
    if (person.nickname) teamOf[nameKey(person.nickname)] ??= person.teamId;
  }
  const questions = content.rounds.flatMap((round) =>
    round.questions.map((question) => ({
      round: round.number,
      subjects: subjectsOf(question, question.photoUploadId ? (submitters[question.photoUploadId] ?? null) : null).map(nameKey),
    })),
  );
  const report = fairnessCheck(questions, teamOf, teams.map((team) => team.id));
  // A team and its count stay together on one line (no-break space).
  const label = (counts: Record<string, number>) =>
    `Voorkennis per team: ${teams.map((team) => `${shortTeamName(team.name)} ${counts[team.id] ?? 0}`).join(", ")}`;
  const roundLines: Record<number, string> = {};
  for (const round of report.rounds) roundLines[round.round] = label(round.counts);
  // Unknown subjects come back as keys; show them as typed in the quiz.
  const typed = new Map<string, string>();
  for (const round of content.rounds) {
    for (const question of round.questions) {
      const submitter = question.photoUploadId ? (submitters[question.photoUploadId] ?? null) : null;
      for (const name of subjectsOf(question, submitter)) typed.set(nameKey(name), name);
    }
  }
  return {
    ...report,
    unknownSubjects: report.unknownSubjects.map((key) => typed.get(key) ?? key),
    line: label(report.total.counts),
    roundLines,
  };
}
