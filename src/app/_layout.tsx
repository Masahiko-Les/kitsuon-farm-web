import { DotGothic16_400Regular } from "@expo-google-fonts/dotgothic16";
import { KleeOne_400Regular, KleeOne_600SemiBold } from "@expo-google-fonts/klee-one";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ModalHost } from "@/components/modal-host";
import { ToastProvider } from "@/components/toast";
import { FarmProvider } from "@/state/farm";
import { C, F } from "@/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({ DotGothic16_400Regular, KleeOne_400Regular, KleeOne_600SemiBold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.moss }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <ToastProvider>
          <FarmProvider>
            <ModalHost>
              <View style={s.column}>
              <Stack
                screenOptions={{
                  headerStyle: { backgroundColor: C.mossDeep },
                  headerTintColor: C.text,
                  headerTitleStyle: { fontFamily: F.ui },
                  headerBackButtonDisplayMode: "minimal",
                  contentStyle: { backgroundColor: C.moss },
                }}
              >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="settings" options={{ title: "設定" }} />
                <Stack.Screen name="help" options={{ title: "あそびかた" }} />
                <Stack.Screen name="terms" options={{ title: "利用規約" }} />
                <Stack.Screen name="contact" options={{ title: "運営への連絡" }} />
                <Stack.Screen name="cafe" options={{ title: "吃音村カフェ" }} />
                <Stack.Screen name="cafe-mine" options={{ title: "わたしの言葉" }} />
                <Stack.Screen name="cafe-admin" options={{ title: "運営：カフェの確認" }} />
              </Stack>
              </View>
            </ModalHost>
          </FarmProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Web：PCの横長画面でも、スマホと同じ縦長の画面を真ん中に置く
const s = StyleSheet.create({
  column: Platform.OS === "web"
    ? { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center", overflow: "hidden" }
    : { flex: 1 },
});
