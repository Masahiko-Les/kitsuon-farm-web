import { MAX_VOICES, type ReactionId, questionById, themeById } from "./cafe";
import type { Timestamp } from "./farm-api";
import { isConfigured, must, supabase } from "./supabase";

/* =========================================================
   吃音村カフェの回答と、届いた気持ち
   - 回答は名前を持たない（匿名）。紹介するときは「村人」とだけ出す。
   - 回答は1問ずつ保存するが、同じ会話の回答は sessionId でつながっていて、3問1シリーズで扱う。
   - 会話のあいだは draft（本人だけ）。3問すべてに答えて「届けてもよい」を選ぶと pending になり、
     運営がシリーズごと確認して public に変えたものだけが、ほかの村人に届く。
   - 危機的な言葉を含む回答は review で保存し、誰にも届かない。
   ========================================================= */

// 通報して隠した回答（端末に保存）
export const CAFE_HIDDEN_KEY = "kitsuon-cafe-hidden";

export type CafeStatus = "draft" | "pending" | "public" | "private" | "review";

export type CafeAnswer = {
  id: string;
  uid: string;
  sessionId: string; // 同じ会話（3問1シリーズ）の回答に共通のID
  themeId: string;
  questionId: string;
  text: string;
  status: CafeStatus;
  createdAt?: Timestamp | null;
};

export type CafeReaction = {
  id: string;
  answerId: string;
  toUid: string;
  fromUid: string;
  kind: ReactionId;
  createdAt?: Timestamp | null;
};

// 画面に出す「ほかの村人の言葉」。sample はお手本（運営が用意した文章）
export type Voice = { key: string; text: string; sample: boolean; answer?: CafeAnswer };

// ひとりの村人の、3問そろった回答
export type CafeSeries = { sessionId: string; uid: string; answers: CafeAnswer[] };

// 公開済みの回答を一度に読む上限（3問で1シリーズなので、30シリーズぶん）
const SERIES_SCAN = 90;

// 同じ会話の回答をつなぐID（端末で作る乱数）
export const newSessionId = () =>
  Date.now().toString(36) + Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join("");

type Row = Record<string, unknown>;
const toAnswer = (r: Row): CafeAnswer => ({
  id: r.id as string,
  uid: r.uid as string,
  sessionId: r.session_id as string,
  themeId: r.theme_id as string,
  questionId: r.question_id as string,
  text: r.text as string,
  status: r.status as CafeStatus,
  createdAt: r.created_at as string,
});
const toReaction = (r: Row): CafeReaction => ({
  id: r.id as string,
  answerId: r.answer_id as string,
  toUid: r.to_uid as string,
  fromUid: r.from_uid as string,
  kind: r.kind as ReactionId,
  createdAt: r.created_at as string,
});

// 回答を会話ごとにまとめる。シリーズの順は渡された順のままで、中は質問の順に並べる
export type AnswerGroup = { sessionId: string; answers: CafeAnswer[]; complete: boolean };
export function groupSeries(answers: CafeAnswer[]): AnswerGroup[] {
  const bySession = new Map<string, CafeAnswer[]>();
  for (const a of answers) bySession.set(a.sessionId, [...(bySession.get(a.sessionId) ?? []), a]);
  return [...bySession.entries()].map(([sessionId, list]) => {
    const questions = themeById(list[0].themeId)?.questions ?? [];
    const order = (a: CafeAnswer) => questions.findIndex((q) => q.id === a.questionId);
    return {
      sessionId,
      answers: [...list].sort((x, y) => order(x) - order(y)),
      complete: questions.length > 0 && questions.every((q) => list.some((a) => a.questionId === q.id)),
    };
  });
}

export async function saveAnswer(a: Omit<CafeAnswer, "id" | "createdAt">) {
  const r = must(await supabase.from("cafe_answers").insert({
    uid: a.uid, session_id: a.sessionId, theme_id: a.themeId, question_id: a.questionId, text: a.text, status: a.status,
  }).select("id").single());
  return (r as { id: string }).id;
}

// ほかの村人の公開済みのシリーズ。3問そろっているものだけを、1人1シリーズまで選ぶ
export async function loadSeries(themeId: string, uid: string, hidden: Set<string>): Promise<CafeSeries[]> {
  const theme = themeById(themeId);
  if (!theme || !isConfigured) return []; // おためしモードでは、お手本の言葉だけ
  try {
    const rows = must(await supabase.from("cafe_answers").select("*")
      .eq("theme_id", themeId).eq("status", "public").limit(SERIES_SCAN)) ?? [];
    const bySession = new Map<string, CafeAnswer[]>();
    for (const row of rows) {
      const a = toAnswer(row);
      bySession.set(a.sessionId, [...(bySession.get(a.sessionId) ?? []), a]);
    }
    const series = [...bySession.entries()]
      .filter(([, answers]) => answers[0].uid !== uid
        && !answers.some((a) => hidden.has(a.id))
        && theme.questions.every((q) => answers.some((a) => a.questionId === q.id)))
      .map(([sessionId, answers]) => ({ sessionId, uid: answers[0].uid, answers }));
    shuffle(series);
    const seen = new Set<string>();
    return series.filter((x) => !seen.has(x.uid) && seen.add(x.uid)).slice(0, MAX_VOICES);
  } catch (e) {
    console.error("cafe series", e);
    return [];
  }
}

