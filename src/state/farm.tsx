import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import {
  type CropDoc, type Letter, type Seed, agreeTerms, deleteEverything, loadUser, millis, registerName,
} from "@/lib/farm-api";
import { auth, db, isConfigured } from "@/lib/firebase";
import { TERMS_VERSION, cropById } from "@/lib/game";

const HIDDEN_KEY = "kitsuon-hidden-seeds";
const SEEN_THANKS_KEY = "kitsuon-seen-thanks";

export type Phase = "loading" | "error" | "name" | "terms" | "ready";

type FarmState = {
  phase: Phase;
  errorMessage: string;
  uid: string;
  name: string;
  publicSeeds: Map<string, Seed>;
  mySeeds: Map<string, Seed>;
  letters: Letter[]; // 通報済み・ブロック済みを除いた、新しい順
  crops: CropDoc[];
  thanks: CropDoc[]; // 水やりした種の人から届いた「ありがとう」。新しい順
  seenThanks: Set<string>;
  blocked: Set<string>;
  hiddenSeeds: Set<string>;
  unreadCount: number;
  register: (name: string) => Promise<void>;
  agree: () => Promise<void>;
  hideSeed: (id: string) => void;
  markThanksSeen: (id: string) => void;
  deleteAllData: () => Promise<void>;
};

