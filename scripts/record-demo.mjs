/**
 * Records the demo video from the live page: headless Chrome plays "the story", the page's frames are captured over
 * the DevTools protocol, and every line the assistant speaks is laid back under the frames at the moment it played,
 * synthesized by the same Amazon Polly voice. A title card and a closing card with a narrator frame it. Needs ffmpeg
 * and AWS credentials that can call Polly.
 *
 *   pnpm demo:record                                   # the live deployment, out to SUBMISSION/nirog-demo.mp4
 *   pnpm demo:record http://127.0.0.1:3333 out.mp4     # anywhere else
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? "https://j2fkpyar4b.ap-south-1.awsapprunner.com";
const OUT = resolve(process.argv[3] ?? "SUBMISSION/nirog-demo.mp4");
const MAX_SECONDS = 178; // Devpost allows under three minutes
const work = join(tmpdir(), `nirog-video-${Date.now()}`);
mkdirSync(join(work, "frames"), { recursive: true });
const polly = new PollyClient({ region: process.env.AWS_REGION ?? "ap-south-1" });
const ffmpeg = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
const probe = (file) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

async function say(text, file, { voice = "Kajal", lang = "en-IN" } = {}) {
  const out = await polly.send(new SynthesizeSpeechCommand({ Engine: "neural", VoiceId: voice, LanguageCode: lang, OutputFormat: "mp3", Text: text }));
  writeFileSync(file, Buffer.from(await out.AudioStream.transformToByteArray()));
  return probe(file);
}

// The GPU keeps the 3D field smooth while frames are captured; without one Chrome falls back to software rendering.
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu", "--use-angle=d3d11", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

/* ── 1. The cards ─────────────────────────────────────────────────────────── */
const card = async (file, eyebrow, title, sub, foot) => {
  await page.setContent(`<html><body style="margin:0;width:1920px;height:1080px;display:grid;place-items:center;background:radial-gradient(1200px 700px at 30% 20%,#12303a 0%,#070b12 60%);font-family:Manrope,Inter,system-ui,sans-serif;color:#eef3f6">
    <div style="width:1240px">
      <div style="font:600 22px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#3dd6c3">${eyebrow}</div>
      <div style="font-weight:800;font-size:104px;line-height:1.02;letter-spacing:-.03em;margin:28px 0 30px">${title}</div>
      <div style="font-size:34px;line-height:1.45;color:#aab8c2;max-width:1100px">${sub}</div>
      <div style="margin-top:56px;font:500 24px 'IBM Plex Mono',monospace;color:#7d8d99">${foot}</div>
    </div></body></html>`);
  await page.screenshot({ path: file });
};
await card(join(work, "intro.png"), "Alexa+ track · Build, Ship, Shape", "Say what hurts.<br><span style='color:#7d8d99'>The clinic remembers.</span>",
  "Nirog for Alexa+ turns an Echo into the front door of a rural clinic. One evening, from both chairs, played live.",
  "MCP server + Agent Skill · Amazon Nova · Bedrock · Polly · Supabase");
await card(join(work, "outro.png"), "Nirog for Alexa+", "One record.<br><span style='color:#7d8d99'>Both chairs.</span>",
  "A real agent routes the words. Rules, not a model, escalate. Code writes what the doctor reads. Every call is in the trust log.",
  `github.com/crusheR-058/nirog-mcp · ${BASE.replace(/^https?:\/\//, "")}/demo`);

/* ── 2. The story, played on the live page ────────────────────────────────── */
const lines = [];
await page.exposeFunction("__nirogSpeak", (d) => lines.push(d));
await page.addInitScript(() => window.addEventListener("nirog:speak", (e) => window.__nirogSpeak(e.detail)));
await page.goto(`${BASE}/demo/`, { waitUntil: "networkidle" });
await page.waitForTimeout(3000);

const cdp = await page.context().newCDPSession(page);
const frames = [];
const writes = [];
cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
  // Acknowledge first and write in the background, so capturing never slows the page it is capturing.
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => undefined);
  const file = join(work, "frames", `${String(frames.length).padStart(6, "0")}.jpg`);
  frames.push({ file, t: metadata.timestamp * 1000 });
  writes.push(writeFile(file, Buffer.from(data, "base64")));
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
await page.getByRole("button", { name: /Play the .* story/ }).click();
await page.waitForFunction(() => document.querySelector(".story h4")?.textContent === "One evening, both chairs", null, { timeout: 480_000, polling: 500 });
await page.waitForTimeout(3500);
await cdp.send("Page.stopScreencast");
await browser.close();
await Promise.all(writes);
console.log(`captured ${frames.length} frames and ${lines.length} spoken lines`);

