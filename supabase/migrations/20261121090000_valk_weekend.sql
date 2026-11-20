-- De Valkenburger Spelen 2027, fase 2 t/m 4: deelnemers, fun facts, prikbord,
-- programma, scorebord, zeskamp, prijsuitreiking, quiz en de afvinklijst.
--
-- Proef en echt: tabellen met spelgegevens hebben een kolom env ('live' of
-- 'test'). De proefmodus raakt zo nooit de echte stand.

-- Instellingen ---------------------------------------------------------------

alter table valk.settings
  add column funfacts_open_at timestamptz not null default '2027-01-01 00:00:00+01',
  add column program_visible boolean not null default false,
  add column teams_visible boolean not null default false,
  add column zeskamp_points integer[] not null default '{10,7,5,3}',
  add column intermezzo_points integer not null default 1 check (intermezzo_points between 0 and 10),
  add column intermezzo_max_duels integer check (intermezzo_max_duels between 1 and 200),
  add column board_open boolean not null default true,
  -- Zolang dit uit staat, ziet de familie de app van fase 1 (oud menu, geen
  -- prikbord). De beheerder ziet alles al. Aan bij de oplevering.
  add column fase2_live boolean not null default false,
  -- Publiek adres en publieke sleutel voor de Realtime-seintjes. Geen geheim
  -- (ze staan in elke browser), maar ook niet in de repo: los gezet.
  add column realtime_url text,
  add column realtime_key text;

-- Teams en deelnemers ----------------------------------------------------------

