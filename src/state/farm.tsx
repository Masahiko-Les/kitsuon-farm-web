import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import {
  type CropDoc, type Letter, type Seed, agreeTerms, deleteEverything, loadBlocks, loadCrops, loadIsAdmin, loadLettersTo,
  loadMySeeds, loadPublicSeeds, loadUser, millis, registerName,
} from "@/lib/farm-api";
import { CAFE_HIDDEN_KEY } from "@/lib/cafe-api";
import { DEV_HIDDEN_KEY } from "@/lib/dev-api";
import { RESIDENT_HIDDEN_KEY } from "@/lib/resident-api";
import { isConfigured, supabase } from "@/lib/supabase";
import { type Crop, TERMS_VERSION, cropById, randomCrop } from "@/lib/game";
import { type MayorSeedState, mayorCropOf, mayorSeedKey } from "@/lib/mayor-seed";

const HIDDEN_KEY = "kitsuon-hidden-seeds";
const desertIntroKey = (uid: string) => `kitsuon-desert-intro-${uid}`;
const SEEN_THANKS_KEY = "kitsuon-seen-thanks";

export type Phase = "loading" | "error" | "name" | "terms" | "ready";

type FarmState = {
  phase: Phase;
  errorMessage: string;
  uid: string;
  name: string;
  isAdmin: boolean; // 運営（admins/{uid} がある）。カフェの言葉の確認画面を使える
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
  mayorSeed: MayorSeedState; // 村長が蒔いた種（新しい村人の、初めての水やりの練習。端末に保存）
  mayorCrop: CropDoc | null; // 村長の種に水やりして咲いた花（思い出帳に入れる）
  waterMayorSeed: (x: number, y: number, letter: string) => Crop;
  desertIntroSeen: boolean | null; // 砂漠の村長の話を聞いたか（null は読み込み中。端末に保存）
  markDesertIntroSeen: () => void;
  justJoined: boolean; // 名前を登録して同意したばかり（村長のオリエンテーションを出す）
  clearJustJoined: () => void;
  refresh: () => void; // 自分で書き込んだあと、Realtime の通知を待たずに一覧を読み直す
};

const FarmContext = createContext<FarmState | null>(null);
export function useFarm() {
  const v = useContext(FarmContext);
  if (!v) throw new Error("FarmProvider がありません");
  return v;
}

