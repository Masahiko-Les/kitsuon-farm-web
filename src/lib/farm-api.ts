import { deleteUser, signOut } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc,
  type Timestamp, where, writeBatch, type DocumentReference, type Query,
} from "firebase/firestore";

import { auth, db } from "./firebase";
import { MAP_ID, MAX_WATERERS, TERMS_VERSION, keyOf } from "./game";

export type Seed = {
  id: string;
  ownerUid: string;
  ownerName: string;
  mapId: string;
  x: number;
  y: number;
  status: "public" | "review" | "hidden";
  waterCount: number;
  waterers: string[];
  createdAt?: Timestamp | null;
};

export type Letter = {
  id: string;
  seedId: string;
  toUid: string;
  toName: string;
  fromUid: string;
  fromName: string;
  seedText: string;
  text: string;
  status: "unread" | "read" | "thanked" | "reported";
  createdAt?: Timestamp | null;
};

export type CropDoc = {
  id: string;
  letterId: string;
  seedId: string;
  cropType: string;
  ownerUids: string[];
  sowerUid: string;
  sowerName: string;
  watererUid: string;
  watererName: string;
  seedText: string;
  letterText: string;
  harvestedAt?: Timestamp | null;
};

export type UserDoc = { villagerName: string; termsVersion?: number };

export const millis = (ts?: Timestamp | null) => (ts && ts.toMillis ? ts.toMillis() : Date.now());
export const dateText = (ts?: Timestamp | null) => {
  const d = ts && ts.toDate ? ts.toDate() : new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/* ---------- 村人 ---------- */
export async function loadUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? (snap.data() as UserDoc) : null;
}

export async function registerName(uid: string, name: string) {
  await setDoc(doc(db, "users", uid), { villagerName: name, createdAt: serverTimestamp() });
}

export async function agreeTerms(uid: string, name: string) {
  await setDoc(doc(db, "users", uid), { villagerName: name, termsVersion: TERMS_VERSION, agreedAt: serverTimestamp() }, { merge: true });
}

/* ---------- 種 ---------- */
export async function sowSeed(uid: string, name: string, x: number, y: number, text: string, status: "public" | "review") {
  const id = keyOf(x, y);
  const batch = writeBatch(db);
  batch.set(doc(db, "seeds", id), {
    ownerUid: uid,
    ownerName: name,
    mapId: MAP_ID,
    x, y,
    status,
    waterCount: 0,
    waterers: [],
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "seedBodies", id), { ownerUid: uid, text });
  await batch.commit();
}

export async function readSeedText(id: string): Promise<string> {
  const snap = await getDoc(doc(db, "seedBodies", id));
  return snap.exists() ? (snap.data().text as string) : "";
}

// 自分が水やりのときに送った手紙（送った本人は読める）
export async function readMyLetter(seedId: string, uid: string): Promise<Letter | null> {
  const snap = await getDoc(doc(db, "letters", `${seedId}_${uid}`));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Letter) : null;
}

/* ---------- 水やり（トランザクション） ---------- */
export async function waterSeed(uid: string, name: string, seed: Seed, seedText: string, text: string) {
  const seedRef = doc(db, "seeds", seed.id);
  const letterRef = doc(db, "letters", `${seed.id}_${uid}`);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(seedRef);
    if (!snap.exists() || snap.data().status !== "public") throw new Error("gone");
    const data = snap.data();
    const waterers: string[] = data.waterers || [];
    if (waterers.includes(uid)) throw new Error("already");
    if ((data.waterCount || 0) >= MAX_WATERERS) throw new Error("full");
    tx.update(seedRef, { waterCount: (data.waterCount || 0) + 1, waterers: [...waterers, uid] });
    tx.set(letterRef, {
      seedId: seed.id,
      toUid: data.ownerUid,
      toName: data.ownerName,
      fromUid: uid,
      fromName: name,
      seedText,
      text,
      status: "unread",
      createdAt: serverTimestamp(),
    });
  });
}

/* ---------- 手紙 ---------- */
export async function markRead(letter: Letter) {
  const b = writeBatch(db);
  b.update(doc(db, "letters", letter.id), { status: "read" });
  await b.commit();
}

// ありがとう（バッチ書き込み）
export async function sayThanks(uid: string, name: string, letter: Letter, cropType: string) {
  const b = writeBatch(db);
  b.update(doc(db, "letters", letter.id), { status: "thanked" });
  b.set(doc(db, "crops", letter.id), {
    letterId: letter.id,
    seedId: letter.seedId,
    cropType,
    ownerUids: [uid, letter.fromUid],
    sowerUid: uid,
    sowerName: name,
    watererUid: letter.fromUid,
    watererName: letter.fromName,
    seedText: letter.seedText || "",
    letterText: letter.text,
    harvestedAt: serverTimestamp(),
  });
  await b.commit();
}

/* ---------- 通報・ブロック ---------- */
export async function reportSeed(uid: string, seedId: string) {
  const b = writeBatch(db);
  b.set(doc(collection(db, "reports")), { targetType: "seed", targetId: seedId, reporterUid: uid, createdAt: serverTimestamp() });
  await b.commit();
}

export async function reportLetter(uid: string, letter: Letter) {
  const b = writeBatch(db);
  b.set(doc(collection(db, "reports")), { targetType: "letter", targetId: letter.id, reporterUid: uid, createdAt: serverTimestamp() });
  b.update(doc(db, "letters", letter.id), { status: "reported" });
  await b.commit();
}

export async function blockUser(uid: string, otherUid: string) {
  await setDoc(doc(db, "users", uid, "blocks", otherUid), { createdAt: serverTimestamp() });
}

/* ---------- すべてのデータを削除 ---------- */
async function deleteAll(refs: DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 400) {
    const b = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => b.delete(r));
    await b.commit();
  }
}

export async function deleteEverything(uid: string) {
  const refsOf = async (q: Query) => (await getDocs(q)).docs.map((d) => d.ref);

  const blocks = await getDocs(collection(db, "users", uid, "blocks"));
  const crops = await refsOf(query(collection(db, "crops"), where("ownerUids", "array-contains", uid)));
  const lettersTo = await refsOf(query(collection(db, "letters"), where("toUid", "==", uid)));
  const lettersFrom = await refsOf(query(collection(db, "letters"), where("fromUid", "==", uid)));
  const seeds = await getDocs(query(collection(db, "seeds"), where("ownerUid", "==", uid)));

  await deleteAll(blocks.docs.map((d) => d.ref));
  await deleteAll([...crops, ...lettersTo, ...lettersFrom]);
  await deleteAll(seeds.docs.map((d) => doc(db, "seedBodies", d.id)));
  await deleteAll(seeds.docs.map((d) => d.ref));
  await deleteAll([doc(db, "users", uid)]);

  const user = auth.currentUser;
  if (user && user.uid === uid) {
    try {
      await deleteUser(user);
    } catch (e) {
      // 匿名アカウントは再ログインできないため、消せなかった場合はログアウトだけする
      console.error(e);
      await signOut(auth);
    }
  }
}
