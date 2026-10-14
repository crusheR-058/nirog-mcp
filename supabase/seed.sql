-- Demo clinic: the Nirog portal seed (github.com/Shivang-creator/nirog), Barabanki district, UP.
-- Rerunning `pnpm db:migrate` resets the seeded queue to today, so every recording starts from the same clinic.
-- Rows the demo creates (Alexa+ consults, doses, filed encounters, the trust log) are left alone.

insert into household (id, name, caregiver_name, caregiver_phone) values
  ('hh_yadav',  'Yadav household, Sultanpur', 'Priya Yadav', '+91 90000 00011'),
  ('hh_sunita', 'Sunita Devi, Sultanpur',     'Ramesh Devi', '+91 90000 00022'),
  ('hh_meena',  'Meena Singh, Haidergarh',    null,          null),
  ('hh_imran',  'Imran Khan, Ramnagar',       'Salma Khan',  '+91 90000 00044')
on conflict (id) do nothing;

insert into patient (id, household_id, full_name, sex, date_of_birth, village, district, preferred_language, abha_linked, relationship, allergies, conditions, current_medications, consent) values
  ('pat_rahul',   'hh_yadav',  'Rahul Yadav', 'male',   '1976-03-14', 'Sultanpur',  'Barabanki, UP', 'Hindi', true,  'self',   '{}',              '{Hypertension}',                 '{"Amlodipine 5mg OD"}',      'active'),
  ('pat_aarav',   'hh_yadav',  'Aarav Yadav', 'male',   '2018-06-21', 'Sultanpur',  'Barabanki, UP', 'Hindi', false, 'child',  '{}',              '{}',                             '{}',                         'active'),
  ('pat_lakshmi', 'hh_yadav',  'Lakshmi Bai', 'female', '1951-07-18', 'Sultanpur',  'Barabanki, UP', 'Hindi', true,  'parent', '{}',              '{Osteoarthritis,Hypertension}',  '{"Telmisartan 40mg OD"}',    'active'),
  ('pat_sunita',  'hh_sunita', 'Sunita Devi', 'female', '1968-11-02', 'Sultanpur',  'Barabanki, UP', 'Hindi', true,  'self',   '{"Sulfa drugs"}', '{"Type 2 Diabetes"}',            '{"Metformin 500mg BD"}',     'active'),
  ('pat_meena',   'hh_meena',  'Meena Singh', 'female', '1995-01-30', 'Haidergarh', 'Barabanki, UP', 'Hindi', false, 'self',   '{}',              '{}',                             '{}',                         'pending'),
  ('pat_imran',   'hh_imran',  'Imran Khan',  'male',   '1989-09-09', 'Ramnagar',   'Barabanki, UP', 'Hindi', true,  'self',   '{Penicillin}',    '{Asthma}',                       '{"Salbutamol inhaler PRN"}', 'active')
on conflict (id) do nothing;

insert into doctor (id, name, specialty, registration_no, languages, experience_years, rating, fee_inr, online) values
  ('doc_ananya', 'Dr. Ananya Rao',   'General Physician', 'HPR-KA-2019-44817', '{Hindi,English,Kannada}', 11, 4.8, 249, true),
  ('doc_imran',  'Dr. Imran Sheikh', 'Orthopaedics',      'HPR-UP-2015-10233', '{Hindi,Urdu,English}',    14, 4.7, 399, true),
  ('doc_kavya',  'Dr. Kavya Menon',  'Internal Medicine', 'HPR-KL-2020-77810', '{Malayalam,English}',      8, 4.9, 299, false)
on conflict (id) do nothing;

insert into encounter (id, patient_id, doctor_id, started_at, ended_at, chief_complaint, assessment, clinical_notes, prescriptions, lab_requests, follow_up) values
  ('enc_rahul_prev', 'pat_rahul', 'doc_ananya', '2026-09-12T06:00:00Z', '2026-09-12T06:14:00Z', 'Hypertension review',
   'Stable hypertension. BP 150/92. Continue current therapy.',
   'Advised salt reduction and home BP monitoring. Amlodipine continued. Review in 3 months or earlier if symptomatic.',
   '[{"id":"rx_prev_1","drug":"Amlodipine","strength":"5mg","form":"Tablet","dose":"1 tablet","frequency":"Once daily","durationDays":90}]',
   '[]', '{"inDays":90,"channel":"video","instructions":"Routine BP review"}'),
  ('enc_sunita_prev', 'pat_sunita', 'doc_ananya', '2026-09-20T05:30:00Z', '2026-09-20T05:47:00Z', 'Diabetes review',
   'HbA1c 7.8%. Suboptimal control. Reinforced diet and adherence.',
   'Discussed carbohydrate portions and foot care. Continued Metformin. Ordered HbA1c and lipid profile.',
   '[{"id":"rx_prev_2","drug":"Metformin","strength":"500mg","form":"Tablet","dose":"1 tablet","frequency":"Twice daily","durationDays":60}]',
   '[{"id":"lab_prev_1","test":"HbA1c","priority":"routine"},{"id":"lab_prev_2","test":"Fasting lipid profile","priority":"routine"}]',
   '{"inDays":60,"channel":"video","instructions":"Review labs"}'),
  ('enc_lakshmi_prev', 'pat_lakshmi', 'doc_ananya', '2026-10-01T04:00:00Z', '2026-10-01T04:12:00Z', 'Joint pain review',
   'Osteoarthritis, knees. Pain controlled. BP 136/84.',
   'Continue Telmisartan. Physiotherapy exercises reviewed.',
   '[{"id":"rx_prev_3","drug":"Telmisartan","strength":"40mg","form":"Tablet","dose":"1 tablet","frequency":"Once daily","durationDays":60},{"id":"rx_prev_4","drug":"Paracetamol","strength":"500mg","form":"Tablet","dose":"1 tablet","frequency":"Twice daily","durationDays":30}]',
   '[]', '{"inDays":56,"channel":"video"}')
