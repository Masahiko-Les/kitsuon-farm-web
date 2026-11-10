import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { C, R, blur, shadow } from "@/theme";
import { ToastLayer } from "./toast";

type ModalApi = {
  open: (node: ReactNode, opts?: { locked?: boolean }) => void;
  close: () => void;
  isOpen: boolean;
};

const ModalContext = createContext<ModalApi>({ open: () => {}, close: () => {}, isOpen: false });
export const useModal = () => useContext(ModalContext);

// 試作版の openModal / closeModal にあたるもの。中身を差し替えて画面をつなぐ。
export function ModalHost({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<{ key: number; node: ReactNode; locked: boolean } | null>(null);

  const open = useCallback((node: ReactNode, opts?: { locked?: boolean }) => {
    setContent({ key: Date.now(), node, locked: !!opts?.locked });
  }, []);
  const close = useCallback(() => setContent(null), []);
  const api = useMemo(() => ({ open, close, isOpen: content !== null }), [open, close, content]);

  return (
    <ModalContext.Provider value={api}>
      {children}
      <Modal
        visible={content !== null}
        transparent
        animationType="fade"
        onRequestClose={() => { if (!content?.locked) close(); }}
      >
        <SafeAreaView style={s.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.kav}>
            <View style={s.dialog}>
              <ScrollView key={content?.key} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
                {content?.node}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
          <ToastLayer />
        </SafeAreaView>
      </Modal>
    </ModalContext.Provider>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(8, 12, 10, 0.55)", ...blur(6) },
  kav: { flex: 1, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 18 },
  dialog: {
    maxHeight: "100%",
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    backgroundColor: C.mossSoft,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.lg,
    overflow: "hidden",
    ...shadow(16, 40, 0.45),
  },
  body: { padding: 22, paddingBottom: 20 },
});
