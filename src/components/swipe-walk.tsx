import { type ReactNode, useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";

import type { Dir } from "@/lib/game";

const DEAD = 14; // これ以上なぞったら歩き出す
const LEASH = 40; // なぞり始めの点は、指からこれ以上離れないようについてくる（向きを変えやすくする）
const HOLD_DELAY = 300; // 指を置いたまま：最初の1歩のあとの待ち
const HOLD_REPEAT = 140; // その後の間隔

const ACTIONS: { name: Dir; label: string }[] = [
  { name: "up", label: "上へ" },
  { name: "down", label: "下へ" },
  { name: "left", label: "左へ" },
  { name: "right", label: "右へ" },
];

// マップの上をなぞった方向へ歩く。指を置いたままなら歩き続け、離すと止まる
export function SwipeArea({ onMove, children }: { onMove: (dir: Dir) => void; children: ReactNode }) {
  const move = useRef(onMove);
  useEffect(() => {
    move.current = onMove;
  }, [onMove]);

  const st = useRef({ ax: 0, ay: 0, cur: null as Dir | null, timer: null as ReturnType<typeof setTimeout> | null });
  const stop = () => {
    const s = st.current;
    if (s.timer) clearTimeout(s.timer);
    s.timer = null;
    s.cur = null;
  };
  const walk = (d: Dir) => {
    const s = st.current;
    if (s.timer) clearTimeout(s.timer);
    s.cur = d;
    move.current(d);
    const rep = () => {
      if (!s.cur) return;
      move.current(s.cur);
      s.timer = setTimeout(rep, HOLD_REPEAT);
    };
    s.timer = setTimeout(rep, HOLD_DELAY);
  };
  useEffect(() => stop, []);

  const pan = usePanGesture({
    minDistance: 0,
    runOnJS: true,
    onBegin: (e) => {
      stop();
      st.current.ax = e.x;
      st.current.ay = e.y;
    },
    onUpdate: (e) => {
      const s = st.current;
      let dx = e.x - s.ax, dy = e.y - s.ay;
      const len = Math.hypot(dx, dy);
      if (len < DEAD) return;
      if (len > LEASH) {
        s.ax = e.x - (dx / len) * LEASH;
        s.ay = e.y - (dy / len) * LEASH;
        dx = e.x - s.ax;
        dy = e.y - s.ay;
      }
      const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (d !== s.cur) walk(d);
    },
    onFinalize: stop,
  });

  return (
    <GestureDetector gesture={pan} touchAction="none" userSelect="none">
      <View
        style={s.fill}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="農場のマップ"
        accessibilityHint="なぞった方向に歩きます。上下左右のアクションで1マスずつ歩けます"
        accessibilityActions={ACTIONS}
        onAccessibilityAction={(e) => onMove(e.nativeEvent.actionName as Dir)}
      >
        {children}
      </View>
    </GestureDetector>
  );
}

const s = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
});
