-- Patient portal accounts.
--
-- A patient signs in to the portal with Google. Google proves who holds the account; it does not say which clinic
-- record is theirs. The clinic hands the patient a one-time link code (the doctor sees it on the chart), and the first
-- sign-in with that code binds the Google subject to exactly one patient row. From then on the account alone opens
-- the record. Nothing in a request can choose a patient id.
alter table patient
  add column if not exists account_sub   text unique,   -- Google's stable subject for the holder, null until claimed
  add column if not exists account_email text,
  add column if not exists link_code     text unique,   -- cleared when claimed, so a code works once
  add column if not exists linked_at     timestamptz;

-- The demo clinic's codes. Only for rows never claimed and without a code, so rerunning is harmless.
update patient set link_code = v.code
from (values ('pat_rahul', 'RY-4821'), ('pat_sunita', 'SD-7304'), ('pat_meena', 'MS-1197'), ('pat_aarav', 'AY-6630'), ('pat_imran', 'IK-2258'), ('pat_lakshmi', 'LB-9045')) as v(id, code)
where patient.id = v.id and patient.link_code is null and patient.account_sub is null;
