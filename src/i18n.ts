/**
 * Spoken lines in English and Hindi.
 *
 * Every deterministic sentence the server can say lives here, so a tool never
 * builds prose inline and a translation can be checked in one place. ARIA's own
 * questions come from the model, which is told which language to answer in.
 */

import { z } from "zod";
import type { Region } from "./clinical/regions.js";

export type Lang = "en" | "hi";

export const langInput = z
  .enum(["en", "hi"])
  .optional()
  .describe("Language to answer in: 'en' (default) or 'hi' for Hindi. Use the language the patient is speaking.");

/** Region names as they read inside "your ___" (en) and "___ की तकलीफ़" (hi). */
const REGION_HI: Record<Region, string> = {
  lower_back: "कमर",
  upper_back: "ऊपरी पीठ",
  head: "सिर",
  neck: "गर्दन",
  chest: "सीने",
  abdomen: "पेट",
  pelvis: "पेड़ू",
  arm: "हाथ",
  leg: "पैर",
  skin: "त्वचा",
  systemic: "बुखार या कमज़ोरी",
  unknown: "इस",
};

const REGION_EN: Record<Region, string> = {
  lower_back: "lower back",
  upper_back: "upper back",
  head: "head",
  neck: "neck",
  chest: "chest",
  abdomen: "abdomen",
  pelvis: "pelvis",
  arm: "arm",
  leg: "leg",
  skin: "skin",
  systemic: "general health",
  unknown: "this",
};

export const regionName = (r: Region, lang: Lang) => (lang === "hi" ? REGION_HI[r] : REGION_EN[r]);

const SLOT_HI: Record<string, string> = {
  morning: "सुबह",
  afternoon: "दोपहर",
  night: "रात",
  "as needed": "ज़रूरत पड़ने पर",
  "as directed": "डॉक्टर के बताए अनुसार",
};
export const slotName = (slot: string, lang: Lang) => (lang === "hi" ? (SLOT_HI[slot] ?? slot) : slot);

const cap = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

