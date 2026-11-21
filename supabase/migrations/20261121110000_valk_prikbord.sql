-- De Valkenburger Spelen 2027: het prikbord.
--
-- Het seintje (live_state.version) gaat bij elke wijziging in de app omhoog,
-- ook bij elke quizstap. Het prikbord krijgt daarom een eigen versienummer:
-- telefoons halen een kanaal alleen opnieuw op als er op het bord echt iets
-- veranderde. Triggers houden het nummer bij, wie er ook schrijft.
--
-- Verder: een index voor de limiet "hoogstens tien berichten per vijf minuten
-- per naam", en hoogstens vier foto's per bericht.
--
-- Het prikbord hoort bij de familie, niet bij de proef: geen kolom env, en
-- "Zet de proef klaar" raakt het niet. Het blijft staan voor volgend jaar.

create table valk.board_state (
  id smallint primary key default 1 check (id = 1),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into valk.board_state (id) values (1) on conflict (id) do nothing;

create or replace function valk.bump_board_version() returns trigger
language plpgsql
set search_path = valk, pg_temp
as $$
begin
  -- Upsert: de testreset leegt de tabel, dan begint het nummer opnieuw.
  insert into valk.board_state as s (id, version, updated_at) values (1, 1, now())
  on conflict (id) do update set version = s.version + 1, updated_at = now();
  return null;
end;
$$;

revoke all on function valk.bump_board_version() from public;

create trigger board_channels_version
  after insert or update or delete on valk.board_channels
  for each statement execute function valk.bump_board_version();

create trigger board_posts_version
  after insert or update or delete on valk.board_posts
  for each statement execute function valk.bump_board_version();

create trigger board_reactions_version
  after insert or update or delete on valk.board_reactions
  for each statement execute function valk.bump_board_version();

-- De limiet per naam telt de berichten van de laatste minuten.
create index board_posts_participant
  on valk.board_posts (participant_id, created_at desc)
  where participant_id is not null;

alter table valk.board_posts
  add constraint board_posts_photo_count check (cardinality(photo_ids) <= 4);

-- Rij-beveiliging: standaard alles weigeren, alleen de serverrol mag erbij.
alter table valk.board_state enable row level security;
create policy valk_app_all on valk.board_state for all to valk_app using (true) with check (true);
grant select, insert, update, delete on valk.board_state to valk_app;

do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on valk.board_state from %I', r);
    end if;
  end loop;
end
$$;

insert into valk.schema_migrations (version, name)
values ('20261121110000', 'valk_prikbord')
on conflict (version) do nothing;