// この質問で読む言葉。同じ村人の話が3問を通してつながる。足りないぶんはお手本で補う
export function voicesFor(questionId: string, series: CafeSeries[]): Voice[] {
  const real: Voice[] = series.flatMap((x) => x.answers.filter((a) => a.questionId === questionId))
    .map((a) => ({ key: a.id, text: a.text, sample: false, answer: a }));
  const samples: Voice[] = (questionById(questionId)?.question.samples ?? [])
    .map((s, i) => ({ key: `sample-${questionId}-${i}`, text: s.text, sample: true }));
  return [...real, ...samples].slice(0, MAX_VOICES);
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ---------- 気持ちを届ける（1つの言葉に1人1つ。あとから選び直せる） ---------- */
export async function sendReaction(uid: string, answer: CafeAnswer, kind: ReactionId) {
  must(await supabase.from("cafe_reactions").upsert({
    id: `${answer.id}_${uid}`,
    answer_id: answer.id,
    to_uid: answer.uid,
    from_uid: uid,
    kind,
    created_at: new Date().toISOString(),
  }, { onConflict: "id" }));
}

/* ---------- わたしの言葉 ---------- */
export async function loadMyAnswers(uid: string): Promise<CafeAnswer[]> {
  return (must(await supabase.from("cafe_answers").select("*").eq("uid", uid)) ?? []).map(toAnswer);
}

export async function loadReactionsToMe(uid: string): Promise<CafeReaction[]> {
  return (must(await supabase.from("cafe_reactions").select("*").eq("to_uid", uid)) ?? []).map(toReaction);
}

// 会話のおわりに、シリーズを届ける（pending）か自分だけにする（private）かを決める。運営の承認もここを通る
export async function setSeriesStatus(answerIds: string[], status: "pending" | "public" | "private") {
  if (answerIds.length === 0) return;
  must(await supabase.from("cafe_answers").update({ status }).in("id", answerIds));
}

// 本人がシリーズごと削除する
export async function deleteSeries(answerIds: string[]) {
  if (answerIds.length === 0) return;
  must(await supabase.from("cafe_answers").delete().in("id", answerIds));
}

/* ---------- 通報 ---------- */
export async function reportAnswer(uid: string, answerId: string) {
  must(await supabase.from("reports").insert({ target_type: "cafeAnswer", target_id: answerId, reporter_uid: uid }));
}

// すべてのデータの削除は、farm-api の deleteEverything（RPC）でカフェの言葉と気持ちも一緒に消える

/* =========================================================
   運営用（admins/{uid} に登録された人だけが使える。ルールで守っている）
   ========================================================= */
export type CafeReport = { id: string; targetId: string; reporterUid: string; handled?: boolean; createdAt?: Timestamp | null };
const toReport = (r: Row): CafeReport => ({
  id: r.id as string, targetId: r.target_id as string, reporterUid: r.reporter_uid as string,
  handled: r.handled as boolean, createdAt: r.created_at as string,
});

// 危機的な言葉を含む回答（ほかの村人には届いていない）
export async function loadReview(): Promise<CafeAnswer[]> {
  return (must(await supabase.from("cafe_answers").select("*").eq("status", "review")) ?? []).map(toAnswer);
}

export async function loadPending(): Promise<CafeAnswer[]> {
  return (must(await supabase.from("cafe_answers").select("*").eq("status", "pending")) ?? []).map(toAnswer);
}

// 通報を受けて、シリーズごと止める。remove なら通報された言葉は削除し、残りを非公開にする
export async function adminRetireSeries(answer: CafeAnswer, remove: boolean) {
  if (remove) must(await supabase.from("cafe_answers").delete().eq("id", answer.id));
  must(await supabase.from("cafe_answers").update({ status: "private" })
    .eq("session_id", answer.sessionId).in("status", ["public", "pending"]));
}

// まだ確認していない、カフェの言葉への通報。回答ごとにまとめる
export async function loadOpenReports(): Promise<{ answer: CafeAnswer | null; targetId: string; reports: CafeReport[] }[]> {
  const open = (must(await supabase.from("reports").select("*").eq("target_type", "cafeAnswer").eq("handled", false)) ?? [])
    .map(toReport);
  const byTarget = new Map<string, CafeReport[]>();
  for (const r of open) byTarget.set(r.targetId, [...(byTarget.get(r.targetId) ?? []), r]);
  const ids = [...byTarget.keys()];
  const answers = ids.length
    ? (must(await supabase.from("cafe_answers").select("*").in("id", ids)) ?? []).map(toAnswer)
    : [];
  return ids.map((targetId) => ({
    targetId,
    reports: byTarget.get(targetId)!,
    answer: answers.find((a) => a.id === targetId) ?? null,
  }));
}

export async function markReportsHandled(reportIds: string[]) {
  if (reportIds.length === 0) return;
  must(await supabase.from("reports").update({ handled: true, handled_at: new Date().toISOString() }).in("id", reportIds));
}
