/**
 * The prikbord against the local test database: who may post where, threads,
 * hearts, hidden posts, editing, deleting (with photos), the flood limit,
 * the double-tap check and the board's own version.
 *
 * Works in its own channels and with its own names, and removes them
 * afterwards. Needs a local Postgres (see README). Override with
 * TEST_ADMIN_DATABASE_URL.
 */
import { execFileSync } from "node:child_process";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const adminUrl = process.env.TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/valk_test";
const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });

type Board = typeof import("@/lib/server/board");
let board: Board;
let closeApp: () => Promise<void>;

const STAFF = "spelleiding";
let sanne: { id: string; name: string };
let tim: { id: string; name: string };
let oma: { id: string; name: string };
let gewoon: string;
let mededelingen: string;

type Viewer = Parameters<Board["createPost"]>[0];
const family = (...names: { id: string; name: string }[]): Viewer => ({
  admin: null,
  names,
  reason: names.length > 0 ? null : "geen-naam",
  boardOpen: true,
});
const beheerder: Viewer = {
  admin: { id: null, name: "Bordtest Beheerder", role: "beheerder" },
  names: [],
  reason: "geen-naam",
  boardOpen: true,
};

function migrate() {
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], {
    env: { ...process.env, MIGRATION_DATABASE_URL: adminUrl },
    stdio: "pipe",
  });
}

async function cleanUp() {
  await sql`delete from valk.uploads where created_by = 'bordtest'`;
  await sql`delete from valk.board_channels where title like 'Bordtest %'`;
  await sql`delete from valk.participants where name like 'Bordtest %'`;
  await sql`delete from valk.audit_log where actor_name = 'Bordtest Beheerder'`;
}

async function upload(participantId: string | null): Promise<string> {
  const [row] = await sql<{ id: string }[]>`
    insert into valk.uploads (kind, participant_id, mime, bytes, size_bytes, created_by)
    values ('bord', ${participantId}::uuid, 'image/jpeg', decode('ffd8ffe0', 'hex'), 4, 'bordtest')
    returning id
  `;
  return row.id;
}

async function post(viewer: Viewer, channelId: string, body: string, extra: Partial<Parameters<Board["createPost"]>[1]> = {}) {
  const result = await board.createPost(viewer, {
    channelId,
    parentId: null,
    body,
    photoIds: [],
    as: viewer.names[0]?.id ?? STAFF,
    ...extra,
  });
  if (!("ok" in result)) throw new Error(result.fout);
  return result.id;
}

const feed = (viewer: Viewer, channelId: string, sort: "nieuw" | "populair" = "nieuw") =>
  board.channelFeed(channelId, viewer, { sort, limit: 30 });

beforeAll(async () => {
  try {
    migrate();
  } catch {
    // Another test file may be applying the same migration right now.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    migrate();
  }
  process.env.DATABASE_URL = adminUrl;
  process.env.DATABASE_SSL = "disable";
  board = await import("@/lib/server/board");
  const { db } = await import("@/lib/server/db");
  closeApp = () => db().end();

  await cleanUp();
  [sanne, tim, oma] = await Promise.all(
    ["Bordtest Sanne", "Bordtest Tim", "Bordtest Oma"].map(async (name) => {
      const [row] = await sql<{ id: string }[]>`insert into valk.participants (env, name) values ('live', ${name}) returning id`;
      return { id: row.id, name };
    }),
  );
  const make = async (title: string, staffOnly: boolean) => {
    const result = await board.saveChannel(beheerder.admin!, null, {
      title,
      description: null,
      sort: 90,
      pinned: false,
      staffOnly,
      readOnly: false,
    });
    if (!("ok" in result)) throw new Error(result.fout);
    return result.id;
  };
  gewoon = await make("Bordtest Weet je nog", false);
  mededelingen = await make("Bordtest Mededelingen", true);
}, 60_000);

