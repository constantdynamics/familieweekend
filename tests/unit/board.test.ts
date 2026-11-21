import { describe, expect, it } from "vitest";
import {
  BOARD,
  aantal,
  applyReaction,
  boardRights,
  bodyProblem,
  cleanBody,
  excerpt,
  floodCheck,
  initials,
  keepPhotoUrls,
  parseBody,
  parseLimit,
  parseSort,
  photoExpiry,
  relativeTime,
  safeHref,
  type FeedPost,
} from "@/lib/shared/board";

const NBSP = " ";
const nb = (text: string) => text.replaceAll(" ", NBSP);

describe("tekst opschonen", () => {
  it("maakt regeleinden gelijk, haalt spaties achteraan en lege regels weg", () => {
    expect(cleanBody("  Hoi\r\nallemaal   \r\n\r\n\r\n\r\nTot zo!\t \n")).toBe("Hoi\nallemaal\n\nTot zo!");
  });

  it("haalt stuurtekens en onzichtbare omkeertekens weg, maar laat emoji heel", () => {
    expect(cleanBody("a\u0000b\u0007c‮gnp.exe⁦x﻿")).toBe("abcgnp.exex");
    const familie = "\u{1F468}‍\u{1F469}‍\u{1F467}";
    expect(cleanBody(`Wij ${familie}!`)).toBe(`Wij ${familie}!`);
  });

  it("zegt wat er mis is met een bericht", () => {
    expect(bodyProblem("", 0)).toMatch(/Schrijf eerst iets/);
    expect(bodyProblem("", 1)).toBeNull();
    expect(bodyProblem("x".repeat(BOARD.maxBody), 0)).toBeNull();
    expect(bodyProblem("x".repeat(BOARD.maxBody + 1), 0)).toMatch(/te lang/);
    expect(bodyProblem(Array.from({ length: BOARD.maxLines + 1 }, () => "a").join("\n"), 0)).toMatch(/regels/);
    expect(bodyProblem("hoi", BOARD.maxPhotos + 1)).toMatch(/maximaal 4/);
  });

  it("maakt een korte samenvatting op één regel", () => {
    expect(excerpt("Hoi\nallemaal")).toBe("Hoi allemaal");
    const lang = excerpt("woord ".repeat(60), 50);
    expect(lang.length).toBeLessThanOrEqual(51);
    expect(lang.endsWith("…")).toBe(true);
  });
});

describe("tekst tonen", () => {
  it("houdt een korte regel helemaal bij elkaar", () => {
    expect(parseBody("Tot snel allemaal!")).toEqual([[[{ link: false, text: nb("Tot snel allemaal!") }]]]);
  });

  it("houdt bij een lange regel de laatste twee woorden bij elkaar", () => {
    const [[[segment]]] = parseBody("Wat was het gezellig vorig jaar, ik heb er nog steeds spierpijn van");
    expect(segment.text.endsWith(`spierpijn${NBSP}van`)).toBe(true);
    expect(segment.text.split(NBSP)).toHaveLength(2);
  });

  it("deelt alinea's en regels op", () => {
    const paragraphs = parseBody("Eerste regel\nTweede regel\n\nNieuwe alinea");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveLength(2);
    expect(paragraphs[1][0][0].text).toBe(nb("Nieuwe alinea"));
  });

  it("maakt alleen van http(s) en www een link, zonder de punt erachter", () => {
    expect(parseBody("Kijk op https://example.com/foto.")).toEqual([
      [
        [
          { link: false, text: `Kijk op${NBSP}` },
          { link: true, text: "https://example.com/foto", href: "https://example.com/foto" },
          { link: false, text: "." },
        ],
      ],
    ]);
    const [[segments]] = parseBody("www.valkenburg.nl");
    expect(segments).toEqual([{ link: true, text: "www.valkenburg.nl", href: "https://www.valkenburg.nl/" }]);
  });

  it("houdt haakjes in een link als ze bij de link horen", () => {
    const [[segments]] = parseBody("(zie https://nl.wikipedia.org/wiki/Valk_(vogel))");
    const link = segments.find((s) => s.link);
    expect(link?.text).toBe("https://nl.wikipedia.org/wiki/Valk_(vogel)");
    expect(segments.at(-1)).toEqual({ link: false, text: ")" });
  });

  it("maakt van gevaarlijke dingen nooit een link", () => {
    for (const evil of [
      "javascript:alert(1)",
      "<script>alert(1)</script>",
      '<img src=x onerror="alert(1)">',
      "data:text/html,<b>hoi</b>",
    ]) {
      const segments = parseBody(evil).flat(2);
      expect(segments.every((s) => !s.link), evil).toBe(true);
    }
    expect(safeHref("https://user:geheim@example.com")).toBeNull();
    expect(safeHref("http://localhost")).toBeNull();
    expect(safeHref("ftp://example.com")).toBeNull();
    expect(safeHref("https://example.com/a?b=c")).toBe("https://example.com/a?b=c");
  });
});

