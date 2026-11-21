import "server-only";
import type postgres from "postgres";
import { maxPointsFor } from "./answers";
import { DEMO_PHOTOS } from "./demoPhotos";
import type { QuestionInput } from "./format";

/**
 * The demo quiz for the test environment (SPEC §9.5): five short rounds in
 * which every question type comes by, the intermezzo after round 3, and a
 * map round in the style of GeoGuessr with drawn postcards of places with
 * a falcon in their name. "Zet de proef klaar" puts it ready.
 */

export const DEMO_TITLE = "Proefquiz: De Kleine Valkenburger";
export const DEMO_PHOTO_CREDIT = "Illustratie, getekend voor de proefquiz";

type DemoQuestion = Omit<QuestionInput, "photo" | "photoCredit" | "extraPhotos"> & {
  photo?: keyof typeof DEMO_PHOTOS;
  /** More views of the same place (a map question with a photo strip). */
  extraPhotos?: (keyof typeof DEMO_PHOTOS)[];
  /** echt_of_ai: the test name that "sent the photo in". */
  submitter?: string;
};

type DemoRound = { number: number; title: string; intro: string; listening: boolean; intermezzoAfter: boolean; questions: DemoQuestion[] };

const q = (question: Partial<DemoQuestion> & Pick<DemoQuestion, "kind" | "text" | "correct">): DemoQuestion => ({
  extId: null,
  options: null,
  unit: null,
  scale: null,
  explanation: null,
  subjects: [],
  note: null,
  ...question,
});

export const DEMO_ROUNDS: DemoRound[] = [
  {
    number: 1,
    title: "Hemelvaart en Moederdag",
    intro: "Drie opwarmers over het weekend zelf. Niemand hoeft iets uit zijn hoofd te weten: beredeneer het maar.",
    listening: false,
    intermezzoAfter: false,
    questions: [
      q({
        extId: "demo-r1v1",
        kind: "meerkeuze",
        text: "Op welke dag van de week valt Hemelvaartsdag altijd?",
        options: ["Maandag", "Woensdag", "Donderdag", "Zondag"],
        correct: 2,
        explanation: "Hemelvaart is altijd op een donderdag. Daarom hebben we een lang weekend!",
      }),
      q({
        extId: "demo-r1v2",
        kind: "waar_niet_waar",
        text: "Waar of niet waar: in 2027 valt Moederdag in het Hemelvaartweekend.",
        correct: true,
        explanation: "Waar! Moederdag is zondag 9 mei, de laatste dag van de Spelen. Ontbijt op bed dus.",
      }),
      q({
        extId: "demo-r1v3",
        kind: "schatting",
        text: "Hoeveel dagen na Pasen valt Hemelvaartsdag?",
        correct: 39,
        unit: "dagen",
        explanation: "39 dagen. Tel je Paaszondag zelf mee, dan is Hemelvaart de veertigste dag.",
      }),
    ],
  },
  {
    number: 2,
    title: "Waar ligt Valkenburg?",
    intro: "Je ziet een foto. Zet de speld waar hij gemaakt is. Hoe dichterbij, hoe meer punten: tot 3 per vraag.",
    listening: false,
    intermezzoAfter: false,
    questions: [
      q({
        extId: "demo-r2v1",
        kind: "kaart",
        text: "Deze straat heet de Valkenburgerstraat. In welke stad is deze foto gemaakt?",
        correct: { lat: 52.3699, lng: 4.906 },
        scale: "nederland",
        photo: "valkenburgerstraat",
        extraPhotos: ["valkenburgerstraat_fiets", "valkenburgerstraat_bord"],
        explanation: "Amsterdam! De Valkenburgerstraat ligt vlak bij het Waterlooplein. De grachtenhuizen en de Amsterdammertjes verraden het.",
      }),
      q({
        extId: "demo-r2v2",
        kind: "kaart",
        text: "Waar is deze ansichtkaart gemaakt? Tip: er zit een valk in de naam van de plaats.",
        correct: { lat: 56.9055, lng: 12.4912 },
        scale: "wereld",
        photo: "falkenberg",
        explanation: "Falkenberg, aan de westkust van Zweden. Falk is Zweeds voor valk.",
      }),
      q({
        extId: "demo-r2v3",
        kind: "kaart",
        text: "En deze? Ook hier vliegt er een valk door de plaatsnaam.",
        correct: { lat: 43.6247, lng: 13.3966 },
        scale: "wereld",
        photo: "falconara",
        explanation: "Falconara Marittima, aan de Adriatische Zee in Italië. Falco is Italiaans voor valk.",
      }),
    ],
  },
  {
    number: 3,
    title: "Muziek",
    intro: "De quizmaster laat een stukje muziek horen. Luister goed: alleen de captain ziet de antwoorden.",
    listening: true,
    intermezzoAfter: true,
    questions: [
      q({
        extId: "demo-r3v1",
        kind: "wie_van_ons",
        text: "Van wie is dit het lievelingsnummer?",
        options: ["Anna Proef", "Daan Proef", "Gijs Proef", "Jet Proef"],
        correct: 1,
        note: "Speel op Spotify: Dancing Queen van ABBA, het lievelingsnummer van Daan.",
        explanation: "Daan Proef! Hij zingt het elke ochtend onder de douche.",
      }),
      q({
        extId: "demo-r3v2",
        kind: "schatting_bereik",
        text: "Uit welk jaar komt dit nummer?",
        options: ["Voor 1970", "1970 tot 1990", "1990 tot 2010", "Na 2010"],
        correct: 1,
        note: "Speel het refrein van Dancing Queen nog een keer.",
        explanation: "Dancing Queen kwam uit in 1976.",
      }),
    ],
  },
  {
    number: 4,
    title: "De Dommel en de valken",
    intro: "Over de streek waar we zijn. Gezond verstand helpt meer dan een encyclopedie.",
    listening: false,
    intermezzoAfter: false,
    questions: [
      q({
        extId: "demo-r4v1",
        kind: "meerkeuze",
        text: "Waar stond Valkenswaard vroeger in heel Europa om bekend?",
        options: ["Om de molens", "Om de valkeniers", "Om de klompen", "Om de kaas"],
        correct: 1,
        explanation: "Om de valkeniers. Eeuwenlang vingen en trainden ze hier valken voor koningen in heel Europa.",
      }),
      q({
        extId: "demo-r4v2",
        kind: "schatting_bereik",
        text: "Hoe hard kan een slechtvalk naar beneden duiken?",
        options: ["Tot 50 km per uur", "50 tot 150 km per uur", "150 tot 300 km per uur", "Meer dan 300 km per uur"],
        correct: 3,
        explanation: "Meer dan 300 km per uur! De slechtvalk is het snelste dier ter wereld.",
      }),
    ],
  },
  {
    number: 5,
    title: "Echt of AI?",
    intro: "De proefteams stuurden een merkwaardige foto in. Of heeft de quizmaster er stiekem iets aan veranderd?",
    listening: false,
    intermezzoAfter: false,
    questions: [
      q({
        extId: "demo-r5v1",
        kind: "echt_of_ai",
        text: "Is deze foto echt, of heeft de quizmaster hem met AI bewerkt?",
        correct: "ai",
        photo: "koe",
        submitter: "Bram Proef",
        explanation: "AI! Koeien kunnen best zwemmen, maar op een duikplank klimmen ze echt niet.",
      }),
      q({
        extId: "demo-r5v2",
        kind: "echt_of_ai",
        text: "En deze? Echt of AI?",
        correct: "echt",
        photo: "pompoen",
        submitter: "Hanna Proef",
        explanation: "Echt! De pompoen van Hanna woog 312 kilo en won de eerste prijs.",
      }),
    ],
  },
];

