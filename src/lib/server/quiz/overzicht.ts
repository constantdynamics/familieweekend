import "server-only";
import { db } from "../db";
import type { Env } from "../tokens";
import { fairnessFor, type QuizFairness } from "./fairness";
import { heavyMapRounds, roundMaxPoints, type WeightWarning } from "./scores";
import { findDemoQuizId, findMainQuizId, loadContent, loadSubmitters, submitterLabel } from "./store";
import type { QuizContent } from "./types";

/**
 * What beheer shows of a quiz: the content, the maximum points per round,
 * the fairness check (with the names and teams of the environment the quiz
 * is for: the real teams for the main quiz, the test teams for the demo)
 * and the warnings.
 */
export type QuizOverview = {
  content: QuizContent;
  fairness: QuizFairness;
  heavy: WeightWarning[];
  maxPerRound: Record<number, number>;
  /** Upload id → "Oom Kees, Team Oranje". */
  submitters: Record<string, string>;
  /** The teams the fairness check counted. */
  teams: { id: string; name: string }[];
};

export async function quizOverview(which: "hoofd" | "demo"): Promise<QuizOverview | null> {
  const quizId = which === "demo" ? await findDemoQuizId() : await findMainQuizId();
  if (!quizId) return null;
  const content = await loadContent(quizId);
  if (!content) return null;
  const env: Env = content.isDemo ? "test" : "live";
  const photoIds = content.rounds.flatMap((round) => round.questions.flatMap((q) => (q.photoUploadId ? [q.photoUploadId] : [])));
  const [people, teams, submitters] = await Promise.all([
    db()<{ name: string; nickname: string | null; team_id: string | null }[]>`
      select name, nickname, team_id from valk.participants where env = ${env}
    `,
    db()<{ id: string; name: string }[]>`select id, name from valk.teams where env = ${env} order by sort, lower(name)`,
    loadSubmitters(env, photoIds),
  ]);
  const fairness = fairnessFor(
    content,
    people.map((p) => ({ name: p.name, nickname: p.nickname, teamId: p.team_id })),
    teams,
    Object.fromEntries(Object.entries(submitters).map(([id, submitter]) => [id, submitter.name])),
  );
  const maxPerRound: Record<number, number> = {};
  for (const round of content.rounds) maxPerRound[round.number] = roundMaxPoints(round.questions);
  return {
    content,
    fairness,
    heavy: heavyMapRounds(content),
    maxPerRound,
    submitters: Object.fromEntries(Object.entries(submitters).map(([id, submitter]) => [id, submitterLabel(submitter) ?? ""])),
    teams,
  };
}
