import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarBlank, CaretRight, ChatCircle, CheckCircle, Clock, Eye, FileText, Flask, Gear, Headset, Lock, MagnifyingGlass, Phone, Pill, Plus, ShieldCheck, SquaresFour, Users, VideoCamera, Warning, X } from "@phosphor-icons/react";
import { ageOf, CHANNEL, CONNECTION, DOCTOR, fmtDate, fmtTime, handoverFor, initials, KIND, minutesSince, PATIENTS, patientById, timeAgo, TRIAGE, type Channel, type QueueItem } from "../clinic/data";
import { CallRoom } from "../clinic/CallRoom";
import { useDemo, type PortalTab } from "../store";

const TABS: Array<{ id: PortalTab; label: string; icon: typeof SquaresFour }> = [
  { id: "dashboard", label: "Dashboard", icon: SquaresFour },
  { id: "patients", label: "Patients", icon: Users },
  { id: "chart", label: "Chart", icon: FileText },
  { id: "consult", label: "Consult", icon: VideoCamera },
  { id: "trust", label: "Trust log", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Gear },
];

function Avatar({ name, tone, size }: { name: string; tone?: string; size?: "big" }) {
  return <span className={`avatar ${tone ?? ""} ${size ?? ""}`}>{initials(name)}</span>;
}

function ChannelIcon({ c }: { c: Channel }) {
  return c === "video" ? <VideoCamera size={13} weight="bold" /> : c === "audio" ? <Phone size={13} weight="bold" /> : <ChatCircle size={13} weight="bold" />;
}

