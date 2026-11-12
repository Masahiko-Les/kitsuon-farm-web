import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";

import { MayorPortrait, VillageMap, addEffect } from "@/components/farm-map";
import { FlowerIcon } from "@/components/flower-icon";
import { useModal } from "@/components/modal-host";
import { useToast } from "@/components/toast";
import {
  Actions, Body, Btn, ErrorText, LinkBtn, Links, Paper, PaperInput, SectionLabel, Small, T, Tips, Title,
} from "@/components/ui";
import { confirmDialog } from "@/lib/confirm";
import {
  type CropDoc, type Letter, type Seed, blockUser, countMyWaterings, dateText, markRead, millis, readMyLetter, readSeedText, reportLetter,
  reportSeed, sayThanks, sowSeed, waterSeed,
} from "@/lib/farm-api";
import { CROPS, type Crop, DESERT_CROPS, cropById, isDesert, randomCrop, seedNameOf } from "@/lib/game";
import { SUPPORT_LINES, SUPPORT_NOTE } from "@/lib/safety";
import { BULLETIN, BULLETIN_NOTE, BULLETIN_TITLE } from "@/lib/bulletin";
import { loadResidentCount } from "@/lib/resident-api";
import { DEV_HIDDEN_KEY, type DevIdea, addIdea, loadBoard, reportIdea } from "@/lib/dev-api";
import { checkText } from "@/lib/text";
import { useFarm } from "@/state/farm";
import { C, F } from "@/theme";

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
    showSow: (x: number, y: number, initial = "") => modal.open(<SowModal x={x} y={y} initial={initial} />),
    showConsult: (onBack: () => void) => modal.open(<ConsultModal onBack={onBack} />),
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
    showMap: (here: { x: number; y: number }, blooms: { x: number; y: number; bloom: string }[], onGo: (id: string) => void) =>
      modal.open(<MapModal here={here} blooms={blooms} onGo={onGo} />),
    showMayor: () => modal.open(<MayorModal />),
    showOrientation: () => modal.open(<OrientationModal />),
    showMayorThanks: () => modal.open(<MayorThanksModal />),
    showDevStaff: () => modal.open(<DevStaffModal />),
    showBlackboard: () => modal.open(<BlackboardModal />),
    showMemory: (c: CropDoc) => modal.open(<MemoryModal crop={c} />),
    showSupport: (kind: SupportKind, onBack?: () => void) => modal.open(<SupportModal kind={kind} onBack={onBack} />),
  };
}

/* =========================================================
   種を蒔く
   ========================================================= */
function SowModal({ x, y, initial = "" }: { x: number; y: number; initial?: string }) {
  const { uid, name, refresh } = useFarm();
  const a = useActions();
  const toast = useToast();
  const text = useRef(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const res = checkText(text.current, 0, null);
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
          <PaperInput placeholder="吃音と向き合う挑戦を、300文字以内で書いてみよう（これからのことも、やってみたことも）" maxLines={null} onChangeText={(t) => { text.current = t; }} />
        </>
      ) : (
        <>
          <Title>種を蒔く</Title>
          <Body>書いた苦労は、この場所に種として埋まります。見つけた人だけが読めます。</Body>
          <PaperInput placeholder="吃音の苦労を、300文字以内で書いてみよう" maxLines={null} initial={initial} onChangeText={(t) => { text.current = t; }} />
        </>
      )}
      <ErrorText>{err}</ErrorText>
      <Actions>
        {/* 苦労の種だけ：書いている途中でも相談窓口を開ける（戻ると書きかけの文はそのまま） */}
        {isDesert(x, y) ? null : (
          <View style={s.consult}>
            <LinkBtn label="本当につらい時はこちらに相談" onPress={() => { const t = text.current; a.showConsult(() => a.showSow(x, y, t)); }} />
          </View>
        )}
        <Btn kind="quiet" label="やめる" onPress={a.close} />
        <Btn label="種を蒔く" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

