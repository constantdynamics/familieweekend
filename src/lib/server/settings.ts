import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";

export const SETTINGS_TAG = "settings";

/** Public settings. Dates are ISO strings so they survive caching and props. */
export type Settings = {
  startAt: string;
  endAt: string;
  locationName: string;
  locationPlace: string;
  latitude: number;
  longitude: number;
  funfactsDeadline: string;
  funfactsOpenAt: string;
  /** The family sees the program (the admin releases it). */
  programVisible: boolean;
  /** Everyone sees which team they are in. */
  teamsVisible: boolean;
  /** Place points for the zeskamp (whole points), e.g. [10, 7, 5, 3]. */
  zeskampPoints: number[];
  intermezzoPoints: number;
  intermezzoMaxDuels: number | null;
  boardOpen: boolean;
  /** The family sees the new app (menu with the board). Off until the delivery. */
  fase2Live: boolean;
  /** Public Supabase Realtime address and key, or null (then phones poll). */
  realtime: { url: string; key: string } | null;
  updatedAt: string;
};

type SettingsRow = {
  start_at: Date;
  end_at: Date;
  location_name: string;
  location_place: string;
  latitude: number;
  longitude: number;
  funfacts_deadline: Date;
  funfacts_open_at: Date;
  program_visible: boolean;
  teams_visible: boolean;
  zeskamp_points: number[];
  intermezzo_points: number;
  intermezzo_max_duels: number | null;
  board_open: boolean;
  fase2_live: boolean;
  realtime_url: string | null;
  realtime_key: string | null;
  updated_at: Date;
};

const COLUMNS = [
  "start_at",
  "end_at",
  "location_name",
  "location_place",
  "latitude",
  "longitude",
  "funfacts_deadline",
  "funfacts_open_at",
  "program_visible",
  "teams_visible",
  "zeskamp_points",
  "intermezzo_points",
  "intermezzo_max_duels",
  "board_open",
  "fase2_live",
  "realtime_url",
  "realtime_key",
  "updated_at",
] as const;