const FarmContext = createContext<FarmState | null>(null);
export function useFarm() {
  const v = useContext(FarmContext);
  if (!v) throw new Error("FarmProvider がありません");
  return v;
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  // Firebase の設定値が未入力のあいだは、保存なしでマップだけ歩ける
  const [phase, setPhase] = useState<Phase>(isConfigured ? "loading" : "ready");
  const [errorMessage, setErrorMessage] = useState("");
  const [uid, setUid] = useState(isConfigured ? "" : "offline");
  const [name, setName] = useState(isConfigured ? "" : "おためし");
  const [publicSeeds, setPublicSeeds] = useState(new Map<string, Seed>());
  const [mySeeds, setMySeeds] = useState(new Map<string, Seed>());
  const [rawLetters, setRawLetters] = useState<Letter[]>([]);
  const [crops, setCrops] = useState<CropDoc[]>([]);
  const [blocked, setBlocked] = useState(new Set<string>());
  const [hiddenSeeds, setHiddenSeeds] = useState(new Set<string>());
  const [seenThanks, setSeenThanks] = useState(new Set<string>());
  const blockedRef = useRef(blocked);
  useEffect(() => { blockedRef.current = blocked; }, [blocked]);

  // 通報して隠した種（端末に保存）
  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY)
      .then((v) => { if (v) setHiddenSeeds(new Set(JSON.parse(v))); })
      .catch(() => {});
    AsyncStorage.getItem(SEEN_THANKS_KEY)
      .then((v) => { if (v) setSeenThanks(new Set(JSON.parse(v))); })
      .catch(() => {});
  }, []);

  const hideSeed = useCallback((id: string) => {
    setHiddenSeeds((prev) => {
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // 「ありがとう」を読んだ印（作物は書き換えられないので端末に保存）
  const markThanksSeen = useCallback((id: string) => {
    setSeenThanks((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(SEEN_THANKS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // 匿名ログインと村人情報
  useEffect(() => {
    if (!isConfigured) return;
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setPhase("loading");
        setUid("");
        setName("");
        try { await signInAnonymously(auth); } catch (e) {
          setErrorMessage("ログインできませんでした。Firebaseの設定（匿名認証）を確認してください。");
          setPhase("error");
          console.error(e);
        }
        return;
      }
      try {
        const u = await loadUser(user.uid);
        setUid(user.uid);
        setName(u?.villagerName ?? "");
        setPhase(!u ? "name" : (u.termsVersion ?? 0) < TERMS_VERSION ? "terms" : "ready");
      } catch (e) {
        setErrorMessage("読み込めませんでした。Firebaseの設定を確認してください。");
        setPhase("error");
        console.error(e);
      }
    });
  }, []);

  const register = useCallback(async (n: string) => {
    await registerName(uid, n);
    setName(n);
    setPhase("terms");
  }, [uid]);

  // すべてのデータを削除。購読を止めてから消し、新しい匿名アカウントで最初からになる。
  const deleteAllData = useCallback(async () => {
    const current = uid;
    setPhase("loading");
    try {
      await deleteEverything(current);
    } catch (e) {
      setPhase("ready");
      throw e;
    }
    await AsyncStorage.multiRemove([HIDDEN_KEY, SEEN_THANKS_KEY]).catch(() => {});
    setHiddenSeeds(new Set());
    setSeenThanks(new Set());
  }, [uid]);

  const agree = useCallback(async () => {
    await agreeTerms(uid, name);
    setPhase("ready");
  }, [uid, name]);

  // Firestore の購読
  useEffect(() => {
    if (phase !== "ready" || !uid || !isConfigured) return;
    const unsubs: (() => void)[] = [];

    unsubs.push(onSnapshot(query(collection(db, "seeds"), where("status", "==", "public")), (snap) => {
      setPublicSeeds(new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Seed])));
    }, (e) => console.error("seeds", e)));

    unsubs.push(onSnapshot(query(collection(db, "seeds"), where("ownerUid", "==", uid)), (snap) => {
      setMySeeds(new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Seed])));
    }, (e) => console.error("mySeeds", e)));

    let lettersReady = false;
    unsubs.push(onSnapshot(query(collection(db, "letters"), where("toUid", "==", uid)), (snap) => {
      if (lettersReady) {
        snap.docChanges().forEach((ch) => {
          if (ch.type === "added" && !blockedRef.current.has(ch.doc.data().fromUid)) toast("郵便受けに手紙が届きました。");
        });
      }
      lettersReady = true;
      setRawLetters(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Letter));
    }, (e) => console.error("letters", e)));

    let cropsReady = false;
    unsubs.push(onSnapshot(query(collection(db, "crops"), where("ownerUids", "array-contains", uid)), (snap) => {
      if (cropsReady) {
        snap.docChanges().forEach((ch) => {
          const c = ch.doc.data() as CropDoc;
          if (ch.type === "added" && c.watererUid === uid) {
            toast(`${c.sowerName}さんから「ありがとう」。あなたの言葉で${cropById(c.cropType).name}が実りました。`);
          }
        });
      }
      cropsReady = true;
      setCrops(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as CropDoc));
    }, (e) => console.error("crops", e)));

    unsubs.push(onSnapshot(collection(db, "users", uid, "blocks"), (snap) => {
      setBlocked(new Set(snap.docs.map((d) => d.id)));
    }, (e) => console.error("blocks", e)));

    return () => {
      unsubs.forEach((u) => u());
      setPublicSeeds(new Map());
      setMySeeds(new Map());
      setRawLetters([]);
      setCrops([]);
      setBlocked(new Set());
    };
  }, [phase, uid, toast]);

  const letters = useMemo(() => rawLetters
    .filter((l) => l.status !== "reported" && !blocked.has(l.fromUid))
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt)), [rawLetters, blocked]);
  const thanks = useMemo(() => crops
    .filter((c) => c.watererUid === uid && !blocked.has(c.sowerUid))
    .sort((a, b) => millis(b.harvestedAt) - millis(a.harvestedAt)), [crops, uid, blocked]);
  const unreadCount = letters.filter((l) => l.status === "unread").length
    + thanks.filter((c) => !seenThanks.has(c.id)).length;

  const value: FarmState = {
    phase, errorMessage, uid, name, publicSeeds, mySeeds, letters, crops, thanks, seenThanks, blocked, hiddenSeeds,
    unreadCount, register, agree, hideSeed, markThanksSeen, deleteAllData,
  };
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}
