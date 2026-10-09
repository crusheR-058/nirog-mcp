/**
 * Text normalisation shared by the lexicon and the triage rules.
 *
 * Hindi reaches us spelled several ways: speech recognisers and keyboards differ on
 * the nukta (ज़ vs ज) and on chandrabindu vs anusvara (साँस vs सांस). Rules written
 * against one spelling would silently miss the other, and in triage a silent miss
 * is the dangerous direction. So both are folded away before any matching, and
 * every Hindi pattern in this codebase is written in the folded form: no nukta,
 * anusvara only.
 */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/़/g, "") // nukta
    .replace(/ँ/g, "ं") // chandrabindu → anusvara
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
