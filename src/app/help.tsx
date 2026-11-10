import { ScrollView } from "react-native";

import { Small, Tips } from "@/components/ui";

export default function Help() {
  return (
    <ScrollView contentContainerStyle={{ padding: 18, width: "100%", maxWidth: 480, alignSelf: "center" }}>
      <Tips
        items={[
          "好きな場所に立って「蒔く」を押すと、吃音の苦労を種として埋められます。",
          "歩いていると、近くの土がきらっと光ります。そこに誰かの種が埋まっています。",
          "種を見つけたら、優しい言葉で水やりしましょう。",
          "届いた手紙に「ありがとう」を押すと作物が実り、2人の思い出帳に入ります。",
          "村のカフェに入って、マスターと話したり、カウンターの空いている席に座ったりすると、「吃音について話す」「気軽に雑談する」の会話ができます。",
          "本名や連絡先は書かないでください。嫌な言葉は通報・ブロックできます。",
        ]}
      />
      <Small>家の横の赤い郵便受けの前で、郵便受けのほうを向いてAを押すと、届いた手紙を読めます。ヘッダーの「郵便受け」からも開けます。</Small>
      <Small>カフェで「届けてもよい」を選んだ言葉だけが、運営の確認のあとで、名前を出さずにほかの村人に紹介されます。</Small>
    </ScrollView>
  );
}