function OwnSeedModal({ seed }: { seed: Seed }) {
  const { uid, letters } = useFarm();
  const a = useActions();
  const [text, setText] = useState("読み込み中…");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    readSeedText(seed.id).then((t) => { setText(t); setLoaded(true); }).catch(() => setText("読み込めませんでした。"));
  }, [seed.id]);
  // 自分の種にも、1回だけ水やりできる（水やりの人数の枠には数えない）
  const selfWatered = letters.some((l) => l.seedId === seed.id && l.fromUid === uid);
  const canWater = seed.status === "public" && !selfWatered && loaded;
  // 水やりの人数は見せない。確認中のときだけ、そのことを伝える
  const status = seed.status === "review" ? "この種は確認中のため、ほかの村人には見えていません。" : "";
  return (
    <>
      <Title>{`あなたが蒔いた${seedNameOf(seed.id)}`}</Title>
      <Paper text={text} />
      {status ? <Small>{status}</Small> : null}
      {selfWatered ? <Small>自分への水やりの手紙は、郵便受けに届いています。</Small> : null}
      <Actions>
        {canWater ? <Btn kind="quiet" label="とじる" onPress={a.close} /> : <Btn label="とじる" onPress={a.close} />}
        {canWater ? <Btn kind="water" label="自分に水やりする" onPress={() => a.showWaterLetter(seed, text)} /> : null}
      </Actions>
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
      <Title>{`誰かの${seedNameOf(seed.id)}`}</Title>
      <Paper text={text} />
      <SectionLabel>あなたが送った手紙</SectionLabel>
      <Paper text={letter} from={`${name}より`} />
      {crop
        ? <Body style={{ marginTop: 14 }}>{`種を蒔いた人から「ありがとう」が届き、${cropById(crop.cropType).name}が咲きました。`}</Body>
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
      <Title>{`誰かの${seedNameOf(seed.id)}`}</Title>
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
  const self = seed.ownerUid === uid; // 自分の種への水やり
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
      toast(self ? "自分の種に水やりしました。手紙は郵便受けに届きました。" : "水やりしました。手紙は種を蒔いた人に届きました。");
      // ほかの村人の種への、初めての水やりなら、村長が話しかけてくる
      if (!self) {
        countMyWaterings(uid)
          .then((n) => { if (n === 1) setTimeout(a.showMayorThanks, 1200); })
          .catch((e) => console.error("countMyWaterings", e));
      }
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
      <Title>{self ? "自分に、優しい言葉で水やりしましょう" : "優しい言葉で水やりしましょう"}</Title>
      <Details summary={self ? `自分の${seedNameOf(seed.id)}をもう一度読む` : `誰かの${seedNameOf(seed.id)}をもう一度読む`}><Paper text={seedText} /></Details>
      <Tips items={self
        ? ["友だちに声をかけるように、自分にも優しい言葉を", "書いたときの自分を、ねぎらうひとことを"]
        : ["アドバイスより、まず気持ちを受け止める言葉を", "似た経験があれば、ひとこと添えて"]} />
      <PaperInput placeholder={self ? "自分へ" : "種を蒔いた人へ"} initial={initial} onChangeText={(t) => { text.current = t; }} />
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="もどる" onPress={() => modal.open(self ? <OwnSeedModal seed={seed} /> : <SeedModal seed={seed} text={seedText} />)} />
        <Btn kind="water" label="水やりする" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

/* =========================================================
   郵便受けと手紙
   ========================================================= */
export const THANKS_TEXT = "花が咲きました。ありがとう。";

// 届いた手紙と、水やりした種の人からの「ありがとう」を、新しい順に並べる
function MailboxModal() {
  const { uid, letters, crops, thanks, seenThanks } = useFarm();
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
                  {unread ? <T style={s.listIcon}>💌</T> : <FlowerIcon id={cropById(c.cropType).id} size={32} />}
                  <View style={s.listMain}>
                    <T style={s.listName}>
                      種を蒔いた人から
                      {unread ? <T style={s.unread}>　未読</T> : null}
                    </T>
                    <T style={s.listSub} numberOfLines={1}>{`${dateText(c.harvestedAt)}　${THANKS_TEXT}`}</T>
                  </View>
                </Pressable>
              );
            }
            const l = item.letter;
            const crop = l.status === "thanked" ? cropForLetter(crops, l.id) : null;
            const icon = l.status === "unread" ? "✉️" : "📄";
            return (
              <Pressable key={l.id} style={s.listItem} onPress={() => a.showLetter(l)} accessibilityRole="button">
                {crop ? <FlowerIcon id={crop.id} size={32} /> : <T style={s.listIcon}>{icon}</T>}
                <View style={s.listMain}>
                  <T style={s.listName}>
                    {l.fromUid === uid ? "自分から" : `${l.fromName}さんから`}
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
        <Animated.View entering={ZoomIn.springify().damping(9)}><FlowerIcon id={info.id} size={96} style={s.cropBig} /></Animated.View>
        <Title>種を蒔いた人から</Title>
      </View>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Paper text={THANKS_TEXT} from="種を蒔いた人より" minLines={1} />
      </Animated.View>
      <Body style={{ marginTop: 14 }}>{`あなたの水やりで${info.name}が咲きました。`}</Body>
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
  const self = letter.fromUid === uid; // 自分の種への水やりの手紙

  useEffect(() => {
    if (initialLetter.status === "unread") markRead(initialLetter).then(refresh).catch((e) => console.error(e));
  }, [initialLetter, refresh]);

  const thanked = letter.status === "thanked";
  const crop = thanked ? cropForLetter(crops, letter.id) : null;

  const thanks = async () => {
    setBusy(true);
    try {
      // 同じ種からは、誰の水やりでも同じ花が咲く。最初の1つだけランダムに決める
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
      <Title>{self ? "自分への手紙" : `${letter.fromName}さんからの手紙`}</Title>
      <Details summary={`あなたが蒔いた${seedNameOf(letter.seedId)}`}><Paper text={letter.seedText || ""} /></Details>
      <Animated.View entering={FadeInDown.duration(600)}>
        <Paper text={letter.text} from={self ? "自分より" : `${letter.fromName}より`} />
      </Animated.View>
      {thanked
        ? <Body style={{ marginTop: 14 }}>{self ? `ありがとうを伝えました。${crop ? crop.name : "花"}が咲きました。` : `ありがとうを伝えました。${crop ? crop.name : "花"}が咲き、${letter.fromName}さんにも届きました。`}</Body>
        : <Small>{self ? "「ありがとう」を押すと花が咲きます。" : "「ありがとう」を押すと花が咲き、手紙をくれた人にも同じ花が届きます。"}</Small>}
      <Actions>
        <Btn kind="quiet" label="郵便受けにもどる" onPress={a.showMailbox} />
        {thanked ? null : <Btn label="ありがとう" onPress={thanks} disabled={busy} />}
      </Actions>
      {self ? null : (
        <Links>
          <LinkBtn label="この手紙を通報する" onPress={report} />
          <LinkBtn label="この人をブロックする" onPress={block} />
        </Links>
      )}
    </>
  );
}

function HarvestModal({ letter, crop }: { letter: Letter; crop: Crop }) {
  const a = useActions();
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View entering={ZoomIn.springify().damping(9)}><FlowerIcon id={crop.id} size={96} style={s.cropBig} /></Animated.View>
      <Title>{`${crop.name}が咲きました`}</Title>
      <Body style={{ textAlign: "center" }}>{letter.fromUid === letter.toUid ? "自分への優しい言葉で、花が咲きました。" : `${letter.fromName}さんにも、同じ${crop.name}が届きました。`}</Body>
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
  const got = new Set(crops.map((c) => cropById(c.cropType).id)); // 花にする前の id も、花として数える
  return (
    <>
      <Title>思い出帳</Title>
      <T style={s.dex}>{`図鑑 ${CROPS.filter((c) => got.has(c.id)).length} / ${CROPS.length}種類`}</T>
      <View style={s.dexRow} accessible={false}>
        {CROPS.map((c) => <FlowerIcon key={c.id} id={c.id} size={32} dim={!got.has(c.id)} />)}
      </View>
      <T style={s.dex}>{`砂漠の図鑑 ${DESERT_CROPS.filter((c) => got.has(c.id)).length} / ${DESERT_CROPS.length}種類`}</T>
      <View style={s.dexRow} accessible={false}>
        {DESERT_CROPS.map((c) => <FlowerIcon key={c.id} id={c.id} size={32} dim={!got.has(c.id)} />)}
      </View>
      {crops.length === 0 ? (
        <Body>まだ花はありません。種に水やりするか、届いた手紙に「ありがとう」を伝えると、花が咲いてここに入ります。</Body>
      ) : (
        <View style={s.grid}>
          {crops.map((c) => {
            const info = cropById(c.cropType);
            return (
              <Pressable key={c.id} style={s.cell} onPress={() => a.showMemory(c)} accessibilityRole="button" accessibilityLabel={`${info.name}の思い出`}>
                <FlowerIcon id={info.id} size={48} />
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

// 村のマップを歩いている村長（長老）
function MayorModal() {
  const a = useActions();
  return (
    <>
      <Title>村長</Title>
      <Body>村長「よう元気か」</Body>
      <Actions>
        <Btn kind="quiet" label="村のことを聞く" onPress={a.showOrientation} />
        <Btn label="とじる" onPress={a.close} />
      </Actions>
    </>
  );
}

// はじめて、ほかの村人の種に水やりしたとき
function MayorThanksModal() {
  const a = useActions();
  return (
    <>
      <View style={s.mayorHead}>
        <MayorPortrait size={64} />
        <View style={{ flex: 1 }}><Title>村長</Title></View>
      </View>
      <Body>村長「ありがとうな。これで村がまた少し元気になった」</Body>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

/* =========================================================
   村長のオリエンテーション（はじめて村に来たとき。村長に「村のことを聞く」でもう一度）
   ========================================================= */
const ORIENTATION: { title: string; lines: string[] }[] = [
  { title: "ようこそ、吃音村へ", lines: [
    "よう来たな。わしはこの村の村長じゃ。",
    "少しだけ、この村のことを話させておくれ。",
  ] },
  { title: "吃音のある人の村", lines: [
    "吃音村は、吃音のある人のための村じゃ。",
    "ことばがつかえても、ここでは誰も急かさん。自分のペースで、ゆっくり過ごしておくれ。",
  ] },
  { title: "苦労の種", lines: [
    "吃音で苦労したことがあったら、草地に立って「蒔く」を押してごらん。その苦労が「種」になって、土に埋まる。",
    "北東の砂漠では、これからの挑戦や、やってみたことを「挑戦の種」として蒔けるぞ。",
  ] },
  { title: "水やり", lines: [
    "村を歩いていると、土がきらっと光るところがある。そこには誰かの種が埋まっておる。",
    "見つけたら、優しい言葉の手紙で水やりをしてあげておくれ。手紙は、種を蒔いた人の郵便受けにすぐ届く。",
  ] },
  { title: "花が咲く", lines: [
    "手紙を受け取った人が「ありがとう」を返すと、その種から花が咲く。",
    "花は、蒔いた人と水やりした人の2人の思い出帳に入って、村の地面にも咲くんじゃ。咲いたあとも、水やりの手紙は送れるぞ。",
  ] },
  { title: "完全に匿名の村", lines: [
    "大事なことをひとつ。この村は完全に匿名じゃ。メールアドレスも本名もいらんし、連絡先は書けん。",
    "種には、蒔いた人の村人名すら出さん。誰の苦労かは、誰にもわからん。だから安心して、本当の気持ちを蒔いておくれ。",
  ] },
  { title: "困ったときは", lines: [
    "嫌な言葉が届いたら、通報やブロックができる。本当につらいときは、相談できる窓口もあるからの。",
    "わしはいつも村の道を歩いておる。また話を聞きたくなったら、声をかけておくれ。",
  ] },
];

function OrientationModal() {
  const a = useActions();
  const [page, setPage] = useState(0);
  const p = ORIENTATION[page];
  const last = page === ORIENTATION.length - 1;
  return (
    <>
      <View style={s.mayorHead}>
        <MayorPortrait size={64} />
        <View style={{ flex: 1 }}>
          <Title>{p.title}</Title>
          <T style={s.mayorPage}>{`村長のはなし　${page + 1} / ${ORIENTATION.length}`}</T>
        </View>
      </View>
      {p.lines.map((l) => <Body key={l}>{`村長「${l}」`}</Body>)}
      <Actions>
        {page > 0 ? <Btn kind="quiet" label="もどる" onPress={() => setPage(page - 1)} /> : null}
        <Btn label={last ? "村を歩く" : "次へ"} onPress={() => (last ? a.close() : setPage(page + 1))} />
      </Actions>
    </>
  );
}

// 村全体のマップ（ヘッダーの「マップ」）
function MapModal({ here, blooms, onGo }: {
  here: { x: number; y: number }; blooms: { x: number; y: number; bloom: string }[]; onGo: (id: string) => void;
}) {
  const a = useActions();
  return (
    <>
      <Title>吃音村のマップ</Title>
      <VillageMap here={here} blooms={blooms} onPick={onGo} />
      <Small>赤い丸が、いまあなたのいる場所です。建物を押すと、その前まで行けます。</Small>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

// 係員の窓口。住民票を書く・読む（画面は src/screens/resident.tsx）
function ClerkModal() {
  const { uid } = useFarm();
  const a = useActions();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!uid || uid === "offline") return;
    let alive = true;
    loadResidentCount().then((n) => { if (alive) setCount(n); }).catch((e) => console.error("resident_count", e));
    return () => { alive = false; };
  }, [uid]);
  const go = (path: "/resident" | "/residents") => { a.close(); router.push(path); };
  return (
    <>
      <Title>村役場の窓口</Title>
      <Body>係員「こんにちは。ここは住民票の窓口です。」</Body>
      {count !== null ? <Body>{`係員「現在の吃音村の人口は${count}人です。」`}</Body> : null}
      <Body>係員「住民票には、自己紹介や、あなたの吃音のことを書いておけます。ほかの村人に見せるかどうかは、あなたが選べますよ。」</Body>
      <View style={s.clerk}>
        <Btn label="わたしの住民票" onPress={() => go("/resident")} />
        <Btn kind="water" label="村人の住民票を見る" onPress={() => go("/residents")} />
        <Btn kind="quiet" label="とじる" onPress={a.close} />
      </View>
    </>
  );
}

/* =========================================================
   開発局：フクロウにアイデアを伝える／黒板を読む
   ========================================================= */
function DevStaffModal() {
  const { uid } = useFarm();
  const a = useActions();
  const [step, setStep] = useState<"ask" | "none" | "write" | "done">("ask");
  const text = useRef("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const res = checkText(text.current, 0, null);
    if (res.error) { setErr(res.error); return; }
    setBusy(true);
    setErr("");
    try {
      await addIdea(uid, text.current.trim(), res.crisis ? "review" : "pending");
      if (res.crisis) a.showSupport("idea");
      else setStep("done");
    } catch (e) {
      console.error(e);
      setBusy(false);
      setErr("伝えられませんでした。通信を確認して、もう一度押してください。");
    }
  };

  return (
    <>
      <Title>開発局</Title>
      {step === "ask" ? (
        <>
          <Body>フクロウ「こんなところまでよく来てくれた。なんか吃音村を良くするためのアイデアないかな？」</Body>
          <Actions>
            <Btn kind="quiet" label="今はまだない" onPress={() => setStep("none")} />
            <Btn label="ある" onPress={() => setStep("write")} />
          </Actions>
        </>
      ) : step === "none" ? (
        <>
          <Body>フクロウ「そうか。思いついたら、またいつでも来てくれ。黒板も見ていってくれよな。」</Body>
          <Actions><Btn label="とじる" onPress={a.close} /></Actions>
        </>
      ) : step === "write" ? (
        <>
          <Body>フクロウ「おお、ぜひ聞かせてくれ！」</Body>
          <PaperInput placeholder="吃音村を良くするためのアイデアを、300文字以内で書いてみよう" maxLines={null} onChangeText={(t) => { text.current = t; }} />
          <Small>書いたアイデアは、運営が確かめてから、名前を出さずに黒板に並びます。</Small>
          <ErrorText>{err}</ErrorText>
          <Actions>
            <Btn kind="quiet" label="やめる" onPress={a.close} />
            <Btn label="伝える" onPress={submit} disabled={busy} />
          </Actions>
        </>
      ) : (
        <>
          <Body>フクロウ「ありがとう！　運営に確かめてもらってから、黒板に書いておくよ。」</Body>
          <Actions>
            <Btn kind="quiet" label="黒板を見る" onPress={a.showBlackboard} />
            <Btn label="とじる" onPress={a.close} />
          </Actions>
        </>
      )}
    </>
  );
}

function BlackboardModal() {
  const { uid } = useFarm();
  const a = useActions();
  const toast = useToast();
  const [ideas, setIdeas] = useState<DevIdea[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([loadBoard(uid), AsyncStorage.getItem(DEV_HIDDEN_KEY).catch(() => null)])
      .then(([list, h]) => {
        if (!alive) return;
        setHidden(new Set(h ? (JSON.parse(h) as string[]) : []));
        setIdeas(list);
      })
      .catch((e) => { console.error(e); if (alive) { setErr("黒板を読めませんでした。"); setIdeas([]); } });
    return () => { alive = false; };
  }, [uid]);

  const report = async (idea: DevIdea) => {
    if (!(await confirm("このアイデアを通報しますか？　あなたの黒板からは見えなくなり、運営が確認します。", "通報する", true))) return;
    try { await reportIdea(uid, idea.id); } catch (e) { console.error(e); }
    const next = new Set(hidden).add(idea.id);
    setHidden(next);
    AsyncStorage.setItem(DEV_HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
    toast("通報しました。運営が確認します。");
  };

  const shown = (ideas ?? []).filter((i) => !hidden.has(i.id));
  return (
    <>
      <Title>開発局の黒板</Title>
      <View style={s.board}>
        <T style={s.boardHead}>吃音村を良くするアイデア</T>
        {ideas === null ? <T style={s.chalkSub}>読み込んでいます…</T> : null}
        {err ? <T style={s.chalkSub}>{err}</T> : null}
        {ideas !== null && !err && shown.length === 0 ? <T style={s.chalkSub}>まだ、何も書かれていない。</T> : null}
        {shown.map((i) => (
          <View key={i.id} style={s.boardItem}>
            <T style={s.chalk}>{`・${i.text}`}</T>
            <View style={s.boardMeta}>
              <T style={s.chalkSub}>{i.uid === uid ? (i.status === "public" ? "あなたのアイデア" : "あなたのアイデア（運営が確認中）") : dateText(i.createdAt)}</T>
              {i.uid !== uid ? <Pressable accessibilityRole="button" onPress={() => report(i)} hitSlop={8}><T style={s.chalkLink}>通報</T></Pressable> : null}
            </View>
          </View>
        ))}
      </View>
      <Small>村人から届いたアイデアのうち、運営が確かめたものを、名前を出さずに並べています。</Small>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

function MemoryModal({ crop: c }: { crop: CropDoc }) {
  const { uid } = useFarm();
  const a = useActions();
  const info = cropById(c.cropType);
  const self = c.sowerUid === c.watererUid; // 自分の種への水やり
  const lead = self
    ? "あなたの種に、自分で水やりしました。"
    : c.sowerUid === uid
    ? `あなたの種に、${c.watererName}さんが水やりしてくれました。`
    : `あなたが誰かの${seedNameOf(c.seedId)}に水やりしました。`;
  return (
    <>
      <View style={{ alignItems: "center" }}>
        <FlowerIcon id={info.id} size={96} style={s.cropBig} />
        <Title>{`${info.name}　${dateText(c.harvestedAt)}`}</Title>
      </View>
      <Body>{lead}</Body>
      <SectionLabel>{`${c.sowerUid === uid ? "あなた" : "誰か"}の${seedNameOf(c.seedId)}`}</SectionLabel>
      <Paper text={c.seedText} />
      <SectionLabel>{self ? "自分への手紙" : `${c.watererName}さんの手紙`}</SectionLabel>
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
type SupportKind = "seed" | "letter" | "cafe" | "unsaved" | "idea" | "resident" | "residentPrivate";
const SUPPORT_LEAD: Record<SupportKind, string> = {
  seed: "とてもつらい気持ちが書かれていたので、この種はいったん非公開にして、運営が確認します。",
  letter: "とてもつらい気持ちが書かれていたので、この手紙は送らずにいったん止めました。",
  cafe: "とてもつらい気持ちが書かれていたので、この言葉はほかの村人には届けず、運営が確認します。",
  unsaved: "とてもつらい気持ちが書かれていました。この言葉はまだ保存されていません。",
  idea: "とてもつらい気持ちが書かれていたので、このアイデアは黒板には出さず、運営が確認します。",
  resident: "とてもつらい気持ちが書かれていたので、この住民票はいったんほかの村人には見せず、運営が確認します。",
  residentPrivate: "とてもつらい気持ちが書かれていました。この住民票は、あなただけが読めます。",
};

// 種を蒔くページから開く相談窓口
function ConsultModal({ onBack }: { onBack: () => void }) {
  const a = useActions();
  return (
    <>
      <Title>ひとりで抱えこまないで</Title>
      <Body>苦しいときは、話を聞いてくれる窓口があります。</Body>
      <SupportList />
      <Small>{SUPPORT_NOTE}</Small>
      <Actions>
        <Btn kind="quiet" label="種を蒔くページに戻る" onPress={onBack} />
        <Btn label="とじる" onPress={a.close} />
      </Actions>
    </>
  );
}

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
  listIcon: { fontSize: 24, width: 32, textAlign: "center" },
  listMain: { flex: 1, minWidth: 0 },
  listName: { fontSize: 15 },
  unread: { fontSize: 12, color: C.error },
  listSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  envelope: { fontSize: 40, textAlign: "center", lineHeight: 48, marginBottom: 8 },
  cropBig: { marginTop: 6, marginBottom: 10 },
  dex: { fontSize: 14, color: C.sub },
  dexRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 2, marginBottom: 12 },
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
  clerk: { gap: 10, marginTop: 6 },
  mayorHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 6 },
  mayorPage: { fontSize: 12, color: C.sub, marginTop: -6 },
  consult: { flex: 1, minWidth: 0, alignSelf: "center" }, // 狭いときは折り返して、ボタンを1列に収める
  board: { backgroundColor: "#2f5a46", borderColor: "#7a5235", borderWidth: 6, borderRadius: 4, padding: 12, marginBottom: 10 },
  boardHead: { color: "#f4f7f2", fontSize: 16, marginBottom: 8, textDecorationLine: "underline" },
  boardItem: { marginBottom: 10 },
  boardMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 },
  chalk: { color: "#f4f7f2", fontFamily: F.letter, fontSize: 15, lineHeight: 22 },
  chalkSub: { color: "#b9cbbf", fontSize: 12 },
  chalkLink: { color: "#f2d04b", fontSize: 12, textDecorationLine: "underline" },
  support: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", backgroundColor: C.moss, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  supportText: { fontSize: 15 },
  supportLink: { fontSize: 15, color: C.leaf, textDecorationLine: "underline" },
});