afterAll(async () => {
  await cleanUp();
  await closeApp?.();
  await sql.end();
});

describe("prikbord", () => {
  it("plaatst een bericht met de naam erbij, en het versienummer gaat omhoog", async () => {
    const before = await board.boardVersion();
    const id = await post(family(sanne), gewoon, "  Weet je nog,\r\nde taart in zeven?  ");
    expect(await board.boardVersion()).toBeGreaterThan(before);
    const view = await feed(family(sanne), gewoon);
    const mine = view?.posts.find((p) => p.id === id);
    expect(mine).toMatchObject({ author: "Bordtest Sanne", body: "Weet je nog,\nde taart in zeven?", mine: true, staff: false });
    expect((await feed(family(tim), gewoon))?.posts.find((p) => p.id === id)?.mine).toBe(false);
  });

  it("zet reacties in een draadje onder het bericht", async () => {
    const id = await post(family(sanne), gewoon, "Wie neemt de slingers mee?");
    await post(family(tim), gewoon, "Ik!", { parentId: id });
    const view = await feed(family(sanne), gewoon);
    const thread = view?.posts.find((p) => p.id === id);
    expect(thread?.replyCount).toBe(1);
    expect(thread?.replies.map((r) => r.body)).toEqual(["Ik!"]);
    expect(view?.posts.some((p) => p.body === "Ik!")).toBe(false);
  });

  it("geeft één hartje en één duim per naam", async () => {
    const id = await post(family(sanne), gewoon, "Hartjes graag");
    for (let i = 0; i < 2; i += 1) {
      expect(await board.setReaction(family(tim), { postId: id, kind: "hart", as: tim.id, on: true })).toEqual({ ok: true });
    }
    await board.setReaction(family(tim), { postId: id, kind: "duim", as: tim.id, on: true });
    await board.setReaction(family(sanne), { postId: id, kind: "hart", as: sanne.id, on: true });
    let mijn = (await feed(family(tim), gewoon))?.posts.find((p) => p.id === id);
    expect(mijn).toMatchObject({ hearts: 2, thumbs: 1, myHearts: [tim.id], myThumbs: [tim.id] });
    await board.setReaction(family(tim), { postId: id, kind: "hart", as: tim.id, on: false });
    mijn = (await feed(family(tim), gewoon))?.posts.find((p) => p.id === id);
    expect(mijn).toMatchObject({ hearts: 1, myHearts: [] });
    // Someone else's name: no.
    expect(await board.setReaction(family(tim), { postId: id, kind: "hart", as: sanne.id, on: true })).toHaveProperty("fout");
  });

  it("sorteert op populair: hartjes, duimen en reacties samen", async () => {
    const kanaal = await board.saveChannel(beheerder.admin!, null, {
      title: "Bordtest Populair",
      description: null,
      sort: 91,
      pinned: false,
      staffOnly: false,
      readOnly: false,
    });
    if (!("ok" in kanaal)) throw new Error(kanaal.fout);
    const oud = await post(family(sanne), kanaal.id, "Oud maar geliefd");
    await board.setReaction(family(tim), { postId: oud, kind: "hart", as: tim.id, on: true });
    await post(family(tim), kanaal.id, "Mee eens", { parentId: oud });
    const nieuw = await post(family(tim), kanaal.id, "Nieuw en stil");
    expect((await feed(family(sanne), kanaal.id, "nieuw"))?.posts.map((p) => p.id)).toEqual([nieuw, oud]);
    expect((await feed(family(sanne), kanaal.id, "populair"))?.posts.map((p) => p.id)).toEqual([oud, nieuw]);
  });

  it("toont verborgen berichten alleen aan de beheerder", async () => {
    const id = await post(family(sanne), gewoon, "Oeps, dit hoort hier niet");
    expect(await board.setPostHidden(family(sanne), id, true)).toHaveProperty("fout");
    expect(await board.setPostHidden(beheerder, id, true)).toEqual({ ok: true });
    expect((await feed(family(tim), gewoon))?.posts.some((p) => p.id === id)).toBe(false);
    expect((await feed(beheerder, gewoon))?.posts.find((p) => p.id === id)?.hidden).toBe(true);
    // Hidden means gone for the family: no hearts, no replies.
    expect(await board.setReaction(family(tim), { postId: id, kind: "hart", as: tim.id, on: true })).toHaveProperty("fout");
    expect(
      await board.createPost(family(tim), { channelId: gewoon, parentId: id, body: "Hoi", photoIds: [], as: tim.id }),
    ).toHaveProperty("fout");
    const [log] = await sql`select action from valk.audit_log where entity_id = ${id} order by id desc limit 1`;
    expect(log.action).toBe("bord.bericht.verborgen");
    await board.setPostHidden(beheerder, id, false);
    expect((await feed(family(tim), gewoon))?.posts.some((p) => p.id === id)).toBe(true);
  });

  it("laat in een kanaal van de spelleiding alleen de beheerder plaatsen", async () => {
    const weigering = await board.createPost(family(sanne), {
      channelId: mededelingen,
      parentId: null,
      body: "Mag ik ook?",
      photoIds: [],
      as: sanne.id,
    });
    expect(weigering).toEqual({ fout: "Hier plaatst alleen de spelleiding." });
    const id = await post(beheerder, mededelingen, "Het eten is klaar!");
    const view = await feed(family(sanne), mededelingen);
    expect(view?.posts[0]).toMatchObject({ id, author: "De spelleiding", staff: true });
    expect(view?.viewer).toMatchObject({ authors: [], canReact: true, notice: "spelleiding" });
    expect(await board.setReaction(family(sanne), { postId: id, kind: "duim", as: sanne.id, on: true })).toEqual({ ok: true });
    expect((await feed(beheerder, mededelingen))?.viewer.authors).toEqual([{ id: STAFF, name: "De spelleiding" }]);
  });

  it("maakt van een kanaal op alleen lezen echt alleen lezen", async () => {
    const kanaal = await board.saveChannel(beheerder.admin!, null, {
      title: "Bordtest Archief",
      description: "Van vorig jaar",
      sort: 92,
      pinned: false,
      staffOnly: false,
      readOnly: false,
    });
    if (!("ok" in kanaal)) throw new Error(kanaal.fout);
    const id = await post(family(sanne), kanaal.id, "Nog net op tijd");
    await board.saveChannel(beheerder.admin!, kanaal.id, {
      title: "Bordtest Archief",
      description: "Van vorig jaar",
      sort: 92,
      pinned: true,
      staffOnly: false,
      readOnly: true,
    });
    expect(
      await board.createPost(family(tim), { channelId: kanaal.id, parentId: null, body: "Hoi", photoIds: [], as: tim.id }),
    ).toEqual({ fout: "Dit kanaal is alleen om te lezen." });
    expect(await board.setReaction(family(tim), { postId: id, kind: "hart", as: tim.id, on: true })).toHaveProperty("fout");
    expect(await board.editPost(family(sanne), { id, body: "Anders", photoIds: [] })).toHaveProperty("fout");
    // The admin can still put things right.
    expect(await board.editPost(beheerder, { id, body: "Nog net op tijd (bijgewerkt)", photoIds: [] })).toEqual({ ok: true });
    // Your own post you can always delete.
    expect(await board.removePost(family(sanne), id)).toEqual({ ok: true });
  });

  it("laat je alleen je eigen bericht bewerken; de beheerder alles", async () => {
    const id = await post(family(sanne), gewoon, "Tikfoutje");
    expect(await board.editPost(family(tim), { id, body: "Gekaapt", photoIds: [] })).toEqual({
      fout: "Je kunt alleen je eigen berichten bewerken.",
    });
    expect(await board.editPost(family(sanne), { id, body: "Tikfout weg", photoIds: [] })).toEqual({ ok: true });
    let mijn = (await feed(family(sanne), gewoon))?.posts.find((p) => p.id === id);
    expect(mijn).toMatchObject({ body: "Tikfout weg", editedByStaff: false });
    expect(mijn?.editedAt).not.toBeNull();
    expect(await board.editPost(beheerder, { id, body: "Netjes gemaakt", photoIds: [] })).toEqual({ ok: true });
    mijn = (await feed(family(sanne), gewoon))?.posts.find((p) => p.id === id);
    expect(mijn).toMatchObject({ body: "Netjes gemaakt", editedByStaff: true });
    const [log] = await sql`select action, old_value from valk.audit_log where entity_id = ${id} order by id desc limit 1`;
    expect(log.action).toBe("bord.bericht");
    expect(log.old_value).toMatchObject({ tekst: "Tikfout weg" });
  });

  it("verwijdert een bericht met de reacties, hartjes en foto's eronder", async () => {
    const foto = await upload(sanne.id);
    const id = await post(family(sanne), gewoon, "Met foto", { photoIds: [foto] });
    const antwoordFoto = await upload(tim.id);
    await post(family(tim), gewoon, "Ook een foto", { parentId: id, photoIds: [antwoordFoto] });
    await board.setReaction(family(tim), { postId: id, kind: "hart", as: tim.id, on: true });
    expect(await board.removePost(family(tim), id)).toEqual({ fout: "Je kunt alleen je eigen berichten verwijderen." });
    expect(await board.removePost(family(sanne), id)).toEqual({ ok: true });
    const [rest] = await sql<{ posts: number; uploads: number; reactions: number }[]>`
      select
        (select count(*)::int from valk.board_posts where id = ${id} or parent_id = ${id}) as posts,
        (select count(*)::int from valk.uploads where id = any(${[foto, antwoordFoto]}::uuid[])) as uploads,
        (select count(*)::int from valk.board_reactions where post_id = ${id}) as reactions
    `;
    expect(rest).toEqual({ posts: 0, uploads: 0, reactions: 0 });
  });

  it("neemt alleen je eigen foto's, en elke foto maar bij één bericht", async () => {
    const vanSanne = await upload(sanne.id);
    expect(
      await board.createPost(family(tim), { channelId: gewoon, parentId: null, body: "Pik", photoIds: [vanSanne], as: tim.id }),
    ).toEqual({ fout: "Een van de foto's is niet van jou. Kies hem opnieuw." });
    await post(family(sanne), gewoon, "Eerste keer", { photoIds: [vanSanne] });
    expect(
      await board.createPost(family(sanne), { channelId: gewoon, parentId: null, body: "Nog eens", photoIds: [vanSanne], as: sanne.id }),
    ).toEqual({ fout: "Een van de foto's hoort al bij een ander bericht." });
    const vanDeSpelleiding = await upload(null);
    expect(
      await board.createPost(family(tim), { channelId: gewoon, parentId: null, body: "Pik", photoIds: [vanDeSpelleiding], as: tim.id }),
    ).toHaveProperty("fout");
    await post(beheerder, gewoon, "Foto van de spelleiding", { photoIds: [vanDeSpelleiding] });
  });

  it("plaatst bij dubbel tikken maar één bericht", async () => {
    const een = await post(family(tim), gewoon, "Dubbel getikt");
    const twee = await post(family(tim), gewoon, "Dubbel getikt");
    expect(twee).toBe(een);
  });

  it("stopt na tien berichten in vijf minuten", async () => {
    await sql`
      insert into valk.board_posts (channel_id, participant_id, author_name, body, created_at)
      select ${gewoon}, ${oma.id}, 'Bordtest Oma', 'Spam ' || n, now() - make_interval(secs => n * 10)
      from generate_series(1, 10) as n
    `;
    const result = await board.createPost(family(oma), {
      channelId: gewoon,
      parentId: null,
      body: "Nog eentje",
      photoIds: [],
      as: oma.id,
    });
    expect("fout" in result && result.fout).toMatch(/^Rustig aan! Je hebt net al 10 berichten geplaatst\. Om \d\d:\d\d kan het weer\.$/);
    // Everyone has a limit of their own.
    await post(family(tim), gewoon, "Ik mag nog wel");
    await sql`delete from valk.board_posts where participant_id = ${oma.id}`;
  });

  it("laat de proef, Bekijk als en een dicht prikbord alleen meelezen", async () => {
    const input = { channelId: gewoon, parentId: null, body: "Proefje", photoIds: [], as: sanne.id };
    expect(await board.createPost({ admin: null, names: [], reason: "proef", boardOpen: true }, input)).toEqual({
      fout: "In de proef kun je het prikbord alleen bekijken.",
    });
    expect(await board.createPost({ ...family(sanne), boardOpen: false }, input)).toEqual({
      fout: "Het prikbord is even dicht. Lezen kan wel.",
    });
    // The admin still posts as De spelleiding when the board is closed.
    await post({ ...beheerder, boardOpen: false }, gewoon, "Even dicht, zo weer open");
  });

  it("verwijdert alleen een leeg kanaal", async () => {
    expect(await board.removeChannel(beheerder.admin!, gewoon)).toHaveProperty("fout");
    const leeg = await board.saveChannel(beheerder.admin!, null, {
      title: "Bordtest Leeg",
      description: null,
      sort: 93,
      pinned: false,
      staffOnly: false,
      readOnly: false,
    });
    if (!("ok" in leeg)) throw new Error(leeg.fout);
    expect(await board.saveChannel(beheerder.admin!, null, {
      title: "bordtest leeg",
      description: null,
      sort: 94,
      pinned: false,
      staffOnly: false,
      readOnly: false,
    })).toEqual({ fout: "Er is al een kanaal met die naam." });
    expect(await board.removeChannel(beheerder.admin!, leeg.id)).toEqual({ ok: true });
  });

  it("telt in het kanaaloverzicht verborgen berichten alleen voor de beheerder", async () => {
    const kanaal = await board.saveChannel(beheerder.admin!, null, {
      title: "Bordtest Tellen",
      description: null,
      sort: 95,
      pinned: true,
      staffOnly: false,
      readOnly: false,
    });
    if (!("ok" in kanaal)) throw new Error(kanaal.fout);
    const zichtbaar = await post(family(sanne), kanaal.id, "Zichtbaar");
    await post(family(tim), kanaal.id, "Antwoord", { parentId: zichtbaar });
    const weg = await post(family(tim), kanaal.id, "Weg ermee");
    await post(family(sanne), kanaal.id, "Antwoord op weg", { parentId: weg });
    await board.setPostHidden(beheerder, weg, true);
    const voorFamilie = (await board.channelList(family(sanne))).channels.find((c) => c.id === kanaal.id);
    expect(voorFamilie).toMatchObject({ posts: 1, replies: 1, lastAuthor: "Bordtest Tim", pinned: true });
    const voorBeheerder = (await board.channelList(beheerder)).channels.find((c) => c.id === kanaal.id);
    expect(voorBeheerder).toMatchObject({ posts: 2, replies: 2 });
  });

  it("laat de serverrol schrijven, en het versienummer gaat mee", async () => {
    const before = await board.boardVersion();
    await sql.begin(async (tx) => {
      await tx.unsafe("set local role valk_app");
      await tx`insert into valk.board_posts (channel_id, author_name, body) values (${gewoon}, 'Bordtest rol', 'Hoi')`;
    });
    expect(await board.boardVersion()).toBeGreaterThan(before);
    await expect(
      sql`insert into valk.board_posts (channel_id, author_name, body, photo_ids)
          values (${gewoon}, 'Bordtest', 'x', array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()])`,
    ).rejects.toThrow(/board_posts_photo_count/);
  });
});
