import { useEffect, useState } from "react";
import { Microphone, PaperPlaneRight, Waveform } from "@phosphor-icons/react";
import { SUGGESTIONS } from "../copy";
import { useDemo } from "../store";
import type { useConversation } from "./useConversation";

type Convo = ReturnType<typeof useConversation>;

/** The glass bar that follows the page. Every reply you hear is a tool result from nirog-mcp. */
export function VoiceBar({ convo }: { convo: Convo }) {
  const [typed, setTyped] = useState("");
  const [show, setShow] = useState(false);
  const lastReply = useDemo((s) => s.lastReply);
  const section = useDemo((s) => s.section);
  const { phase, talk, handle, notice, canListen } = convo;
  const busy = phase === "thinking" || phase === "listening";

  // The reply card shows for a while after each answer, unless the Talk section already shows the whole conversation.
  useEffect(() => {
    if (!lastReply) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 9000);
    return () => clearTimeout(t);
  }, [lastReply]);

  const replyVisible = show && lastReply && section !== 5;

  return (
    <div className="voicebar-wrap">
      {replyVisible && (
        <div className={`reply-card ${lastReply.level}`} role="status">
          <span className="who"><Waveform size={14} weight="bold" /> Alexa+ · ARIA</span>
          <p>{lastReply.text}</p>
        </div>
      )}
      {notice && <div className={`reply-card ${notice.error ? "error" : ""}`} role="status"><p>{notice.text}</p></div>}
      <form
        className="voicebar"
        onSubmit={(e) => {
          e.preventDefault();
          const t = typed;
          setTyped("");
          void handle(t);
        }}
      >
        <button type="button" className={`mic ${phase}`} onClick={talk} disabled={busy && phase !== "listening"} aria-label={canListen ? "Talk" : "Microphone unavailable"} title={canListen ? "Hold a thought, then talk" : "This browser cannot hear you. Type instead."}>
          <Microphone size={20} weight="fill" />
          <span className="ring" />
        </button>
        <label htmlFor="ask" className="sr-only">Say what hurts</label>
        <input id="ask" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phase === "listening" ? "Listening…" : phase === "thinking" ? "Checking the record…" : phase === "speaking" ? "Speaking…" : "Say what hurts, or ask about your medicines"} disabled={busy} autoComplete="off" />
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s.say} type="button" className="chip" onClick={() => void handle(s.say)} disabled={busy} title={s.say}>
              {s.label}
            </button>
          ))}
        </div>
        <button type="submit" className="send" disabled={busy || !typed.trim()} aria-label="Send">
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}
