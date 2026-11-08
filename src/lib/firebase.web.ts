import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

import { firebaseConfig, isConfigured } from "./firebase-config";

// Web版。ブラウザの getAuth は匿名アカウントを IndexedDB（使えなければ localStorage）に保存するので、
// リロードしても同じ村人のまま遊べる
export { firebaseConfig, isConfigured };

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
