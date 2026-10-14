-- Nirog for Alexa+: the clinic schema on Supabase.
-- Applied by `pnpm db:migrate` after the memory tables (visit, complaint) from src/memory/pg.ts. Safe to rerun.
--
-- Row-level security is on for every table with no policies, so the anon and publishable
-- keys read nothing. Only the MCP server, holding the service key, reaches the data, and
-- it enforces consent per request with the household token.

create table if not exists household (
  id              text primary key,
  name            text not null,
  caregiver_name  text,
  caregiver_phone text,
  created_at      timestamptz not null default now()
);

create table if not exists patient (
  id                  text primary key,
  household_id        text references household(id),
  full_name           text not null,
  sex                 text check (sex in ('male', 'female', 'other')),
  date_of_birth       date,
  village             text,
  district            text,
  preferred_language  text not null default 'Hindi',
  abha_linked         boolean not null default false,
  relationship        text not null default 'self',
  allergies           text[] not null default '{}',
  conditions          text[] not null default '{}',
  current_medications text[] not null default '{}',
  consent             text not null default 'pending' check (consent in ('active', 'pending')),
  created_at          timestamptz not null default now()
);

create table if not exists doctor (
  id               text primary key,
  name             text not null,
  specialty        text not null,
  registration_no  text not null unique,
  languages        text[] not null default '{}',
  clinic           text not null default 'Nirog Rural Care Network',
  experience_years int,
  rating           numeric(2, 1),
  fee_inr          int,
  online           boolean not null default false
);

-- ARIA's structured intake summary, read by the doctor before the consult.
create table if not exists handover (
  id               text primary key default gen_random_uuid()::text,
  patient_id       text not null references patient(id),
  created_at       timestamptz not null default now(),
  chief_complaint  text not null,
  narrative        text not null,
  duration_text    text,
  symptoms         text[] not null default '{}',
  red_flags        text[] not null default '{}',
  vitals           jsonb not null default '{}',
  ai_confidence    numeric(3, 2),
  suggested_triage text not null check (suggested_triage in ('emergency', 'urgent', 'routine')),
  language         text not null default 'Hindi'
);
create index if not exists handover_patient_idx on handover (patient_id, created_at desc);

-- The doctor's queue. doctor_id null means the on-call pool, which any doctor can claim.
create table if not exists consult (
  id             text primary key default gen_random_uuid()::text,
  patient_id     text not null references patient(id),
  doctor_id      text references doctor(id),
  kind           text not null default 'new' check (kind in ('new', 'follow_up', 'pediatrics', 'chronic', 'emergency')),
  triage         text not null check (triage in ('emergency', 'urgent', 'routine')),
  state          text not null default 'waiting' check (state in ('waiting', 'scheduled', 'in_consult', 'completed')),
  channel        text not null default 'audio' check (channel in ('video', 'audio', 'chat')),
  source         text not null default 'app' check (source in ('app', 'alexa')),
  reason         text not null,
  handover_id    text references handover(id),
  connection     text check (connection in ('good', 'fair', 'poor')),
  red_flag_count int not null default 0,
  checked_in_at  timestamptz not null default now(),
  scheduled_for  timestamptz not null default now()
);
create index if not exists consult_state_idx on consult (state, checked_in_at desc);

-- A completed encounter is the patient's active care plan.
create table if not exists encounter (
  id              text primary key default gen_random_uuid()::text,
  patient_id      text not null references patient(id),
  doctor_id       text references doctor(id),
  consult_id      text references consult(id),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  chief_complaint text not null default '',
  assessment      text not null default '',
  clinical_notes  text not null default '',
  prescriptions   jsonb not null default '[]',
  lab_requests    jsonb not null default '[]',
  follow_up       jsonb
);
create index if not exists encounter_patient_idx on encounter (patient_id, started_at desc);

create table if not exists dose (
  id         text primary key default gen_random_uuid()::text,
  patient_id text not null references patient(id),
  drug       text not null,
  slot       text not null,
  taken_at   timestamptz not null default now()
);
create index if not exists dose_patient_idx on dose (patient_id, taken_at);

-- The trust log: who did what to whom, and why. Never edited, never deleted.
create table if not exists audit_event (
  id         text primary key default gen_random_uuid()::text,
  actor_name text not null,
  action     text not null,
  target     text not null,
  reason     text,
  at         timestamptz not null default now()
);
create index if not exists audit_event_at_idx on audit_event (at desc);

create or replace function audit_event_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'audit_event is append-only';
end $$;
drop trigger if exists audit_event_no_change on audit_event;
create trigger audit_event_no_change before update or delete on audit_event
  for each row execute function audit_event_append_only();
drop trigger if exists audit_event_no_truncate on audit_event;
create trigger audit_event_no_truncate before truncate on audit_event
  for each statement execute function audit_event_append_only();

alter table household   enable row level security;
alter table patient     enable row level security;
alter table doctor      enable row level security;
alter table handover    enable row level security;
alter table consult     enable row level security;
alter table encounter   enable row level security;
alter table dose        enable row level security;
alter table audit_event enable row level security;
alter table visit       enable row level security;
alter table complaint   enable row level security;
