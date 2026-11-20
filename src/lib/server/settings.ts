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
  updated_at: Date;
};

function toSettings(row: SettingsRow): Settings {
  return {
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    locationName: row.location_name,
    locationPlace: row.location_place,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    funfactsDeadline: row.funfacts_deadline.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function readSettings(): Promise<Settings> {
  const [row] = await db()<SettingsRow[]>`
    select start_at, end_at, location_name, location_place, latitude, longitude,
           funfacts_deadline, updated_at
    from valk.settings
    where id = 1
  `;
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
};

const LABELS: Record<keyof SettingsInput, string> = {
  startAt: "aftrap",
  endAt: "einde",
  locationName: "locatie",
  locationPlace: "plaats",
  latitude: "breedtegraad",
  longitude: "lengtegraad",
  funfactsDeadline: "deadline fun facts",
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
      select start_at, end_at, location_name, location_place, latitude, longitude,
             funfacts_deadline, updated_at
      from valk.settings where id = 1 for update
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