export function shortWhen(d: Date, now: Date, lang: Lang = "en"): string {
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  const weeks = Math.round(days / 7);
  if (lang === "hi") {
    if (days <= 1) return "कल";
    if (days < 14) return `${days} दिन पहले`;
    if (weeks < 9) return `${weeks} हफ़्ते पहले`;
    return `${Math.round(days / 30)} महीने पहले`;
  }
  if (days <= 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (weeks < 9) return `${weeks} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

export const EMERGENCY_ADVICE: Record<Lang, string> = {
  en: "This could be serious. Please call 108 for an ambulance or go to the nearest hospital right now.",
  hi: "यह गंभीर हो सकता है। कृपया अभी 108 पर एम्बुलेंस बुलाइए या तुरंत नज़दीकी अस्पताल जाइए।",
};

export const URGENT_ADVICE: Record<Lang, string> = {
  en: "This needs a doctor today. I am booking you an urgent consultation.",
  hi: "इसे आज ही डॉक्टर को दिखाना ज़रूरी है। मैं आपके लिए डॉक्टर से तुरंत बात का समय ले रही हूँ।",
};

export const SELF_HARM_ADVICE: Record<Lang, string> = {
  en: "I am really glad you told me. You are not alone. Please call the Tele-MANAS helpline on 14416 now, it is free and open all day. I am also alerting your doctor.",
  hi: "अच्छा किया कि आपने मुझे बताया। आप अकेले नहीं हैं। कृपया अभी टेली-मानस हेल्पलाइन 14416 पर फ़ोन कीजिए, यह मुफ़्त है और दिन-रात खुली रहती है। मैं आपके डॉक्टर को भी ख़बर कर रही हूँ।",
};

export const T = {
  consentDenied: (lang: Lang) =>
    lang === "hi"
      ? "इस डिवाइस से उस व्यक्ति का स्वास्थ्य रिकॉर्ड देखने की सहमति मेरे पास नहीं है। परिवार का कोई सदस्य निरोग ऐप में यह सहमति दे सकता है।"
      : "I don't have consent to access that person's health record from this device. A family member can grant it in the Nirog app.",

  /* recall */
  memoryDegraded: (lang: Lang) =>
    lang === "hi"
      ? "एक बात पहले बता दूँ। अभी मैं आपका रिकॉर्ड नहीं देख पा रही हूँ, इसलिए यह नहीं बता पाऊँगी कि यह तकलीफ़ पहले भी हुई थी या नहीं।"
      : "One thing first. I can't get to your records right now, so I won't be able to tell you if this has come up before.",
  recallRecurrent: (lang: Lang, p: { region: Region; visits: number; days: number; when: string; text: string }) =>
    lang === "hi"
      ? `पिछले ${p.days} दिनों में आपने ${p.visits} बार ${regionName(p.region, "hi")} की तकलीफ़ बताई है। ${p.when} आपने कहा था, "${p.text}"। क्या यह वही तकलीफ़ है?`
      : `You have mentioned your ${regionName(p.region, "en")} ${p.visits} times in the last ${p.days} days. ${cap(p.when)} you said "${p.text}". Is this the same thing?`,
  recallWatch: (lang: Lang, p: { region: Region; when: string }) =>
    lang === "hi"
      ? `${p.when} भी आपने ${regionName(p.region, "hi")} की तकलीफ़ बताई थी। क्या यह वही परेशानी है?`
      : `You mentioned your ${regionName(p.region, "en")} ${p.when} too. Is this the same problem?`,
  recallClosest: (lang: Lang, p: { when: string; text: string }) =>
    lang === "hi" ? `${p.when} आपने कहा था, "${p.text}"। क्या यह उसी से जुड़ा है?` : `${cap(p.when)} you told me "${p.text}". Does this feel related?`,

  /* intake */
  ariaUnreachable: (lang: Lang) =>
    lang === "hi"
      ? "अभी मैं इंटेक सहायक तक नहीं पहुँच पा रही हूँ, लेकिन आपकी बात दर्ज हो गई है और डॉक्टर इसे देखेंगे।"
      : "I could not reach the intake assistant, but your complaint is recorded and a doctor will see it.",
  escalating: (lang: Lang) => (lang === "hi" ? "मैं अभी डॉक्टर को ख़बर कर रही हूँ।" : "I am escalating this now."),
  offlineQuestions: (lang: Lang) =>
    lang === "hi"
      ? ["इस बार यह कब से हो रहा है?", "यह बढ़ रहा है, वैसा ही है, या कम हो रहा है?", "क्या इसके साथ कोई और तकलीफ़ भी है?"]
      : ["How long has this been going on this time?", "Is it getting worse, staying the same, or getting better?", "Is anything else bothering you along with it?"],
  offlineHandover: (lang: Lang) =>
    lang === "hi" ? "धन्यवाद। मैं यह आपकी पुरानी जानकारी के साथ डॉक्टर को भेज रही हूँ।" : "Thank you. I am sending this to the doctor along with your history.",

  /* red flag */
  routineNoted: (lang: Lang) =>
    lang === "hi" ? "इसमें अभी एमरजेंसी जैसी कोई बात नहीं है। मैंने इसे डॉक्टर के लिए नोट कर लिया है।" : "Nothing here needs emergency care. I have noted it for the doctor.",
  emergencyAlerted: (lang: Lang, family: boolean) =>
    lang === "hi"
      ? `मैंने ऑन-कॉल डॉक्टर${family ? " और आपके परिवार" : ""} को भी ख़बर कर दी है।`
      : `I have also alerted the on-call doctor${family ? " and your family contact" : ""}.`,
  familyTold: (lang: Lang) => (lang === "hi" ? " आपके परिवार को भी बता दिया गया है।" : " Your family contact has been told."),

  /* care plan */
  noPlan: (lang: Lang, name: string) =>
    lang === "hi"
      ? `${name} का अभी कोई इलाज का प्लान दर्ज नहीं है। अगर कोई तकलीफ़ है तो मैं अभी पूछताछ शुरू कर सकती हूँ।`
      : `${name} has no care plan on file yet. If something is bothering them, I can start an intake.`,
  noActiveMeds: (lang: Lang, name: string) => (lang === "hi" ? `${name} की अभी कोई दवा चालू नहीं है।` : `${name} has no active medicines right now.`),
  activeMeds: (lang: Lang, name: string, n: number, list: string) =>
    lang === "hi" ? `${name} की ${n} दवा चालू है: ${list}।` : `${name} has ${n} active medicine${n > 1 ? "s" : ""}: ${list}.`,
  pendingTests: (lang: Lang, tests: string[]) => (lang === "hi" ? `बाकी जाँचें: ${tests.join(" और ")}।` : `Pending tests: ${tests.join(" and ")}.`),
  followUp: (lang: Lang, status: "overdue" | "due_today" | "upcoming", days: number) => {
    if (lang === "hi") {
      if (status === "overdue") return `डॉक्टर से दोबारा मिलने की तारीख़ ${-days} दिन पहले निकल चुकी है।`;
      if (status === "due_today") return "डॉक्टर से दोबारा मिलने की तारीख़ आज है।";
      return `अगली बार डॉक्टर से ${days} दिन बाद मिलना है।`;
    }
    if (status === "overdue") return `The follow-up with the doctor is overdue by ${-days} days.`;
    if (status === "due_today") return "The follow-up with the doctor is due today.";
    return `The next follow-up is in ${days} days.`;
  },
  dose: (lang: Lang, dose: string | undefined) => (lang === "hi" ? (dose ?? "").replace(/tablets?/i, "गोली").replace(/capsules?/i, "कैप्सूल") : (dose ?? "")),
  and: (lang: Lang) => (lang === "hi" ? " और " : " and "),

  /* doses */
  doseNoMeds: (lang: Lang, name: string) =>
    lang === "hi"
      ? `${name} के प्लान में अभी कोई दवा चालू नहीं है, इसलिए मैंने कुछ दर्ज नहीं किया।`
      : `${name} has no active medicines on the care plan, so I have not recorded anything.`,
  doseWhich: (lang: Lang, list: string) => (lang === "hi" ? `कौन सी दवा ली? ${list}` : `Which medicine did you take? ${list}`),
  doseLogged: (lang: Lang, p: { drug: string; slot: string; time: string; next: string | null }) =>
    lang === "hi"
      ? `ठीक है। ${p.drug} की ${slotName(p.slot, "hi")} की खुराक ${p.time} पर दर्ज कर ली है। ${p.next ? `अगली खुराक: ${slotName(p.next, "hi")}।` : "आज की सारी खुराक पूरी हो गई।"}`
      : `Noted. ${p.drug}, ${p.slot} dose, recorded at ${p.time}. ${p.next ? `Next dose: ${p.next}.` : "That is all for today."}`,
  doseDuplicate: (lang: Lang, drug: string) =>
    lang === "hi"
      ? `${drug} की आज की खुराक पहले ही दर्ज है। कृपया दोबारा मत लीजिए। अगर शक हो तो मैं डॉक्टर से पूछ सकती हूँ।`
      : `${drug} is already recorded for today. Please do not take an extra dose. If you are unsure, I can ask the doctor.`,

  /* family summary */
  summary: (lang: Lang, p: { name: string; days: number; complaints: number; flag: { region: Region; visits: number; span: number } | null; taken: number; expected: number; consults: number }) => {
    if (lang === "hi") {
      const parts = [
        p.complaints === 0
          ? `${p.name}, पिछले ${p.days} दिन: कोई तकलीफ़ दर्ज नहीं हुई।`
          : `${p.name}, पिछले ${p.days} दिन: ${p.complaints} तकलीफ़ दर्ज हुई${p.flag ? `, और ${regionName(p.flag.region, "hi")} की तकलीफ़ ${p.flag.span} दिनों में ${p.flag.visits} बार आई है` : ""}।`,
      ];
      if (p.expected > 0) parts.push(`दवा: ${p.expected} में से ${p.taken} खुराक दर्ज हैं।`);
      if (p.consults > 0) parts.push(`${p.consults} बार डॉक्टर से तुरंत बात का अनुरोध किया गया।`);
      return parts.join(" ");
    }
    const parts = [
      p.complaints === 0
        ? `${p.name}, last ${p.days} days: no complaints recorded.`
        : `${p.name}, last ${p.days} days: ${p.complaints} health complaint${p.complaints > 1 ? "s" : ""} recorded${p.flag ? `, and the ${regionName(p.flag.region, "en")} has come up ${p.flag.visits} times in ${p.flag.span} days` : ""}.`,
    ];
    if (p.expected > 0) parts.push(`Medicines: ${p.taken} of ${p.expected} doses recorded.`);
    if (p.consults > 0) parts.push(`${p.consults} urgent consult${p.consults > 1 ? "s were" : " was"} requested.`);
    return parts.join(" ");
  },
};