function toSettings(row: SettingsRow): Settings {
  return {
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    locationName: row.location_name,
    locationPlace: row.location_place,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    funfactsDeadline: row.funfacts_deadline.toISOString(),
    funfactsOpenAt: row.funfacts_open_at.toISOString(),
    programVisible: row.program_visible,
    teamsVisible: row.teams_visible,
    zeskampPoints: row.zeskamp_points.map(Number),
    intermezzoPoints: Number(row.intermezzo_points),
    intermezzoMaxDuels: row.intermezzo_max_duels === null ? null : Number(row.intermezzo_max_duels),
    boardOpen: row.board_open,
    fase2Live: row.fase2_live,
    realtime:
      row.realtime_url && row.realtime_key && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(row.realtime_url)
        ? { url: row.realtime_url, key: row.realtime_key }
        : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function readSettings(): Promise<Settings> {
  const sql = db();
  const [row] = await sql<SettingsRow[]>`select ${sql(COLUMNS)} from valk.settings where id = 1`;
  if (!row) throw new Error("De instellingen ontbreken in de database. Draai de migraties.");
  return toSettings(row);
}

/** Cached for everyone; the admin's save clears the `settings` tag. */
export async function getSettings(): Promise<Settings> {
  "use cache";
  cacheTag(SETTINGS_TAG);
  cacheLife("days");
  return readSettings();
}

export type SettingsInput = {
  startAt: Date;
  endAt: Date;
  locationName: string;
  locationPlace: string;
  latitude: number;
  longitude: number;
  funfactsDeadline: Date;
  funfactsOpenAt: Date;
};

const LABELS: Record<keyof SettingsInput, string> = {
  startAt: "aftrap",
  endAt: "einde",
  locationName: "locatie",
  locationPlace: "plaats",
  latitude: "breedtegraad",
  longitude: "lengtegraad",
  funfactsDeadline: "deadline fun facts",
  funfactsOpenAt: "fun facts open",
};

function comparable(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Save the settings and log what changed (old and new value per field).
 * Returns the names of the fields that changed.
 */
export async function updateSettings(input: SettingsInput, actor: Actor): Promise<string[]> {
  return db().begin(async (sql) => {
    const [current] = await sql<SettingsRow[]>`
      select ${sql(COLUMNS)} from valk.settings where id = 1 for update
    `;
    if (!current) throw new Error("De instellingen ontbreken in de database.");
    const before = toSettings(current);
    const oldValue: Record<string, string | number> = {};
    const newValue: Record<string, string | number> = {};
    for (const key of Object.keys(LABELS) as (keyof SettingsInput)[]) {
      const previous = before[key];
      const next = input[key];
      if (comparable(previous) !== comparable(next)) {
        oldValue[LABELS[key]] = previous;
        newValue[LABELS[key]] = next instanceof Date ? next.toISOString() : next;
      }
    }
    const changed = Object.keys(newValue);
    if (changed.length === 0) return changed;
    await sql`
      update valk.settings set
        start_at = ${input.startAt},
        end_at = ${input.endAt},
        location_name = ${input.locationName},
        location_place = ${input.locationPlace},
        latitude = ${input.latitude},
        longitude = ${input.longitude},
        funfacts_deadline = ${input.funfactsDeadline},
        funfacts_open_at = ${input.funfactsOpenAt},
        updated_at = now(),
        updated_by = ${actor.name}
      where id = 1
    `;
    await logAudit(actor, { action: "instellingen.gewijzigd", entity: "instellingen", oldValue, newValue }, sql);
    return changed;
  });
}

export type Heartbeat = { lastSeenAt: string; source: string; beats: number };

export async function readHeartbeat(): Promise<Heartbeat | null> {
  const [row] = await db()<{ last_seen_at: Date; source: string; beats: string }[]>`
    select last_seen_at, source, beats from valk.heartbeat where id = 1
  `;
  if (!row) return null;
  return { lastSeenAt: row.last_seen_at.toISOString(), source: row.source, beats: Number(row.beats) };
}

/** Switches the admin flips: what the family already sees. */
export type SettingsFlag = "programVisible" | "teamsVisible" | "boardOpen" | "fase2Live";

const FLAG_COLUMNS: Record<SettingsFlag, { column: string; label: string }> = {
  programVisible: { column: "program_visible", label: "programma zichtbaar" },
  teamsVisible: { column: "teams_visible", label: "teams zichtbaar" },
  boardOpen: { column: "board_open", label: "prikbord open" },
  fase2Live: { column: "fase2_live", label: "nieuwe app voor de familie" },
};

export async function setSettingsFlag(flag: SettingsFlag, value: boolean, actor: Actor): Promise<void> {
  const { column, label } = FLAG_COLUMNS[flag];
  await db().begin(async (sql) => {
    const [row] = await sql<{ old: boolean }[]>`
      select ${sql(column)} as old from valk.settings where id = 1 for update
    `;
    if (!row || row.old === value) return;
    await sql`
      update valk.settings set ${sql({ [column]: value })}, updated_at = now(), updated_by = ${actor.name}
      where id = 1
    `;
    await logAudit(
      actor,
      { action: "instellingen.gewijzigd", entity: "instellingen", oldValue: { [label]: row.old }, newValue: { [label]: value } },
      sql,
    );
  });
}

/** Place points and intermezzo points (SPEC §5.1: "alle tabellen zijn instelbaar"). */
export async function updatePointTables(
  input: { zeskampPoints: number[]; intermezzoPoints: number; intermezzoMaxDuels: number | null },
  actor: Actor,
): Promise<void> {
  await db().begin(async (sql) => {
    const [row] = await sql<Pick<SettingsRow, "zeskamp_points" | "intermezzo_points" | "intermezzo_max_duels">[]>`
      select zeskamp_points, intermezzo_points, intermezzo_max_duels from valk.settings where id = 1 for update
    `;
    if (!row) throw new Error("De instellingen ontbreken in de database.");
    await sql`
      update valk.settings set
        zeskamp_points = ${input.zeskampPoints}::int[],
        intermezzo_points = ${input.intermezzoPoints},
        intermezzo_max_duels = ${input.intermezzoMaxDuels},
        updated_at = now(),
        updated_by = ${actor.name}
      where id = 1
    `;
    await logAudit(
      actor,
      {
        action: "puntentabellen.gewijzigd",
        entity: "instellingen",
        oldValue: { zeskamp: row.zeskamp_points, intermezzo: row.intermezzo_points, maxDuels: row.intermezzo_max_duels },
        newValue: { zeskamp: input.zeskampPoints, intermezzo: input.intermezzoPoints, maxDuels: input.intermezzoMaxDuels },
      },
      sql,
    );
  });
}
