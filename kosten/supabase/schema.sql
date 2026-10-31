-- Haus-Kosten: Datenbank-Struktur für Supabase
-- Im Supabase-Dashboard unter „SQL Editor“ einmal komplett ausführen.
-- Danach unten bei „Zugang“ die eigene E-Mail eintragen.

-- ---------- Tabellen ----------
create table if not exists public.kosten (
  id            text primary key,
  nr            text,
  datum         date not null,
  kategorie     text not null default 'Sonstiges',
  gewerk        text,
  raum          text,
  lieferant     text,
  beschreibung  text,
  belegart      text,
  belegnr       text,
  betrag        numeric(12,2) not null default 0,
  bezahlt       numeric(12,2) not null default 0,
  status        text not null default 'Bezahlt',
  anmerkung     text,
  quelle        text not null default 'app',      -- excel | handy | app | chatgpt
  geloescht     boolean not null default false,   -- weiches Löschen, damit alle Geräte es mitbekommen
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default clock_timestamp()
);

create table if not exists public.arbeitszeit (
  id            text primary key,
  datum         date not null,
  mitarbeiter   text not null,
  beginn        text,
  ende          text,
  stunden       numeric(6,2) not null default 0,
  betrag        numeric(12,2),                    -- leer = Stunden × Stundensatz
  beschreibung  text,
  kategorie     text default 'Mitarbeiter',
  gewerk        text,
  raum          text,
  quelle        text not null default 'app',      -- excel | app | extern (Mitarbeiter-Projekt)
  extern_id     text unique,                      -- ID im Mitarbeiter-Projekt
  geloescht     boolean not null default false,
  erstellt_am   timestamptz not null default now(),
  geaendert_am  timestamptz not null default clock_timestamp()
);

create table if not exists public.mitarbeiter (
  name          text primary key,
  stundensatz   numeric(8,2) not null default 0,
  rolle         text,
  aktiv         boolean not null default true,
  geloescht     boolean not null default false,
  geaendert_am  timestamptz not null default clock_timestamp()
);

-- eigene Kategorien / Gewerke / Räume
create table if not exists public.listen (
  id            text primary key,                 -- "<typ>:<name>"
  typ           text not null,                    -- kategorie | gewerk | raum
  name          text not null,
  sortierung    integer default 0,
  geloescht     boolean not null default false,
  geaendert_am  timestamptz not null default clock_timestamp()
);

create index if not exists kosten_geaendert_idx on public.kosten (geaendert_am);
create index if not exists kosten_datum_idx on public.kosten (datum);
create index if not exists arbeitszeit_geaendert_idx on public.arbeitszeit (geaendert_am);
create index if not exists arbeitszeit_datum_idx on public.arbeitszeit (datum, mitarbeiter);
create index if not exists mitarbeiter_geaendert_idx on public.mitarbeiter (geaendert_am);
create index if not exists listen_geaendert_idx on public.listen (geaendert_am);

-- ---------- Änderungszeit automatisch setzen (Grundlage für den Abgleich) ----------
create or replace function public.setze_geaendert_am() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.geaendert_am := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['kosten','arbeitszeit','mitarbeiter','listen'] loop
    execute format('drop trigger if exists %I_geaendert on public.%I', t, t);
    execute format('create trigger %I_geaendert before insert or update on public.%I for each row execute function public.setze_geaendert_am()', t, t);
  end loop;
end $$;

-- ---------- Zugang: nur eingetragene E-Mail-Adressen ----------
create table if not exists public.kosten_zugang (
  email text primary key
);
alter table public.kosten_zugang enable row level security;   -- keine Policy: nur über SQL-Editor änderbar

create or replace function public.hat_kosten_zugang() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.kosten_zugang z
    where lower(z.email) = lower(coalesce((select auth.jwt()) ->> 'email', ''))
  );
$$;
revoke all on function public.hat_kosten_zugang() from public, anon;
grant execute on function public.hat_kosten_zugang() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['kosten','arbeitszeit','mitarbeiter','listen'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_zugang on public.%I', t, t);
    execute format('create policy %I_zugang on public.%I for all to authenticated using ((select public.hat_kosten_zugang())) with check ((select public.hat_kosten_zugang()))', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Zugang eintragen (eigene E-Mail einsetzen) ----------
-- insert into public.kosten_zugang (email) values ('deine@email.de') on conflict do nothing;
