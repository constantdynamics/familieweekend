import "server-only";
import { logAudit, type Actor } from "./audit";
import { db } from "./db";
import { isUuid } from "./teams";
import type { Env } from "./tokens";

/**
 * Card decks for the game helper (SPEC §4.8 "Spelhulp"): words or tasks the
 * spelleider pastes beforehand. Content, not game data, so the same decks
 * serve the real Spelen and the test environment.
 */

export type Deck = { id: string; name: string; cards: string[]; createdBy: string; updatedAt: string };

type Row = { id: string; name: string; cards: unknown; created_by: string; updated_at: Date };

function toDeck(row: Row): Deck {
  const cards = Array.isArray(row.cards) ? row.cards.filter((card): card is string => typeof card === "string") : [];
  return { id: row.id, name: row.name, cards, createdBy: row.created_by, updatedAt: row.updated_at.toISOString() };
}

export async function listDecks(): Promise<Deck[]> {
  const rows = await db()<Row[]>`select id, name, cards, created_by, updated_at from valk.card_decks order by lower(name), created_at`;
  return rows.map(toDeck);
}

export async function getDeck(id: string): Promise<Deck | null> {
  if (!isUuid(id)) return null;
  const [row] = await db()<Row[]>`select id, name, cards, created_by, updated_at from valk.card_decks where id = ${id}`;
  return row ? toDeck(row) : null;
}

/** A new deck (id null) or new cards for an existing one. Returns the id. */
export async function saveDeck(env: Env, input: { id: string | null; name: string; cards: string[] }, actor: Actor): Promise<string | null> {
  return db().begin(async (sql) => {
    if (input.id) {
      if (!isUuid(input.id)) return null;
      const [row] = await sql<{ id: string }[]>`
        update valk.card_decks set name = ${input.name}, cards = ${sql.json(input.cards)}, updated_at = now()
        where id = ${input.id}
        returning id
      `;
      if (!row) return null;
      await logAudit(actor, { action: "spelhulp.kaartjes", entity: "kaartjes", entityId: row.id, newValue: { naam: input.name, aantal: input.cards.length } }, sql, env);
      return row.id;
    }
    const [row] = await sql<{ id: string }[]>`
      insert into valk.card_decks (name, cards, created_by) values (${input.name}, ${sql.json(input.cards)}, ${actor.name})
      returning id
    `;
    await logAudit(actor, { action: "spelhulp.kaartjes", entity: "kaartjes", entityId: row.id, newValue: { naam: input.name, aantal: input.cards.length } }, sql, env);
    return row.id;
  });
}

export async function deleteDeck(env: Env, id: string, actor: Actor): Promise<boolean> {
  if (!isUuid(id)) return false;
  return db().begin(async (sql) => {
    const [row] = await sql<{ name: string; cards: unknown }[]>`delete from valk.card_decks where id = ${id} returning name, cards`;
    if (!row) return false;
    await logAudit(
      actor,
      {
        action: "spelhulp.verwijderd",
        entity: "kaartjes",
        entityId: id,
        oldValue: { naam: row.name, kaartjes: Array.isArray(row.cards) ? row.cards : [] },
      },
      sql,
      env,
    );
    return true;
  });
}
