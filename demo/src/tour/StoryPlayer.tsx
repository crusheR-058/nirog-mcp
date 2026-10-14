import { useCallback, useRef, useState } from "react";
import { Play, Stop, X } from "@phosphor-icons/react";
import { BEATS, playStory } from "./story";

type StoryState = { beat: number; error?: string; done?: boolean } | null;

/** The story's controls: start it, follow it beat by beat, stop it. */
export function useStory() {
  const [story, setStory] = useState<StoryState>(null);
  const abort = useRef<AbortController | null>(null);

  const play = useCallback(() => {
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setStory({ beat: 0 });
    playStory((beat) => setStory({ beat }), ctl.signal)
      .then(() => setStory((s) => (s ? { ...s, done: true } : s)))
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setStory((s) => ({ beat: s?.beat ?? 0, error: e instanceof Error ? e.message : String(e) }));
      });
  }, []);

  const stop = useCallback(() => {
    abort.current?.abort();
    setStory(null);
  }, []);

  return { story, play, stop };
}

export function StoryPlayer({ story, onStop, onReplay }: { story: StoryState; onStop: () => void; onReplay: () => void }) {
  if (!story) return null;
  const beat = BEATS[story.beat];
  const running = !story.done && !story.error;
  return (
    <aside className="story glass" aria-live="polite" aria-label="The story, playing on this page">
      <div className="story-head">
        <span className="eyebrow"><Play size={12} weight="fill" /> The story · {story.beat + 1} of {BEATS.length}</span>
        <button className="ghost small" onClick={onStop} aria-label={running ? "Stop the story" : "Close"}>
          {running ? <><Stop size={14} weight="fill" /> Stop</> : <X size={14} weight="bold" />}
        </button>
      </div>
      <h4>{beat.title}</h4>
      <p>{story.error ?? beat.body}</p>
      <div className="story-progress" aria-hidden="true">
        {BEATS.map((_, i) => <i key={i} className={i < story.beat ? "done" : i === story.beat ? "now" : ""} />)}
      </div>
      {!running && <button className="btn small" onClick={onReplay}><Play size={14} weight="fill" /> Play it again</button>}
    </aside>
  );
}
