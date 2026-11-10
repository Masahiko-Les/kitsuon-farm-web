import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import {
  type CropDoc, type Letter, type Seed, agreeTerms, deleteEverything, loadBlocks, loadCrops, loadIsAdmin, loadLettersTo,
  loadMySeeds, loadPublicSeeds, loadUser, millis, registerName,
} from "@/lib/farm-api";
import { CAFE_HIDDEN_KEY } from "@/lib/cafe-api";
import { isConfigured, supabase } from "@/lib/supabase";
import { TERMS_VERSION, cropById } from "@/lib/game";

const HIDDEN_KEY = "kitsuon-hidden-seeds";
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
    await AsyncStorage.multiRemove([HIDDEN_KEY, SEEN_THANKS_KEY, CAFE_HIDDEN_KEY]).catch(() => {});
    setHiddenSeeds(new Set());
    setSeenThanks(new Set());
  }, [uid]);

  const agree = useCallback(async () => {
    await agreeTerms(uid, name);
    setPhase("ready");
  }, [uid, name]);

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
    const refresh = (k: Key) => {
      clearTimeout(timers.get(k));
      timers.set(k, setTimeout(() => { loaders[k]().catch((e) => console.error(k, e)); }, 150));
    };
    const refreshAll = () => (Object.keys(loaders) as Key[]).forEach(refresh);
    refreshAll();

    const channel = supabase.channel(`farm-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "seeds" }, () => {
        refresh("publicSeeds");
        refresh("mySeeds");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "letters", filter: `to_uid=eq.${uid}` }, (p) => {
        if (p.eventType === "INSERT" && !blockedRef.current.has((p.new as { from_uid: string }).from_uid)) {
          toast("郵便受けに手紙が届きました。");
        }
        refresh("letters");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "crops", filter: `sower_uid=eq.${uid}` }, () => refresh("crops"))
      .on("postgres_changes", { event: "*", schema: "public", table: "crops", filter: `waterer_uid=eq.${uid}` }, (p) => {
        if (p.eventType === "INSERT") {
          const c = p.new as { sower_name: string; crop_type: string };
          toast(`${c.sower_name}さんから「ありがとう」。あなたの言葉で${cropById(c.crop_type).name}が実りました。`);
        }
        refresh("crops");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "blocks", filter: `owner_uid=eq.${uid}` }, () => refresh("blocks"))
      // つながった（つながり直した）ときは、そのあいだの変化を取りこぼさないように全部読み直す
      .subscribe((status) => { if (status === "SUBSCRIBED") refreshAll(); });

    return () => {
      alive = false;
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
    .filter((c) => c.watererUid === uid && !blocked.has(c.sowerUid))
    .sort((a, b) => millis(b.harvestedAt) - millis(a.harvestedAt)), [crops, uid, blocked]);
  const unreadCount = letters.filter((l) => l.status === "unread").length
    + thanks.filter((c) => !seenThanks.has(c.id)).length;

  const value: FarmState = {
    phase, errorMessage, uid, name, isAdmin, publicSeeds, mySeeds, letters, crops, thanks, seenThanks, blocked, hiddenSeeds,
    unreadCount, register, agree, hideSeed, markThanksSeen, deleteAllData,
  };
  return <FarmContext.Provider value={value}>{children}</FarmContext.Provider>;
}
