/**
 * Reads a quiz file (SPEC §9.2), checks it with clear Dutch messages, and
 * writes it into the main quiz of the database.
 *
 *   npm run import:quiz -- quiz.json
 *
 * Uses MIGRATION_DATABASE_URL, or else DATABASE_URL. A "foto" that is a file
 * name is looked up next to the quiz file and in content/fotos/, and stored
 * as a quiz photo. The quiz file itself never goes into the app or the repo.
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { QuizEditError, writeQuiz } from "../src/lib/server/quiz/editor";
import { parseQuizFile } from "../src/lib/server/quiz/format";
import { MAX_UPLOAD_BYTES, sniffImage } from "../src/lib/server/uploads";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Geef het quizbestand mee: npm run import:quiz -- quiz.json");
    process.exit(1);
  }
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Zet MIGRATION_DATABASE_URL of DATABASE_URL (bijvoorbeeld in .env.local).");
    process.exit(1);
  }

  let source: string;
  try {
    source = await readFile(file, "utf8");
  } catch {
    console.error(`Het bestand ${file} kan ik niet lezen. Klopt de naam?`);
    process.exit(1);
  }

  const parsed = parseQuizFile(source);
  if (!parsed.ok) {
    console.error(`Het bestand is niet ingelezen. Dit moet eerst anders:\n`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {}, ssl: local ? false : "require" });
  const folders = [path.dirname(path.resolve(file)), path.resolve("content", "fotos")];

  try {
    const report = await sql.begin((tx) =>
      writeQuiz(tx, parsed.quiz, { id: null, name: "npm run import:quiz", role: "script" }, async (name, txSql) => {
        for (const folder of folders) {
          const candidate = path.resolve(folder, name);
          // Only files inside the folder, never ../ out of it.
          if (!candidate.startsWith(folder + path.sep)) continue;
          const info = await stat(candidate).catch(() => null);
          if (!info?.isFile()) continue;
          if (info.size > MAX_UPLOAD_BYTES) {
            console.warn(`  ! ${name} is groter dan 3 MB; maak hem kleiner en importeer opnieuw.`);
            return null;
          }
          const bytes = new Uint8Array(await readFile(candidate));
          const mime = sniffImage(bytes);
          if (!mime) {
            console.warn(`  ! ${name} is geen JPG, PNG of WebP.`);
            return null;
          }
          const [row] = await txSql<{ id: string }[]>`
            insert into valk.uploads (kind, mime, bytes, size_bytes, created_by)
            values ('quiz', ${mime}, ${Buffer.from(bytes)}, ${bytes.length}, 'npm run import:quiz')
            returning id
          `;
          return row.id;
        }
        return null;
      }),
    );
    const rondes = report.rounds === 1 ? "1 ronde" : `${report.rounds} rondes`;
    const vragen = report.questions === 1 ? "1 vraag" : `${report.questions} vragen`;
    console.log(`Quiz ingelezen: ${rondes}, ${vragen}.`);
    console.log(`  ${report.added} nieuw, ${report.changed} bijgewerkt, ${report.removed} verwijderd.`);
    if (report.warnings.length > 0) {
      console.log("\nLet op:");
      for (const warning of report.warnings) console.log(`  - ${warning}`);
    }
  } catch (error) {
    if (error instanceof QuizEditError) {
      console.error(error.message);
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
