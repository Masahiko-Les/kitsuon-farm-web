import {
  collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, type Query, type Timestamp, where, writeBatch,
} from "firebase/firestore";

import { MAX_VOICES, type ReactionId, questionById, themeById } from "./cafe";
import { db } from "./firebase";

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

export const newSessionId = () => doc(collection(db, "cafeAnswers")).id;

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
  const ref = doc(collection(db, "cafeAnswers"));
  await setDoc(ref, { ...a, createdAt: serverTimestamp() });
  return ref.id;
}

// ほかの村人の公開済みのシリーズ。3問そろっているものだけを、1人1シリーズまで選ぶ
export async function loadSeries(themeId: string, uid: string, hidden: Set<string>): Promise<CafeSeries[]> {
  const theme = themeById(themeId);
  if (!theme) return [];
  try {
    const snap = await getDocs(query(
      collection(db, "cafeAnswers"),
      where("themeId", "==", themeId),
      where("status", "==", "public"),
      limit(SERIES_SCAN),
    ));
    const bySession = new Map<string, CafeAnswer[]>();
    for (const d of snap.docs) {
      const a = { id: d.id, ...d.data() } as CafeAnswer;
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
  await setDoc(doc(db, "cafeReactions", `${answer.id}_${uid}`), {
    answerId: answer.id,
    toUid: answer.uid,
    fromUid: uid,
    kind,
    createdAt: serverTimestamp(),
  });
}

/* ---------- わたしの言葉 ---------- */
export async function loadMyAnswers(uid: string): Promise<CafeAnswer[]> {
  const snap = await getDocs(query(collection(db, "cafeAnswers"), where("uid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CafeAnswer);
}

export async function loadReactionsToMe(uid: string): Promise<CafeReaction[]> {
  const snap = await getDocs(query(collection(db, "cafeReactions"), where("toUid", "==", uid)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CafeReaction);
}

// 会話のおわりに、シリーズを届ける（pending）か自分だけにする（private）かを決める。運営の承認もここを通る
export async function setSeriesStatus(answerIds: string[], status: "pending" | "public" | "private") {
  const b = writeBatch(db);
  answerIds.forEach((id) => b.update(doc(db, "cafeAnswers", id), { status }));
  await b.commit();
}

// 本人がシリーズごと削除する
export async function deleteSeries(answerIds: string[]) {
  const b = writeBatch(db);
  answerIds.forEach((id) => b.delete(doc(db, "cafeAnswers", id)));
  await b.commit();
}

/* ---------- 通報 ---------- */
export async function reportAnswer(uid: string, answerId: string) {
  const b = writeBatch(db);
  b.set(doc(collection(db, "reports")), { targetType: "cafeAnswer", targetId: answerId, reporterUid: uid, createdAt: serverTimestamp() });
  await b.commit();
}

/* ---------- すべてのデータを削除（farm-api の deleteEverything から呼ぶ） ---------- */
export async function cafeRefsOf(uid: string) {
  const refs = async (q: Query) => (await getDocs(q)).docs.map((d) => d.ref);
  return [
    ...(await refs(query(collection(db, "cafeReactions"), where("fromUid", "==", uid)))),
    ...(await refs(query(collection(db, "cafeReactions"), where("toUid", "==", uid)))),
    ...(await refs(query(collection(db, "cafeAnswers"), where("uid", "==", uid)))),
  ];
}

/* =========================================================
   運営用（admins/{uid} に登録された人だけが使える。ルールで守っている）
   ========================================================= */
export type CafeReport = { id: string; targetId: string; reporterUid: string; handled?: boolean; createdAt?: Timestamp | null };

// 危機的な言葉を含む回答（ほかの村人には届いていない）
export async function loadReview(): Promise<CafeAnswer[]> {
  const snap = await getDocs(query(collection(db, "cafeAnswers"), where("status", "==", "review")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CafeAnswer);
}

export async function loadPending(): Promise<CafeAnswer[]> {
  const snap = await getDocs(query(collection(db, "cafeAnswers"), where("status", "==", "pending")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CafeAnswer);
}

// 通報を受けて、シリーズごと止める。remove なら通報された言葉は削除し、残りを非公開にする
export async function adminRetireSeries(answer: CafeAnswer, remove: boolean) {
  const snap = await getDocs(query(collection(db, "cafeAnswers"), where("sessionId", "==", answer.sessionId)));
  const b = writeBatch(db);
  for (const d of snap.docs) {
    if (remove && d.id === answer.id) b.delete(d.ref);
    else if (d.data().status === "public" || d.data().status === "pending") b.update(d.ref, { status: "private" });
  }
  await b.commit();
}

// まだ確認していない、カフェの言葉への通報。回答ごとにまとめる
export async function loadOpenReports(): Promise<{ answer: CafeAnswer | null; targetId: string; reports: CafeReport[] }[]> {
  const snap = await getDocs(query(collection(db, "reports"), where("targetType", "==", "cafeAnswer")));
  const open = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as CafeReport)
    .filter((r) => !r.handled);
  const byTarget = new Map<string, CafeReport[]>();
  for (const r of open) byTarget.set(r.targetId, [...(byTarget.get(r.targetId) ?? []), r]);
  return Promise.all([...byTarget.entries()].map(async ([targetId, reports]) => {
    const a = await getDoc(doc(db, "cafeAnswers", targetId));
    return { targetId, reports, answer: a.exists() ? ({ id: a.id, ...a.data() } as CafeAnswer) : null };
  }));
}

export async function markReportsHandled(reportIds: string[]) {
  const b = writeBatch(db);
  reportIds.forEach((id) => b.update(doc(db, "reports", id), { handled: true, handledAt: serverTimestamp() }));
  await b.commit();
}
