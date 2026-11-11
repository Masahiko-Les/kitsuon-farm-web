// ほかの村人（同じ時間に村を歩いている人）の姿。Supabase Realtime の Presence と Broadcast を使い、データベースには何も残さない。
// ・送るのは、場所（area・x・y・向き）だけ。uid と名前は送らない（開くたびに作る使い捨ての ID で区別する）
// ・場所（村のマップ・カフェ・村役場）ごとにチャンネルを分け、1つの村は VILLAGE_CAP 人まで。いっぱいなら次の村に入る
// ・家の中と、タブが裏に回っているあいだは、どのチャンネルにも入らない
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef } from "react";

import type { Other } from "@/components/farm-map";
import { type Area, DIRS, type Dir, ROOMS, type RoomId, WALKABLE, roomTileAt, tileAt } from "@/lib/game";
import { supabase } from "@/lib/supabase";

export const VILLAGE_CAP = 10; // 1つの村に入れる人数（自分を含む）
const MAX_VILLAGES = 30; // 探す村の数の上限
const SETTLE_MS = 800; // 立ち止まってから、いまの場所を Presence に書くまで
const MAX_OTHERS = 30; // 念のため、画面に出す人数の上限

type Spot = { area: Area; x: number; y: number; dir: Dir };
type Shared = "farm" | "cafe" | "hall";

const shared = (a: Area): a is Shared => a !== "house";
const isDir = (d: unknown): d is Dir => typeof d === "string" && d in DIRS;
// 受け取った場所が、その場所で村人の立てるマスかを確かめる（誰でも送れるので、変な値は捨てる）
function validSpot(area: Shared, v: unknown): { x: number; y: number; dir: Dir } | null {
  if (!v || typeof v !== "object") return null;
  const { x, y, dir } = v as Record<string, unknown>;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !isDir(dir)) return null;
  const nx = x as number, ny = y as number;
  if (area === "farm") return WALKABLE.has(tileAt(nx, ny)) || tileAt(nx, ny) === "L" ? { x: nx, y: ny, dir } : null; // L=ベンチに座っている
  const c = roomTileAt(area as RoomId, nx, ny);
  return ROOMS[area].walkable.has(c) || c === "s" ? { x: nx, y: ny, dir } : null;
}
// 服の色の組み合わせを、ID から決める
function lookOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}
const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// others：描画ループが毎フレーム読む（React の再描画はしない）
export function useVillagers(enabled: boolean, others: Map<string, Other>) {
  const me = useRef<Spot>({ area: "farm", x: 16, y: 17, dir: "down" }); // すぐに announce で本当の場所に変わる
  const ch = useRef<{ channel: RealtimeChannel; area: Shared; joined: boolean } | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0); // 入り直しのたびに増やす。古い入室の処理を止める
  const id = useRef(newId());

  const leave = useCallback(() => {
    gen.current++;
    if (settle.current) clearTimeout(settle.current);
    const c = ch.current;
    ch.current = null;
    others.clear();
    if (c) supabase.removeChannel(c.channel);
  }, [others]);

  // ほかの村人を、新しい場所に置く。となりのマスなら歩かせ、離れていればその場に立たせる
  const place = useCallback((key: string, s: { x: number; y: number; dir: Dir }) => {
    const now = performance.now();
    const o = others.get(key);
    if (!o) {
      if (others.size >= MAX_OTHERS) return;
      others.set(key, { ...s, fromX: s.x, fromY: s.y, moveStart: 0, walkStart: 0, walkUntil: 0, look: lookOf(key) });
      return;
    }
    o.dir = s.dir;
    if (o.x === s.x && o.y === s.y) return;
    if (Math.abs(o.x - s.x) + Math.abs(o.y - s.y) === 1) {
      o.fromX = o.x; o.fromY = o.y;
      if (now > o.walkUntil) o.walkStart = now;
      o.walkUntil = now + 230;
      o.moveStart = now;
    } else {
      Object.assign(o, { fromX: s.x, fromY: s.y, moveStart: 0, walkUntil: 0 });
    }
    o.x = s.x; o.y = s.y;
  }, [others]);

  const join = useCallback(async () => {
    leave();
    const area = me.current.area;
    if (!enabled || !shared(area)) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    const g = gen.current;
    for (let n = 1; n <= MAX_VILLAGES; n++) {
      const channel = supabase.channel(`village:${area}:${n}`, {
        config: { presence: { key: id.current }, broadcast: { self: false } },
      });
      // 入る前に、その村の人数を数える
      const synced = new Promise<number>((resolve) => {
        channel.on("presence", { event: "sync" }, () => resolve(Object.keys(channel.presenceState()).length));
        setTimeout(() => resolve(-1), 5000);
      });
      channel.on("presence", { event: "sync" }, () => {
        const c = ch.current;
        if (!c || c.channel !== channel || !c.joined) return;
        const state = channel.presenceState();
        for (const key of [...others.keys()]) if (!state[key]) others.delete(key);
        for (const [key, metas] of Object.entries(state)) {
          if (key === id.current) continue;
          const s = validSpot(area, metas[metas.length - 1]);
          if (s) place(key, s);
        }
      });
      channel.on("broadcast", { event: "move" }, ({ payload }) => {
        const c = ch.current;
        if (!c || c.channel !== channel || !c.joined) return;
        const key = (payload as { id?: unknown })?.id;
        // Presence にいる人の動きだけ受け取る
        if (typeof key !== "string" || key === id.current || !channel.presenceState()[key]) return;
        const s = validSpot(area, payload);
        if (s) place(key, s);
      });
      channel.subscribe();
      const count = await synced;
      if (g !== gen.current) { supabase.removeChannel(channel); return; }
      if (count < 0 || count >= VILLAGE_CAP) {
        // つながらないか、いっぱい。つながらないときはあきらめる（姿が見えないだけで、遊ぶのには困らない）
        supabase.removeChannel(channel);
        if (count < 0) return;
        continue;
      }
      ch.current = { channel, area, joined: true };
      const { x, y, dir } = me.current;
      await channel.track({ x, y, dir });
      return;
    }
  }, [enabled, leave, place, others]);

  // 自分が動いたら知らせる。場所（area）が変わったら、その場所の村に入り直す
  const announce = useCallback((area: Area, x: number, y: number, dir: Dir) => {
    const prev = me.current;
    me.current = { area, x, y, dir };
    if (prev.area !== area) { void join(); return; }
    const c = ch.current;
    if (!c?.joined) return;
    if (prev.x === x && prev.y === y && prev.dir === dir) return;
    void c.channel.send({ type: "broadcast", event: "move", payload: { id: id.current, x, y, dir } });
    // 立ち止まったら、いまの場所を Presence に残す（あとから来た人に見えるように）
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const cur = ch.current;
      if (cur?.joined) void cur.channel.track({ x: me.current.x, y: me.current.y, dir: me.current.dir });
    }, SETTLE_MS);
  }, [join]);

  useEffect(() => {
    void join();
    if (typeof document === "undefined") return leave;
    const onVis = () => { if (document.visibilityState === "hidden") leave(); else void join(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); leave(); };
  }, [join, leave]);

  return announce;
}