/** All question texts of the demo quiz (the secrecy test looks for them in the client bundle). */
export const DEMO_TEXTS = DEMO_ROUNDS.flatMap((round) => round.questions.map((question) => question.text));

/**
 * A fresh demo quiz, with its postcards in valk.uploads, and the test
 * environment pointed at it. Runs inside "Zet de proef klaar", after the
 * test teams and names exist.
 */
export async function seedDemoQuiz(sql: postgres.TransactionSql): Promise<void> {
  const oldPhotos = await sql<{ id: string }[]>`
    select unnest(array_prepend(q.photo_upload_id, q.extra_photo_ids)) as id
    from valk.quiz_questions q
    join valk.quiz_rounds r on r.id = q.round_id
    join valk.quizzes z on z.id = r.quiz_id
    where z.is_demo and q.photo_upload_id is not null
  `;
  await sql`delete from valk.quizzes where is_demo`;
  if (oldPhotos.length > 0) {
    await sql`delete from valk.uploads where kind = 'quiz' and id in ${sql(oldPhotos.map((row) => row.id))}`;
  }

  const people = await sql<{ id: string; name: string }[]>`select id, name from valk.participants where env = 'test'`;
  const personId = (name: string | undefined) => (name ? (people.find((p) => p.name === name)?.id ?? null) : null);

  const [quiz] = await sql<{ id: string }[]>`insert into valk.quizzes (title, is_demo) values (${DEMO_TITLE}, true) returning id`;
  for (const round of DEMO_ROUNDS) {
    const max = round.questions.reduce((sum, question) => sum + maxPointsFor(question), 0);
    const [row] = await sql<{ id: string }[]>`
      insert into valk.quiz_rounds (quiz_id, number, title, intro, listening, intermezzo_after, max_points)
      values (${quiz.id}, ${round.number}, ${round.title}, ${round.intro}, ${round.listening}, ${round.intermezzoAfter}, ${max})
      returning id
    `;
    for (const [index, question] of round.questions.entries()) {
      const store = async (key: keyof typeof DEMO_PHOTOS): Promise<string> => {
        const photo = DEMO_PHOTOS[key];
        const bytes = Buffer.from(photo.base64, "base64");
        const [upload] = await sql<{ id: string }[]>`
          insert into valk.uploads (kind, participant_id, mime, bytes, width, height, size_bytes, created_by)
          values ('quiz', ${personId(question.submitter)}, 'image/jpeg', ${bytes}, ${photo.width}, ${photo.height}, ${bytes.length}, 'proefquiz')
          returning id
        `;
        return upload.id;
      };
      const photoId = question.photo ? await store(question.photo) : null;
      const extraIds: string[] = [];
      for (const key of photoId ? (question.extraPhotos ?? []) : []) extraIds.push(await store(key));
      await sql`
        insert into valk.quiz_questions (round_id, sort, ext_id, kind, text, options, correct, unit, scale, explanation,
          photo_upload_id, extra_photo_ids, photo_credit, subjects, note)
        values (${row.id}, ${index + 1}, ${question.extId}, ${question.kind}, ${question.text},
          ${question.options === null ? null : sql.json(question.options)}, ${sql.json(question.correct as postgres.JSONValue)},
          ${question.unit}, ${question.scale}, ${question.explanation}, ${photoId}, ${extraIds}::uuid[],
          ${photoId ? DEMO_PHOTO_CREDIT : null}, ${sql.json(question.subjects)}, ${question.note})
      `;
    }
  }
  await sql`update valk.live_state set quiz_id = ${quiz.id} where env = 'test'`;
}
