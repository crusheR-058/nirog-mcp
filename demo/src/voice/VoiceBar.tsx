import { useEffect, useState } from "react";
import { Microphone, PaperPlaneRight, Waveform } from "@phosphor-icons/react";
import { SECTIONS, SUGGESTIONS } from "../copy";
import { useDemo } from "../store";
import type { useConversation } from "./useConversation";

type Convo = ReturnType<typeof useConversation>;

const PLACEHOLDER = {
  en: { idle: "Say what hurts…", listening: "Listening…", thinking: "Checking the record…", speaking: "Speaking…" },
  hi: { idle: "तकलीफ़ बताइए…", listening: "सुन रही हूँ…", thinking: "रिकॉर्ड देख रही हूँ…", speaking: "बोल रही हूँ…" },
};

/** The glass bar that follows the page. Every reply you hear is a tool result from nirog-mcp. */
export function VoiceBar({ convo }: { convo: Convo }) {
  const [typed, setTyped] = useState("");
  const [show, setShow] = useState(false);
  const lastReply = useDemo((s) => s.lastReply);
  const section = useDemo((s) => s.section);
  const { phase, talk, handle, notice, canListen, settings, setSettings } = convo;
  const lang = settings.language;
  const busy = phase === "thinking" || phase === "listening";

  // The reply card shows for a while after each answer, unless the Talk section already shows the whole conversation.
  useEffect(() => {
    if (!lastReply) return;
    setShow(true);
    const t = setTimeout(() => setShow(false), 9000);
    return () => clearTimeout(t);
  }, [lastReply]);

  const replyVisible = show && lastReply && section !== SECTIONS.length - 1;

  return (
    <div className="voicebar-wrap" lang={lang}>
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
        <button type="button" className={`mic ${phase}`} onClick={talk} disabled={busy && phase !== "listening"} aria-label={canListen ? "Talk" : "Microphone unavailable"} title={canListen ? "Talk" : "This browser cannot hear you. Type instead."}>
          <Microphone size={20} weight="fill" />
          <span className="ring" />
        </button>
        <label htmlFor="ask" className="sr-only">Say what hurts</label>
        <input id="ask" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={PLACEHOLDER[lang][phase]} disabled={busy} autoComplete="off" />
        <div className="chips">
          {SUGGESTIONS[lang].map((s) => (
            <button key={s.say} type="button" className="chip" onClick={() => void handle(s.say)} disabled={busy} title={s.say}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="lang" role="group" aria-label="Language">
          <button type="button" aria-pressed={lang === "en"} onClick={() => setSettings({ ...settings, language: "en" })}>EN</button>
          <button type="button" aria-pressed={lang === "hi"} onClick={() => setSettings({ ...settings, language: "hi" })} lang="hi">हिं</button>
        </div>
        <button type="submit" className="send" disabled={busy || !typed.trim()} aria-label="Send">
          <PaperPlaneRight size={18} weight="fill" />
        </button>
      </form>
    </div>
  );
}
