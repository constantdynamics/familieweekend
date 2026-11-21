/**
 * Load test for a quiz round (SPEC §2 and §7.5): 50 phones read the quiz
 * state while the quizmaster runs a round, four captains answer, and every
 * phone polls the version like the app does without Realtime. After every
 * step all phones fetch the new state at once, as they do after a ring of
 * the doorbell. Reports the latencies and checks that an update reaches
 * every phone within one second.
 *
 * Against a local production server and a local database, for example the
 * end-to-end database after `npm run build`:
 *
 *   E2E_PORT=3150 E2E_DB=valk_e2e_e npx tsx tests/e2e/prepare.ts
 *   DATABASE_URL=postgres://valk_app:…@localhost:5432/valk_e2e_e DATABASE_SSL=disable \
 *     APP_SECRET=… npx next start -p 3150 &
 *   DATABASE_URL=… DATABASE_SSL=disable APP_SECRET=… BASE_URL=http://localhost:3150 \
 *     npx tsx --conditions=react-server scripts/belasting.ts
 *
 * It sets up the test environment itself (the demo quiz with four test
 * teams), exactly as "Zet de proef klaar" does. Never against production.
 */
import postgres from "postgres";
import { setUpTestEnvironment } from "../src/lib/server/proef";
import {
  CAPTAIN_COOKIE,
  PROEF_COOKIE,
  SESSION_COOKIE,
  STAFF_COOKIE,
  createCaptainToken,
  createProefToken,
  createSessionToken,
  createStaffToken,
} from "../src/lib/server/tokens";

const BASE = process.env.BASE_URL ?? "http://localhost:3150";
const CLIENTS = Number(process.env.CLIENTS) || 50;
const POLL_MS = 2500;
const LIMIT_MS = 1000;

if (!/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(BASE) || !/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? "")) {
  console.error("De belastingtest draait alleen tegen een lokale server en database (localhost).");
  process.exit(1);
}

type Client = { name: string; cookie: string; captainTeam?: string; seen: number };

const sql = postgres(process.env.DATABASE_URL!, { max: 2, prepare: false, onnotice: () => {} });
const latencies = { state: [] as number[], versie: [] as number[], answer: [] as number[], everyone: [] as number[] };
let errors = 0;

async function get(client: Client, path: string): Promise<{ ms: number; body: Record<string, unknown> | null }> {
  const start = performance.now();
  try {
    const response = await fetch(`${BASE}${path}`, { headers: { cookie: client.cookie }, cache: "no-store" });
    const body = response.ok ? ((await response.json()) as Record<string, unknown>) : null;
    if (!response.ok) errors += 1;
    return { ms: performance.now() - start, body };
  } catch {
    errors += 1;
    return { ms: performance.now() - start, body: null };
  }
}

async function post(client: Client, path: string, body: unknown): Promise<{ ms: number; ok: boolean; text: string }> {
  const start = performance.now();
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { cookie: client.cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { ms: performance.now() - start, ok: response.ok, text };
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function line(label: string, values: number[]) {
  const fmt = (n: number) => `${Math.round(n)} ms`.padStart(8);
  console.log(
    `${label.padEnd(36)} ${String(values.length).padStart(5)}x  p50 ${fmt(percentile(values, 50))}  p95 ${fmt(percentile(values, 95))}  max ${fmt(Math.max(0, ...values))}`,
  );
}

/** Every phone fetches the state at once, as after a ring; returns when all see `phase`. */
async function ringAndWait(clients: Client[], phase: string, since: number) {
  const results = await Promise.all(
    clients.map(async (client) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { ms, body } = await get(client, "/api/quiz/state");
        latencies.state.push(ms);
        if (body && body.phase === phase) return performance.now() - since;
      }
      return Number.POSITIVE_INFINITY;
    }),
  );
  latencies.everyone.push(Math.max(...results));
}

