import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarBlank, ChatCircleDots, CheckCircle, ClockCounterClockwise, Eye, Flask, GoogleLogo, House, LinkSimple, Microphone, Pill, ShieldCheck, SignOut, Stethoscope, UserCircle, Warning, Waveform } from "@phosphor-icons/react";
import { fmtDate, fmtTime, initials, timeAgo, toneFor } from "../clinic/data";
import { fetchConfig, loadGis, type AuthConfig } from "../doctor/auth";
import { callTool } from "../mcp";
import { stopSpeaking } from "../speech";
import { useDemo } from "../store";
import { useConversation } from "../voice/useConversation";
import { VoiceBar } from "../voice/VoiceBar";
import { AriaScene } from "./AriaScene";
import { fetchMe, loadPatientSession, patientSession, savePatientSession, serverMode, type Encounter, type Me, type PatientHistory, type PatientSession, type Prescription } from "./auth";

type Tab = "home" | "history" | "medicines" | "talk" | "profile";
const TABS: Array<{ id: Tab; label: string; icon: typeof House }> = [
  { id: "home", label: "Today", icon: House },
  { id: "history", label: "My history", icon: ClockCounterClockwise },
  { id: "medicines", label: "Medicines", icon: Pill },
  { id: "talk", label: "Talk to Nirog", icon: ChatCircleDots },
  { id: "profile", label: "Me", icon: UserCircle },
];

const REGION: Record<string, string> = { lower_back: "Lower back", upper_back: "Upper back", head: "Head", neck: "Neck", chest: "Chest", abdomen: "Stomach", pelvis: "Pelvis", arm: "Arm", leg: "Leg", skin: "Skin", systemic: "Whole body", unknown: "Not placed" };
const TRIAGE_PILL = { emergency: "red", urgent: "gold", routine: "green" } as const;
const DEMO_PATIENTS = [
  { id: "pat_rahul", name: "Rahul Yadav", note: "Back pain that keeps coming back · holds the family account" },
  { id: "pat_sunita", name: "Sunita Devi", note: "Diabetes, tingling feet" },
  { id: "pat_imran", name: "Imran Khan", note: "Asthma; a wheeze is serious for him" },
  { id: "pat_lakshmi", name: "Lakshmi Bai", note: "Knees, on Rahul's family account" },
];

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
const firstName = (n: string) => n.split(" ")[0];
const addDays = (iso: string, d: number) => new Date(new Date(iso).getTime() + d * 86_400_000);
/** Medicines from the newest care plan that are still running, with days left. */
function activeRx(encounters: Encounter[], now = Date.now()): Array<Prescription & { since: string; left?: number }> {
  const last = encounters[0];
  if (!last) return [];
  return last.prescriptions
    .map((r) => ({ ...r, since: last.startedAt, left: r.durationDays ? Math.ceil((new Date(last.startedAt).getTime() + r.durationDays * 86_400_000 - now) / 86_400_000) : undefined }))
    .filter((r) => r.left === undefined || r.left > 0);
}

/**
 * The patient's own page at #/patient. Gate one is Google (or, on the public demo, a fictional patient's chair). Gate
 * two, once, is the clinic's link code that ties the account to one record. Everything after that is read with a
 * consent token scoped to that record, the same token Alexa+ would carry for this household.
 */
