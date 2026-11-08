// Web の入口。Skia は読み込んだ時点で CanvasKit を使うので、
// 先に canvaskit.wasm を読み込んでから、アプリ本体を読み込む
import { LoadSkiaWeb } from "@shopify/react-native-skia/lib/module/web";

LoadSkiaWeb({ locateFile: (file) => `/${file}` }).then(() => {
  require("expo-router/entry");
});
