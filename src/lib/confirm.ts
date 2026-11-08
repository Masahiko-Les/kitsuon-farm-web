import { Alert, Platform } from "react-native";

// 確認ダイアログ。ネイティブは Alert、Web は Alert が表示されないので window.confirm を使う
export function confirmDialog(opts: {
  title?: string;
  message: string;
  ok: string;
  cancel?: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title = "", message, ok, cancel = "やめる", destructive = false } = opts;
  if (Platform.OS === "web") {
    return Promise.resolve(window.confirm(title ? `${title}\n\n${message}` : message));
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: cancel, style: "cancel", onPress: () => resolve(false) },
      { text: ok, style: destructive ? "destructive" : "default", onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
