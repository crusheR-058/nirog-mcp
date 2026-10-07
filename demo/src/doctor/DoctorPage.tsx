import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle, GoogleLogo, IdentificationCard, Lock, ShieldCheck, SignOut, Waveform } from "@phosphor-icons/react";
import { PortalWindow } from "../sections/Portal";
import { useDemo } from "../store";
import { fetchConfig, loadGis, loadSession, saveSession, startSession, verifyDoctor, type AuthConfig, type DoctorProfile } from "./auth";

type Step = "loading" | "google" | "verify" | "portal";
type Identity = { idToken?: string; demo?: { email: string; name: string }; email: string; name: string; picture?: string };

/**
 * The dedicated doctor page at #/doctor. Gate one is Google. Gate two, once per doctor,
 * is the registration number and clinic invite code. After that the signed session on
 * this device lets Google alone open the portal.
 */
export function DoctorPage({ onBack }: { onBack: () => void }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [doctor, setDoctor] = useState<DoctorProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState("");
  const [code, setCode] = useState("");
  const [demoEmail, setDemoEmail] = useState("ananya.rao@nirog.health");
  const gButton = useRef<HTMLDivElement>(null);
  const setDoctorIdentity = useDemo((s) => s.setDoctor);
  const addAudit = useDemo((s) => s.addAudit);

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c);
        setStep("google");
      })
      .catch((e) => {
        setError(e.message);
        setStep("google");
      });
  }, []);

  // Render the Google button once we know the client id.
  useEffect(() => {
    if (step !== "google" || !config?.googleClientId || !gButton.current) return;
    let cancelled = false;
    loadGis()
      .then(() => {
        if (cancelled || !window.google || !gButton.current) return;
        window.google.accounts.id.initialize({
          client_id: config.googleClientId!,
          ux_mode: "popup",
          callback: ({ credential }) => void afterGoogle({ idToken: credential, ...decode(credential) }),
        });
        window.google.accounts.id.renderButton(gButton.current, { theme: "filled_black", size: "large", shape: "pill", text: "signin_with", width: 320 });
      })
      .catch((e) => setError(e.message));
    return () => {
      cancelled = true;
    };
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

  async function afterGoogle(id: Identity) {
    setBusy(true);
    setError(null);
    try {
      const r = await startSession({ idToken: id.idToken, demo: id.demo });
      setIdentity(id);
      if (r.status === "verified" && r.session && r.doctor) {
        saveSession(r.session);
        enter(r.doctor);
      } else {
        setStep("verify");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!identity) return;
    setBusy(true);
    setError(null);
    try {
      const r = await verifyDoctor({ idToken: identity.idToken, demo: identity.demo }, reg, code);
      if (r.session && r.doctor) {
        saveSession(r.session);
        addAudit({ actorName: r.doctor.name, action: "Verified identity", target: "Doctor portal", reason: `Google ${identity.email} bound to ${r.doctor.registrationNo}` });
        enter(r.doctor);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function enter(d: DoctorProfile) {
    setDoctor(d);
    setDoctorIdentity({ name: d.name, email: d.email, specialty: d.specialty, picture: d.picture, registrationNo: d.registrationNo });
    addAudit({ actorName: d.name, action: "Signed in", target: "Doctor portal", reason: "Google sign-in" });
    setStep("portal");
  }

  function signOut() {
    saveSession(null);
    window.google?.accounts.id.disableAutoSelect();
    if (doctor) addAudit({ actorName: doctor.name, action: "Signed out", target: "Doctor portal" });
    setDoctorIdentity(null);
    setDoctor(null);
    setIdentity(null);
    setStep("google");
  }

  const remembered = Boolean(loadSession());

  if (step === "portal" && doctor) {
    return (
      <div className="doctor-page">
        <header className="topbar glass">
          <div className="brand"><span className="mark"><Waveform size={16} weight="bold" /></span><div><b>{doctor.clinic}</b><small>Doctor portal · {doctor.specialty}</small></div></div>
          <div className="topbar-right">
            <span className="who-pill">{doctor.picture ? <img src={doctor.picture} alt="" /> : <span className="avatar blue">{doctor.name.split(" ").map((w) => w[0]).slice(1, 3).join("")}</span>}<span>{doctor.name}<small>{doctor.email}</small></span></span>
            <button className="btn small" onClick={signOut}><SignOut size={14} weight="bold" /> Sign out</button>
          </div>
        </header>
        <main className="doctor-main">
          <PortalWindow full />
        </main>
      </div>
    );
  }

  return (
    <div className="doctor-page">
      <header className="topbar glass">
        <div className="brand"><span className="mark"><Waveform size={16} weight="bold" /></span><div><b>Nirog Rural Care Network</b><small>Doctor portal</small></div></div>
        <button className="btn small" onClick={onBack}><ArrowLeft size={14} weight="bold" /> Back to Nirog</button>
      </header>
      <main className="gate">
        <div className="glass gate-card">
          <ol className="gate-steps" aria-label="Sign-in steps">
            <li className={step === "google" ? "is-current" : step !== "loading" ? "done" : ""}><GoogleLogo size={16} weight="bold" /> Google</li>
            <li className={step === "verify" ? "is-current" : ""}><IdentificationCard size={16} weight="bold" /> Verify once</li>
            <li><ShieldCheck size={16} weight="bold" /> Portal</li>
          </ol>

          {step === "loading" && <p className="muted">Checking sign-in configuration…</p>}

          {step === "google" && (
            <>
              <h1>Sign in to the clinic.</h1>
              <p className="muted">Doctors sign in with Google. {remembered ? "This device is already verified, so Google is all you need." : "The first time, you will also verify your registration once."}</p>
              {config?.googleClientId ? (
                <div className="gbtn" ref={gButton} />
              ) : (
                <div className="setup">
                  <p className="eyebrow red"><Lock size={12} weight="fill" /> Google sign-in not configured</p>
                  <p className="small">Set <code>GOOGLE_CLIENT_ID</code> on the server to a Web OAuth client from Google Cloud Console, with this origin under Authorized JavaScript origins.</p>
                  {config?.demoSignIn && (
                    <form className="demo-form" onSubmit={(e) => { e.preventDefault(); void afterGoogle({ demo: { email: demoEmail, name: "Dr. Ananya Rao" }, email: demoEmail, name: "Dr. Ananya Rao" }); }}>
                      <label>Demo Google account (open dev server only)<input value={demoEmail} onChange={(e) => setDemoEmail(e.target.value)} type="email" required /></label>
                      <button className="btn primary" type="submit" disabled={busy}><GoogleLogo size={16} weight="bold" /> Continue as demo account</button>
                    </form>
                  )}
                </div>
              )}
            </>
          )}

          {step === "verify" && identity && (
            <form onSubmit={onVerify} className="verify-form">
              <h1>Verify once.</h1>
              <p className="muted">Signed in as <b>{identity.email}</b>. Bind it to your clinic registration. You will not be asked again on this device.</p>
              <label>Medical registration number (HPR)<input value={reg} onChange={(e) => setReg(e.target.value)} placeholder="HPR-KA-2019-44817" autoComplete="off" required /></label>
              <label>Clinic invite code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder={config?.inviteHint ? `e.g. ${config.inviteHint}` : "From your clinic admin"} autoComplete="off" required /></label>
              <p className="small muted"><ShieldCheck size={12} weight="fill" /> Verification is written to the trust log with who, what and why.</p>
              <div className="gate-actions">
                <button type="button" className="btn" onClick={() => setStep("google")}>Use another account</button>
                <button type="submit" className="btn primary" disabled={busy}><CheckCircle size={16} weight="bold" /> {busy ? "Verifying…" : "Verify and open the portal"}</button>
              </div>
            </form>
          )}

          {error && <p className="gate-error" role="alert">{error}</p>}
        </div>
        <p className="muted small gate-foot">Registration numbers on the allowlist tonight: HPR-KA-2019-44817 (Dr. Rao), HPR-UP-2015-10233 (Dr. Sheikh), HPR-KL-2020-77810 (Dr. Menon).</p>
      </main>
    </div>
  );
}
