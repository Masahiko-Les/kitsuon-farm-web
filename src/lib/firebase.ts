import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { type Auth, getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { firebaseConfig, isConfigured } from "./firebase-config";

// 設定値は firebase-config.ts の1か所にまとめている。Web は firebase.web.ts を使う
export { firebaseConfig, isConfigured };

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

function makeAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // 開発中のリロードで二重に初期化したとき
    return getAuth(app);
  }
}

export const auth = makeAuth();
export const db = getFirestore(app);