create table valk.teams (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null check (color in ('oranje', 'mosterd', 'avocado', 'petrol')),
  sort integer not null default 0,
  pin_hash text,
  pin_version integer not null default 1,
  -- Het ene toestel dat nu als captain van dit team antwoordt.
  active_device_id text,
  active_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index teams_env_name_key on valk.teams (env, lower(name));
create index teams_env on valk.teams (env, sort);

create table valk.participants (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  name text not null check (length(trim(name)) between 1 and 60),
  nickname text check (nickname is null or length(trim(nickname)) between 1 and 30),
  team_id uuid references valk.teams (id) on delete set null,
  is_child boolean not null default false,
  is_captain boolean not null default false,
  -- Het toestel dat deze naam koos. Eén toestel per naam; een toestel mag
  -- wel meer namen hebben ("Ik vul ook in voor…").
  claimed_device_id text,
  claimed_at timestamptz,
  funfacts_done_at timestamptz,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index participants_env_name_key on valk.participants (env, lower(name));
create index participants_env on valk.participants (env, sort, name);
create index participants_device on valk.participants (claimed_device_id) where claimed_device_id is not null;

-- Programma -------------------------------------------------------------------

create table valk.program_items (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz,
  title text not null check (length(trim(title)) between 1 and 80),
  subtitle text,
  location text,
  kind text not null default 'gewoon'
    check (kind in ('gewoon', 'maaltijd', 'moederdag', 'quiz', 'vrijdag', 'zeskamp', 'prijsuitreiking')),
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index program_items_start on valk.program_items (starts_at, sort);

-- Onderdelen, uitslagen, jokers en losse punten -----------------------------

create table valk.events (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  kind text not null check (kind in ('quiz', 'intermezzo', 'vrijdag', 'zeskamp')),
  name text not null check (length(trim(name)) between 1 and 60),
  description text,
  sort integer not null default 0,
  result_type text
    check (result_type in ('tijd', 'aantal_hoog', 'aantal_laag', 'meting_hoog', 'meting_laag', 'plaatsen', 'jury', 'vrij')),
  unit text,
  mode text not null default 'tegelijk' check (mode in ('tegelijk', 'na_elkaar')),
  points_table integer[],
  joker_allowed boolean not null default false,
  counts_for_medals boolean not null default true,
  status text not null default 'gepland' check (status in ('gepland', 'bezig', 'klaar')),
  started_at timestamptz,
  started_by text,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_env on valk.events (env, kind, sort);

create table valk.event_results (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  event_id uuid not null references valk.events (id) on delete cascade,
  team_id uuid not null references valk.teams (id) on delete cascade,
  -- Seconden, aantal, centimeters, plaats of jurycijfer, afhankelijk van het type.
  raw_value double precision,
  -- Vrije punten (vrijdag), in twaalfden.
  free_twelfths integer,
  entered_by text not null,
  entered_at timestamptz not null default now(),
  -- Zelfde uitslag twee keer versturen (offline invoer) telt één keer.
  client_id text,
  unique (event_id, team_id)
);

create table valk.jokers (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  team_id uuid not null references valk.teams (id) on delete cascade,
  kind text not null check (kind in ('quiz', 'zeskamp')),
  round_no integer,
  event_id uuid references valk.events (id) on delete cascade,
  set_at timestamptz not null default now(),
  set_by text not null,
  unique (env, team_id, kind),
  check ((kind = 'quiz' and round_no is not null) or (kind = 'zeskamp' and event_id is not null))
);

create table valk.bonus_points (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  team_id uuid not null references valk.teams (id) on delete cascade,
  twelfths integer not null check (twelfths <> 0),
  reason text not null check (length(trim(reason)) between 1 and 200),
  given_by text not null,
  created_at timestamptz not null default now()
);

create table valk.scoreboard_snapshots (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  taken_at timestamptz not null default now(),
  standings jsonb not null,
  medals jsonb not null,
  events jsonb not null,
  jokers jsonb not null
);
create index scoreboard_snapshots_env on valk.scoreboard_snapshots (env, taken_at desc);

-- Foto's ----------------------------------------------------------------------
-- In de database in plaats van Supabase Storage: dan is de servicesleutel van
-- het gedeelde project niet nodig. Alleen op te vragen via ondertekende links.

create table valk.uploads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('funfact', 'ai', 'bord', 'quiz')),
  participant_id uuid references valk.participants (id) on delete set null,
  original_id uuid references valk.uploads (id) on delete cascade,
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  bytes bytea not null,
  width integer,
  height integer,
  size_bytes integer not null check (size_bytes between 1 and 3000000),
  -- Bij een fun-factsfoto: welke versie in de quiz komt.
  quiz_variant text check (quiz_variant in ('echt', 'ai')),
  created_by text,
  created_at timestamptz not null default now()
);
create index uploads_kind on valk.uploads (kind, created_at desc);
create index uploads_original on valk.uploads (original_id) where original_id is not null;

-- Fun facts -------------------------------------------------------------------

create table valk.funfact_questions (
  id uuid primary key default gen_random_uuid(),
  sort integer not null,
  kind text not null check (kind in ('ja_nee', 'getal', 'keuze', 'open', 'foto')),
  text text not null check (length(trim(text)) between 1 and 200),
  hint text,
  options jsonb,
  min_value integer,
  max_value integer,
  quiz_form text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'getal' or (min_value is not null and max_value is not null and max_value > min_value)),
  check (kind <> 'keuze' or jsonb_typeof(options) = 'array')
);

create table valk.funfact_answers (
  participant_id uuid not null references valk.participants (id) on delete cascade,
  question_id uuid not null references valk.funfact_questions (id) on delete cascade,
  value jsonb,
  skipped boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (participant_id, question_id)
);

-- Quiz ------------------------------------------------------------------------

create table valk.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table valk.quiz_rounds (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references valk.quizzes (id) on delete cascade,
  number integer not null check (number between 1 and 20),
  title text not null,
  intro text,
  listening boolean not null default false,
  intermezzo_after boolean not null default false,
  max_points integer,
  unique (quiz_id, number)
);

create table valk.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references valk.quiz_rounds (id) on delete cascade,
  sort integer not null,
  ext_id text,
  kind text not null
    check (kind in ('meerkeuze', 'waar_niet_waar', 'wie_van_ons', 'schatting', 'schatting_bereik', 'kaart', 'echt_of_ai')),
  text text not null,
  options jsonb,
  correct jsonb not null,
  unit text,
  scale text check (scale in ('nederland', 'wereld')),
  explanation text,
  photo_upload_id uuid references valk.uploads (id) on delete set null,
  photo_credit text,
  subjects jsonb not null default '[]',
  note text,
  updated_at timestamptz not null default now()
);
create index quiz_questions_round on valk.quiz_questions (round_id, sort);

