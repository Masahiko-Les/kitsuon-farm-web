import { createContext, type ReactNode, useCallback, useContext, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C } from "@/theme";
import { T } from "./ui";

type Msg = { id: number; text: string } | null;

const ToastContext = createContext<(message: string) => void>(() => {});
const MessageContext = createContext<Msg>(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<Msg>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((text: string) => {
    setMessage({ id: Date.now(), text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      <MessageContext.Provider value={message}>
        {children}
        <ToastLayer />
      </MessageContext.Provider>
    </ToastContext.Provider>
  );
}

// モーダルの中にも置けるように分けてある
export function ToastLayer() {
  const message = useContext(MessageContext);
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="none" style={[s.wrap, { top: insets.top + 64 }]}>
      {message ? (
        <Animated.View key={message.id} entering={FadeInUp.duration(250)} exiting={FadeOut.duration(250)} style={s.toast}>
          <T style={s.text} accessibilityLiveRegion="polite">{message.text}</T>
        </Animated.View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center", zIndex: 100, elevation: 100 },
  toast: {
    backgroundColor: C.paper,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  text: { color: C.ink, fontSize: 15, lineHeight: 22 },
});
