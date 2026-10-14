-- Wipes what demo runs created, so the next recording starts from the seeded clinic. Demo database only.
-- Run by `pnpm db:reset -- --yes`, which then reseeds. The trust log is append-only and is kept.
delete from encounter where id not in ('enc_rahul_prev', 'enc_sunita_prev', 'enc_lakshmi_prev');
delete from consult where id not in ('q_rahul', 'q_imran', 'q_sunita', 'q_aarav', 'q_meena', 'q_lakshmi_done');
delete from handover where id not in ('aria_rahul', 'aria_sunita', 'aria_aarav', 'aria_meena', 'aria_imran');
delete from dose;
delete from complaint;
delete from visit;
