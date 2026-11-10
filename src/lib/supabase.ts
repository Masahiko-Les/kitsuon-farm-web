import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Supabase の Project Settings > API（または Connect）で表示される値に置き換えてください。
// この2つは公開されても問題ありません（守りは supabase/migrations の RLS で行います）。
export const SUPABASE_URL = "https://lkxfzdrfjuawwvfortlz.supabase.co";
export const SUPABASE_KEY = "sb_publishable_8pnW0Hy75EOiwELSBa4Q2Q_HPG_vFrp";

// 未入力のあいだは、保存なしでマップとカフェだけ歩ける（おためしモード）
export const isConfigured = !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_KEY.startsWith("YOUR_");

export const supabase = createClient(
  isConfigured ? SUPABASE_URL : "http://localhost:54321",
  isConfigured ? SUPABASE_KEY : "offline",
  {
    auth: {
      // 匿名アカウントをブラウザ（localStorage）に保存して、次に開いたときも同じ村人にする
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
);

// RPC や読み書きのエラーを、Error にそろえて投げる（メッセージは SQL の例外の文字列。'gone' など）
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