describe("tijd en aantallen", () => {
  // Zaterdag 8 mei 2027, 12:00 in Amsterdam.
  const now = Date.parse("2027-05-08T12:00:00+02:00");
  const ago = (ms: number) => new Date(now - ms);

  it("zegt net, minuten en uren", () => {
    expect(relativeTime(ago(30_000), now)).toBe("net");
    expect(relativeTime(new Date(now + 60_000), now)).toBe("net");
    expect(relativeTime(ago(60_000), now)).toBe(nb("1 minuut geleden"));
    expect(relativeTime(ago(5 * 60_000), now)).toBe(nb("5 minuten geleden"));
    expect(relativeTime(ago(2 * 3_600_000), now)).toBe(nb("2 uur geleden"));
  });

  it("zegt vandaag, gisteren en de dag van de week in Amsterdamse tijd", () => {
    expect(relativeTime("2027-05-08T08:00:00+02:00", now)).toBe(nb("vandaag om 08:00"));
    expect(relativeTime("2027-05-07T20:15:00+02:00", now)).toBe(nb("gisteren om 20:15"));
    expect(relativeTime("2027-05-05T10:00:00+02:00", now)).toBe(nb("woensdag om 10:00"));
    expect(relativeTime("2027-03-12T10:00:00+01:00", now)).toBe(nb("12 maart"));
    expect(relativeTime("2026-11-20T10:00:00+01:00", now)).toBe(nb("20 november 2026"));
  });

  it("telt de dag volgens Amsterdam, niet volgens de server (UTC)", () => {
    // Zaterdag 01:30 in Amsterdam is in UTC nog vrijdag 23:30: toch vandaag.
    expect(relativeTime("2027-05-08T01:30:00+02:00", now)).toBe(nb("vandaag om 01:30"));
    expect(relativeTime("2027-05-07T23:30:00+02:00", Date.parse("2027-05-08T04:00:00+02:00"))).toBe(
      nb("gisteren om 23:30"),
    );
    // Na middernacht maar binnen drie uur: gewoon "1 uur geleden".
    expect(relativeTime("2027-05-07T23:30:00+02:00", Date.parse("2027-05-08T00:45:00+02:00"))).toBe(
      nb("1 uur geleden"),
    );
  });

  it("houdt getal en woord bij elkaar", () => {
    expect(aantal(1, "bericht", "berichten")).toBe(`1${NBSP}bericht`);
    expect(aantal(3, "reactie", "reacties")).toBe(`3${NBSP}reacties`);
    expect(aantal(0, "hartje", "hartjes")).toBe(`0${NBSP}hartjes`);
  });

  it("maakt initialen", () => {
    expect(initials("Sanne Valkenburg")).toBe("SV");
    expect(initials("Tim")).toBe("T");
    expect(initials("jan van der berg")).toBe("JB");
    expect(initials("  Émile   Zola ")).toBe("ÉZ");
  });

  it("leest sorteren en aantal veilig", () => {
    expect(parseSort("populair")).toBe("populair");
    expect(parseSort("<script>")).toBe("nieuw");
    expect(parseLimit(null)).toBe(BOARD.pageSize);
    expect(parseLimit("45")).toBe(2 * BOARD.pageSize);
    expect(parseLimit("100000")).toBe(BOARD.maxPageSize);
    expect(parseLimit("-3")).toBe(BOARD.pageSize);
  });
});

describe("floodlimiet", () => {
  const now = Date.parse("2027-05-08T12:00:00+02:00");
  const minutesAgo = (...m: number[]) => m.map((n) => new Date(now - n * 60_000));

  it("laat negen berichten in vijf minuten toe", () => {
    expect(floodCheck(minutesAgo(0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4), now)).toEqual({ blocked: false, retryAt: null });
  });

  it("stopt bij tien, en zegt wanneer het weer mag", () => {
    const result = floodCheck(minutesAgo(0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5), now);
    expect(result.blocked).toBe(true);
    expect(result.retryAt?.toISOString()).toBe(new Date(now + 30_000).toISOString());
  });

  it("telt oudere berichten niet mee", () => {
    expect(floodCheck(minutesAgo(0, 1, 2, 3, 4, 6, 7, 8, 9, 10), now).blocked).toBe(false);
  });
});