export function FarmProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  // Supabase の設定値が未入力のあいだは、保存なしでマップだけ歩ける（おためしモード）
  const [phase, setPhase] = useState<Phase>(isConfigured ? "loading" : "ready");
  const [errorMessage, setErrorMessage] = useState("");
  const [uid, setUid] = useState(isConfigured ? "" : "offline");
  const [name, setName] = useState(isConfigured ? "" : "おためし");
  const [isAdmin, setIsAdmin] = useState(false);

  // 運営かどうか（admins テーブルは Supabase のダッシュボードからだけ書ける）
  useEffect(() => {
    if (phase !== "ready" || !uid || !isConfigured) return;
    let alive = true;
    loadIsAdmin(uid).then((v) => { if (alive) setIsAdmin(v); }).catch((e) => console.error("admin", e));
    return () => { alive = false; setIsAdmin(false); };
  }, [phase, uid]);
  const [publicSeeds, setPublicSeeds] = useState(new Map<string, Seed>());
  const [mySeeds, setMySeeds] = useState(new Map<string, Seed>());
  const [rawLetters, setRawLetters] = useState<Letter[]>([]);
  const [crops, setCrops] = useState<CropDoc[]>([]);
  const [blocked, setBlocked] = useState(new Set<string>());
  const [hiddenSeeds, setHiddenSeeds] = useState(new Set<string>());
  const [seenThanks, setSeenThanks] = useState(new Set<string>());
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);
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

  // 「ありがとう」を読んだ印（花の記録は書き換えられないので端末に保存）
  const markThanksSeen = useCallback((id: string) => {
    setSeenThanks((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(SEEN_THANKS_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // 匿名ログインと村人情報。セッションがなければ匿名でサインインする（ブラウザに保存され、次も同じ村人）
  useEffect(() => {
    if (!isConfigured) return;
    let lastUid = "";
    const handle = async (user: { id: string } | null) => {
      if (!user) {
        lastUid = "";
        setPhase("loading");
        setUid("");
        setName("");
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          setErrorMessage("ログインできませんでした。Supabase の設定（匿名サインイン）を確認してください。");
          setPhase("error");
          console.error(error);
        }
        return; // サインインできたら、もう一度ここに来る
      }
      if (user.id === lastUid) return; // トークンの更新など、同じ村人のまま
      lastUid = user.id;
      try {
        const u = await loadUser(user.id);
        setUid(user.id);
        setName(u?.villagerName ?? "");
        setPhase(!u ? "name" : (u.termsVersion ?? 0) < TERMS_VERSION ? "terms" : "ready");
      } catch (e) {
        lastUid = "";
        setErrorMessage("読み込めませんでした。通信を確認して、ページを開き直してください。");
        setPhase("error");
        console.error(e);
      }
    };
    // コールバックの中で Supabase を待つと固まることがあるので、一度外に出してから処理する
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => { handle(session?.user ?? null); }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // 新しく村に来た人（名前を登録した人）。同意のあとに村長のオリエンテーションを出す。規約の改定で同意し直す人には出さない
  const newcomer = useRef(false);
  const [justJoined, setJustJoined] = useState(false);
  const clearJustJoined = useCallback(() => setJustJoined(false), []);

  // 村長の種。村人ごとに端末へ保存する
  const [mayorSeed, setMayorSeed] = useState<MayorSeedState>({ state: "none" });
  const saveMayorSeed = useCallback((id: string, v: MayorSeedState) => {
    setMayorSeed(v);
    AsyncStorage.setItem(mayorSeedKey(id), JSON.stringify(v)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    AsyncStorage.getItem(mayorSeedKey(uid))
      .then((v) => { if (alive && v) setMayorSeed(JSON.parse(v)); })
      .catch(() => {});
    return () => { alive = false; setMayorSeed({ state: "none" }); };
  }, [uid]);
  // 砂漠に初めて種を蒔くときの村長の話。村人ごとに端末へ保存する
  const [desertIntroSeen, setDesertIntroSeen] = useState<boolean | null>(null);
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    AsyncStorage.getItem(desertIntroKey(uid))
      .then((v) => { if (alive) setDesertIntroSeen(v === "1"); })
      .catch(() => { if (alive) setDesertIntroSeen(false); });
    return () => { alive = false; setDesertIntroSeen(null); };
  }, [uid]);
  const markDesertIntroSeen = useCallback(() => {
    setDesertIntroSeen(true);
    AsyncStorage.setItem(desertIntroKey(uid), "1").catch(() => {});
  }, [uid]);

  const waterMayorSeed = useCallback((x: number, y: number, letter: string) => {
    const crop = randomCrop(`${x}_${y}`);
    saveMayorSeed(uid, { state: "done", x, y, letter, bloom: crop.id, at: new Date().toISOString() });
    return crop;
  }, [uid, saveMayorSeed]);
  const mayorCrop = useMemo(
    () => (mayorSeed.state === "done" ? mayorCropOf(uid, name, mayorSeed) : null),
    [mayorSeed, uid, name],
  );

  const register = useCallback(async (n: string) => {
    await registerName(uid, n);
    newcomer.current = true;
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
    await AsyncStorage.multiRemove([HIDDEN_KEY, SEEN_THANKS_KEY, CAFE_HIDDEN_KEY, DEV_HIDDEN_KEY, RESIDENT_HIDDEN_KEY, mayorSeedKey(current), desertIntroKey(current)]).catch(() => {});
    setHiddenSeeds(new Set());
    setSeenThanks(new Set());
  }, [uid]);

  const agree = useCallback(async () => {
    await agreeTerms(uid, name);
    if (newcomer.current) {
      newcomer.current = false;
      saveMayorSeed(uid, { state: "pending" });
      setJustJoined(true);
    }
    setPhase("ready");
  }, [uid, name, saveMayorSeed]);

  // 購読。最初に一覧を読み、Supabase Realtime で変化が届いたら読み直す（短い間隔はまとめる）
  useEffect(() => {
    if (phase !== "ready" || !uid || !isConfigured) return;
    let alive = true;
    const loaders = {
      publicSeeds: async () => { const l = await loadPublicSeeds(); if (alive) setPublicSeeds(new Map(l.map((x) => [x.id, x]))); },
      mySeeds: async () => { const l = await loadMySeeds(uid); if (alive) setMySeeds(new Map(l.map((x) => [x.id, x]))); },
      letters: async () => { const l = await loadLettersTo(uid); if (alive) setRawLetters(l); },
      crops: async () => { const l = await loadCrops(uid); if (alive) setCrops(l); },
      blocks: async () => { const l = await loadBlocks(uid); if (alive) setBlocked(new Set(l)); },
    };
    type Key = keyof typeof loaders;
    const timers = new Map<Key, ReturnType<typeof setTimeout>>();
    const reload = (k: Key) => {
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => { loaders[k]().catch((e) => console.error(k, e)); }, 150));
    };
    const refreshAll = () => (Object.keys(loaders) as Key[]).forEach(reload);
    refreshRef.current = refreshAll;
    refreshAll();

    const channel = supabase.channel(`farm-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seeds" }, () => {
        reload("publicSeeds");
        reload("mySeeds");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "letters", filter: `to_uid=eq.${uid}` }, (p) => {
        const from = (p.new as { from_uid?: string }).from_uid ?? "";
        // 自分の種への水やり（自分から自分への手紙）は、水やりのときに知らせているので出さない
        if (p.eventType === "INSERT" && from !== uid && !blockedRef.current.has(from)) {
          toast("郵便受けに手紙が届きました。");
        }
        reload("letters");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crops", filter: `sower_uid=eq.${uid}` }, () => reload("crops"))
      .on("postgres_changes", { event: "*", schema: "public", table: "crops", filter: `waterer_uid=eq.${uid}` }, (p) => {
        const c = p.new as { sower_uid: string; crop_type: string };
        if (p.eventType === "INSERT" && c.sower_uid !== uid) {
          toast(`種を蒔いた人から「ありがとう」。あなたの言葉で${cropById(c.crop_type).name}が咲きました。`);
        }
        reload("crops");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "blocks", filter: `owner_uid=eq.${uid}` }, () => reload("blocks"))
      // つながった（つながり直した）ときは、そのあいだの変化を取りこぼさないように全部読み直す
      .subscribe((status) => { if (status === "SUBSCRIBED") refreshAll(); });

    return () => {
      alive = false;
      refreshRef.current = () => {};
      timers.forEach((t) => clearTimeout(t));
      supabase.removeChannel(channel);
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
    .filter((c) => c.watererUid === uid && c.sowerUid !== uid && !blocked.has(c.sowerUid)) // 自分への水やりの花は除く
    .sort((a, b) => millis(b.harvestedAt) - millis(a.harvestedAt)), [crops, uid, blocked]);
  const unreadCount = letters.filter((l) => l.status === "unread").length
    + thanks.filter((c) => !seenThanks.has(c.id)).length;

  const value: FarmState = {
    phase, errorMessage, uid, name, isAdmin, publicSeeds, mySeeds, letters, crops, thanks, seenThanks, blocked, hiddenSeeds,
    unreadCount, register, agree, hideSeed, markThanksSeen, deleteAllData, mayorSeed, mayorCrop, waterMayorSeed, desertIntroSeen, markDesertIntroSeen, justJoined, clearJustJoined, refresh,
  };
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}