async function main() {
  const proefToken = await createProefToken("proef");
  const [admin] = await sql<{ id: string; name: string; pin_version: number }[]>`
    select id, name, pin_version from valk.staff where role = 'beheerder' and active order by created_at limit 1
  `;
  if (!admin) throw new Error("Er is geen beheerder in deze database. Draai eerst tests/e2e/prepare.ts.");

  console.log("Proef klaarzetten met de demo-quiz…");
  await setUpTestEnvironment({ id: admin.id, name: admin.name, role: "beheerder" });
  const teams = await sql<{ id: string; name: string; pin_version: number }[]>`
    select id, name, pin_version from valk.teams where env = 'test' order by sort
  `;
  const [quiz] = await sql<{ quiz_id: string }[]>`select quiz_id from valk.live_state where env = 'test'`;

  const quizmasterDevice = "belasting-quizmaster";
  const quizmaster: Client = {
    name: "quizmaster",
    seen: 0,
    cookie: [
      `${SESSION_COOKIE}=${await createSessionToken(quizmasterDevice)}`,
      `${STAFF_COOKIE}=${await createStaffToken({ staffId: admin.id, role: "beheerder", name: admin.name, deviceId: quizmasterDevice, pinVersion: admin.pin_version })}`,
      `${PROEF_COOKIE}=${proefToken}`,
    ].join("; "),
  };

  const clients: Client[] = [];
  for (let index = 0; index < CLIENTS; index += 1) {
    const device = `belasting-telefoon-${index}`;
    const team = index < teams.length ? teams[index] : null;
    const cookies = [`${SESSION_COOKIE}=${await createSessionToken(device)}`, `${PROEF_COOKIE}=${proefToken}`];
    if (team) {
      await sql`update valk.teams set active_device_id = ${device}, active_since = now() where id = ${team.id}`;
      cookies.push(`${CAPTAIN_COOKIE}=${await createCaptainToken({ teamId: team.id, env: "test", pinVersion: team.pin_version, deviceId: device })}`);
    }
    clients.push({ name: team ? `captain ${team.name}` : `telefoon ${index}`, cookie: cookies.join("; "), captainTeam: team?.id, seen: 0 });
  }
  console.log(`${clients.length} telefoons, waarvan ${teams.length} captains, en een quizmaster.`);

  // Every phone polls the version, as the app does without Realtime.
  let polling = true;
  const pollers = clients.map(async (client, index) => {
    await new Promise((resolve) => setTimeout(resolve, (index * POLL_MS) / clients.length));
    while (polling) {
      const { ms } = await get(client, "/api/versie");
      latencies.versie.push(ms);
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
  });

  const step = async (actie: string, phase: string, extra: Record<string, unknown> = {}) => {
    const sent = performance.now();
    const result = await post(quizmaster, "/api/quiz/console", { actie, ...extra });
    if (!result.ok) throw new Error(`${actie}: ${result.text}`);
    await ringAndWait(clients, phase, sent);
  };

  await step("start", "rondescherm", { quiz: quiz.quiz_id });
  for (let vraag = 0; vraag < 3; vraag += 1) {
    await step(vraag === 0 ? "toon" : "volgende", "open");
    const state = (await get(clients[0], "/api/quiz/state")).body as { question?: { id: string; kind: string; options: string[] | null } };
    const question = state.question!;
    // The four captains answer at the same time; after each answer every phone fetches again.
    await Promise.all(
      clients
        .filter((client) => client.captainTeam)
        .map(async (client, index) => {
          const antwoord =
            question.kind === "schatting" ? { number: 30 + index * 3 } : question.kind === "waar_niet_waar" ? { bool: index % 2 === 0 } : { choice: index % (question.options?.length ?? 2) };
          const result = await post(client, "/api/quiz/antwoord", { vraag: question.id, antwoord });
          latencies.answer.push(result.ms);
          if (!result.ok) errors += 1;
        }),
    );
    await ringAndWait(clients, "open", performance.now());
    await step("sluit", "gesloten");
    await step("onthul", "onthuld");
  }
  await step("volgende", "tussenstand");
  await step("pauze", "tussenstand");
  polling = false;
  await Promise.all(pollers);

  console.log("");
  line("Stand ophalen na een seintje", latencies.state);
  line("Versie vragen (elke 2,5 s)", latencies.versie);
  line("Antwoord van een captain", latencies.answer);
  line("Stap tot alle telefoons bij", latencies.everyone);
  console.log(`Fouten: ${errors}`);
  const worst = Math.max(...latencies.everyone);
  const ok = errors === 0 && worst <= LIMIT_MS;
  console.log(
    ok
      ? `\nGeslaagd: elke stap stond binnen ${Math.round(worst)} ms op alle ${clients.length} telefoons (eis: binnen ${LIMIT_MS} ms na het seintje).`
      : `\nNiet gehaald: de langzaamste stap kostte ${Math.round(worst)} ms, met ${errors} fouten.`,
  );
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
