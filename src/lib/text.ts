import { MAX_CHARS, MAX_LINES } from "./game";
import { CONTACT_PATTERNS, CRISIS_WORDS, NG_WORDS } from "./safety";

export function measure(text: string) {
  return { lines: text === "" ? 0 : text.split("\n").length, chars: [...text].length };
}

// 下限の字数を数えるときは、空白と改行を数えない
export const countContent = (text: string) => [...text.replace(/\s/g, "")].length;

export type TextCheck = { ok?: true; error?: string; crisis: boolean };

// 送信前に必ず通す。
export function checkText(text: string, minChars = 0): TextCheck {
  const trimmed = text.trim();
  const { lines, chars } = measure(text);
  const crisis = CRISIS_WORDS.some((w) => text.includes(w));
  if (!trimmed) return { error: "何か書いてから送ってください。", crisis };
  const content = countContent(text);
  if (content < minChars) return { error: `${minChars}字以上で書いてください（いま${content}字）。`, crisis };
  if (lines > MAX_LINES) return { error: `${MAX_LINES}行以内にしてください（いま${lines}行）。`, crisis };
  if (chars > MAX_CHARS) return { error: `${MAX_CHARS}字以内にしてください（いま${chars}字）。`, crisis };
  if (NG_WORDS.some((w) => text.includes(w))) {
    return { error: "相手を傷つけるおそれのある言葉が含まれています。言い換えてください。", crisis };
  }
  if (CONTACT_PATTERNS.some((p) => p.test(text))) {
    return { error: "連絡先やSNSのアカウントは書けません。消してから送ってください。", crisis };
  }
  return { ok: true, crisis };
}
