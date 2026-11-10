import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FarmMap, type Player, type Scene, type SeedKind, playerPos } from "@/components/farm-map";
import { useModal } from "@/components/modal-host";
import { SwipeArea } from "@/components/swipe-walk";
import { useToast } from "@/components/toast";
import { T } from "@/components/ui";
import type { Seed } from "@/lib/farm-api";
import {
  type Area, BUILDINGS, CAFE_GUESTS, DIRS, type Dir, MAX_WATERERS, ROOMS, type RoomId, WALKABLE, buildingAt, canSow, isDesert, keyOf, roomTileAt, tileAt,
} from "@/lib/game";
import { useActions } from "@/modals";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

// go は建物への出入りと、カフェの丸椅子に座ること（描画ループの状態を変えるので、run とは分けて pressA で扱う）
type Action = { label: string; hint: string; run: (() => void) | null; go?: RoomId | "leave" | "sit"; seat?: { x: number; y: number } };

const ROOM_HINTS: Record<RoomId, Record<string, string>> = {
  house: {
    B: "ふかふかのベッドだ。",
    L: "木のテーブルだ。",
    K: "本がたくさん並んでいる。",
  },
  cafe: {
    "#": "棚にカップがきれいに並んでいる。",
    b: "カウンターの向こうだ。",
    P: "よく手入れされた鉢植えだ。",
  },
};
const ROOM_IDLE: Record<RoomId, string> = {
  house: "自分の家だ。ほっとする。",
  cafe: "コーヒーの香りがする。静かで、あたたかい。",
};
const doorOf = (id: RoomId) => BUILDINGS.find((b) => b.id === id)!.door;
const isRoom = (a: Area): a is RoomId => a !== "farm";