function Stat({ label, value, unit, icon, tone, sub }: { label: string; value: string | number; unit?: string; icon: React.ReactNode; tone?: string; sub?: string }) {
  return (
    <div className={`glass stat ${tone ?? ""}`}>
      <div className="stat-head"><span>{label}</span><span className="tile-icon small">{icon}</span></div>
      <div className="stat-value">{value}<small>{unit}</small></div>
      {sub && <div className="muted small">{sub}</div>}
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────────────────── */
function Dashboard() {
  const { queue, onCall, setOnCall, startConsult, openChart, audit, addAudit } = useDemo();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 20000); return () => clearInterval(t); }, []);
  const waiting = queue.filter((q) => q.state === "waiting");
  const emergencies = waiting.filter((q) => q.triage === "emergency").length;
  const scheduled = queue.filter((q) => q.state === "scheduled").length;
  const completed = queue.filter((q) => q.state === "completed").length;
  const avgWait = waiting.length ? Math.round(waiting.reduce((a, q) => a + minutesSince(q.checkedInAt), 0) / waiting.length) : 0;
  const order = { waiting: 0, in_consult: 0, scheduled: 1, completed: 2 };
  const tri = { emergency: 0, urgent: 1, routine: 2 };
  const sorted = [...queue].sort((a, b) => order[a.state] - order[b.state] || tri[a.triage] - tri[b.triage] || new Date(a.checkedInAt).getTime() - new Date(b.checkedInAt).getTime());
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="portal-page">
      <div className="portal-greet">
        <h3>{greet}, Dr. Rao</h3>
        <p className="muted">{waiting.length} patient{waiting.length === 1 ? "" : "s"} waiting{emergencies ? ` · ${emergencies} emergency` : ""}.</p>
      </div>
      <div className="stats">
        <Stat label="Waiting" value={waiting.length} icon={<Users size={14} />} />
        <Stat label="Emergencies" value={emergencies} icon={<Warning size={14} />} tone={emergencies ? "red" : ""} sub={emergencies ? "Act now" : "None"} />
        <Stat label="Scheduled" value={scheduled} icon={<CalendarBlank size={14} />} />
        <Stat label="Avg wait" value={avgWait} unit="min" icon={<Clock size={14} />} tone={avgWait >= 10 ? "amber" : ""} />
        <Stat label="Completed" value={completed} icon={<CheckCircle size={14} />} tone="green" />
      </div>
      <div className="portal-grid">
        <div>
          <div className={`glass card oncall ${onCall ? "on" : ""}`}>
            <span className="tile-icon small"><Headset size={16} weight="duotone" /></span>
            <div><b>{onCall ? "On call" : "Off call"}</b><p className="muted small">{onCall ? "Receiving on-demand consults from Alexa+ and the patient app." : "Go on call to receive on-demand consults."}</p></div>
            <button role="switch" aria-checked={onCall} className={`switch ${onCall ? "on" : ""}`} onClick={() => { setOnCall(!onCall); addAudit({ actorName: DOCTOR.name, action: onCall ? "Went off call" : "Went on call", target: "Queue", reason: "Clinic availability" }); }}><span /></button>
          </div>
          <div className="queue-head"><h4>Today's queue</h4><span className="muted small">Sorted by triage, then wait time</span></div>
          <ol className="queue">
            {sorted.map((q) => {
              const p = patientById(q.patientId)!;
              const done = q.state === "completed";
              const live = q.state === "waiting" || q.state === "in_consult";
              const mins = minutesSince(q.checkedInAt);
              return (
                <li key={q.id} className={`glass qcard ${q.triage} ${done ? "done" : ""}`}>
                  <span className={`spine ${q.triage}`} />
                  <Avatar name={p.fullName} tone={p.tone} />
                  <div className="qmain">
                    <div className="qname"><b>{p.fullName}</b><span className="muted small">{ageOf(p)}y</span>{q.source === "alexa" && <span className="pill teal">Alexa+</span>}</div>
                    <p className="muted">{q.reason}</p>
                    <div className="qmeta">
                      <span>{KIND[q.kind]}</span>
                      {live && <span className={mins >= 10 ? "late" : ""}><Clock size={12} /> waiting {mins}m</span>}
                      {q.state === "scheduled" && <span><CalendarBlank size={12} /> {fmtTime(q.scheduledFor)}</span>}
                      {done && <span className="ok"><CheckCircle size={12} weight="fill" /> Completed</span>}
                      {live && q.quality !== "good" && <span className={`net ${q.quality}`}>{CONNECTION[q.quality]}</span>}
                    </div>
                  </div>
                  <div className="qside">
                    <div className="qbadges">
                      {q.redFlagCount > 0 && !done && <span className="pill red">{q.redFlagCount} red flag{q.redFlagCount > 1 ? "s" : ""}</span>}
                      <span className={`pill ${q.triage === "emergency" ? "red" : q.triage === "urgent" ? "gold" : "green"}`}>{TRIAGE[q.triage]}</span>
                      <span className="pill"><ChannelIcon c={q.channel} /> {CHANNEL[q.channel]}</span>
                    </div>
                    {live ? (
                      <button className="btn primary small" onClick={() => { startConsult(q.id); addAudit({ actorName: DOCTOR.name, action: "Started consult", target: p.fullName, reason: q.reason }); }}>{q.state === "in_consult" ? "Resume" : "Start"}</button>
                    ) : (
                      <button className="ghost small" onClick={() => { openChart(p.id); addAudit({ actorName: DOCTOR.name, action: "Viewed chart", target: p.fullName, reason: q.reason }); }} aria-label={`Open ${p.fullName}`}><CaretRight size={16} weight="bold" /></button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <aside className="glass card trustlog">
          <div className="card-head"><span className="eyebrow"><ShieldCheck size={14} weight="duotone" /> Trust log</span><span className="muted small">Immutable · who / what / why</span></div>
          <TrustList events={audit.slice(0, 6)} />
        </aside>
      </div>
    </div>
  );
}

function TrustList({ events }: { events: ReturnType<typeof useDemo.getState>["audit"] }) {
  return (
    <ol className="trust-list">
      {events.map((e) => (
        <li key={e.id}>
          <span className="tick"><ShieldCheck size={12} weight="fill" /></span>
          <div>
            <p><b>{e.action}</b> · <span className="muted">{e.target}</span></p>
            {e.reason && <p className="muted small">Reason: {e.reason}</p>}
            <p className="muted small">{e.actorName} · {timeAgo(e.at)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Patients ─────────────────────────────────────────────────────────────── */
function Patients() {
  const [q, setQ] = useState("");
  const { openChart, addAudit } = useDemo();
  const list = PATIENTS.filter((p) => `${p.fullName} ${p.village} ${p.conditions.join(" ")}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="portal-page">
      <div className="portal-greet"><h3>Patients</h3><p className="muted">Only patients who have granted you a care relationship appear here. There is no clinic-wide patient search.</p></div>
      <label className="search"><MagnifyingGlass size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, village or condition" /></label>
      <ul className="pgrid">
        {list.map((p) => (
          <li key={p.id}>
            <button className="glass pcard" onClick={() => { openChart(p.id); addAudit({ actorName: DOCTOR.name, action: "Viewed chart", target: p.fullName, reason: "Patient list" }); }}>
              <Avatar name={p.fullName} tone={p.tone} />
              <div className="pmain">
                <div className="qname"><b>{p.fullName}</b><span className="muted small">{ageOf(p)}y</span></div>
                <p className="muted small">{p.village} · {p.conditions.length ? p.conditions.join(", ") : "No chronic conditions"}</p>
                <div className="qbadges left">
                  <span className={`pill ${p.consent === "active" ? "green" : "gold"}`}><ShieldCheck size={12} weight="fill" /> Consent {p.consent}</span>
                  {p.abha && <span className="pill">ABHA</span>}
                </div>
              </div>
              <CaretRight size={16} weight="bold" className="muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Chart ────────────────────────────────────────────────────────────────── */
function Chart() {
  const { activePatientId, encounters, setPortalTab, queue, startConsult } = useDemo();
  const p = patientById(activePatientId)!;
  const h = handoverFor(p.id);
  const history = encounters.filter((e) => e.patientId === p.id);
  const live = queue.find((q) => q.patientId === p.id && (q.state === "waiting" || q.state === "in_consult"));
  const traces = useDemo((s) => s.traces).filter((t) => (t.args as { patient_id?: string }).patient_id === p.id && t.tool === "start_intake");
  return (
    <div className="portal-page">
      <button className="ghost small back" onClick={() => setPortalTab("patients")}><ArrowLeft size={14} weight="bold" /> Patients</button>
      <div className="chart-head">
        <Avatar name={p.fullName} tone={p.tone} size="big" />
        <div>
          <h3>{p.fullName} <span className="muted">{ageOf(p)}y · {p.sex}</span></h3>
          <p className="muted small">{p.village}, {p.district} · {p.language} · {p.relationship === "self" ? "Own account" : `${p.relationship} on a family account`}</p>
          <div className="qbadges left">
            <span className={`pill ${p.consent === "active" ? "green" : "gold"}`}><ShieldCheck size={12} weight="fill" /> Consent {p.consent}</span>
            {p.abha && <span className="pill">ABHA linked</span>}
            {p.allergies.length > 0 && <span className="pill red"><Warning size={12} weight="fill" /> Allergy: {p.allergies.join(", ")}</span>}
          </div>
        </div>
        {live && <button className="btn primary" onClick={() => startConsult(live.id)}><VideoCamera size={16} weight="bold" /> {live.state === "in_consult" ? "Resume consult" : "Start consult"}</button>}
      </div>
      <div className="chart-grid">
        <div className="chart-main">
          {h && (
            <div className={`glass card handover ${h.suggestedTriage}`}>
              <div className="card-head"><span className="eyebrow">ARIA handover · unverified</span><span className={`pill ${h.suggestedTriage === "emergency" ? "red" : h.suggestedTriage === "urgent" ? "gold" : "green"}`}>{TRIAGE[h.suggestedTriage]} · {Math.round(h.aiConfidence * 100)}%</span></div>
              <h4>{h.chiefComplaint}</h4>
              <p>{h.narrative}</p>
              <div className="vitals">{Object.entries(h.vitals).map(([k, v]) => <span key={k}><small>{k.replace("Bpm", "").replace("respRate", "RR").replace("tempC", "°C")}</small>{v}</span>)}</div>
              <div className="qbadges left">{h.symptoms.map((s) => <span key={s} className="pill">{s}</span>)}{h.redFlags.map((r) => <span key={r} className="pill red"><Warning size={12} weight="fill" /> {r}</span>)}</div>
              <p className="muted small">Duration {h.durationText} · in {h.language}</p>
            </div>
          )}
          {traces.length > 0 && (
            <div className="glass card">
              <div className="card-head"><span className="eyebrow">Alexa+ intake tonight</span><span className="pill teal">live</span></div>
              {traces.slice(0, 3).map((t) => (
                <div key={t.id} className="alexa-line"><q>{String((t.args as { complaint?: string }).complaint)}</q><ul>{(t.summary ?? []).filter((s) => /recall|recurrence|triage/.test(s)).map((s) => <li key={s}>{s}</li>)}</ul></div>
              ))}
            </div>
          )}
          <div className="glass card">
            <div className="card-head"><span className="eyebrow">Care history</span><span className="muted small">{history.length} encounter{history.length === 1 ? "" : "s"}</span></div>
            {history.length === 0 && <p className="muted">No prior encounters.</p>}
            {history.map((e) => (
              <div key={e.id} className="enc">
                <div className="enc-head"><b>{e.chiefComplaint}</b><span className="muted small">{fmtDate(e.startedAt)} · {e.doctor}</span></div>
                <p><span className="muted">Assessment.</span> {e.assessment}</p>
                {e.notes && <p className="muted small">{e.notes}</p>}
                <div className="qbadges left">
                  {e.prescriptions.map((rx) => <span key={rx.drug} className="pill"><Pill size={12} weight="fill" /> {rx.drug} {rx.strength} · {rx.frequency}</span>)}
                  {e.labs.map((l) => <span key={l.test} className="pill"><Flask size={12} weight="fill" /> {l.test}</span>)}
                  {e.followUp && <span className="pill"><CalendarBlank size={12} weight="fill" /> Follow-up in {e.followUp.inDays} days</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <aside className="chart-side">
          <div className="glass card"><span className="eyebrow">Conditions</span><p>{p.conditions.length ? p.conditions.join(", ") : "None recorded"}</p><span className="eyebrow">Medications</span><p>{p.medications.length ? p.medications.join(", ") : "None"}</p></div>
          <div className="glass card"><span className="eyebrow">Documents</span><p className="muted">No documents yet.</p><button className="ghost small"><Plus size={14} weight="bold" /> Upload</button></div>
          <div className="glass card"><span className="eyebrow"><Lock size={12} weight="fill" /> Access</span><p className="muted small">Every read of this chart is logged with who, what and why. Consent can be revoked by the patient at any time.</p></div>
        </aside>
      </div>
    </div>
  );
}

/* ── Consult ──────────────────────────────────────────────────────────────── */
function Consult() {
  const { consultQueueId, queue, fileEncounter, setQueueState, endConsult, openChart, addAudit, setPortalTab } = useDemo();
  const item = queue.find((q) => q.id === consultQueueId) ?? null;
  const p = item ? patientById(item.patientId)! : null;
  const h = p ? handoverFor(p.id) : undefined;
  const [acceptAria, setAcceptAria] = useState(true);
  const [form, setForm] = useState({ chief: "", assessment: "", notes: "", rx: [{ drug: "", strength: "", frequency: "" }], labs: [""], followUp: true, inDays: 14, channel: "video" as Channel, instructions: "" });
  const [inCall, setInCall] = useState(false);
  useEffect(() => { if (h) setForm((f) => ({ ...f, chief: h.chiefComplaint })); }, [h]);

  if (!item || !p) {
    return <div className="portal-page empty-state"><VideoCamera size={28} /><h3>No consultation open.</h3><p className="muted">Start one from the queue. The ARIA handover and the chart open beside the call.</p><button className="btn" onClick={() => setPortalTab("dashboard")}>Go to the queue</button></div>;
  }

  const file = () => {
    const rx = form.rx.filter((r) => r.drug.trim()).map((r) => ({ drug: r.drug, strength: r.strength, frequency: r.frequency }));
    fileEncounter({ id: `enc_${Date.now()}`, patientId: p.id, startedAt: new Date().toISOString(), chiefComplaint: form.chief || item.reason, assessment: form.assessment, notes: form.notes, prescriptions: rx, labs: form.labs.filter(Boolean).map((t) => ({ test: t, priority: "routine" as const })), followUp: form.followUp ? { inDays: form.inDays, channel: form.channel, instructions: form.instructions } : null, doctor: DOCTOR.name });
    setQueueState(item.id, "completed");
    addAudit({ actorName: DOCTOR.name, action: "Filed encounter", target: p.fullName, reason: `${rx.length} prescription${rx.length === 1 ? "" : "s"} · ${acceptAria ? "ARIA handover accepted" : "ARIA handover not accepted"}` });
    endConsult();
    openChart(p.id);
  };

  return (
    <div className="portal-page">
      <div className="consult-head">
        <button className="ghost small" onClick={() => openChart(p.id)}><ArrowLeft size={14} weight="bold" /> Chart</button>
        <div className="qbadges"><span className={`pill ${item.triage === "emergency" ? "red" : item.triage === "urgent" ? "gold" : "green"}`}>{TRIAGE[item.triage]}</span><span className="pill"><ChannelIcon c={item.channel} /> {CHANNEL[item.channel]}</span><span className={`pill net ${item.quality}`}>{CONNECTION[item.quality]}</span></div>
      </div>
      <div className="consult-grid">
        <div className="consult-main">
          <div className="glass card stage-card">
            <div className="stage-hero">
              <Avatar name={p.fullName} tone={p.tone} size="big" />
              <div><h3>{p.fullName}</h3><p className="muted">{ageOf(p)}y · {p.village} · {item.reason}</p></div>
              <button className="btn primary" onClick={() => setInCall(true)}><VideoCamera size={16} weight="bold" /> Connect</button>
            </div>
            <p className="muted small">Connecting captures your camera and microphone. The patient joins from a shareable room link; video drops to audio on a weak network and resumes where it left off.</p>
          </div>
          <div className="glass card form">
            <label className="accept"><input type="checkbox" checked={acceptAria} onChange={(e) => setAcceptAria(e.target.checked)} /><span><b>Accept the ARIA handover into the record</b><br /><span className="muted small">Marks the AI summary as reviewed by you. It stays labelled as AI intake.</span></span></label>
            <label>Chief complaint<input value={form.chief} onChange={(e) => setForm({ ...form, chief: e.target.value })} placeholder="Presenting complaint" /></label>
            <label>Clinical assessment <span className="req">required</span><textarea value={form.assessment} onChange={(e) => setForm({ ...form, assessment: e.target.value })} placeholder="Working diagnosis and clinical reasoning…" rows={3} /></label>
            <label>Notes &amp; advice<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Advice to the patient, safety-netting, red-flag guidance…" rows={2} /></label>
            <div className="form-group">
              <span className="eyebrow"><Pill size={12} weight="fill" /> Prescription</span>
              {form.rx.map((r, i) => (
                <div key={i} className="rx-row">
                  <input value={r.drug} onChange={(e) => setForm({ ...form, rx: form.rx.map((x, j) => (j === i ? { ...x, drug: e.target.value } : x)) })} placeholder="Drug (e.g. Amlodipine)" />
                  <input value={r.strength} onChange={(e) => setForm({ ...form, rx: form.rx.map((x, j) => (j === i ? { ...x, strength: e.target.value } : x)) })} placeholder="Strength" />
                  <input value={r.frequency} onChange={(e) => setForm({ ...form, rx: form.rx.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)) })} placeholder="Frequency" />
                  <button className="ghost small" onClick={() => setForm({ ...form, rx: form.rx.filter((_, j) => j !== i) })} aria-label="Remove medication"><X size={14} /></button>
                </div>
              ))}
              <button className="ghost small" onClick={() => setForm({ ...form, rx: [...form.rx, { drug: "", strength: "", frequency: "" }] })}><Plus size={14} weight="bold" /> Add medication</button>
            </div>
            <div className="form-group">
              <span className="eyebrow"><Flask size={12} weight="fill" /> Tests</span>
              {form.labs.map((t, i) => (
                <div key={i} className="rx-row one">
                  <input value={t} onChange={(e) => setForm({ ...form, labs: form.labs.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="Test (e.g. HbA1c)" />
                  <button className="ghost small" onClick={() => setForm({ ...form, labs: form.labs.filter((_, j) => j !== i) })} aria-label="Remove test"><X size={14} /></button>
                </div>
              ))}
              <button className="ghost small" onClick={() => setForm({ ...form, labs: [...form.labs, ""] })}><Plus size={14} weight="bold" /> Add test</button>
            </div>
            <div className="form-group">
              <label className="accept"><input type="checkbox" checked={form.followUp} onChange={(e) => setForm({ ...form, followUp: e.target.checked })} /><span><b>Schedule a follow-up</b></span></label>
              {form.followUp && (
                <div className="fu-row">
                  <label>In (days)<input type="number" min={1} value={form.inDays} onChange={(e) => setForm({ ...form, inDays: Number(e.target.value) })} /></label>
                  <label>Channel<select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as Channel })}><option value="video">Video</option><option value="audio">Audio</option><option value="chat">Chat</option></select></label>
                  <label className="span2">Instructions<input value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. Review BP diary and lab results" /></label>
                </div>
              )}
            </div>
            <div className="form-foot"><span className="muted small">Filed under {DOCTOR.registrationNo}. Every field is audited.</span><button className="btn primary" disabled={!form.assessment.trim()} onClick={file}><CheckCircle size={16} weight="bold" /> File consultation</button></div>
          </div>
        </div>
        <aside className="consult-side">
          {h && (
            <div className={`glass card handover ${h.suggestedTriage}`}>
              <div className="card-head"><span className="eyebrow">ARIA handover</span><span className="pill">{Math.round(h.aiConfidence * 100)}% confidence</span></div>
              <h4>{h.chiefComplaint}</h4>
              <p className="small">{h.narrative}</p>
              <div className="vitals">{Object.entries(h.vitals).map(([k, v]) => <span key={k}><small>{k.replace("Bpm", "").replace("respRate", "RR").replace("tempC", "°C")}</small>{v}</span>)}</div>
              {h.redFlags.length > 0 && <div className="qbadges left">{h.redFlags.map((r) => <span key={r} className="pill red"><Warning size={12} weight="fill" /> {r}</span>)}</div>}
            </div>
          )}
          {item.source === "alexa" && <div className="glass card"><span className="eyebrow">Source</span><p className="small">Escalated by Alexa+ through nirog-mcp. The rules-based triage, not the model, raised the level.</p></div>}
          <div className="glass card"><span className="eyebrow">Allergies</span><p>{p.allergies.length ? p.allergies.join(", ") : "None recorded"}</p><span className="eyebrow">Current medicines</span><p>{p.medications.length ? p.medications.join(", ") : "None"}</p></div>
        </aside>
      </div>
      {inCall && <CallRoom doctor={{ name: DOCTOR.name, spec: DOCTOR.specialty }} side="doctor" onEnd={() => setInCall(false)} />}
    </div>
  );
}

/* ── Trust log ────────────────────────────────────────────────────────────── */
function Trust() {
  const audit = useDemo((s) => s.audit);
  return (
    <div className="portal-page">
      <div className="portal-greet"><h3><ShieldCheck size={22} weight="duotone" /> Trust log</h3><p className="muted">The client requests, the server decides, and records it. This is the accountable access trail behind every record in Nirog.</p></div>
      <div className="stats three">
        <div className="glass stat"><Eye size={18} /><b>Every read is logged</b><span className="muted small">Opening a chart records who, what and why.</span></div>
        <div className="glass stat"><Lock size={18} /><b>Immutable</b><span className="muted small">Audit entries cannot be edited or deleted.</span></div>
        <div className="glass stat"><Warning size={18} /><b>Break-glass needs a reason</b><span className="muted small">Access without consent is possible but always explained.</span></div>
      </div>
      <div className="glass card"><div className="card-head"><span className="eyebrow">Recent activity</span><span className="muted small">{audit.length} entries</span></div><TrustList events={audit} /></div>
    </div>
  );
}

/* ── Settings ─────────────────────────────────────────────────────────────── */
function Settings() {
  const [mfa, setMfa] = useState(true);
  return (
    <div className="portal-page">
      <div className="portal-greet"><h3>Settings</h3><p className="muted">{DOCTOR.name} · {DOCTOR.specialty} · {DOCTOR.registrationNo}</p></div>
      <div className="settings-grid">
        <div className="glass card"><span className="eyebrow">Consultation languages</span><div className="qbadges left">{DOCTOR.languages.map((l) => <span key={l} className="pill green">{l}</span>)}<span className="pill">+ Add</span></div><p className="muted small">Patients are matched to doctors who speak their language first.</p></div>
        <div className="glass card"><span className="eyebrow">Data source</span><p>nirog-mcp · <span className="muted">mock patients, live memory</span></p><p className="muted small">Switch to Supabase by setting NIROG_DATA_SOURCE on the server. The portal never touches a database directly.</p></div>
        <div className="glass card oncall"><span className="tile-icon small"><Lock size={16} weight="duotone" /></span><div><b>Two-factor authentication</b><p className="muted small">Required for prescribing. Authenticator app, backup codes issued.</p></div><button role="switch" aria-checked={mfa} className={`switch ${mfa ? "on" : ""}`} onClick={() => setMfa(!mfa)}><span /></button></div>
        <div className="glass card"><span className="eyebrow">Clinic</span><p>{DOCTOR.clinic}</p><p className="muted small">Barabanki district, Uttar Pradesh · On-demand pool shared with 2 other doctors.</p></div>
      </div>
    </div>
  );
}

/* ── The window ───────────────────────────────────────────────────────────── */
export function Portal() {
  const tab = useDemo((s) => s.portalTab);
  const setTab = useDemo((s) => s.setPortalTab);
  const date = useMemo(() => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }), []);
  return (
    <section className="portal" id="portal" aria-label="Doctor portal">
      <header className="section-head">
        <p className="eyebrow">Doctor portal · the other chair</p>
        <h2>The same consultation, from the clinician's side.</h2>
        <p className="lede">Consults escalated by Alexa+ land in this queue. Every tool call the agent made is already in the trust log.</p>
      </header>
      <div className="glass window">
        <div className="win-top">
          <div className="win-brand"><span className="mark small">N</span><div><b>{DOCTOR.clinic}</b><small>{date} · {DOCTOR.specialty}</small></div></div>
          <div className="win-user"><span className="avatar blue">DA</span><b>{DOCTOR.name}</b></div>
        </div>
        <div className="win-body">
          <nav className="win-nav" aria-label="Portal">
            {TABS.map((t) => { const Icon = t.icon; return <button key={t.id} aria-current={tab === t.id} onClick={() => setTab(t.id)}><Icon size={18} weight={tab === t.id ? "fill" : "regular"} /><span>{t.label}</span></button>; })}
          </nav>
          <div className="win-main">
            {tab === "dashboard" && <Dashboard />}
            {tab === "patients" && <Patients />}
            {tab === "chart" && <Chart />}
            {tab === "consult" && <Consult />}
            {tab === "trust" && <Trust />}
            {tab === "settings" && <Settings />}
          </div>
        </div>
      </div>
    </section>
  );
}

export type { QueueItem };
