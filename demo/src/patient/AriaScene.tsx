import { useEffect, useRef, useState } from "react";
import { setSpeaker } from "../speech";

/**
 * ARIA's face on the patient page: the mobile app's 3D nurse, unchanged, in a same-origin iframe served by
 * /aria/scene. While she is on screen the assistant's lines are spoken through her (lip-synced to the same Polly
 * audio) instead of the page's own player; when she is not, nothing changes. The page never waits for her: the
 * conversation works before she loads, and without her if WebGL or the model is unavailable.
 */
declare global {
  interface Window {
    nirog?: { say: (text: string) => void; hush: () => void };
    NIROG_TOKEN?: string;
  }
}

const canRender = () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  try {
    return Boolean(document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl"));
  } catch {
    return false;
  }
};

export function AriaScene({ token }: { token: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [speaking, setSpeaking] = useState(false);
  const [wanted] = useState(canRender);
  // Whoever is waiting for the current line; settled on the scene's next "idle".
  const waiting = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!wanted) return;
    const w = frame.current?.contentWindow;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== w || typeof e.data !== "string") return;
      let m: { type?: string; realistic?: boolean };
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "ready") {
        setState("ready");
        if (w) w.NIROG_TOKEN = token;
        setSpeaker({
          say: (text) =>
            new Promise<void>((resolve) => {
              const n = w?.nirog;
              if (!n) return resolve();
              waiting.current?.();
              waiting.current = resolve;
              n.say(text);
            }),
          stop: () => {
            w?.nirog?.hush();
            const r = waiting.current;
            waiting.current = null;
            r?.();
          },
        });
      } else if (m.type === "speaking") setSpeaking(true);
      else if (m.type === "idle") {
        setSpeaking(false);
        const r = waiting.current;
        waiting.current = null;
        r?.();
      }
    };
    window.addEventListener("message", onMessage);
    // The model is a few megabytes; past this, the conversation goes on without her.
    const giveUp = setTimeout(() => setState((s) => (s === "loading" ? "failed" : s)), 60_000);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(giveUp);
      setSpeaker(null);
    };
  }, [wanted, token]);

  // The token can be renewed while she is on screen.
  useEffect(() => {
    const w = frame.current?.contentWindow;
    if (w && state === "ready") w.NIROG_TOKEN = token;
  }, [token, state]);

  if (!wanted || state === "failed") return null;
  return (
    <div className={`aria-stage ${state} ${speaking ? "speaking" : ""}`} aria-label="ARIA, the clinic's assistant">
      <iframe ref={frame} src="/aria/scene" title="ARIA" allow="autoplay" />
      {state === "loading" && <div className="aria-loading"><span className="eyebrow">ARIA is on her way</span><p className="muted small">You can start talking; she joins when the model has loaded.</p></div>}
      <span className="aria-tag"><i className="dot" />{speaking ? "Speaking" : state === "ready" ? "Listening" : "Loading"}</span>
    </div>
  );
}
