import { useEffect, useRef, useState } from "react";
import { CameraSlash, Microphone, MicrophoneSlash, PhoneDisconnect, VideoCamera, VideoCameraSlash, WifiHigh } from "@phosphor-icons/react";

/**
 * The consultation room. Captures the local camera and microphone like Nirog's
 * WebRTC room does; without a signalling server in this demo there is no remote
 * peer, so the far side shows the waiting state. Mute and camera toggles flip the
 * live tracks for real.
 */
export function CallRoom({ doctor, onEnd, side = "patient" }: { doctor: { name: string; spec: string }; onEnd: () => void; side?: "patient" | "doctor" }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: true, audio: true })
      .then((s) => {
        if (!active) return s.getTracks().forEach((t) => t.stop());
        setStream(s);
      })
      .catch((e) => setError(e instanceof Error ? (e.name === "NotAllowedError" ? "Camera access was refused." : "No camera available on this device.") : "Camera unavailable."));
    const t = setInterval(() => setSeconds((x) => x + 1), 1000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);
  useEffect(() => { stream?.getAudioTracks().forEach((t) => (t.enabled = mic)); }, [mic, stream]);
  useEffect(() => { stream?.getVideoTracks().forEach((t) => (t.enabled = cam)); }, [cam, stream]);

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const other = side === "patient" ? doctor.name : "Rahul Yadav";

  return (
    <div className="modal-scrim" role="dialog" aria-modal="true" aria-label={`Call with ${other}`}>
      <div className="glass call">
        <div className="call-head">
          <div>
            <span className="eyebrow">Teleconsultation · {side === "patient" ? doctor.spec : "Video"}</span>
            <h3>{other}</h3>
          </div>
          <span className="pill green"><WifiHigh size={14} weight="bold" /> Fair network · {clock}</span>
        </div>
        <div className="stage">
          <div className="remote">
            <span className="avatar big">{other.split(" ").map((w) => w[0]).slice(1, 2).join("") || other[0]}</span>
            <p>{side === "patient" ? `${doctor.name} is opening your case file…` : "Waiting for the patient to join from the link…"}</p>
            <p className="muted small">{side === "patient" ? "Your history is already on their screen." : "The handover is open beside the call."}</p>
          </div>
          <div className={`local ${cam && stream ? "" : "off"}`}>
            {stream && cam ? <video ref={videoRef} autoPlay playsInline muted /> : <span className="local-off"><CameraSlash size={22} /> {error ?? "Camera off"}</span>}
            <span className="local-tag">You</span>
          </div>
        </div>
        <div className="call-controls">
          <button className={`ctl ${mic ? "" : "off"}`} onClick={() => setMic((m) => !m)} aria-label={mic ? "Mute" : "Unmute"}>{mic ? <Microphone size={20} weight="fill" /> : <MicrophoneSlash size={20} weight="fill" />}</button>
          <button className={`ctl ${cam ? "" : "off"}`} onClick={() => setCam((c) => !c)} aria-label={cam ? "Camera off" : "Camera on"}>{cam ? <VideoCamera size={20} weight="fill" /> : <VideoCameraSlash size={20} weight="fill" />}</button>
          <button className="ctl end" onClick={onEnd} aria-label="End call"><PhoneDisconnect size={20} weight="fill" /></button>
        </div>
      </div>
    </div>
  );
}
