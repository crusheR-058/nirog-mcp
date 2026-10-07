import { Star, VideoCamera } from "@phosphor-icons/react";
import { DOCTORS } from "../clinic/data";
import { useDemo } from "../store";
import { CallRoom } from "../clinic/CallRoom";

export function Doctors() {
  const callDoctorId = useDemo((s) => s.callDoctorId);
  const setCallDoctor = useDemo((s) => s.setCallDoctor);
  const addAudit = useDemo((s) => s.addAudit);
  const doctor = DOCTORS.find((d) => d.id === callDoctorId) ?? null;

  const call = (id: string) => {
    const d = DOCTORS.find((x) => x.id === id)!;
    setCallDoctor(id);
    addAudit({ actorName: "Rahul Yadav", action: "Requested consult", target: d.name, reason: "Patient-initiated call from the case file" });
  };

  return (
    <section className="doctors" id="doctors" aria-label="Doctors">
      <header className="section-head">
        <p className="eyebrow">Patient app · who to call</p>
        <h2>Your case goes ahead of you.</h2>
        <p className="lede">They open the call with your history already on screen, so the first two minutes are not spent repeating yourself.</p>
      </header>
      <ul className="doc-grid">
        {DOCTORS.map((d) => (
          <li key={d.id} className="glass card doc">
            <div className="doc-top">
              <span className={`avatar big ${d.online ? "online" : ""}`}>{d.name.split(" ")[1]?.[0] ?? "D"}</span>
              <span className={`pill ${d.online ? "green" : ""}`}>{d.online ? "Online now" : "Back tomorrow"}</span>
            </div>
            <h3>{d.name}</h3>
            <p className="muted">{d.spec}</p>
            <p className="muted small">{d.exp} years · {d.rating} <Star size={12} weight="fill" /></p>
            <p className="muted small">Speaks {d.langs}</p>
            <div className="doc-foot">
              <b>₹{d.fee}</b>
              <button className="btn primary" onClick={() => call(d.id)} disabled={!d.online}><VideoCamera size={16} weight="bold" /> Call</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted small">Calling opens the clinician's side of Nirog too, so you can see the same consultation from the other chair. Same record, same patient.</p>
      {doctor && <CallRoom doctor={doctor} onEnd={() => setCallDoctor(null)} />}
    </section>
  );
}
