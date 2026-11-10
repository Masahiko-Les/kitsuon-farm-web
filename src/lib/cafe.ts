/* =========================================================
   吃音村カフェ：テーマ・質問・お手本の言葉
   質問の文言とお手本の言葉は、公開前に見直すこと。
   ========================================================= */

// 言葉を読んだときに届けられる気持ち。数は競わせず、書いた本人にだけ静かに届く
export const REACTIONS = [
  { id: "empathy", label: "共感しました" },
  { id: "courage", label: "勇気をもらいました" },
  { id: "discovery", label: "新しい発見がありました" },
  { id: "thanks", label: "ありがとう" },
] as const;
export type ReactionId = (typeof REACTIONS)[number]["id"];
export const reactionLabel = (id: string) => REACTIONS.find((r) => r.id === id)?.label ?? "";

// お手本の言葉（運営が用意したもの）。実際の村人の言葉と誤解されないよう、画面で必ず明示する
export type Sample = { text: string };
export type Question = { id: string; text: string; samples: Sample[] };
export type Theme = {
  id: string;
  title: string;
  description: string; // テーマを選ぶ画面に出す説明
  aim: string; // ねらい（運営向けのメモ。画面には出さない）
  lead: string; // マスターがテーマを受けて最初に言うこと
  gentle?: string; // つらい記憶にふれやすいテーマに添える一言
  questions: Question[];
};

// 1つの質問で、ほかの村人の言葉を何人ぶんまで読めるか
export const MAX_VOICES = 3;

// 質問は3問1セット。質問の id は回答の保存に使うので、文言を直しても id は変えないこと
export const THEMES: Theme[] = [
  {
    id: "stutter",
    title: "吃音について話す",
    description: "最近の出来事や、心に残っていることを話してみましょう。",
    aim: "出来事を話し、感情を振り返り、誰かに聞いてもらう。つらい経験でも、うれしかった経験でも構わない。",
    lead: "吃音のお話ですね。つらかったことでも、うれしかったことでも大丈夫ですよ。急がず、思いついたことからどうぞ。",
    questions: [
      {
        id: "stutter-1",
        text: "最近、吃音が気になる場面はありましたか？",
        samples: [{ text: "電話で予約を取るとき、お店の名前の最初の音が出てこなくて、少し焦りました。\n電話を切ったあとも、しばらく気になっていました。" }],
      },
      {
        id: "stutter-2",
        text: "吃音が気になった時に、少し気持ちが楽になれる工夫や、ほっとできる瞬間はありますか？",
        samples: [{ text: "話す前に、ゆっくり息をはくようにしています。\n帰り道に温かい飲みものを買ってひと息つくと、ほっとします。" }],
      },
      {
        id: "stutter-3",
        text: "最近の自分に、ひとことかけるとしたら、何と言いますか？",
        samples: [{ text: "苦手な電話、最後までかけられたね。\n今週もおつかれさま、と言いたいです。" }],
      },
    ],
  },
  {
    id: "chat",
    title: "気軽に雑談する",
    description: "好きなものや趣味、これからの楽しみを気軽に話しましょう。",
    aim: "自分の好きなことを話しながら、相手との共通点を見つけたり、互いの人柄を知ったりする。",
    lead: "雑談ですね。いいですね。肩の力を抜いて、好きなことを聞かせてください。",
    questions: [
      {
        id: "chat-1",
        text: "好きなものや趣味はありますか？",
        samples: [{ text: "パンを焼くのが好きです。\n休みの日は、朝からゆっくり生地をこねています。" }],
      },
      {
        id: "chat-2",
        text: "その好きなものや趣味に、どんな魅力を感じていますか？",
        samples: [{ text: "時間をかけた分だけ、ちゃんとおいしくなるところです。\n焼けるまでの香りも好きで、待つ時間ごと楽しんでいます。" }],
      },
      {
        id: "chat-3",
        text: "これからやってみたいことや、楽しみにしていることはありますか？",
        samples: [{ text: "今度、友だちを家に呼んで、焼きたてのパンを食べてもらいたいです。\nどんなパンにしようか、今から考えるのが楽しみです。" }],
      },
    ],
  },
];

export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? null;
export const questionById = (id: string) => {
  for (const t of THEMES) {
    const q = t.questions.find((x) => x.id === id);
    if (q) return { theme: t, question: q };
  }
  return null;
};
