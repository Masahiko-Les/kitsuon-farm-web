import { type ReactNode, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";

import { addEffect } from "@/components/farm-map";
import { useModal } from "@/components/modal-host";
import { useToast } from "@/components/toast";
import {
  Actions, Body, Btn, ErrorText, LinkBtn, Links, Paper, PaperInput, SectionLabel, Small, T, Tips, Title,
} from "@/components/ui";
import { confirmDialog } from "@/lib/confirm";
import {
  type CropDoc, type Letter, type Seed, blockUser, dateText, markRead, millis, readMyLetter, readSeedText, reportLetter,
  reportSeed, sayThanks, sowSeed, waterSeed,
} from "@/lib/farm-api";
import { CROPS, type Crop, DESERT_CROPS, SEED_MIN_CHARS, cropById, isDesert, randomCrop, seedNameOf } from "@/lib/game";
import { SUPPORT_LINES, SUPPORT_NOTE } from "@/lib/safety";
import { BULLETIN, BULLETIN_NOTE, BULLETIN_TITLE } from "@/lib/bulletin";
import { checkText } from "@/lib/text";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

function confirm(message: string, ok: string, destructive = false) {
  return confirmDialog({ message, ok, destructive });
}

/* =========================================================
   モーダルを開く関数をまとめたもの
   ========================================================= */
export function useActions() {
  const modal = useModal();
  const toast = useToast();

  return {
    close: modal.close,
    showSow: (x: number, y: number) => modal.open(<SowModal x={x} y={y} />),
    showOwnSeed: (seed: Seed) => modal.open(<OwnSeedModal seed={seed} />),
    showWateredSeed: (seed: Seed) => modal.open(<WateredSeedModal seed={seed} />),
    showSeed: async (seed: Seed) => {
      let text = "";
      try { text = await readSeedText(seed.id); } catch (e) { console.error(e); }
      if (!text) { toast("この種は読めませんでした。"); return; }
      modal.open(<SeedModal seed={seed} text={text} />);
    },
    showWaterLetter: (seed: Seed, seedText: string) => modal.open(<WaterLetterModal seed={seed} seedText={seedText} />),
    showMailbox: () => modal.open(<MailboxModal />),
    showLetter: (letter: Letter) => modal.open(<LetterModal letter={letter} />),
    showThanks: (c: CropDoc) => modal.open(<ThanksModal crop={c} />),
    showHarvest: (letter: Letter, crop: Crop) => modal.open(<HarvestModal letter={letter} crop={crop} />),
    showBook: () => modal.open(<BookModal />),
    showBulletin: () => modal.open(<BulletinModal />),
    showClerk: () => modal.open(<ClerkModal />),
    showMemory: (c: CropDoc) => modal.open(<MemoryModal crop={c} />),
    showSupport: (kind: SupportKind, onBack?: () => void) => modal.open(<SupportModal kind={kind} onBack={onBack} />),
  };
}

/* =========================================================
   種を蒔く
   ========================================================= */
function SowModal({ x, y }: { x: number; y: number }) {
  const { uid, name, refresh } = useFarm();
  const a = useActions();
  const toast = useToast();
  const text = useRef("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const res = checkText(text.current, SEED_MIN_CHARS, null);
    if (res.error) { setErr(res.error); return; }
    setBusy(true);
    setErr("");
    try {
      await sowSeed(uid, name, x, y, text.current.trim(), res.crisis ? "review" : "public");
      refresh();
      if (res.crisis) {
        a.showSupport("seed");
      } else {
        a.close();
        addEffect("sow", x, y);
        toast("種を蒔きました。誰かが見つけて、水やりしてくれるのを待とう。");
      }
    } catch (e) {
      setBusy(false);
      setErr((e as Error).message === "taken"
        ? "この場所にはすでに種が埋まっています。別の場所で蒔いてください。"
        : "種を蒔けませんでした。通信を確認して、もう一度押してください。");
      console.error(e);
    }
  };

  return (
    <>
      {isDesert(x, y) ? (
        <>
          <Title>挑戦の種を蒔く</Title>
          <Body>書いた挑戦は、この場所に種として埋まります。見つけた人だけが読めます。</Body>
          <PaperInput placeholder="吃音と向き合う挑戦を、30文字以上・300文字以内で書いてみよう（これからのことも、やってみたことも）" minChars={SEED_MIN_CHARS} maxLines={null} onChangeText={(t) => { text.current = t; }} />
        </>
      ) : (
        <>
          <Title>種を蒔く</Title>
          <Body>書いた苦労は、この場所に種として埋まります。見つけた人だけが読めます。</Body>
          <PaperInput placeholder="吃音の苦労を、30文字以上・300文字以内で書いてみよう" minChars={SEED_MIN_CHARS} maxLines={null} onChangeText={(t) => { text.current = t; }} />
        </>
      )}
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="やめる" onPress={a.close} />
        <Btn label="種を蒔く" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

function OwnSeedModal({ seed }: { seed: Seed }) {
  const a = useActions();
  const [text, setText] = useState("読み込み中…");
  useEffect(() => {
    readSeedText(seed.id).then(setText).catch(() => setText("読み込めませんでした。"));
  }, [seed.id]);
  // 水やりの人数は見せない。確認中のときだけ、そのことを伝える
  const status = seed.status === "review" ? "この種は確認中のため、ほかの村人には見えていません。" : "";
  return (
    <>
      <Title>{`あなたが蒔いた${seedNameOf(seed.id)}`}</Title>
      <Paper text={text} />
      {status ? <Small>{status}</Small> : null}
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

// 自分が水やりした種。種の文章と、自分が送った手紙を読み返せる
function WateredSeedModal({ seed }: { seed: Seed }) {
  const { uid, name, crops } = useFarm();
  const a = useActions();
  const [text, setText] = useState("読み込み中…");
  const [letter, setLetter] = useState("読み込み中…");
  useEffect(() => {
    readSeedText(seed.id).then((t) => setText(t || "読み込めませんでした。")).catch(() => setText("読み込めませんでした。"));
    readMyLetter(seed.id, uid)
      .then((l) => setLetter(l ? l.text : "読み込めませんでした。"))
      .catch(() => setLetter("読み込めませんでした。"));
  }, [seed.id, uid]);
  const crop = crops.find((c) => c.letterId === `${seed.id}_${uid}`);
  return (
    <>
      <Title>{`${seed.ownerName}さんの${seedNameOf(seed.id)}`}</Title>
      <Paper text={text} />
      <SectionLabel>あなたが送った手紙</SectionLabel>
      <Paper text={letter} from={`${name}より`} />
      {crop
        ? <Body style={{ marginTop: 14 }}>{`${seed.ownerName}さんから「ありがとう」が届き、${cropById(crop.cropType).name}が実りました。`}</Body>
        : null}
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

/* =========================================================
   種を見つけて水やり
   ========================================================= */
function SeedModal({ seed, text }: { seed: Seed; text: string }) {
  const { uid, hideSeed, refresh } = useFarm();
  const a = useActions();
  const toast = useToast();

  const report = async () => {
    if (!(await confirm("この種を通報しますか？　あなたの画面からは見えなくなり、運営が確認します。", "通報する", true))) return;
    try { await reportSeed(uid, seed.id); refresh(); } catch (e) { console.error(e); }
    hideSeed(seed.id);
    a.close();
    toast("通報しました。運営が確認します。");
  };

  return (
    <>
      <Title>{`${seed.ownerName}さんの${seedNameOf(seed.id)}`}</Title>
      <Paper text={text} />
      <Body style={{ marginTop: 14 }}>水やりしますか？</Body>
      <Actions>
        <Btn kind="quiet" label="いいえ" onPress={a.close} />
        <Btn kind="water" label="はい" onPress={() => a.showWaterLetter(seed, text)} />
      </Actions>
      <Links><LinkBtn label="この種を通報する" onPress={report} /></Links>
    </>
  );
}

function Details({ summary, children }: { summary: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.details}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <T style={s.summary}>{`${open ? "▼" : "▶"} ${summary}`}</T>
      </Pressable>
      {open ? <View style={{ marginTop: 8 }}>{children}</View> : null}
    </View>
  );
}

function WaterLetterModal({ seed, seedText, initial = "" }: { seed: Seed; seedText: string; initial?: string }) {
  const { uid, name, refresh } = useFarm();
  const a = useActions();
  const modal = useModal();
  const toast = useToast();
  const text = useRef(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const res = checkText(text.current);
    if (res.crisis) {
      const draft = text.current;
      a.showSupport("letter", () => modal.open(<WaterLetterModal seed={seed} seedText={seedText} initial={draft} />));
      return;
    }
    if (res.error) { setErr(res.error); return; }
    setBusy(true);
    setErr("");
    try {
      await waterSeed(uid, name, seed, seedText, text.current.trim());
      refresh();
      a.close();
      addEffect("water", seed.x, seed.y);
      toast(`水やりしました。手紙は${seed.ownerName}さんに届きました。`);
    } catch (e) {
      setBusy(false);
      const messages: Record<string, string> = {
        full: "村人の優しさで花が咲きました。",
        already: "この種にはもう水やりしました。",
        gone: "この種は見つからなくなりました。",
      };
      setErr(messages[(e as Error).message] || "手紙を送れませんでした。通信を確認して、もう一度押してください。");
      console.error(e);
    }
  };

  return (
    <>
      <Title>優しい言葉で水やりしましょう</Title>
      <Details summary={`${seed.ownerName}さんの${seedNameOf(seed.id)}をもう一度読む`}><Paper text={seedText} /></Details>
      <Tips items={["アドバイスより、まず気持ちを受け止める言葉を", "似た経験があれば、ひとこと添えて"]} />
      <PaperInput placeholder={`${seed.ownerName}さんへ`} initial={initial} onChangeText={(t) => { text.current = t; }} />
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="もどる" onPress={() => modal.open(<SeedModal seed={seed} text={seedText} />)} />
        <Btn kind="water" label="水やりする" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

/* =========================================================
   郵便受けと手紙
   ========================================================= */
export const THANKS_TEXT = "収穫しました。ありがとう。";

// 届いた手紙と、水やりした種の人からの「ありがとう」を、新しい順に並べる
function MailboxModal() {
  const { letters, crops, thanks, seenThanks } = useFarm();
  const a = useActions();
  const items = [
    ...letters.map((l) => ({ kind: "letter" as const, at: millis(l.createdAt), letter: l })),
    ...thanks.map((c) => ({ kind: "thanks" as const, at: millis(c.harvestedAt), crop: c })),
  ].sort((x, y) => y.at - x.at);
  return (
    <>
      <Title>郵便受け</Title>
      {items.length === 0 ? (
        <Body>まだ手紙は届いていません。種を蒔くと、見つけた村人が水やりの手紙をくれます。</Body>
      ) : (
        <View style={s.list}>
          {items.map((item) => {
            if (item.kind === "thanks") {
              const c = item.crop;
              const unread = !seenThanks.has(c.id);
              return (
                <Pressable key={`thanks-${c.id}`} style={s.listItem} onPress={() => a.showThanks(c)} accessibilityRole="button">
                  <T style={s.listIcon}>{unread ? "💌" : cropById(c.cropType).emoji}</T>
                  <View style={s.listMain}>
                    <T style={s.listName}>
                      {`${c.sowerName}さんから`}
                      {unread ? <T style={s.unread}>　未読</T> : null}
                    </T>
                    <T style={s.listSub} numberOfLines={1}>{`${dateText(c.harvestedAt)}　${THANKS_TEXT}`}</T>
                  </View>
                </Pressable>
              );
            }
            const l = item.letter;
            const crop = l.status === "thanked" ? cropForLetter(crops, l.id) : null;
            const icon = crop ? crop.emoji : l.status === "unread" ? "✉️" : "📄";
            return (
              <Pressable key={l.id} style={s.listItem} onPress={() => a.showLetter(l)} accessibilityRole="button">
                <T style={s.listIcon}>{icon}</T>
                <View style={s.listMain}>
                  <T style={s.listName}>
                    {`${l.fromName}さんから`}
                    {l.status === "unread" ? <T style={s.unread}>　未読</T> : null}
                  </T>
                  <T style={s.listSub} numberOfLines={1}>{`${dateText(l.createdAt)}　${l.text.replace(/\n/g, " ")}`}</T>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

function ThanksModal({ crop: c }: { crop: CropDoc }) {
  const { markThanksSeen } = useFarm();
  const a = useActions();
  const info = cropById(c.cropType);

  useEffect(() => { markThanksSeen(c.id); }, [c.id, markThanksSeen]);

  return (
    <>
      <View style={{ alignItems: "center" }}>
        <Animated.View entering={ZoomIn.springify().damping(9)}><T style={s.cropBig}>{info.emoji}</T></Animated.View>
        <Title>{`${c.sowerName}さんから`}</Title>
      </View>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Paper text={THANKS_TEXT} from={`${c.sowerName}より`} minLines={1} />
      </Animated.View>
      <Body style={{ marginTop: 14 }}>{`あなたの水やりで${info.name}が実りました。`}</Body>
      <Actions>
        <Btn kind="quiet" label="郵便受けにもどる" onPress={a.showMailbox} />
        <Btn label="思い出を見る" onPress={() => a.showMemory(c)} />
      </Actions>
    </>
  );
}

function cropForLetter(crops: CropDoc[], letterId: string) {
  const c = crops.find((x) => x.letterId === letterId);
  return c ? cropById(c.cropType) : null;
}

function LetterModal({ letter: initialLetter }: { letter: Letter }) {
  const { uid, name, letters, crops, refresh } = useFarm();
  const a = useActions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const letter = letters.find((l) => l.id === initialLetter.id) ?? initialLetter;

  useEffect(() => {
    if (initialLetter.status === "unread") markRead(initialLetter).then(refresh).catch((e) => console.error(e));
  }, [initialLetter, refresh]);

  const thanked = letter.status === "thanked";
  const crop = thanked ? cropForLetter(crops, letter.id) : null;

  const thanks = async () => {
    setBusy(true);
    try {
      // 同じ種からは、誰の水やりでも同じ作物が実る。最初の1つだけランダムに決める
      const sameSeed = crops.find((x) => x.seedId === letter.seedId && x.sowerUid === uid);
      const c = sameSeed ? cropById(sameSeed.cropType) : randomCrop(letter.seedId);
      await sayThanks(uid, name, letter, c.id);
      refresh();
      a.showHarvest(letter, c);
    } catch (e) {
      setBusy(false);
      toast("送れませんでした。もう一度押してください。");
      console.error(e);
    }
  };

  const report = async () => {
    if (!(await confirm("この手紙を通報しますか？　郵便受けから消え、運営が確認します。", "通報する", true))) return;
    try {
      await reportLetter(uid, letter);
      refresh();
      a.close();
      toast("通報しました。運営が確認します。");
    } catch (e) {
      toast("通報できませんでした。もう一度試してください。");
      console.error(e);
    }
  };

  const block = async () => {
    if (!(await confirm(`${letter.fromName}さんをブロックしますか？　この人からの手紙は届かなくなります。`, "ブロックする", true))) return;
    try {
      await blockUser(uid, letter.fromUid);
      refresh();
      a.close();
      toast(`${letter.fromName}さんをブロックしました。`);
    } catch (e) {
      toast("ブロックできませんでした。もう一度試してください。");
      console.error(e);
    }
  };

  return (
    <>
      <Animated.View entering={ZoomIn.duration(500)}><T style={s.envelope}>💌</T></Animated.View>
      <Title>{`${letter.fromName}さんからの手紙`}</Title>
      <Details summary={`あなたが蒔いた${seedNameOf(letter.seedId)}`}><Paper text={letter.seedText || ""} /></Details>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Paper text={letter.text} from={`${letter.fromName}より`} />
      </Animated.View>
      {thanked
        ? <Body style={{ marginTop: 14 }}>{`ありがとうを伝えました。${crop ? crop.name : "作物"}が実り、${letter.fromName}さんにも届きました。`}</Body>
        : <Small>「ありがとう」を押すと作物が実り、手紙をくれた人にも同じ作物が届きます。</Small>}
      <Actions>
        <Btn kind="quiet" label="郵便受けにもどる" onPress={a.showMailbox} />
        {thanked ? null : <Btn label="ありがとう" onPress={thanks} disabled={busy} />}
      </Actions>
      <Links>
        <LinkBtn label="この手紙を通報する" onPress={report} />
        <LinkBtn label="この人をブロックする" onPress={block} />
      </Links>
    </>
  );
}

function HarvestModal({ letter, crop }: { letter: Letter; crop: Crop }) {
  const a = useActions();
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View entering={ZoomIn.springify().damping(9)}><T style={s.cropBig}>{crop.emoji}</T></Animated.View>
      <Title>{`${crop.name}が実りました`}</Title>
      <Body style={{ textAlign: "center" }}>{`${letter.fromName}さんにも、同じ${crop.name}が届きました。`}</Body>
      <Actions center>
        <Btn kind="quiet" label="とじる" onPress={a.close} />
        <Btn label="思い出帳を見る" onPress={a.showBook} />
      </Actions>
    </View>
  );
}

/* =========================================================
   思い出帳
   ========================================================= */
function BookModal() {
  const { crops: all } = useFarm();
  const a = useActions();
  const crops = [...all].sort((x, y) => millis(y.harvestedAt) - millis(x.harvestedAt));
  const got = new Set(crops.map((c) => c.cropType));
  return (
    <>
      <Title>思い出帳</Title>
      <T style={s.dex}>{`図鑑 ${CROPS.filter((c) => got.has(c.id)).length} / ${CROPS.length}種類`}</T>
      <View style={s.dexRow} accessible={false}>
        {CROPS.map((c) => <T key={c.id} style={[s.dexEmoji, !got.has(c.id) && s.missing]}>{c.emoji}</T>)}
      </View>
      <T style={s.dex}>{`砂漠の図鑑 ${DESERT_CROPS.filter((c) => got.has(c.id)).length} / ${DESERT_CROPS.length}種類`}</T>
      <View style={s.dexRow} accessible={false}>
        {DESERT_CROPS.map((c) => <T key={c.id} style={[s.dexEmoji, !got.has(c.id) && s.missing]}>{c.emoji}</T>)}
      </View>
      {crops.length === 0 ? (
        <Body>まだ作物はありません。種に水やりするか、届いた手紙に「ありがとう」を伝えると、作物が実ってここに入ります。</Body>
      ) : (
        <View style={s.grid}>
          {crops.map((c) => {
            const info = cropById(c.cropType);
            return (
              <Pressable key={c.id} style={s.cell} onPress={() => a.showMemory(c)} accessibilityRole="button" accessibilityLabel={`${info.name}の思い出`}>
                <T style={s.cellEmoji}>{info.emoji}</T>
              </Pressable>
            );
          })}
        </View>
      )}
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

/* =========================================================
   村役場：掲示板と窓口
   ========================================================= */
function BulletinModal() {
  const a = useActions();
  return (
    <>
      <Title>{`掲示板「${BULLETIN_TITLE}」`}</Title>
      {BULLETIN.map((sec) => (
        <View key={sec.title}>
          <SectionLabel>{sec.title}</SectionLabel>
          {sec.lines.map((l) => <Body key={l} style={{ marginBottom: 4 }}>{l}</Body>)}
        </View>
      ))}
      <Small>{BULLETIN_NOTE}</Small>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

// 係員の窓口。住民登録はまだ準備中
function ClerkModal() {
  const a = useActions();
  return (
    <>
      <Title>村役場の窓口</Title>
      <Body>係員「こんにちは。ここでは、吃音村の住民登録ができます。」</Body>
      <Body>係員「ただ、住民登録の受付は、いま準備をしているところなんです。始まったら、ぜひまた来てくださいね。」</Body>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

function MemoryModal({ crop: c }: { crop: CropDoc }) {
  const { uid } = useFarm();
  const a = useActions();
  const info = cropById(c.cropType);
  const lead = c.sowerUid === uid
    ? `あなたの種に、${c.watererName}さんが水やりしてくれました。`
    : `あなたが${c.sowerName}さんの${seedNameOf(c.seedId)}に水やりしました。`;
  return (
    <>
      <View style={{ alignItems: "center" }}>
        <T style={s.cropBig}>{info.emoji}</T>
        <Title>{`${info.name}　${dateText(c.harvestedAt)}`}</Title>
      </View>
      <Body>{lead}</Body>
      <SectionLabel>{`${c.sowerName}さんの${seedNameOf(c.seedId)}`}</SectionLabel>
      <Paper text={c.seedText} />
      <SectionLabel>{`${c.watererName}さんの手紙`}</SectionLabel>
      <Paper text={c.letterText} />
      <Actions><Btn kind="quiet" label="思い出帳にもどる" onPress={a.showBook} /></Actions>
    </>
  );
}

/* =========================================================
   相談窓口
   ========================================================= */
export function SupportList() {
  return (
    <View style={{ marginBottom: 12 }}>
      {SUPPORT_LINES.map((l) => (
        <View key={l.tel} style={s.support}>
          <T style={s.supportText}>{`${l.name}　`}</T>
          <Pressable onPress={() => Linking.openURL(`tel:${l.tel}`)} accessibilityRole="link" hitSlop={6}>
            <T style={s.supportLink}>{l.label}</T>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// seed=種 letter=手紙 cafe=カフェの言葉（保存した） unsaved=カフェの言葉（保存できなかった）
type SupportKind = "seed" | "letter" | "cafe" | "unsaved";
const SUPPORT_LEAD: Record<SupportKind, string> = {
  seed: "とてもつらい気持ちが書かれていたので、この種はいったん非公開にして、運営が確認します。",
  letter: "とてもつらい気持ちが書かれていたので、この手紙は送らずにいったん止めました。",
  cafe: "とてもつらい気持ちが書かれていたので、この言葉はほかの村人には届けず、運営が確認します。",
  unsaved: "とてもつらい気持ちが書かれていました。この言葉はまだ保存されていません。",
};

function SupportModal({ kind, onBack }: { kind: SupportKind; onBack?: () => void }) {
  const a = useActions();
  const lead = SUPPORT_LEAD[kind];
  return (
    <>
      <Title>ひとりで抱えこまないで</Title>
      <Body>{lead}</Body>
      <Body>苦しいときは、話を聞いてくれる窓口があります。</Body>
      <SupportList />
      <Small>{SUPPORT_NOTE}</Small>
      <Actions>
        {onBack ? <Btn kind="quiet" label="書き直す" onPress={onBack} /> : null}
        <Btn label="とじる" onPress={a.close} />
      </Actions>
    </>
  );
}

const s = StyleSheet.create({
  details: { marginBottom: 12 },
  summary: { fontSize: 14, color: C.sub },
  list: { gap: 8 },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.moss,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  listIcon: { fontSize: 24, width: 30, textAlign: "center" },
  listMain: { flex: 1, minWidth: 0 },
  listName: { fontSize: 15 },
  unread: { fontSize: 12, color: C.error },
  listSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  envelope: { fontSize: 40, textAlign: "center", lineHeight: 48, marginBottom: 8 },
  cropBig: { fontSize: 76, lineHeight: 90, marginTop: 6, marginBottom: 10, textAlign: "center" },
  dex: { fontSize: 14, color: C.sub },
  dexRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2, marginBottom: 12 },
  dexEmoji: { fontSize: 22, lineHeight: 30 },
  missing: { opacity: 0.25 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cell: {
    width: "22.5%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.moss,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 6,
  },
  cellEmoji: { fontSize: 32, lineHeight: 40 },
  support: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", backgroundColor: C.moss, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  supportText: { fontSize: 15 },
  supportLink: { fontSize: 15, color: C.leaf, textDecorationLine: "underline" },
});