create table valk.quiz_answers (
  env text not null check (env in ('live', 'test')),
  question_id uuid not null references valk.quiz_questions (id) on delete cascade,
  team_id uuid not null references valk.teams (id) on delete cascade,
  answer jsonb not null,
  device_id text,
  answered_at timestamptz not null default now(),
  -- Correctie door de quizmaster, in twaalfden (gaat voor de berekende punten).
  override_twelfths integer,
  override_by text,
  primary key (env, question_id, team_id)
);

-- Intermezzo: steen, papier, schaar -------------------------------------------

create table valk.duels (
  id uuid primary key default gen_random_uuid(),
  env text not null check (env in ('live', 'test')),
  seq integer not null,
  champion_id uuid not null references valk.participants (id) on delete cascade,
  challenger_id uuid not null references valk.participants (id) on delete cascade,
  champion_choice text check (champion_choice in ('steen', 'papier', 'schaar')),
  challenger_choice text check (challenger_choice in ('steen', 'papier', 'schaar')),
  winner_id uuid references valk.participants (id) on delete cascade,
  status text not null default 'kiezen' check (status in ('kiezen', 'onthullen', 'klaar', 'gestopt')),
  in_real_life boolean not null default false,
  reveal_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (env, seq)
);

-- Live-status per omgeving: de waarheid voor quiz, intermezzo en ceremonie ------

create table valk.live_state (
  env text primary key check (env in ('live', 'test')),
  mode text not null default 'rust' check (mode in ('rust', 'quiz', 'intermezzo', 'ceremonie')),
  quiz_id uuid references valk.quizzes (id) on delete set null,
  round_no integer,
  question_id uuid references valk.quiz_questions (id) on delete set null,
  phase text check (phase in ('rondescherm', 'open', 'gesloten', 'onthuld', 'tussenstand', 'einde')),
  listening boolean not null default false,
  countdown_until timestamptz,
  ceremony_step integer not null default 0,
  lock_closed boolean not null default false,
  lock_closed_at timestamptz,
  lock_auto boolean not null default true,
  games_started_at timestamptz,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);
insert into valk.live_state (env) values ('live'), ('test') on conflict (env) do nothing;

-- Prikbord --------------------------------------------------------------------

create table valk.board_channels (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 60),
  description text,
  sort integer not null default 0,
  pinned boolean not null default false,
  -- Alleen de spelleiding plaatst hier; iedereen leest mee.
  staff_only boolean not null default false,
  read_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table valk.board_posts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references valk.board_channels (id) on delete cascade,
  parent_id uuid references valk.board_posts (id) on delete cascade,
  participant_id uuid references valk.participants (id) on delete set null,
  author_name text not null,
  author_staff boolean not null default false,
  body text not null check (length(body) <= 4000),
  photo_ids uuid[] not null default '{}',
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by text
);
create index board_posts_channel on valk.board_posts (channel_id, created_at desc) where parent_id is null;
create index board_posts_parent on valk.board_posts (parent_id, created_at) where parent_id is not null;

create table valk.board_reactions (
  post_id uuid not null references valk.board_posts (id) on delete cascade,
  participant_id uuid not null references valk.participants (id) on delete cascade,
  kind text not null check (kind in ('hart', 'duim')),
  created_at timestamptz not null default now(),
  primary key (post_id, participant_id, kind)
);

-- Afvinklijst voor beheerder en spelleiders ------------------------------------