export function PatientPage({ onBack }: { onBack: () => void }) {
  const [session, setSession] = useState<PatientSession | null>(loadPatientSession);
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (s: PatientSession | null = session) => {
    if (!s) return;
    try {
      const m = await fetchMe(s.token);
      if (!m) {
        // The session is no longer accepted: back to the gate, with nothing shown.
        savePatientSession(null);
        setSession(null);
        setMe(null);
        return;
      }
      setMe(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    void refresh(session).finally(() => setLoading(false));
  }, [session, refresh]);

  const signOut = () => {
    savePatientSession(null);
    window.google?.accounts.id.disableAutoSelect();
    setSession(null);
    setMe(null);
  };

  if (!session) return <Gate onBack={onBack} onEnter={(s) => { savePatientSession(s); setSession(s); }} />;
  return <Portal session={session} me={me} loading={loading} error={error} refresh={() => void refresh()} signOut={signOut} />;
}

/* ── Gate ─────────────────────────────────────────────────────────────────── */
type Identity = { idToken?: string; demo?: { patientId?: string; email?: string; name?: string }; email: string; name: string; picture?: string };

function Gate({ onBack, onEnter }: { onBack: () => void; onEnter: (s: PatientSession) => void }) {
  const [mode, setMode] = useState<"loading" | "public-demo" | "open" | "google">("loading");
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [step, setStep] = useState<"google" | "link">("google");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [code, setCode] = useState("");
  const [demoEmail, setDemoEmail] = useState("rahul.yadav@example.in");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gButton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([serverMode(), fetchConfig().catch(() => null)]).then(([m, c]) => { setMode(m); setConfig(c); });
  }, []);

  useEffect(() => {
    if (step !== "google" || !config?.googleClientId || !gButton.current) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !window.google || !gButton.current) return;
        window.google.accounts.id.initialize({ client_id: config.googleClientId!, ux_mode: "popup", callback: ({ credential }) => void afterIdentity({ idToken: credential, ...decode(credential) }) });
        window.google.accounts.id.renderButton(gButton.current, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 320 });
      })
      .catch((e) => setError(e.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, config]);

  function decode(jwt: string): { email: string; name: string; picture?: string } {
    try {
      const p = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return { email: p.email, name: p.name ?? p.email, picture: p.picture };
    } catch {
      return { email: "", name: "" };
    }
  }

  async function afterIdentity(id: Identity, linkCode?: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await patientSession({ idToken: id.idToken, demo: id.demo }, linkCode);
      setIdentity(id);
      if (r.status === "linked") onEnter({ token: r.token, patientId: r.patient.id, name: r.patient.fullName, picture: id.picture });
      else setStep("link");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="doctor-page">
      <header className="topbar glass">
        <div className="brand"><span className="mark"><Waveform size={16} weight="bold" /></span><div><b>Nirog</b><small>Your health record</small></div></div>
        <button className="btn small" onClick={onBack}><ArrowLeft size={14} weight="bold" /> Back to Nirog</button>
      </header>
      <main className="gate">
        <div className="glass gate-card">
          <ol className="gate-steps" aria-label="Sign-in steps">
            <li className={step === "google" ? "is-current" : "done"}><GoogleLogo size={16} weight="bold" /> Google</li>
            <li className={step === "link" ? "is-current" : ""}><LinkSimple size={16} weight="bold" /> Link once</li>
            <li><ShieldCheck size={16} weight="bold" /> Your record</li>
          </ol>

          {mode === "loading" && <p className="muted">Checking sign-in…</p>}

          {mode !== "loading" && step === "google" && (
            <>
              <h1>Your health story, in one place.</h1>
              <p className="muted">What you told the clinic, what the doctor decided, and the medicines you are on. Only you, and the doctors you have allowed, can read it.</p>
              {config?.googleClientId && <div className="gbtn" ref={gButton} />}
              {mode === "public-demo" && (
                <div className="setup" style={{ borderColor: "rgba(61, 214, 195, 0.35)", background: "rgba(61, 214, 195, 0.06)" }}>
                  <p className="eyebrow"><Eye size={12} weight="fill" /> Public demo · fictional patients</p>
                  <p className="small muted">Nobody here is real. Sit in one patient's chair to see what they would see. The record you open is the same one the doctor portal and Alexa+ work from.</p>
                  <ul className="pick-grid">
                    {DEMO_PATIENTS.map((p) => (
                      <li key={p.id}>
                        <button disabled={busy} onClick={() => void afterIdentity({ demo: { patientId: p.id }, email: "", name: p.name })}>
                          <span className={`avatar ${toneFor(p.id)}`}>{initials(p.name)}</span>
                          <span><b>{p.name}</b><small>{p.note}</small></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {mode === "open" && (
                <div className="setup">
                  <p className="eyebrow red"><Warning size={12} weight="fill" /> Development server · no Google client id</p>
                  <form className="demo-form" onSubmit={(e) => { e.preventDefault(); void afterIdentity({ demo: { email: demoEmail, name: demoEmail.split("@")[0] }, email: demoEmail, name: demoEmail }); }}>
                    <label>Demo account (stands in for Google)<input value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} type="email" required /></label>
                    <button className="btn primary" type="submit" disabled={busy}><GoogleLogo size={16} weight="bold" /> Continue as demo account</button>
                  </form>
                  <p className="small muted">Link codes for the seeded patients: RY-4821 Rahul · SD-7304 Sunita · MS-1197 Meena · AY-6630 Aarav · IK-2258 Imran · LB-9045 Lakshmi.</p>
                </div>
              )}
              {mode === "google" && !config?.googleClientId && <p className="gate-error">This server has no sign-in configured.</p>}
            </>
          )}

          {step === "link" && identity && (
            <form className="verify-form" onSubmit={(e) => { e.preventDefault(); void afterIdentity(identity, code); }}>
              <h1>Link your record, once.</h1>
              <p className="muted">Signed in as <b>{identity.email || identity.name}</b>. This account is not yet tied to a clinic record. Enter the link code your clinic gave you. It works once, and you will not be asked again.</p>
              <label>Clinic link code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. RY-4821" autoComplete="one-time-code" required /></label>
              <p className="small muted"><ShieldCheck size={12} weight="fill" /> Linking is written to the trust log, and your clinic can see that the record was claimed.</p>
              <div className="gate-actions">
                <button type="button" className="btn" onClick={() => setStep("google")}>Use another account</button>
                <button type="submit" className="btn primary" disabled={busy}><CheckCircle size={16} weight="bold" /> {busy ? "Linking…" : "Link and open my record"}</button>
              </div>
            </form>
          )}
          {error && <p className="gate-error" role="alert">{error}</p>}
        </div>
        <p className="muted small gate-foot">Signing in does not share anything with a doctor. Doctors see a record only when you, or your clinic on your behalf, have granted a care relationship.</p>
      </main>
    </div>
  );
}

/* ── Portal ───────────────────────────────────────────────────────────────── */
function Portal({ session, me, loading, error, refresh, signOut }: { session: PatientSession; me: Me | null; loading: boolean; error: string | null; refresh: () => void; signOut: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const [whoId, setWhoId] = useState(session.patientId);
  const who = me?.patients.find((p) => p.record.id === whoId) ?? me?.patients[0] ?? null;
  const holder = me?.patients.find((p) => p.record.id === session.patientId)?.record;
  const convo = useConversation({ patientId: who?.record.id ?? session.patientId, token: session.token });
  const level = useDemo((s) => s.level);
  // The conversation's tool results are the record changing: re-read it after each spoken reply.
  const turns = useDemo((s) => s.turns.length);
  useEffect(() => { if (turns) refresh(); }, [turns]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving the page ends the conversation: the landing page must not inherit a patient's turns, nor a half-spoken line.
  useEffect(() => () => { stopSpeaking(); useDemo.getState().reset(); }, []);

  return (
    <div className={`doctor-page level-${level}`}>
      <header className="topbar glass">
        <div className="brand"><span className="mark"><Waveform size={16} weight="bold" /></span><div><b>Nirog</b><small>Your health record</small></div></div>
        <div className="topbar-right">
          <span className="who-pill">{session.picture ? <img src={session.picture} alt="" /> : <span className={`avatar ${toneFor(session.patientId)}`}>{initials(session.name)}</span>}<span>{session.name}<small>{holder?.relationship === "self" && (me?.patients.length ?? 0) > 1 ? `Family account · ${me!.patients.length} people` : "Patient"}</small></span></span>
          <button className="btn small" onClick={signOut}><SignOut size={14} weight="bold" /> Sign out</button>
        </div>
      </header>
      <main className="patient-main">
        <nav className="ptabs glass" aria-label="Your record">
          {TABS.map((t) => { const Icon = t.icon; return <button key={t.id} onClick={() => setTab(t.id)} aria-current={tab === t.id}><Icon size={16} weight={tab === t.id ? "fill" : "regular"} /> {t.label}</button>; })}
        </nav>
        {me && me.patients.length > 1 && (
          <div className="who-switch" role="group" aria-label="Whose record">
            {me.patients.map((p) => (
              <button key={p.record.id} aria-pressed={p.record.id === who?.record.id} onClick={() => setWhoId(p.record.id)}>
                <span className={`avatar ${toneFor(p.record.id)}`}>{initials(p.record.fullName)}</span>{p.record.fullName}{p.record.relationship !== "self" && <small className="muted">· {p.record.relationship}</small>}
              </button>
            ))}
          </div>
        )}
        {error && <p className="gate-error" role="alert">{error}</p>}
        {!who && loading && <p className="muted">Opening your record…</p>}
        {who && tab === "home" && <Home p={who} go={setTab} />}
        {who && tab === "history" && <History p={who} />}
        {who && tab === "medicines" && <Medicines p={who} token={session.token} refresh={refresh} />}
        {who && tab === "talk" && <Talk p={who} convo={convo} token={session.token} />}
        {who && tab === "profile" && <Profile p={who} me={me!} signOut={signOut} />}
      </main>
      {tab === "talk" && <VoiceBar convo={convo} quiet />}
    </div>
  );
}

/* ── Today ────────────────────────────────────────────────────────────────── */
function Home({ p, go }: { p: PatientHistory; go: (t: Tab) => void }) {
  const last = p.encounters[0];
  const rx = activeRx(p.encounters);
  const followUp = last?.followUp ? addDays(last.startedAt, last.followUp.inDays) : null;
  const waiting = p.consults[0];
  const saidLast = p.complaints?.[0];
  const todayDoses = p.doses.filter((d) => new Date(d.takenAt).toDateString() === new Date().toDateString());
  return (
    <>
      <div className="pgreet">
        <div><h1>{greeting()}, {firstName(p.record.fullName)}.</h1><p>{p.record.conditions.length ? `On record: ${p.record.conditions.join(", ")}.` : "No long-term conditions on record."} {p.record.allergies.length ? `Allergic to ${p.record.allergies.join(", ")}.` : ""}</p></div>
        <div className="actions">
          <button className="btn primary" onClick={() => go("talk")}><Microphone size={16} weight="fill" /> Tell Nirog what hurts</button>
          <button className="btn" onClick={() => go("history")}><ClockCounterClockwise size={16} weight="bold" /> My history</button>
        </div>
      </div>
      <div className="home-grid">
        {waiting && (
          <div className={`glass card span2 ${waiting.triage === "emergency" ? "alert" : ""}`}>
            <span className="eyebrow"><Stethoscope size={12} weight="fill" /> A doctor is being asked to see you</span>
            <p className="big">{waiting.reason}</p>
            <p className="muted small">Raised {timeAgo(waiting.at)} · <span className={`pill ${TRIAGE_PILL[waiting.triage as keyof typeof TRIAGE_PILL] ?? ""}`}>{waiting.triage}</span>{waiting.triage === "emergency" ? " · If you feel worse, call 108 now." : " · The doctor sees your words exactly as you said them."}</p>
          </div>
        )}
        <div className="glass card">
          <span className="eyebrow"><Pill size={12} weight="fill" /> Medicines today</span>
          {rx.length === 0 && !p.record.currentMedications.length ? <p className="muted">No medicines on your current plan.</p> : (
            <>
              {rx.map((r) => <p key={r.id} className="big">{r.drug} {r.strength}<br /><small className="muted small">{r.frequency ?? ""}{r.left ? ` · ${r.left} days left` : ""}</small></p>)}
              {!rx.length && p.record.currentMedications.map((m) => <p key={m} className="big">{m}</p>)}
              <p className="muted small">{todayDoses.length ? `${todayDoses.length} dose${todayDoses.length === 1 ? "" : "s"} logged today.` : "Nothing logged today yet."}</p>
            </>
          )}
          <button className="ghost small" onClick={() => go("medicines")}>Medicines and doses</button>
        </div>
        <div className="glass card">
          <span className="eyebrow"><CalendarBlank size={12} weight="fill" /> Next visit</span>
          {followUp ? <><p className="big">{fmtDate(followUp.toISOString())}</p><p className="muted small">{last!.followUp!.channel} follow-up{last!.followUp!.instructions ? ` · ${last!.followUp!.instructions}` : ""}{followUp.getTime() < Date.now() ? " · this date has passed" : ""}</p></> : <p className="muted">No follow-up planned.</p>}
        </div>
        <div className="glass card">
          <span className="eyebrow"><Stethoscope size={12} weight="fill" /> Last consultation</span>
          {last ? <><p className="big">{last.chiefComplaint || "Consultation"}</p><p className="muted small">{fmtDate(last.startedAt)} · {last.assessment}</p></> : <p className="muted">No consultation on record yet.</p>}
        </div>
        <div className="glass card span2">
          <span className="eyebrow"><ChatCircleDots size={12} weight="fill" /> The last thing you told Nirog</span>
          {p.complaints === null ? <p className="muted">Your earlier words could not be read just now.</p> : saidLast ? <><p className="big"><q>{saidLast.rawText}</q></p><p className="muted small">{fmtDate(saidLast.occurredAt)} · placed under {REGION[saidLast.bodyRegion] ?? saidLast.bodyRegion}</p></> : <p className="muted">Nothing recorded yet. Say what hurts, in your own words, and it stays yours.</p>}
        </div>
        <div className="glass card">
          <span className="eyebrow"><Eye size={12} weight="fill" /> Who looked</span>
          <p className="big">{p.access.length}</p>
          <p className="muted small">entries in the trust log about you{p.access[0] ? `, last ${timeAgo(p.access[0].at)}` : ""}.</p>
          <button className="ghost small" onClick={() => go("profile")}>See every one</button>
        </div>
      </div>
    </>
  );
}

/* ── History ──────────────────────────────────────────────────────────────── */
type Ev = { id: string; at: string; kind: "said" | "handover" | "doctor" | "dose"; region?: string; triage?: "emergency" | "urgent" | "routine"; title?: string; quote?: string; body?: string; tags?: string[] };

function History({ p }: { p: PatientHistory }) {
  const [kinds, setKinds] = useState<Set<Ev["kind"]>>(new Set(["said", "handover", "doctor", "dose"]));
  const [region, setRegion] = useState<string | null>(null);
  const events = useMemo<Ev[]>(() => {
    const out: Ev[] = [];
    for (const c of p.complaints ?? []) out.push({ id: c.id, at: c.occurredAt, kind: "said", region: c.bodyRegion, quote: c.rawText });
    for (const h of p.handovers) out.push({ id: h.id, at: h.createdAt, kind: "handover", triage: h.triage, title: h.chiefComplaint, body: h.narrative, tags: [...h.symptoms, ...h.redFlags.map((r) => `⚠ ${r}`)] });
    for (const e of p.encounters) out.push({ id: e.id, at: e.startedAt, kind: "doctor", title: e.chiefComplaint || "Consultation", body: e.assessment + (e.clinicalNotes ? ` ${e.clinicalNotes}` : ""), tags: [...e.prescriptions.map((r) => `${r.drug} ${r.strength ?? ""} · ${r.frequency ?? ""}`.trim()), ...e.labRequests.map((l) => `Test: ${l.test}`), ...(e.followUp ? [`Follow-up in ${e.followUp.inDays} days`] : [])] });
    for (const d of p.doses) out.push({ id: d.id, at: d.takenAt, kind: "dose", title: `${d.drug} taken`, body: `${d.slot} dose, logged at ${fmtTime(d.takenAt)}` });
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [p]);
  const regions = useMemo(() => [...new Set((p.complaints ?? []).map((c) => c.bodyRegion))], [p]);
  const shown = events.filter((e) => kinds.has(e.kind) && (!region || e.region === region));
  const toggle = (k: Ev["kind"]) => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const LABEL: Record<Ev["kind"], string> = { said: "You said", handover: "Summary for the doctor", doctor: "The doctor", dose: "Dose logged" };

  return (
    <>
      <div className="pgreet"><div><h1>Your history.</h1><p>Everything in order, newest first. Your words are kept exactly as you said them; summaries and the doctor's notes are labelled as theirs.</p></div></div>
      <div className="hist">
        <ol className="hist-list">
          {shown.length === 0 && <li className="glass"><span className="when" /><div className="what"><p className="muted">{p.complaints === null && kinds.has("said") ? "Your earlier words could not be read just now; the rest is shown." : "Nothing here yet."}</p></div></li>}
          {shown.map((e) => (
            <li key={e.id} className={`glass ${e.kind} ${e.triage ?? ""}`}>
              <span className="when"><b>{fmtDate(e.at)}</b>{fmtTime(e.at)}</span>
              <div className="what">
                <div className="head">
                  <span className={`src ${e.kind}`}>{LABEL[e.kind]}</span>
                  {e.region && <span className="pill">{REGION[e.region] ?? e.region}</span>}
                  {e.triage && <span className={`pill ${TRIAGE_PILL[e.triage]}`}>{e.triage}</span>}
                </div>
                {e.quote && <q>{e.quote}</q>}
                {e.title && <b>{e.title}</b>}
                {e.body && <p>{e.body}</p>}
                {e.tags && e.tags.length > 0 && <div className="qbadges left" style={{ marginTop: 2 }}>{e.tags.map((t) => <span key={t} className="pill">{t}</span>)}</div>}
              </div>
            </li>
          ))}
        </ol>
        <aside className="filters">
          <div className="glass card">
            <span className="eyebrow">Show</span>
            <div className="chipset">{(["said", "handover", "doctor", "dose"] as Ev["kind"][]).map((k) => <button key={k} aria-pressed={kinds.has(k)} onClick={() => toggle(k)}>{LABEL[k]}</button>)}</div>
          </div>
          <div className="glass card">
            <span className="eyebrow">Where it hurt</span>
            {regions.length === 0 ? <p className="muted small">Each thing you say is placed on the body, so you can look back by place.</p> : (
              <div className="chipset">
                <button aria-pressed={region === null} onClick={() => setRegion(null)}>Everywhere</button>
                {regions.map((r) => <button key={r} aria-pressed={region === r} onClick={() => setRegion(region === r ? null : r)}>{REGION[r] ?? r}</button>)}
              </div>
            )}
            <p className="muted small">A place is where you felt something, not what it is. Only a doctor says what it is.</p>
          </div>
          <div className="glass card">
            <span className="eyebrow"><ShieldCheck size={12} weight="fill" /> Provenance</span>
            <p className="muted small"><span className="src said">You said</span> is your sentence, unedited. <span className="src handover">Summary</span> is assembled by rules from your words for the doctor. <span className="src doctor">The doctor</span> wrote and signed their own notes.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

/* ── Medicines ────────────────────────────────────────────────────────────── */
function Medicines({ p, token, refresh }: { p: PatientHistory; token: string; refresh: () => void }) {
  const rx = activeRx(p.encounters);
  const [toast, setToast] = useState<{ text: string; refused?: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, typeof p.doses>();
    for (const d of [...p.doses].sort((a, b) => b.takenAt.localeCompare(a.takenAt))) { const k = fmtDate(d.takenAt); m.set(k, [...(m.get(k) ?? []), d]); }
    return [...m.entries()];
  }, [p.doses]);

  const took = async (drug: string) => {
    setBusy(drug);
    setToast(null);
    // The same MCP tool Alexa+ calls, with the same refusals: a second dose in the same slot or within four hours is not logged.
    const r = await callTool({ endpoint: `${location.origin}/mcp`, token, patientId: p.record.id, language: "en" }, "log_dose_taken", { patient_id: p.record.id, medicine: drug, language: "en" });
    setBusy(null);
    if (r.error) return setToast({ text: r.error, refused: true });
    const res = r.result as { logged: boolean; spoken?: string; reason?: string };
    setToast({ text: res.spoken ?? (res.logged ? `${drug} logged.` : res.reason ?? "Not logged."), refused: !res.logged });
    refresh();
  };

  return (
    <>
      <div className="pgreet"><div><h1>Your medicines.</h1><p>What the doctor prescribed, and the doses you have logged. Logging records that you said you took it; it is not proof.</p></div></div>
      <div className="hist">
        <div style={{ display: "grid", gap: 14 }}>
          {toast && <p className={`toast ${toast.refused ? "refused" : ""}`} role="status">{toast.text}</p>}
          <ul className="rx-list">
            {rx.length === 0 && p.record.currentMedications.length === 0 && <li className="glass"><span /><div><b>No medicines on your plan.</b><p>When a doctor files a care plan, it appears here and Nirog can remind you about it.</p></div><span /></li>}
            {rx.map((r) => (
              <li key={r.id} className="glass">
                <span className="tile-icon small"><Pill size={16} weight="fill" /></span>
                <div><b>{r.drug} {r.strength}</b><p>{[r.frequency, r.left ? `${r.left} days left` : r.durationDays ? `${r.durationDays} days` : null, `from ${fmtDate(r.since)}`].filter(Boolean).join(" · ")}</p></div>
                <button className="btn small" disabled={busy !== null} onClick={() => void took(r.drug)}><CheckCircle size={14} weight="bold" /> {busy === r.drug ? "Logging…" : "I took it"}</button>
              </li>
            ))}
            {rx.length === 0 && p.record.currentMedications.map((m) => (
              <li key={m} className="glass"><span className="tile-icon small"><Pill size={16} weight="fill" /></span><div><b>{m}</b><p>On your record, from before the clinic's first care plan.</p></div><button className="btn small" disabled={busy !== null} onClick={() => void took(m.split(" ")[0])}><CheckCircle size={14} weight="bold" /> {busy === m.split(" ")[0] ? "Logging…" : "I took it"}</button></li>
            ))}
          </ul>
          {p.encounters[0]?.labRequests.length ? (
            <div className="glass card"><span className="eyebrow"><Flask size={12} weight="fill" /> Tests the doctor asked for</span>{p.encounters[0].labRequests.map((l) => <p key={l.id}>{l.test} <span className="pill">{l.priority}</span></p>)}</div>
          ) : null}
        </div>
        <aside className="filters">
          <div className="glass card">
            <span className="eyebrow">Doses logged · 90 days</span>
            {byDay.length === 0 ? <p className="muted small">No doses logged yet. Say "I took my tablet" to Nirog, or press "I took it".</p> : (
              <div className="dose-days">{byDay.map(([day, ds]) => <div key={day}><span className="d">{day}</span><span>{ds.map((d) => `${d.drug} (${d.slot}, ${fmtTime(d.takenAt)})`).join(", ")}</span></div>)}</div>
            )}
          </div>
          <div className="glass card"><span className="eyebrow"><ShieldCheck size={12} weight="fill" /> Guarded</span><p className="muted small">Nirog refuses to log the same dose twice in one slot, or two doses less than four hours apart. The refusal is spoken, and nothing is written.</p></div>
        </aside>
      </div>
    </>
  );
}

/* ── Talk ─────────────────────────────────────────────────────────────────── */
function Talk({ p, convo, token }: { p: PatientHistory; convo: ReturnType<typeof useConversation>; token: string }) {
  const { turns, traces, reset } = useDemo();
  const { stop, settings, handle, phase } = convo;
  const busy = phase === "thinking" || phase === "listening";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: "smooth" }); }, [turns.length]);
  const steps = traces.filter((t) => t.tool !== "alexa+ agent").slice(0, 3);
  const TRY = settings.language === "hi"
    ? ["कमर में फिर से दर्द हो रहा है, तीन हफ़्ते हो गए", "आज रात कौन सी दवा लेनी है", "मैंने दवा ले ली"]
    : ["the ache is back again, it's been three weeks now", "what medicines do I take tonight", "I took my tablet"];
  return (
    <>
      <div className="pgreet"><div><h1>Talk to Nirog.</h1><p>Say what hurts, in Hindi or English. Your words go on your record exactly as you say them. A serious symptom is passed to a doctor at once.</p></div></div>
      <div className="talk-pane">
        <AriaScene token={token} />
        <div className="glass card convo-card">
          <div className="card-head"><span className="eyebrow">Speaking for {p.record.fullName}</span><button className="ghost" onClick={() => { stop(); reset(); }}>Start over</button></div>
          <div className="convo" ref={ref} aria-live="polite">
            {turns.length === 0 && (
              <div className="tries" lang={settings.language}>
                <p className="muted small">Things people say.</p>
                {TRY.map((t) => <button key={t} className="try" onClick={() => void handle(t)} disabled={busy}><span className="try-say">{t}</span></button>)}
              </div>
            )}
            {turns.map((t) => <div key={t.id} className={`turn ${t.role} ${t.level ?? ""}`}><span className="who">{t.role === "user" ? "You" : "Nirog"}</span><span className="what">{t.text}</span></div>)}
          </div>
          {steps.length > 0 && <p className="muted small" style={{ marginTop: 10 }}>What just happened: {steps.map((s) => s.error ? `${s.tool} refused` : s.tool.replace(/_/g, " ")).join(", ")}.</p>}
        </div>
      </div>
    </>
  );
}

/* ── Me ───────────────────────────────────────────────────────────────────── */
function Profile({ p, me, signOut }: { p: PatientHistory; me: Me; signOut: () => void }) {
  const r = p.record;
  return (
    <>
      <div className="pgreet"><div><h1>{r.fullName}.</h1><p>Your record, and who has looked at it.</p></div><button className="btn" onClick={signOut}><SignOut size={16} weight="bold" /> Sign out</button></div>
      <div className="hist">
        <div className="glass card">
          <span className="eyebrow"><Eye size={12} weight="fill" /> Who looked at my record</span>
          <p className="muted small">Every read and every change is written to a log that cannot be edited or deleted, with who did it and why.</p>
          {p.access.length === 0 ? <p className="muted">No entries yet.</p> : (
            <ul className="access-list">
              {p.access.map((a) => <li key={a.id}><div><p><b>{a.action}</b> · {a.actorName}</p>{a.reason && <p className="muted small">{a.reason}</p>}</div><span className="muted small">{fmtDate(a.at)}<br />{fmtTime(a.at)}</span></li>)}
            </ul>
          )}
        </div>
        <aside className="filters">
          <div className="glass card">
            <span className="eyebrow">On record</span>
            <dl className="kv">
              <dt>Language</dt><dd>{r.preferredLanguage}</dd>
              <dt>Conditions</dt><dd>{r.conditions.length ? r.conditions.join(", ") : "None recorded"}</dd>
              <dt>Allergies</dt><dd>{r.allergies.length ? r.allergies.join(", ") : "None recorded"}</dd>
              <dt>Account</dt><dd>{r.relationship === "self" ? "You hold this account" : `On a family account, as ${r.relationship}`}</dd>
              {me.patients.length > 1 && <><dt>Family</dt><dd>{me.patients.filter((x) => x.record.id !== r.id).map((x) => x.record.fullName).join(", ")}</dd></>}
            </dl>
            <p className="muted small">Identity, relationships and consent are changed by the clinic, not from this page.</p>
          </div>
          <div className="glass card"><span className="eyebrow"><ShieldCheck size={12} weight="fill" /> Session</span><p className="muted small">Signed in until {fmtDate(new Date(me.expiresAt * 1000).toISOString())}. Signing out removes the session from this device.</p></div>
        </aside>
      </div>
    </>
  );
}