describe("wie mag wat", () => {
  const gewoon = { staffOnly: false, readOnly: false };
  const familie = { isAdmin: false, hasNames: true, reason: null, boardOpen: true } as const;

  it("met een naam plaats je, reageer je en bewerk je je eigen bericht", () => {
    expect(boardRights(gewoon, familie)).toEqual({ post: true, react: true, editOwn: true, staffPost: false, notice: null });
  });

  it("in een kanaal van de spelleiding geef je alleen hartjes", () => {
    const rights = boardRights({ staffOnly: true, readOnly: false }, familie);
    expect(rights).toMatchObject({ post: false, react: true, notice: "spelleiding" });
  });

  it("alleen lezen is echt alleen lezen", () => {
    expect(boardRights({ staffOnly: false, readOnly: true }, familie)).toMatchObject({
      post: false,
      react: false,
      editOwn: false,
      notice: "alleen-lezen",
    });
  });

  it("een dicht prikbord kun je nog lezen", () => {
    expect(boardRights(gewoon, { ...familie, boardOpen: false })).toMatchObject({ post: false, react: false, notice: "dicht" });
  });

  it("zonder naam, in de proef of bij Bekijk als lees je alleen mee", () => {
    expect(boardRights(gewoon, { ...familie, hasNames: false, reason: "geen-naam" })).toMatchObject({
      post: false,
      react: false,
      notice: "geen-naam",
    });
    expect(boardRights(gewoon, { ...familie, reason: "proef" })).toMatchObject({ post: false, notice: "proef" });
    expect(boardRights(gewoon, { ...familie, reason: "bekijk-als" })).toMatchObject({ post: false, notice: "bekijk-als" });
  });

  it("de beheerder plaatst overal als De spelleiding", () => {
    const beheerder = { isAdmin: true, hasNames: false, reason: "geen-naam", boardOpen: false } as const;
    expect(boardRights({ staffOnly: true, readOnly: true }, beheerder)).toMatchObject({ post: false, staffPost: true });
  });
});

function post(id: string, extra: Partial<FeedPost> = {}): FeedPost {
  return {
    id,
    parentId: null,
    author: "Sanne",
    staff: false,
    body: "Hoi",
    photos: [],
    createdAt: "2027-05-08T10:00:00.000Z",
    editedAt: null,
    editedByStaff: false,
    hidden: false,
    mine: false,
    hearts: 0,
    thumbs: 0,
    myHearts: [],
    myThumbs: [],
    replies: [],
    replyCount: 0,
    ...extra,
  };
}

describe("hartjes meteen tonen", () => {
  it("zet een hartje aan en uit, ook twee keer achter elkaar", () => {
    const posts = [post("a", { hearts: 2, myHearts: [] }), post("b")];
    const on = applyReaction(posts, { postId: "a", kind: "hart", by: "sanne", on: true });
    expect(on[0]).toMatchObject({ hearts: 3, myHearts: ["sanne"] });
    expect(on[1]).toBe(posts[1]);
    expect(applyReaction(on, { postId: "a", kind: "hart", by: "sanne", on: true })[0].hearts).toBe(3);
    const off = applyReaction(on, { postId: "a", kind: "hart", by: "sanne", on: false });
    expect(off[0]).toMatchObject({ hearts: 2, myHearts: [] });
  });

  it("werkt ook voor een reactie in een draadje, en nooit onder nul", () => {
    const posts = [post("a", { replies: [post("r", { parentId: "a", thumbs: 0, myThumbs: ["tim"] })], replyCount: 1 })];
    const off = applyReaction(posts, { postId: "r", kind: "duim", by: "tim", on: false });
    expect(off[0].replies[0]).toMatchObject({ thumbs: 0, myThumbs: [] });
  });
});

describe("fotolinks", () => {
  const link = (id: string, t: number) => `/api/foto/${id}?t=${t}&s=abc`;
  const photo = (id: string, t: number) => ({ id, url: link(id, t), width: 10, height: 10 });

  it("leest wanneer een link verloopt", () => {
    expect(photoExpiry(link("x", 1234))).toBe(1234);
    expect(photoExpiry("/zonder")).toBeNull();
  });

  it("houdt een link die nog even geldig is, zodat de foto niet opnieuw laadt", () => {
    const previous = [post("a", { photos: [photo("f1", 10_000), photo("f2", 1_100)] })];
    const next = [post("a", { photos: [photo("f1", 10_060), photo("f2", 1_160), photo("f3", 10_060)] })];
    const kept = keepPhotoUrls(next, previous, 1_000);
    expect(kept[0].photos.map((p) => p.url)).toEqual([link("f1", 10_000), link("f2", 1_160), link("f3", 10_060)]);
  });
});