/* ── 3. Narration and the assistant's voice ───────────────────────────────── */
const introLen = await say("This is Nirog for Alexa Plus. In a village four hours from a clinic, the front door is the Echo on the shelf. Here is one evening, from both chairs, running live.", join(work, "intro.mp3"), { voice: "Matthew", lang: "en-US" });
const outroLen = await say("One record, both chairs. A real agent routes the words, rules escalate, and every call is in the trust log. Nirog: say what hurts. The clinic remembers.", join(work, "outro.mp3"), { voice: "Matthew", lang: "en-US" });
const introD = Math.max(5, introLen + 1.2);
const outroD = Math.max(6, outroLen + 1.5);

const t0 = frames[0].t;
const storyLen = (frames.at(-1).t - t0) / 1000;
const speed = Math.max(1, storyLen / (MAX_SECONDS - introD - outroD));
console.log(`story ${storyLen.toFixed(1)} s, played at ${speed.toFixed(2)}x to fit`);

const voiced = [];
for (const [i, l] of lines.entries()) {
  const file = join(work, `line-${i}.mp3`);
  await say(l.text, file, { lang: l.language === "hi" ? "hi-IN" : "en-IN" });
  voiced.push({ file, at: (l.at - t0) / 1000 / speed, tempo: (l.rate ?? 1) * speed });
}

/* ── 4. Assemble ──────────────────────────────────────────────────────────── */
const list = frames.map((f, i) => `file '${f.file.replace(/\\/g, "/")}'\nduration ${(((frames[i + 1]?.t ?? f.t + 100) - f.t) / 1000).toFixed(4)}`).join("\n");
writeFileSync(join(work, "frames.txt"), `${list}\nfile '${frames.at(-1).file.replace(/\\/g, "/")}'\n`);

const enc = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"];
const storyMix = voiced.map((v, i) => `[${i + 1}:a]atempo=${Math.min(2, v.tempo).toFixed(3)},adelay=${Math.round(v.at * 1000)}:all=1[a${i}]`).join(";");
ffmpeg([
  "-f", "concat", "-safe", "0", "-i", join(work, "frames.txt"),
  ...voiced.flatMap((v) => ["-i", v.file]),
  "-filter_complex", `[0:v]setpts=PTS/${speed.toFixed(4)},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p[v];${storyMix}${voiced.length ? ";" : ""}${voiced.map((_, i) => `[a${i}]`).join("")}amix=inputs=${Math.max(1, voiced.length)}:normalize=0:duration=longest[a]`,
  "-map", "[v]", "-map", voiced.length ? "[a]" : "0:a?", "-t", (storyLen / speed).toFixed(2), ...enc, join(work, "story.mp4"),
]);
const cardClip = (png, mp3, d, out) =>
  ffmpeg(["-loop", "1", "-i", png, "-i", mp3, "-filter_complex", `[0:v]fade=t=in:st=0:d=0.6,fade=t=out:st=${(d - 0.6).toFixed(2)}:d=0.6,format=yuv420p[v];[1:a]adelay=500:all=1,apad[a]`, "-map", "[v]", "-map", "[a]", "-t", d.toFixed(2), ...enc, out]);
cardClip(join(work, "intro.png"), join(work, "intro.mp3"), introD, join(work, "intro.mp4"));
cardClip(join(work, "outro.png"), join(work, "outro.mp3"), outroD, join(work, "outro.mp4"));

ffmpeg(["-i", join(work, "intro.mp4"), "-i", join(work, "story.mp4"), "-i", join(work, "outro.mp4"),
  // Loudness to the level YouTube plays at, so the voice is neither faint nor clipped.
  "-filter_complex", "[0:v][0:a][1:v][1:a][2:v][2:a]concat=n=3:v=1:a=1[v][c];[c]loudnorm=I=-16:TP=-1.5:LRA=11[a]", "-map", "[v]", "-map", "[a]", ...enc, "-movflags", "+faststart", OUT]);
console.log(`wrote ${OUT}: ${probe(OUT).toFixed(1)} s`);
