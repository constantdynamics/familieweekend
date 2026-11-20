-- De Valkenburger Spelen 2027, fase 1: basis.
--
-- Alles van de app staat in het eigen schema "valk". Dat schema staat niet open
-- voor de Data API van Supabase: de browser praat nooit rechtstreeks met de
-- database, alleen de server doet dat, als de databasegebruiker valk_app.
-- Rij-beveiliging (RLS) staat op elke tabel aan en weigert standaard alles;
-- alleen valk_app heeft een regel die toegang geeft.
--
-- Het wachtwoord van valk_app staat niet in deze migratie. Dat zet je los
-- (zie README, "Databasegebruiker"), zodat het nooit in de repo komt.

create schema if not exists valk;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'valk_app') then
    create role valk_app login noinherit;
  end if;
end
$$;

revoke all on schema valk from public;
grant usage on schema valk to valk_app;

-- Welke migraties van deze app zijn toegepast. Los van andere apps die
-- hetzelfde Supabase-project gebruiken.
create table valk.schema_migrations (
  version text primary key,
  name text not null,
  applied_at timestamptz not null default now()
);

-- Instellingen: één rij. Tijden zijn timestamptz; de app rekent en toont in
-- Europe/Amsterdam.
create table valk.settings (
  id smallint primary key default 1 check (id = 1),
  start_at timestamptz not null default '2027-05-06 14:00:00+02',
  end_at timestamptz not null default '2027-05-09 15:00:00+02',
  location_name text not null default 'De Dommelvallei',
  location_place text not null default 'Borkel en Schaft',
  latitude double precision not null default 51.2975
    check (latitude between -90 and 90),
  longitude double precision not null default 5.4417
    check (longitude between -180 and 180),
  funfacts_deadline timestamptz not null default '2027-04-01 23:59:59+02',
  updated_at timestamptz not null default now(),
  updated_by text,
  check (end_at > start_at)
);
insert into valk.settings (id) values (1) on conflict (id) do nothing;

-- De familiecode, alleen als hash (scrypt met peper). Null betekent: nog niet
-- ingesteld, dan komt niemand binnen.
create table valk.family_access (
  id smallint primary key default 1 check (id = 1),
  code_hash text,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into valk.family_access (id) values (1) on conflict (id) do nothing;

-- Beheerder en spelleiders. De PIN staat alleen als hash. pin_version gaat
-- omhoog bij elke wijziging, zodat oude inlogsessies vervallen.
create table valk.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  role text not null check (role in ('beheerder', 'spelleider')),
  pin_hash text,
  pin_version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index staff_name_role_key on valk.staff (lower(name), role);

-- Inlogpogingen voor de limiet "5 pogingen per 10 minuten per toestel en rol".
-- subject is een toestel-id of een gehasht IP-adres, nooit een PIN of code.
create table valk.login_attempts (
  id bigint generated always as identity primary key,
  kind text not null,
  subject text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index login_attempts_lookup on valk.login_attempts (kind, subject, created_at desc);

-- Logboek van alles wat de beheerder doet, met oude en nieuwe waarde.
-- Nooit een PIN of familiecode in old_value of new_value.
create table valk.audit_log (
  id bigint generated always as identity primary key,
  env text not null default 'live' check (env in ('live', 'test')),
  actor_id uuid,
  actor_name text not null,
  actor_role text not null,
  action text not null,
  entity text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created on valk.audit_log (created_at desc);

-- Hartslag van de dagelijkse keepalive, zodat het gratis Supabase-project niet
-- in slaap valt. Ook zichtbaar in het beheerscherm.
create table valk.heartbeat (
  id smallint primary key default 1 check (id = 1),
  last_seen_at timestamptz not null default now(),
  source text not null default 'migratie',
  beats bigint not null default 0
);
insert into valk.heartbeat (id) values (1) on conflict (id) do nothing;

-- Rij-beveiliging: standaard alles weigeren, alleen de serverrol mag erbij.
do $$
declare
  t text;
begin
  foreach t in array array[
    'schema_migrations', 'settings', 'family_access', 'staff',
    'login_attempts', 'audit_log', 'heartbeat'
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
alter default privileges in schema valk
  grant select, insert, update, delete on tables to valk_app;
alter default privileges in schema valk
  grant usage, select on sequences to valk_app;

-- De app leest de migratielijst alleen.
revoke insert, update, delete on valk.schema_migrations from valk_app;

-- Extra slot op de deur: de standaardrollen van Supabase krijgen niets.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema valk from %I', r);
      execute format('revoke all on all tables in schema valk from %I', r);
      execute format('revoke all on all sequences in schema valk from %I', r);
    end if;
  end loop;
end
$$;

insert into valk.schema_migrations (version, name)
values ('20261120140000', 'valk_init')
on conflict (version) do nothing;