create table valk.checklist_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 120),
  detail text,
  -- Gezet als de app zelf kan zien of het af is.
  auto_key text unique,
  done boolean not null default false,
  done_at timestamptz,
  done_by text,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table valk.checklist_notes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references valk.checklist_items (id) on delete cascade,
  author_name text not null,
  author_role text not null check (author_role in ('beheerder', 'spelleider')),
  body text not null check (length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index checklist_notes_item on valk.checklist_notes (item_id, created_at);

-- Spelhulp: kaartjes voor uitbeelden en dergelijke ---------------------------

create table valk.card_decks (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  cards jsonb not null default '[]',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Weer (Open-Meteo), 30 minuten bewaard ---------------------------------------

create table valk.weather_cache (
  id smallint primary key default 1 check (id = 1),
  fetched_at timestamptz not null,
  payload jsonb not null
);

-- Rij-beveiliging: standaard alles weigeren, alleen de serverrol mag erbij ------

do $$
declare
  t text;
begin
  foreach t in array array[
    'teams', 'participants', 'program_items', 'events', 'event_results', 'jokers',
    'bonus_points', 'scoreboard_snapshots', 'uploads', 'funfact_questions',
    'funfact_answers', 'quizzes', 'quiz_rounds', 'quiz_questions', 'quiz_answers',
    'duels', 'live_state', 'board_channels', 'board_posts', 'board_reactions',
    'checklist_items', 'checklist_notes', 'card_decks', 'weather_cache'
  ] loop
    execute format('alter table valk.%I enable row level security', t);
    execute format(
      'create policy valk_app_all on valk.%I for all to valk_app using (true) with check (true)',
      t
    );
  end loop;
end
$$;

grant select, insert, update, delete on all tables in schema valk to valk_app;
grant usage, select on all sequences in schema valk to valk_app;
revoke insert, update, delete on valk.schema_migrations from valk_app;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all tables in schema valk from %I', r);
      execute format('revoke all on all sequences in schema valk from %I', r);
    end if;
  end loop;
end
$$;

-- Startinhoud ------------------------------------------------------------------
-- In een functie, zodat de lokale testreset dezelfde inhoud terugzet. Alleen
-- voor de eigenaar van het schema (de migratie), niet voor valk_app.

create or replace function valk.seed_defaults() returns void
language plpgsql
set search_path = valk, pg_temp
as $seed$
begin
  -- De vier teams met hun werktitels (SPEC §1).
  if not exists (select 1 from valk.teams where env = 'live') then
    insert into valk.teams (env, name, color, sort) values
      ('live', 'Team Oranje', 'oranje', 1),
      ('live', 'Team Mosterd', 'mosterd', 2),
      ('live', 'Team Avocado', 'avocado', 3),
      ('live', 'Team Petrol', 'petrol', 4);
  end if;

  -- De onderdelen van het weekend. De zeskampspellen zijn voorstellen uit de
  -- spellenbank (SPEC §9.4); de eigenaar kiest in beheer.
  if not exists (select 1 from valk.events where env = 'live') then
    insert into valk.events (env, kind, name, description, sort, result_type, unit, mode, joker_allowed, counts_for_medals) values
      ('live', 'quiz', 'De Grote Valkenburger Quiz', '5 rondes van 10 vragen.', 1, null, null, 'tegelijk', true, true),
      ('live', 'intermezzo', 'Intermezzo: steen, papier, schaar', 'Elk gewonnen duel is een punt.', 2, null, null, 'tegelijk', false, false),
      ('live', 'vrijdag', 'Spelletjesmiddag', 'Vrije punten van de beheerder.', 3, 'vrij', null, 'tegelijk', false, true),
      ('live', 'zeskamp', 'Taart in zeven', 'Snij een ronde taart in 7 zo gelijk mogelijke stukken. Daarna wegen.', 11, 'meting_laag', 'gram', 'tegelijk', true, true),
      ('live', 'zeskamp', 'Lekke-bekerestafette', 'Water met doorgeprikte bekers naar een fles brengen, 3 minuten.', 12, 'meting_hoog', 'cm', 'tegelijk', true, true),
      ('live', 'zeskamp', 'Blind parcours met dierengeluiden', 'Eén teamlid is geblinddoekt, de rest stuurt alleen met dierengeluiden.', 13, 'tijd', null, 'na_elkaar', true, true),
      ('live', 'zeskamp', 'Skilopen', 'Vier personen op twee lange planken.', 14, 'tijd', null, 'tegelijk', true, true),
      ('live', 'zeskamp', 'Hoogste toren uit je zakken', '5 minuten bouwen met alleen wat je bij je hebt.', 15, 'meting_hoog', 'cm', 'tegelijk', true, true),
      ('live', 'zeskamp', 'Zaklopen-estafette', 'Klassiek.', 16, 'tijd', null, 'tegelijk', true, true);
  end if;

  -- Voorbeeldprogramma (SPEC §9.3). De familie ziet het pas als de beheerder
  -- het vrijgeeft.
  if not exists (select 1 from valk.program_items) then
    insert into valk.program_items (starts_at, title, subtitle, kind, sort) values
      ('2027-05-06 14:00+02', 'Aankomst en kamers verdelen', null, 'gewoon', 1),
      ('2027-05-06 17:30+02', 'Barbecue', null, 'maaltijd', 2),
      ('2027-05-06 20:00+02', 'De Grote Valkenburger Quiz', '5 rondes van 10 vragen, met een intermezzo', 'quiz', 3),
      ('2027-05-06 22:30+02', 'Uitslag van de quiz', null, 'gewoon', 4),
      ('2027-05-07 09:30+02', 'Ontbijt', null, 'maaltijd', 1),
      ('2027-05-07 11:00+02', 'Wandelen langs de Dommel', null, 'gewoon', 2),
      ('2027-05-07 14:00+02', 'Spelletjesmiddag', 'Telt mee voor de Spelen', 'vrijdag', 3),
      ('2027-05-07 18:30+02', 'Pizza-avond', null, 'maaltijd', 4),
      ('2027-05-08 09:00+02', 'Ontbijt', null, 'maaltijd', 1),
      ('2027-05-08 10:30+02', 'Zeskamp, spel 1 t/m 3', 'Het scorebord gaat op slot', 'zeskamp', 2),
      ('2027-05-08 12:30+02', 'Lunch', null, 'maaltijd', 3),
      ('2027-05-08 14:00+02', 'Zeskamp, spel 4 t/m 6', null, 'zeskamp', 4),
      ('2027-05-08 18:00+02', 'Feestdiner', null, 'maaltijd', 5),
      ('2027-05-08 20:30+02', 'Prijsuitreiking', null, 'prijsuitreiking', 6),
      ('2027-05-09 09:00+02', 'Moederdagontbijt', null, 'moederdag', 1),
      ('2027-05-09 11:00+02', 'Opruimen', null, 'gewoon', 2),
      ('2027-05-09 13:00+02', 'Vertrek', null, 'gewoon', 3);
  end if;

  -- De 25 vragen voor de fun facts (SPEC §9.1).
  if not exists (select 1 from valk.funfact_questions) then
    insert into valk.funfact_questions (sort, kind, text, hint, options, min_value, max_value, quiz_form) values
      (1, 'ja_nee', 'Heb je ooit iets gebroken?', null, null, null, null, 'Hoeveel van ons hebben ooit iets gebroken?'),
      (2, 'keuze', 'Ben je ooit gezakt voor je rijexamen?', null, '["Ja", "Nee, in één keer geslaagd", "Ik heb (nog) geen rijbewijs"]', null, null, 'Hoeveel van ons zakten ooit voor het rijexamen?'),
      (3, 'ja_nee', 'Kun je op je vingers fluiten?', null, null, null, null, 'Hoeveel van ons kunnen op hun vingers fluiten?'),
      (4, 'ja_nee', 'Ben je ooit op tv, op de radio of in de krant geweest?', null, null, null, null, 'Hoeveel van ons kwamen ooit in het nieuws?'),
      (5, 'ja_nee', 'Heb je ooit een vliegtuig, trein of bus gemist?', null, null, null, null, 'Hoeveel van ons misten ooit hun vervoer?'),
      (6, 'ja_nee', 'Ben je bang voor spinnen?', null, null, null, null, 'Welk percentage van ons is bang voor spinnen?'),
      (7, 'ja_nee', 'Kun je je tong in een rolletje draaien?', null, null, null, null, 'Hoeveel van ons kunnen hun tong rollen?'),
      (8, 'ja_nee', 'Heb je ooit in het buitenland gewoond?', null, null, null, null, 'Hoeveel van ons woonden ooit in het buitenland?'),
      (9, 'ja_nee', 'Heb je ooit een prijs gewonnen?', 'Loterij, wedstrijd of sport: alles telt.', null, null, null, 'Hoeveel van ons wonnen ooit een prijs?'),
      (10, 'ja_nee', 'Heb je ooit iemand beroemds ontmoet?', null, null, null, null, 'Hoeveel van ons ontmoetten ooit iemand beroemds?'),
      (11, 'ja_nee', 'Heb je ooit een hele dag in je pyjama doorgebracht?', null, null, null, null, 'Hoeveel van ons brachten ooit een hele dag in pyjama door?'),
      (12, 'getal', 'In hoeveel landen ben je ooit geweest?', null, null, 0, 200, 'Wat is het record van de familie?'),
      (13, 'getal', 'Hoe vaak ben je verhuisd?', null, null, 0, 50, 'Hoe vaak zijn we samen verhuisd?'),
      (14, 'getal', 'Hoeveel paar schoenen heb je?', null, null, 0, 200, 'Hoeveel paar schoenen hebben we samen?'),
      (15, 'getal', 'Hoeveel uur slaap je gemiddeld per nacht?', null, null, 3, 14, 'Hoeveel uur slaapt de familie gemiddeld?'),
      (16, 'getal', 'Hoeveel kopjes koffie en thee drink je per dag?', null, null, 0, 20, 'Hoeveel kopjes drinken we samen per dag?'),
      (17, 'getal', 'Hoeveel kilometer woon je van Borkel en Schaft?', 'Een schatting is goed genoeg.', null, 0, 20000, 'Hoeveel kilometer reisden we samen om hier te komen?'),
      (18, 'keuze', 'Koffie of thee?', null, '["Koffie", "Thee", "Allebei", "Geen van beide"]', null, null, 'Welk percentage kiest koffie?'),
      (19, 'keuze', 'Ben je een ochtendmens of een avondmens?', null, '["Ochtend", "Avond", "Geen van beide"]', null, null, 'Zijn er meer ochtend- of avondmensen?'),
      (20, 'keuze', 'Wat is je favoriete seizoen?', null, '["Lente", "Zomer", "Herfst", "Winter"]', null, null, 'Wat is het favoriete seizoen van de familie?'),
      (21, 'keuze', 'Hagelslag: puur, melk, wit of gemengd?', null, '["Puur", "Melk", "Wit", "Gemengd", "Geen hagelslag"]', null, null, 'Welke hagelslag wint?'),
      (22, 'keuze', 'Uit welk decennium komt je lievelingsnummer?', null, '["Jaren 60 of eerder", "Jaren 70", "Jaren 80", "Jaren 90", "Jaren 00", "Jaren 10", "Jaren 20"]', null, null, 'Uit welk decennium komen de meeste lievelingsnummers?'),
      (23, 'open', 'Wat is je lievelingsnummer?', 'Titel en artiest.', null, null, null, 'Muziekronde: van wie is dit het lievelingsnummer?'),
      (24, 'foto', 'Upload je meest merkwaardige foto', 'Het moet echt gebeurd zijn!', null, null, null, 'Ronde Echt of AI?'),
      (25, 'open', 'Wat is je gekste vakantieherinnering?', null, null, null, null, 'Verhalen voor de quizmaster en wie-van-ons-vragen');
  end if;

  -- De kanalen van het prikbord, gekozen door de eigenaar.
  if not exists (select 1 from valk.board_channels) then
    insert into valk.board_channels (title, description, sort, pinned, staff_only) values
      ('Mededelingen van de spelleiding', 'Belangrijke berichten van de organisatie. Lezen mag iedereen.', 1, true, true),
      ('Doe de groeten aan…', 'Iemand die er niet bij kan zijn, of gewoon zomaar: hier doe je de groeten.', 2, false, false),
      ('Weet je nog?', 'Herinneringen aan eerdere familieweekenden. Foto''s erbij mag!', 3, false, false),
      ('Opscheppen mag', 'Sterke verhalen, trainingsschema''s voor de zeskamp en alles waar je trots op bent.', 4, false, false),
      ('Vraag het de organisatie', 'Vragen over het weekend? Stel ze hier, dan ziet iedereen het antwoord.', 5, false, false);
  end if;

  -- De afvinklijst. Met auto_key zet de app het vinkje zelf.
  if not exists (select 1 from valk.checklist_items) then
    insert into valk.checklist_items (title, detail, auto_key, sort) values
      ('Link en familiecode in de familie-app zetten', null, null, 1),
      ('Familiecode instellen', null, 'familiecode', 2),
      ('Je eigen beheerders-PIN wijzigen', 'Beheer → Mijn PIN.', 'eigen_pin', 3),
      ('Logo laten maken en sturen', 'Met de logoprompt uit de SPEC (Bijlage A). Daarna maakt Claude alle iconen.', null, 4),
      ('Deelnemerslijst invoeren', 'Beheer → Deelnemers en teams. Plakken mag, één naam per regel.', 'deelnemers', 5),
      ('Nieuwe app aanzetten voor de familie', 'Beheer → Instellingen.', 'nieuwe_app', 6),
      ('Fun facts gaan open', 'Automatisch op de ingestelde datum.', 'funfacts_open', 7),
      ('Iedereen heeft de fun facts ingevuld', 'Deadline 1 april.', 'funfacts_klaar', 8),
      ('Teamnamen kiezen', null, null, 9),
      ('Iedereen in een team zetten', null, 'teams_ingedeeld', 10),
      ('Per team een captain kiezen', null, 'captains', 11),
      ('De zes zeskampspellen kiezen', 'Beheer → Zeskamp. Voorstellen staan er al in.', null, 12),
      ('De spelletjesmiddag op vrijdag vastleggen', null, null, 13),
      ('Programma en starttijd definitief maken en vrijgeven', null, 'programma', 14),
      ('Quizvragen maken met Claude', 'In april, met de export van de fun facts en de prompt uit de SPEC (Bijlage B).', 'quiz_geimporteerd', 15),
      ('Eerlijkheidscheck van de quiz in orde', null, 'eerlijkheid', 16),
      ('AI-versies maken voor Echt of AI', null, null, 17),
      ('Foto''s voor de kaartronde verzamelen', 'Valk-plekken in binnen- en buitenland, met de juiste coördinaten.', null, 18),
      ('Spotify-playlist voor de muziekronde klaarzetten', null, null, 19),
      ('Proefquiz spelen met een paar familieleden', 'Half april, in de proefmodus.', null, 20),
      ('Spelleiders vragen en hun PIN''s maken', 'Ongeveer zes.', 'spelleiders', 21),
      ('Team-PIN''s maken en aan de captains geven', null, 'team_pins', 22),
      ('Paklijst: bluetoothspeaker, powerbanks, opladers, mobiele hotspot', null, null, 23),
      ('Spullen voor de zeskamp verzamelen', null, null, 24),
      ('Proef leegmaken', 'Beheer → Proefmodus, vlak voor het weekend.', null, 25),
      ('Alles opruimen na het weekend', 'Beheer → Na afloop. Het prikbord blijft staan.', null, 26);
  end if;
end;
$seed$;

revoke all on function valk.seed_defaults() from public;
select valk.seed_defaults();

insert into valk.schema_migrations (version, name)
values ('20261121090000', 'valk_weekend')
on conflict (version) do nothing;