on conflict (id) do nothing;

insert into handover (id, patient_id, created_at, chief_complaint, narrative, duration_text, symptoms, red_flags, vitals, ai_confidence, suggested_triage) values
  ('aria_rahul', 'pat_rahul', now() - interval '15 minutes', 'Lower back pain, 3rd visit in 5 weeks',
   'Same ache as July, worse in the mornings and when bending to lift water. No numbness, no fever, no change in bladder or bowel. Adherent to Amlodipine. Memory linked three presentations with no shared wording.',
   '3 weeks, recurring since July', '{"Lower back ache","Worse on bending","Morning stiffness"}', '{"Recurrent: 3 visits in 38 days"}',
   '{"pulseBpm":84,"spo2":97,"systolic":148,"diastolic":92}', 0.88, 'urgent'),
  ('aria_sunita', 'pat_sunita', now() - interval '3 hours', 'Diabetes review + tingling feet',
   'Routine follow-up for Type 2 Diabetes. Reports occasional tingling in both feet over the last month. Home glucometer fasting readings around 150–170 mg/dL. Metformin adherent, no hypoglycaemic episodes.',
   '1 month', '{"Peripheral tingling","Raised fasting glucose"}', '{}',
   '{"pulseBpm":78,"spo2":98,"systolic":138,"diastolic":84}', 0.90, 'routine'),
  ('aria_aarav', 'pat_aarav', now() - interval '3 hours', 'Fever and cough (child, 8y)',
   'Mother reports 3 days of fever up to 101°F and a dry cough. Eating less but drinking fluids, passing urine normally. No rash, no difficulty breathing reported. Attends school.',
   '3 days', '{"Fever","Dry cough","Reduced appetite"}', '{}',
   '{"tempC":38.3,"pulseBpm":110,"spo2":97,"respRate":24}', 0.86, 'routine'),
  ('aria_meena', 'pat_meena', now() - interval '2 hours', 'Headache for 5 days',
   'New patient. Dull bilateral headache for 5 days, worse in the afternoon, partially relieved by rest. No visual changes, no vomiting, no neck stiffness. Works long hours doing embroidery. Sleeps poorly.',
   '5 days', '{"Bilateral headache","Poor sleep","Eye strain"}', '{}',
   '{"pulseBpm":82,"spo2":99,"systolic":122,"diastolic":78}', 0.79, 'routine'),
  ('aria_imran', 'pat_imran', now() - interval '7 minutes', 'Asthma flare after dust exposure',
   'Reports wheeze and cough since threshing work yesterday. Using inhaler more than usual (6+ times/day) with partial relief. Able to speak in full sentences. No cyanosis reported.',
   '1 day', '{"Wheeze","Cough","Increased inhaler use"}', '{"Inhaler use >6×/day"}',
   '{"pulseBpm":96,"spo2":95,"respRate":20}', 0.84, 'urgent')
on conflict (id) do update set created_at = excluded.created_at;

-- Today's clinic, in India Standard Time.
with today as (select (date_trunc('day', now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata' as d)
insert into consult (id, patient_id, doctor_id, kind, triage, state, channel, source, reason, handover_id, connection, red_flag_count, checked_in_at, scheduled_for)
select v.* from today, lateral (values
  ('q_rahul',        'pat_rahul',   'doc_ananya', 'chronic',    'urgent',  'waiting',   'video', 'app', 'Lower back pain, 3rd visit in 5 weeks', 'aria_rahul',  'fair', 1, now() - interval '13 minutes', today.d + interval '18 hours 15 minutes'),
  ('q_imran',        'pat_imran',   'doc_ananya', 'chronic',    'urgent',  'waiting',   'audio', 'app', 'Asthma flare',                          'aria_imran',  'poor', 1, now() - interval '5 minutes',  today.d + interval '18 hours 30 minutes'),
  ('q_sunita',       'pat_sunita',  'doc_ananya', 'follow_up',  'routine', 'scheduled', 'video', 'app', 'Diabetes follow-up',                    'aria_sunita', 'good', 0, today.d + interval '16 hours',      today.d + interval '16 hours'),
  ('q_aarav',        'pat_aarav',   'doc_ananya', 'pediatrics', 'routine', 'scheduled', 'video', 'app', 'Fever and cough',                       'aria_aarav',  'good', 0, today.d + interval '16 hours 30 minutes', today.d + interval '16 hours 30 minutes'),
  ('q_meena',        'pat_meena',   'doc_ananya', 'new',        'routine', 'scheduled', 'chat',  'app', 'Headache, new patient',                 'aria_meena',  'good', 0, today.d + interval '17 hours',      today.d + interval '17 hours'),
  ('q_lakshmi_done', 'pat_lakshmi', 'doc_ananya', 'follow_up',  'routine', 'completed', 'video', 'app', 'Joint pain review',                     null,          'good', 0, today.d + interval '9 hours 30 minutes', today.d + interval '9 hours 30 minutes')
) as v(id, patient_id, doctor_id, kind, triage, state, channel, source, reason, handover_id, connection, red_flag_count, checked_in_at, scheduled_for)
on conflict (id) do update set state = excluded.state, checked_in_at = excluded.checked_in_at, scheduled_for = excluded.scheduled_for;