export function FarmScreen() {
  const farm = useFarm();
  const modal = useModal();
  const toast = useToast();
  const a = useActions();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  // 立ち位置と向き。ヒントとAボタンの表示に使う
  const [pos, setPos] = useState({ x: 8, y: 9, dir: "down" as Dir, area: "farm" as Area });

  /* ---------- 種の判定 ---------- */
  const seedAt = useCallback((x: number, y: number): Seed | null => {
    const k = keyOf(x, y);
    if (farm.mySeeds.has(k)) return farm.mySeeds.get(k)!;
    if (farm.hiddenSeeds.has(k)) return null;
    return farm.publicSeeds.get(k) ?? null;
  }, [farm.mySeeds, farm.publicSeeds, farm.hiddenSeeds]);

  const kindOf = useCallback((seed: Seed | null): SeedKind => {
    if (!seed) return null;
    if (seed.ownerUid === farm.uid) return seed.status === "review" ? "mine-review" : "mine";
    if ((seed.waterers || []).includes(farm.uid)) return "watered";
    if ((seed.waterCount || 0) >= MAX_WATERERS) return "full";
    return "open";
  }, [farm.uid]);

  const nearOpenSeed = useMemo(() => {
    for (const s of farm.publicSeeds.values()) {
      if (kindOf(s) !== "open" || farm.hiddenSeeds.has(s.id)) continue;
      if (Math.abs(s.x - pos.x) + Math.abs(s.y - pos.y) <= 2) return true;
    }
    return false;
  }, [farm.publicSeeds, farm.hiddenSeeds, kindOf, pos.x, pos.y]);

  /* ---------- 描画ループに渡すもの ---------- */
  const visibleSeeds = useMemo(() => {
    const m = new Map<string, Seed>();
    for (const s of farm.publicSeeds.values()) if (!farm.hiddenSeeds.has(s.id)) m.set(s.id, s);
    for (const s of farm.mySeeds.values()) m.set(s.id, s);
    return [...m.values()];
  }, [farm.publicSeeds, farm.mySeeds, farm.hiddenSeeds]);
  const sceneRef = useRef<Scene>({
    area: "farm",
    player: { x: 8, y: 9, dir: "down", fromX: 8, fromY: 9, moveStart: 0, walkStart: 0, walkUntil: 0 } satisfies Player,
    seeds: [],
    kindOf: () => null,
    hasUnread: false,
  });
  const hasUnread = farm.unreadCount > 0;
  useEffect(() => {
    Object.assign(sceneRef.current, { seeds: visibleSeeds, kindOf, hasUnread });
  }, [visibleSeeds, kindOf, hasUnread]);

  /* ---------- 移動 ---------- */
  const modalOpen = useRef(modal.isOpen);
  useEffect(() => { modalOpen.current = modal.isOpen; }, [modal.isOpen]);

  // 農場と建物の中を行き来する。歩かずに、その場に立たせる
  const warp = useCallback((area: Area, x: number, y: number, dir: Dir) => {
    const sc = sceneRef.current;
    sc.area = area;
    Object.assign(sc.player, { x, y, dir, fromX: x, fromY: y, moveStart: 0, walkUntil: 0 });
    setPos({ x, y, dir, area });
  }, []);
  const enterRoom = useCallback((id: RoomId) => warp(id, ROOMS[id].entry.x, ROOMS[id].entry.y, "up"), [warp]);
  const leaveRoom = useCallback(() => {
    const id = sceneRef.current.area;
    if (!isRoom(id)) return;
    const door = doorOf(id);
    warp("farm", door.x, door.y + 1, "down");
  }, [warp]);

  // 1マス進む。歩いている途中でも、今いる場所から次のマスへ向かい直す
  const move = useCallback((dir: Dir) => {
    if (modalOpen.current) return;
    const sc = sceneRef.current;
    const p = sc.player;
    const now = performance.now();
    p.dir = dir;
    const [dx, dy] = DIRS[dir];
    const nx = p.x + dx;
    const ny = p.y + dy;
    const area = sc.area;
    if (isRoom(area)) {
      // 出入り口へ歩くと外に出る
      const c = roomTileAt(area, nx, ny);
      if (c === "E") { leaveRoom(); return; }
      if (!ROOMS[area].walkable.has(c)) { setPos({ x: p.x, y: p.y, dir, area }); return; }
    } else {
      // 入れる建物の扉へ歩くと中に入る
      const b = buildingAt(nx, ny);
      if (b && b.enterable && b.door.x === nx && b.door.y === ny) { enterRoom(b.id as RoomId); return; }
      if (!WALKABLE.has(tileAt(nx, ny))) { setPos({ x: p.x, y: p.y, dir, area: "farm" }); return; }
    }
    const { fx, fy } = playerPos(p, now);
    p.fromX = fx; p.fromY = fy;
    p.x = nx; p.y = ny;
    p.moveStart = now;
    if (now > p.walkUntil) p.walkStart = now;
    p.walkUntil = now + 230;
    setPos({ x: nx, y: ny, dir, area: sc.area });
  }, [enterRoom, leaveRoom]);

  /* ---------- ヒントとAボタン ---------- */
  const openCafe = () => router.push("/cafe");
  const action: Action = (() => {
    const [dx, dy] = DIRS[pos.dir];
    if (isRoom(pos.area)) {
      const room = pos.area;
      const fx = pos.x + dx, fy = pos.y + dy;
      const front = roomTileAt(room, fx, fy);
      if (front === "E") return { label: "出る", hint: "外に出られる。", run: null, go: "leave" };
      if (room === "cafe") {
        const seated = roomTileAt("cafe", pos.x, pos.y) === "s";
        if (seated && front === "C") {
          return { label: "話す", hint: "マスター「いらっしゃい。今日は、どんなお話をしましょうか」", run: openCafe };
        }
        if (seated) {
          return { label: "話す", hint: "カウンター席に座っている。隣の村人も、静かにカップを傾けている。", run: openCafe };
        }
        if (front === "C" || front === "O") {
          return { label: "…", hint: "マスター「どうぞ、カウンターの空いている席へ」", run: null };
        }
        if (front === "s") {
          // 空いている丸椅子に座る。両隣の村人をヒントで伝える
          const side = CAFE_GUESTS[keyOf(fx - 1, fy)] || CAFE_GUESTS[keyOf(fx + 1, fy)] ? "隣には村人が座っている。" : "";
          return { label: "座る", hint: `カウンターの席が空いている。${side}`, run: null, go: "sit", seat: { x: fx, y: fy } };
        }
        if (front === "g") return { label: "…", hint: "村人が、カウンターでくつろいでいる。", run: null };
        if (front === "a") return { label: "…", hint: "村人が、静かにカップを傾けている。", run: null };
        if (front === "T") return { label: "…", hint: "テーブル席は埋まっているようだ。カウンターに座ろう。", run: null };
      }
      const h = ROOM_HINTS[room][front];
      if (h) return { label: "…", hint: h, run: null };
      return { label: "…", hint: ROOM_IDLE[room], run: null };
    }
    if (tileAt(pos.x + dx, pos.y + dy) === "M") {
      return { label: "開く", hint: "郵便受けだ。", run: a.showMailbox };
    }
    if (tileAt(pos.x + dx, pos.y + dy) === "W") {
      return { label: "…", hint: "風が強すぎて危険だ。これ以上進めない。", run: null };
    }
    if (tileAt(pos.x + dx, pos.y + dy) === "V") {
      return { label: "…", hint: "船が停まっている。", run: null };
    }
    const building = buildingAt(pos.x + dx, pos.y + dy);
    if (building && building.enterable && building.door.x === pos.x + dx && building.door.y === pos.y + dy) {
      const hint = building.id === "house" ? "自分の家だ。" : `${building.name}の入り口だ。コーヒーのいい香りがする。`;
      return { label: "入る", hint, run: null, go: building.id as RoomId };
    }
    if (building) {
      const atDoor = building.door.x === pos.x + dx && building.door.y === pos.y + dy;
      return { label: "…", hint: atDoor ? `${building.name}の入り口だ。今はまだ入れない。` : `${building.name}だ。`, run: null };
    }
    const seed = seedAt(pos.x, pos.y);
    const kind = kindOf(seed);
    // 砂漠に蒔いた種は「挑戦の種」。仕組みは農場と同じで、文言だけ変える
    const desert = isDesert(pos.x, pos.y);
    const seedName = desert ? "挑戦の種" : "種";
    if (seed && (kind === "mine" || kind === "mine-review")) {
      return { label: "見る", hint: `あなたが蒔いた${seedName}だ。`, run: () => a.showOwnSeed(seed) };
    }
    if (seed && kind === "open") {
      return { label: "水やり", hint: desert ? "砂の中に種が埋まっている！" : "土の中に種が埋まっている！", run: () => { a.showSeed(seed); } };
    }
    if (seed && kind === "watered") {
      return { label: "見る", hint: `あなたが水やりした${seedName}だ。`, run: () => a.showWateredSeed(seed) };
    }
    if (kind === "full") {
      return { label: "見る", hint: "村人の優しさで花が咲きました。", run: () => toast("村人の優しさで花が咲きました。") };
    }
    if (canSow(pos.x, pos.y)) {
      const near = nearOpenSeed ? "近くに種の気配がする…　" : "";
      const hint = desert ? "砂漠だ。ここに挑戦の種を蒔ける。" : "ここに種を蒔ける。";
      return { label: "蒔く", hint: `${near}${hint}`, run: () => a.showSow(pos.x, pos.y) };
    }
    return { label: "…", hint: nearOpenSeed ? "近くに種の気配がする…" : "道の上には種を蒔けない。", run: null };
  })();

  const canPress = !!action.run || !!action.go;
  const pressA = () => {
    if (modal.isOpen) return;
    if (action.go === "sit" && action.seat) { warp("cafe", action.seat.x, action.seat.y, "up"); openCafe(); }
    else if (action.go === "leave") leaveRoom();
    else if (action.go && action.go !== "sit") enterRoom(action.go);
    else action.run?.();
  };

  // Web：矢印キー（WASD）で歩き、Enter・スペースでAボタン。農場が表に出ているときだけ
  const pressARef = useRef(pressA);
  useEffect(() => { pressARef.current = pressA; });
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== "web") return;
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (modalOpen.current || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const dir = KEY_DIRS[e.key];
      if (dir) {
        e.preventDefault();
        // 押しっぱなしのときは、なぞって歩くときと同じ間隔にそろえる
        const now = performance.now();
        if (e.repeat && now - last < KEY_REPEAT) return;
        last = now;
        move(dir);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        // ボタンにフォーカスがあるときは、そのボタンを押す動作に任せる
        if (e.repeat || tag === "BUTTON" || el?.getAttribute("role") === "button") return;
        e.preventDefault();
        pressARef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]));

  // 村人は、上の帯と操作部のあいだの真ん中に置く
  const topH = insets.top + HUD_H;
  const bottomH = insets.bottom + BOTTOM_PAD + A_SIZE + GAP;
  const focusY = height > 0 ? (topH + (height - bottomH)) / 2 / height : 0.5;

  return (
    <View style={s.root}>
      <SwipeArea onMove={move}>
        <FarmMap scene={sceneRef} paused={modal.isOpen} focusY={focusY} />
      </SwipeArea>

      <View style={[s.hud, { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
        <T style={s.villager} numberOfLines={1}>{`${farm.name}さん`}</T>
        <View style={s.hudActions}>
          <HudBtn label="郵便受け" badge={farm.unreadCount} onPress={a.showMailbox} />
          <HudBtn label="思い出帳" onPress={a.showBook} />
          <HudBtn label="設定" onPress={() => router.push("/settings")} />
        </View>
      </View>

      <View
        pointerEvents="box-none"
        style={[s.bottom, { paddingBottom: insets.bottom + BOTTOM_PAD, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}
      >
        <View style={s.controls} pointerEvents="box-none">
          <View style={s.hint} pointerEvents="none">
            <T style={s.hintText} accessibilityLiveRegion="polite">{action.hint}</T>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canPress }}
            disabled={!canPress}
            onPress={pressA}
            style={({ pressed }) => [s.aBtn, pressed && s.aBtnPressed, !canPress && s.aBtnOff]}
          >
            <T style={s.aText}>{action.label}</T>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function HudBtn({ label, badge = 0, onPress }: { label: string; badge?: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}　未読${badge}通` : label}
      style={({ pressed }) => [s.hudBtn, pressed && s.hudBtnPressed]}
    >
      <T style={s.hudText}>{label}</T>
      {badge > 0 ? <View style={s.badge}><T style={s.badgeText}>{String(badge)}</T></View> : null}
    </Pressable>
  );
}

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  w: "up", s: "down", a: "left", d: "right",
};
const KEY_REPEAT = 140;

const HUD_H = 52; // 上の帯（ステータスバーを除く）
const GAP = 8;
const BOTTOM_PAD = 12;
const A_SIZE = 84;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.moss },
  hud: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingBottom: 8,
    backgroundColor: "rgba(31,39,29,0.78)",
  },
  villager: { fontSize: 15, color: C.leaf, flexShrink: 1 },
  hudActions: { flexDirection: "row", gap: 6, flexShrink: 0 },
  hudBtn: {
    backgroundColor: C.mossSoft,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    shadowColor: C.mossDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  hudBtnPressed: { transform: [{ translateY: 2 }], shadowOffset: { width: 0, height: 1 } },
  hudText: { fontSize: 14 },
  badge: {
    position: "absolute",
    top: -8,
    right: -8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    backgroundColor: C.mail,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 12, color: "#fff", lineHeight: 16 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0 },
  hint: {
    flex: 1,
    minHeight: 64,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(31,39,29,0.82)",
    borderRadius: 6,
    justifyContent: "center",
  },
  hintText: { fontSize: 15, lineHeight: 22 },
  controls: { flexDirection: "row", alignItems: "center", gap: 12 },
  aBtn: {
    width: A_SIZE,
    height: A_SIZE,
    borderRadius: A_SIZE / 2,
    marginRight: 4,
    backgroundColor: "rgba(156,200,106,0.82)",
    borderColor: "rgba(31,39,29,0.7)",
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  aBtnPressed: { backgroundColor: "rgba(156,200,106,0.95)", transform: [{ translateY: 2 }] },
  aBtnOff: { backgroundColor: "rgba(111,154,68,0.6)" },
  aText: { fontSize: 18, color: C.ink },
});
