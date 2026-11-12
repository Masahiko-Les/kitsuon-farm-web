import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";

import { MayorPortrait, VillageMap, addEffect, setFireCount } from "@/components/farm-map";
import { FlowerIcon } from "@/components/flower-icon";
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
import { CROPS, type Crop, DESERT_CROPS, cropById, isDesert, isDesertSeedId, randomCrop, seedNameOf } from "@/lib/game";
import { SUPPORT_LINES, SUPPORT_NOTE } from "@/lib/safety";
import { MAYOR_UID, type MayorKind, mayorSeedName, mayorSeedText } from "@/lib/mayor-seed";
import { BULLETIN, BULLETIN_NOTE, BULLETIN_TITLE } from "@/lib/bulletin";
import { loadResidentCount } from "@/lib/resident-api";
import { DEV_HIDDEN_KEY, type DevIdea, addIdea, loadBoard, reportIdea } from "@/lib/dev-api";
import {
  AUTHOR_MAX, type Book, LIBRARY_HIDDEN_KEY, type LibraryTarget, type Note, type Review, SHELF_NAME, type Shelf, TITLE_MAX,
  addNote, addReview, builtinBooks, loadMyRequests, loadNotes, loadReviews, loadShelf, reportEntry, requestBook,
} from "@/lib/library";
import {
  CAMPFIRE_HIDDEN_KEY, CAMPFIRE_MAX, type FireMessage, addFireMessage, agoText, loadFire, reportFireMessage,
} from "@/lib/campfire";
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
    showDesertIntro: (x: number, y: number, withSeed: boolean) => modal.open(<DesertIntroModal x={x} y={y} withSeed={withSeed} />),
    showMayorSeed: (kind: MayorKind, x: number, y: number) => modal.open(<MayorSeedModal kind={kind} x={x} y={y} />),
    showMayorMemory: (kind: MayorKind) => modal.open(<MayorMemory kind={kind} />),
    showDevStaff: () => modal.open(<DevStaffModal />),
    showBlackboard: () => modal.open(<BlackboardModal />),
    showShelf: (shelf: Shelf) => modal.open(<ShelfModal shelf={shelf} />),
    showLibraryBook: (book: Book) => modal.open(<LibraryBookModal book={book} />),
    showReviewWrite: (book: Book, initial = "") => modal.open(<ReviewWriteModal book={book} initial={initial} />),
    showLibrarian: () => modal.open(<LibrarianModal />),
    showBoy: () => modal.open(<BoyModal />),
    showCampfire: () => modal.open(<CampfireModal />),
    showNotebook: () => modal.open(<NotebookModal />),
    showNoteWrite: () => modal.open(<NoteWriteModal />),
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
  const { crops: farmCrops, mayorCrops } = useFarm();
  const a = useActions();
  const all = [...farmCrops, ...mayorCrops]; // 村長の種の花も入れる
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
      <View style={s.mayorHead}>
        <MayorPortrait size={64} />
        <View style={{ flex: 1 }}><Title>村長</Title></View>
      </View>
      <Body>「よう元気か」</Body>
      <Actions>
        <Btn kind="quiet" label="村のことを聞く" onPress={a.showOrientation} />
        <Btn label="とじる" onPress={a.close} />
      </Actions>
    </>
  );
}

/* =========================================================
   村長が蒔いた種（新しい村人の、初めての水やりの練習。src/lib/mayor-seed.ts）
   ========================================================= */
function MayorSeedModal({ kind, x, y }: { kind: MayorKind; x: number; y: number }) {
  const a = useActions();
  const modal = useModal();
  return (
    <>
      <Title>{mayorSeedName(kind)}</Title>
      <Paper text={mayorSeedText(kind)} />
      <Body style={{ marginTop: 14 }}>水やりしますか？</Body>
      <Actions>
        <Btn kind="quiet" label="いいえ" onPress={a.close} />
        <Btn kind="water" label="はい" onPress={() => modal.open(<MayorWaterModal kind={kind} x={x} y={y} />)} />
      </Actions>
    </>
  );
}

function MayorWaterModal({ kind, x, y, initial = "" }: { kind: MayorKind; x: number; y: number; initial?: string }) {
  const { waterMayorSeed } = useFarm();
  const a = useActions();
  const modal = useModal();
  const text = useRef(initial);
  const [err, setErr] = useState("");

  const submit = () => {
    const res = checkText(text.current);
    if (res.crisis) {
      const draft = text.current;
      a.showSupport("letter", () => modal.open(<MayorWaterModal kind={kind} x={x} y={y} initial={draft} />));
      return;
    }
    if (res.error) { setErr(res.error); return; }
    const crop = waterMayorSeed(kind, x, y, text.current.trim());
    addEffect("water", x, y);
    modal.open(<MayorThanksModal kind={kind} crop={crop} />);
  };

  return (
    <>
      <Title>優しい言葉で水やりしましょう</Title>
      <Details summary={`${mayorSeedName(kind)}をもう一度読む`}><Paper text={mayorSeedText(kind)} /></Details>
      <Tips items={kind === "farm"
        ? ["アドバイスより、まず気持ちを受け止める言葉を", "似た経験があれば、ひとこと添えて", "村長への手紙は、あなたの端末にだけ残ります"]
        : ["挑戦したこと、しようとしていることを応援する言葉を", "結果より、一歩をふみ出したことに目を向けて", "村長への手紙は、あなたの端末にだけ残ります"]} />
      <PaperInput placeholder="村長へ" initial={initial} onChangeText={(t) => { text.current = t; }} />
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="もどる" onPress={() => modal.open(<MayorSeedModal kind={kind} x={x} y={y} />)} />
        <Btn kind="water" label="水やりする" onPress={submit} />
      </Actions>
    </>
  );
}

function MayorThanksModal({ kind, crop }: { kind: MayorKind; crop: Crop }) {
  const a = useActions();
  return (
    <>
      <View style={s.mayorHead}>
        <MayorPortrait size={64} />
        <View style={{ flex: 1 }}><Title>村長</Title></View>
      </View>
      <Body>「ありがとうな。これで村がまた少し元気になった」</Body>
      <View style={{ alignItems: "center" }}>
        <Animated.View entering={ZoomIn.springify().damping(9)}><FlowerIcon id={crop.id} size={96} style={s.cropBig} /></Animated.View>
      </View>
      <Body style={{ textAlign: "center" }}>{`${mayorSeedName(kind)}に${crop.name}が咲きました。思い出帳に入りました。`}</Body>
      <Body>
        {kind === "farm"
          ? "「村には、ほかの村人の種も埋まっておる。光っているところを見つけたら、また水やりしてあげておくれ」"
          : "「さあ、こんどはおぬしの番じゃ。砂の上で『蒔く』を押して、挑戦の種を蒔いてごらん」"}
      </Body>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

function MayorMemory({ kind }: { kind: MayorKind }) {
  const { mayorCrops } = useFarm();
  const a = useActions();
  const crop = mayorCrops.find((c) => c.id.startsWith(`mayor-${kind}_`));
  if (!crop) return <><Body>{`${mayorSeedName(kind)}の思い出は見つかりませんでした。`}</Body><Actions><Btn label="とじる" onPress={a.close} /></Actions></>;
  return <MemoryModal crop={crop} />;
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
    "花は、蒔いた人と水やりした人の2人の思い出帳に入って、村の地面にも咲くんじゃ。",
  ] },
  { title: "完全に匿名の村", lines: [
    "大事なことをひとつ。この村は完全に匿名じゃ。メールアドレスも本名もいらんし、連絡先は書けん。",
    "種には、蒔いた人の村人名すら出ないのじゃ。誰の苦労かは、誰にもわからん。だから安心して、本当の気持ちを蒔いておくれ。",
  ] },
  { title: "困ったときは", lines: [
    "嫌な言葉が届いたら、通報やブロックができる。本当につらいときは、相談できる窓口もあるからの。",
    "わしはいつも村の道を歩いておる。また話を聞きたくなったら、声をかけておくれ。",
  ] },
];

// 村長の種がまだあるとき（新しい村人）は、最後に水やりへ誘う
const ORIENTATION_MAYOR_SEED = { title: "さっそく水やりを", lines: [
  "広場の南の草地に、わしが蒔いた種がある。近くに行くと、土がきらっと光るはずじゃ。",
  "まずはその種に、水やりの手紙を書いてみておくれ。",
] };

function OrientationModal() {
  const { mayorSeed } = useFarm();
  const a = useActions();
  const pages = mayorSeed.state === "pending" ? [...ORIENTATION, ORIENTATION_MAYOR_SEED] : ORIENTATION;
  return <MayorTalk pages={pages} lastLabel="村を歩く" onDone={a.close} />;
}

// 砂漠に初めて種を蒔こうとしたとき、村長が挑戦の種のことを話す。話し終えたら、そのまま蒔く画面へ
const DESERT_INTRO: { title: string; lines: string[] }[] = [
  { title: "砂漠の挑戦の種", lines: [
    "おお、砂漠まで来たか。この砂漠では、苦労ではなく「挑戦」を種にできるんじゃ。",
    "これからやってみたいことでも、もうやってみたことでもいい。うまくいったかどうかは関係ないぞ。",
  ] },
  { title: "砂漠の花", lines: [
    "挑戦の種にも、村人が水やりの手紙をくれる。「ありがとう」を返すと、砂漠の花が咲くんじゃ。",
    "砂漠の花は、思い出帳の「砂漠の図鑑」に入るぞ。",
  ] },
  { title: "思いきって蒔いておくれ", lines: [
    "挑戦の種にも、蒔いた人の村人名は出ないのじゃ。",
    "小さな一歩でもかまわん。思いきって蒔いておくれ。",
  ] },
];

// 村長の挑戦の種をすぐそばに出したときは、最後に水やりへ誘う（蒔く画面には進まない）
const DESERT_INTRO_SEED = { title: "まずは水やりを", lines: [
  "その前に、すぐそばにわしが蒔いた挑戦の種がある。砂がきらっと光っておるじゃろう。",
  "まずはその種に、応援の手紙で水やりしてみておくれ。",
] };

function DesertIntroModal({ x, y, withSeed }: { x: number; y: number; withSeed: boolean }) {
  const { markDesertIntroSeen } = useFarm();
  const a = useActions();
  useEffect(() => { markDesertIntroSeen(); }, [markDesertIntroSeen]);
  return withSeed
    ? <MayorTalk pages={[...DESERT_INTRO, DESERT_INTRO_SEED]} lastLabel="水やりしに行く" onDone={a.close} />
    : <MayorTalk pages={DESERT_INTRO} lastLabel="挑戦の種を蒔く" onDone={() => a.showSow(x, y)} />;
}

// 村長が何ページかに分けて話す（オリエンテーション・砂漠の話）
function MayorTalk({ pages, lastLabel, onDone }: { pages: { title: string; lines: string[] }[]; lastLabel: string; onDone: () => void }) {
  const [page, setPage] = useState(0);
  const p = pages[page];
  const last = page === pages.length - 1;
  return (
    <>
      <View style={s.mayorHead}>
        <MayorPortrait size={64} />
        <View style={{ flex: 1 }}>
          <Title>{p.title}</Title>
          <T style={s.mayorPage}>{`村長のはなし　${page + 1} / ${pages.length}`}</T>
        </View>
      </View>
      {/* せりふを「」でくくるので、中のかぎかっこは『』にする */}
      {p.lines.map((l) => <Body key={l}>{`「${l.replace(/「/g, "『").replace(/」/g, "』")}」`}</Body>)}
      <Actions>
        {page > 0 ? <Btn kind="quiet" label="もどる" onPress={() => setPage(page - 1)} /> : null}
        <Btn label={last ? lastLabel : "次へ"} onPress={() => (last ? onDone() : setPage(page + 1))} />
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

/* =========================================================
   図書館：本棚・感想・司書・ノート（src/lib/library.ts）
   ========================================================= */
// 通報して隠した感想・ノート（端末に保存）
function useLibraryHidden() {
  const { uid } = useFarm();
  const toast = useToast();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(LIBRARY_HIDDEN_KEY)
      .then((h) => { if (alive && h) setHidden(new Set(JSON.parse(h) as string[])); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const report = async (type: LibraryTarget, id: string) => {
    const what = type === "libraryReview" ? "この感想" : "このノート";
    if (!(await confirm(`${what}を通報しますか？　あなたの画面からは見えなくなり、運営が確認します。`, "通報する", true))) return;
    try { await reportEntry(uid, type, id); } catch (e) { console.error(e); }
    const next = new Set(hidden).add(id);
    setHidden(next);
    AsyncStorage.setItem(LIBRARY_HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
    toast("通報しました。運営が確認します。");
  };
  return { hidden, report };
}

// 書いた人の欄：自分のものは「あなたの〜」、ほかの村人のものは日付と通報
function EntryMeta({ mine, status, createdAt, what, onReport }: {
  mine: boolean; status: string; createdAt?: string | null; what: string; onReport: () => void;
}) {
  return (
    <View style={s.entryMeta}>
      <T style={s.entrySub}>{mine ? (status === "ok" ? `あなたの${what}` : `あなたの${what}（運営が確認中）`) : dateText(createdAt)}</T>
      {!mine ? <Pressable accessibilityRole="button" onPress={onReport} hitSlop={8}><T style={s.entryLink}>通報</T></Pressable> : null}
    </View>
  );
}

function ShelfModal({ shelf }: { shelf: Shelf }) {
  const a = useActions();
  const [books, setBooks] = useState<Book[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadShelf(shelf)
      .then((list) => { if (alive) setBooks(list); })
      .catch((e) => { console.error(e); if (alive) setBooks(builtinBooks(shelf)); });
    return () => { alive = false; };
  }, [shelf]);
  return (
    <>
      <Title>{SHELF_NAME[shelf]}</Title>
      <Body>{shelf === "stutter"
        ? "吃音について書かれた本が並んでいる。本を選ぶと、村人が書き残した感想を読んだり、自分の感想を書いたりできる。"
        : "悲しみをそっと癒したり、勇気をくれたりする本が並んでいる。"}</Body>
      {books === null ? <Small>本を出しています…</Small> : null}
      <View style={s.list}>
        {(books ?? []).map((b) => (
          <Pressable key={b.id} accessibilityRole="button" onPress={() => a.showLibraryBook(b)} style={s.listItem}>
            <View style={[s.spine, { backgroundColor: shelf === "stutter" ? "#3f6fb0" : "#c4473a" }]} />
            <View style={s.listMain}>
              <T style={s.listName}>{`『${b.title}』`}</T>
              <T style={s.listSub}>{[b.author, b.requested ? "村人の希望で並んだ本" : ""].filter(Boolean).join("　")}</T>
            </View>
          </Pressable>
        ))}
      </View>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

function LibraryBookModal({ book }: { book: Book }) {
  const { uid } = useFarm();
  const a = useActions();
  const { hidden, report } = useLibraryHidden();
  const withReviews = book.shelf === "stutter";
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!withReviews) return;
    let alive = true;
    loadReviews(uid, book.id)
      .then((list) => { if (alive) setReviews(list); })
      .catch((e) => { console.error(e); if (alive) { setErr("感想を読めませんでした。"); setReviews([]); } });
    return () => { alive = false; };
  }, [uid, book.id, withReviews]);
  const shown = (reviews ?? []).filter((r) => !hidden.has(r.id));
  return (
    <>
      <Title>{`『${book.title}』`}</Title>
      {book.author ? <Small>{book.author}</Small> : null}
      {book.requested ? (
        book.about ? (<><SectionLabel>この本を希望した村人のおすすめ</SectionLabel><Paper text={book.about} minLines={2} /></>) : <Body>村人の希望で並んだ本だ。</Body>
      ) : <Body>{book.about}</Body>}
      {withReviews ? (
        <>
          <SectionLabel>村人の感想</SectionLabel>
          {reviews === null ? <Small>読み込んでいます…</Small> : null}
          {err ? <ErrorText>{err}</ErrorText> : null}
          {reviews !== null && !err && shown.length === 0 ? <Small>まだ感想はない。最初の感想を書き残してみよう。</Small> : null}
          {shown.map((r) => (
            <View key={r.id} style={s.entry}>
              <Paper text={r.text} minLines={2} />
              <EntryMeta mine={r.uid === uid} status={r.status} createdAt={r.createdAt} what="感想" onReport={() => report("libraryReview", r.id)} />
            </View>
          ))}
        </>
      ) : null}
      <Actions>
        <Btn kind="quiet" label="棚にもどる" onPress={() => a.showShelf(book.shelf)} />
        {withReviews ? <Btn label="感想を書く" onPress={() => a.showReviewWrite(book)} /> : <Btn label="とじる" onPress={a.close} />}
      </Actions>
    </>
  );
}

function ReviewWriteModal({ book, initial }: { book: Book; initial: string }) {
  const { uid } = useFarm();
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
      await addReview(uid, book.id, text.current.trim(), res.crisis ? "review" : "ok");
      if (res.crisis) { a.showSupport("review"); return; }
      toast("感想を書き残しました。");
      a.showLibraryBook(book);
    } catch (e) {
      console.error(e);
      setBusy(false);
      setErr("書き残せませんでした。通信を確認して、もう一度押してください。");
    }
  };
  return (
    <>
      <Title>{`『${book.title}』の感想`}</Title>
      <PaperInput placeholder="読んで感じたことを、300文字以内で書いてみよう" initial={initial} maxLines={null} onChangeText={(t) => { text.current = t; }} />
      <Small>感想は名前を出さずに、この本の感想として並びます。</Small>
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="やめる" onPress={() => a.showLibraryBook(book)} />
        <Btn label="書き残す" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

// 司書（ヒツジ）。並べたい本の希望を聞いて、運営（村長）が承認すると棚に並ぶ
function LibrarianModal() {
  const { uid } = useFarm();
  const a = useActions();
  const [done, setDone] = useState(false);
  const [shelf, setShelf] = useState<Shelf>("stutter");
  const title = useRef("");
  const author = useRef("");
  const reason = useRef("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<Book[]>([]);
  useEffect(() => {
    if (!uid || uid === "offline") return;
    let alive = true;
    loadMyRequests(uid).then((l) => { if (alive) setMine(l); }).catch((e) => console.error(e));
    return () => { alive = false; };
  }, [uid, done]);

  const submit = async () => {
    const t = title.current.trim(), au = author.current.trim(), r = reason.current.trim();
    if (!t) { setErr("本の名前を書いてください。"); return; }
    if ([...t].length > TITLE_MAX) { setErr(`本の名前は${TITLE_MAX}文字以内にしてください。`); return; }
    if ([...au].length > AUTHOR_MAX) { setErr(`書いた人の名前は${AUTHOR_MAX}文字以内にしてください。`); return; }
    const checks = [t, au, r].filter(Boolean).map((x) => checkText(x, 0, null));
    const bad = checks.find((c) => c.error);
    if (bad) { setErr(bad.error!); return; }
    const crisis = checks.some((c) => c.crisis);
    setBusy(true);
    setErr("");
    try {
      await requestBook(uid, { shelf, title: t, author: au, reason: r }, crisis ? "review" : "pending");
      if (crisis) { a.showSupport("request"); return; }
      setDone(true);
    } catch (e) {
      console.error(e);
      setBusy(false);
      setErr("伝えられませんでした。通信を確認して、もう一度押してください。");
    }
  };

  const pending = mine.length > 0
    ? <Small>{`村長と相談中の本：${mine.map((b) => `『${b.title}』`).join("、")}`}</Small>
    : null;
  if (done) {
    return (
      <>
        <Title>図書館のカウンター</Title>
        <Body>司書「ありがとうございます。村長と相談してみますね。」</Body>
        <Small>村長（運営）が承認すると、本棚に並びます。</Small>
        {pending}
        <Actions><Btn label="とじる" onPress={a.close} /></Actions>
      </>
    );
  }
  return (
    <>
      <Title>図書館のカウンター</Title>
      <Body>司書「ようこそ、吃音村の図書館へ。何か並べたい本のご希望はありますか？」</Body>
      <SectionLabel>本の名前</SectionLabel>
      <TextInput
        placeholder="例：きよしこ"
        placeholderTextColor="#9b9384"
        accessibilityLabel="本の名前"
        onChangeText={(v) => { title.current = v; }}
        style={s.field}
      />
      <SectionLabel>書いた人（わかれば）</SectionLabel>
      <TextInput
        placeholder="例：重松清"
        placeholderTextColor="#9b9384"
        accessibilityLabel="書いた人"
        onChangeText={(v) => { author.current = v; }}
        style={s.field}
      />
      <SectionLabel>並べる棚</SectionLabel>
      <View style={s.shelfPick}>
        {(["stutter", "heart"] as const).map((k) => (
          <Pressable
            key={k}
            accessibilityRole="radio"
            accessibilityState={{ selected: shelf === k }}
            onPress={() => setShelf(k)}
            style={[s.shelfBtn, shelf === k && s.shelfBtnOn]}
          >
            <T style={s.shelfBtnText}>{k === "stutter" ? "吃音の本（左）" : "心の本（右）"}</T>
          </Pressable>
        ))}
      </View>
      <SectionLabel>おすすめしたい理由（任意）</SectionLabel>
      <PaperInput placeholder="この本のどんなところが好きか、300文字以内で" maxLines={null} onChangeText={(v) => { reason.current = v; }} />
      <Small>理由は、本が並んだときに名前を出さずに紹介として載ります。</Small>
      {pending}
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="今はない" onPress={a.close} />
        <Btn label="お願いする" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

/* =========================================================
   焚き火：薪をくべて、ひとこと残す（24時間で消える。src/lib/campfire.ts）
   ========================================================= */
const CAMPFIRE_AT = { x: 16, y: 14 }; // 広場の焚き火（MAP の O）
function CampfireModal() {
  const { uid } = useFarm();
  const a = useActions();
  const toast = useToast();
  const [list, setList] = useState<FireMessage[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loadErr, setLoadErr] = useState("");
  const text = useRef("");
  const [len, setLen] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const l = await loadFire(uid);
      setList(l);
      setFireCount(l.filter((m) => m.status === "ok").length);
    } catch (e) {
      console.error(e);
      setLoadErr("焚き火のまわりの言葉を読めませんでした。");
      setList([]);
    }
  };
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CAMPFIRE_HIDDEN_KEY)
      .then((h) => { if (alive && h) setHidden(new Set(JSON.parse(h) as string[])); })
      .catch(() => {});
    loadFire(uid)
      .then((l) => { if (alive) { setList(l); setFireCount(l.filter((m) => m.status === "ok").length); } })
      .catch((e) => { console.error(e); if (alive) { setLoadErr("焚き火のまわりの言葉を読めませんでした。"); setList([]); } });
    return () => { alive = false; };
  }, [uid]);

  const submit = async () => {
    const t = text.current.trim();
    if (!t) { setErr("ひとこと書いてから、薪をくべてください。"); return; }
    if ([...t].length > CAMPFIRE_MAX) { setErr(`${CAMPFIRE_MAX}文字以内にしてください（いま${[...t].length}文字）。`); return; }
    const res = checkText(t, 0, null);
    if (res.error) { setErr(res.error); return; }
    setBusy(true);
    setErr("");
    try {
      await addFireMessage(uid, t, res.crisis ? "review" : "ok");
      if (res.crisis) { a.showSupport("campfire"); return; }
      addEffect("fire", CAMPFIRE_AT.x, CAMPFIRE_AT.y);
      toast("薪をくべた。火がぱちぱちと大きくなった。");
      text.current = ""; setLen(0); setInputKey((k) => k + 1);
      await reload();
    } catch (e) {
      console.error(e);
      setErr("くべられませんでした。通信を確認して、もう一度押してください。");
    }
    setBusy(false);
  };

  const report = async (m: FireMessage) => {
    if (!(await confirm("このひとことを通報しますか？　あなたの画面からは見えなくなり、運営が確認します。", "通報する", true))) return;
    try { await reportFireMessage(uid, m.id); } catch (e) { console.error(e); }
    const next = new Set(hidden).add(m.id);
    setHidden(next);
    AsyncStorage.setItem(CAMPFIRE_HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
    toast("通報しました。運営が確認します。");
  };

  const shown = (list ?? []).filter((m) => !hidden.has(m.id));
  return (
    <>
      <Title>焚き火</Title>
      <Body>ぱちぱちと火がはぜている。薪をくべて、ひとこと残していこう。残した言葉は、24時間たつと燃えて消える。</Body>
      <TextInput
        key={inputKey}
        multiline
        placeholder="ひとこと（200文字以内）"
        placeholderTextColor="#9b9384"
        accessibilityLabel="焚き火に残すひとこと"
        onChangeText={(v) => { text.current = v; setLen([...v].length); }}
        textAlignVertical="top"
        style={s.fireInput}
      />
      <T style={[s.fireCounter, len > CAMPFIRE_MAX && { color: C.over }]}>{`${len} / ${CAMPFIRE_MAX}文字`}</T>
      <Small>名前は出さずに、焚き火のまわりの村人みんなが読めます。</Small>
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="とじる" onPress={a.close} />
        <Btn label="薪をくべる" onPress={submit} disabled={busy} />
      </Actions>
      <SectionLabel>焚き火のまわりに残された言葉</SectionLabel>
      {list === null ? <Small>読み込んでいます…</Small> : null}
      {loadErr ? <ErrorText>{loadErr}</ErrorText> : null}
      {list !== null && !loadErr && shown.length === 0 ? <Small>いまは、誰の言葉も残っていない。</Small> : null}
      {shown.map((m) => (
        <View key={m.id} style={s.fireItem}>
          <T style={s.fireText}>{m.text}</T>
          <View style={s.entryMeta}>
            <T style={s.entrySub}>{m.uid === uid
              ? `あなたのひとこと${m.status === "ok" ? "" : "（運営が確認中）"}　${agoText(m.createdAt)}`
              : agoText(m.createdAt)}</T>
            {m.uid !== uid ? <Pressable accessibilityRole="button" onPress={() => report(m)} hitSlop={8}><T style={s.entryLink}>通報</T></Pressable> : null}
          </View>
        </View>
      ))}
    </>
  );
}

// 図書館を歩きまわっている少年
function BoyModal() {
  const a = useActions();
  return (
    <>
      <Title>少年</Title>
      <Body>「こっこっこっ声が出ない分、ほっほっ！本を読んで立派な人間になるんだ」</Body>
      <Actions><Btn label="とじる" onPress={a.close} /></Actions>
    </>
  );
}

// 閲覧テーブルのノート。心に残った文章と、そのときの心境や状況
function NotebookModal() {
  const { uid } = useFarm();
  const a = useActions();
  const { hidden, report } = useLibraryHidden();
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    loadNotes(uid)
      .then((l) => { if (alive) setNotes(l); })
      .catch((e) => { console.error(e); if (alive) { setErr("ノートを読めませんでした。"); setNotes([]); } });
    return () => { alive = false; };
  }, [uid]);
  const shown = (notes ?? []).filter((n) => !hidden.has(n.id));
  return (
    <>
      <Title>閲覧テーブルのノート</Title>
      <Body>心に残った文章と、そのときの気持ちや状況が、村人の手で書き残されている。</Body>
      {notes === null ? <Small>ページをめくっています…</Small> : null}
      {err ? <ErrorText>{err}</ErrorText> : null}
      {notes !== null && !err && shown.length === 0 ? <Small>まだ何も書かれていない。最初のページに書いてみよう。</Small> : null}
      {shown.map((n) => (
        <View key={n.id} style={s.entry}>
          <SectionLabel>心に残った文章</SectionLabel>
          <Paper text={n.quote} minLines={1} />
          {n.feeling ? (<><SectionLabel>そのときの心境や状況</SectionLabel><Paper text={n.feeling} minLines={1} /></>) : null}
          <EntryMeta mine={n.uid === uid} status={n.status} createdAt={n.createdAt} what="ページ" onReport={() => report("libraryNote", n.id)} />
        </View>
      ))}
      <Actions>
        <Btn kind="quiet" label="とじる" onPress={a.close} />
        <Btn label="ノートに書く" onPress={a.showNoteWrite} />
      </Actions>
    </>
  );
}

function NoteWriteModal() {
  const { uid } = useFarm();
  const a = useActions();
  const toast = useToast();
  const quote = useRef("");
  const feeling = useRef("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const q = checkText(quote.current, 0, null);
    if (q.error) { setErr(quote.current.trim() ? q.error : "心に残った文章を書いてください。"); return; }
    const f = feeling.current.trim() ? checkText(feeling.current, 0, null) : { crisis: false };
    if ("error" in f && f.error) { setErr(f.error); return; }
    const crisis = q.crisis || f.crisis;
    setBusy(true);
    setErr("");
    try {
      await addNote(uid, quote.current.trim(), feeling.current.trim(), crisis ? "review" : "ok");
      if (crisis) { a.showSupport("note"); return; }
      toast("ノートに書き残しました。");
      a.showNotebook();
    } catch (e) {
      console.error(e);
      setBusy(false);
      setErr("書き残せませんでした。通信を確認して、もう一度押してください。");
    }
  };
  return (
    <>
      <Title>ノートに書く</Title>
      <SectionLabel>心に残った文章</SectionLabel>
      <PaperInput placeholder="本や、誰かの言葉で、心に残った文章" maxLines={null} onChangeText={(t) => { quote.current = t; }} />
      <SectionLabel>そのときの心境や状況（任意）</SectionLabel>
      <PaperInput placeholder="その文章に出会ったときの気持ちや、そのころの様子" maxLines={null} onChangeText={(t) => { feeling.current = t; }} />
      <Small>ノートには名前を出さずに書き残されます。</Small>
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="やめる" onPress={a.showNotebook} />
        <Btn label="書き残す" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

function MemoryModal({ crop: c }: { crop: CropDoc }) {
  const { uid } = useFarm();
  const a = useActions();
  const info = cropById(c.cropType);
  const self = c.sowerUid === c.watererUid; // 自分の種への水やり
  const mayor = c.sowerUid === MAYOR_UID; // 村長の種（端末にだけある）
  const mayorName = mayorSeedName(isDesertSeedId(c.seedId) ? "desert" : "farm");
  const lead = mayor
    ? `あなたが${mayorName}に水やりしました。`
    : self
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
      <SectionLabel>{mayor ? mayorName : `${c.sowerUid === uid ? "あなた" : "誰か"}の${seedNameOf(c.seedId)}`}</SectionLabel>
      <Paper text={c.seedText} />
      <SectionLabel>{mayor ? "あなたの手紙" : self ? "自分への手紙" : `${c.watererName}さんの手紙`}</SectionLabel>
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
type SupportKind = "seed" | "letter" | "cafe" | "unsaved" | "idea" | "resident" | "residentPrivate" | "review" | "note" | "request" | "campfire";
const SUPPORT_LEAD: Record<SupportKind, string> = {
  seed: "とてもつらい気持ちが書かれていたので、この種はいったん非公開にして、運営が確認します。",
  letter: "とてもつらい気持ちが書かれていたので、この手紙は送らずにいったん止めました。",
  cafe: "とてもつらい気持ちが書かれていたので、この言葉はほかの村人には届けず、運営が確認します。",
  unsaved: "とてもつらい気持ちが書かれていました。この言葉はまだ保存されていません。",
  idea: "とてもつらい気持ちが書かれていたので、このアイデアは黒板には出さず、運営が確認します。",
  resident: "とてもつらい気持ちが書かれていたので、この住民票はいったんほかの村人には見せず、運営が確認します。",
  residentPrivate: "とてもつらい気持ちが書かれていました。この住民票は、あなただけが読めます。",
  review: "とてもつらい気持ちが書かれていたので、この感想はほかの村人には見せず、運営が確認します。",
  note: "とてもつらい気持ちが書かれていたので、このノートはほかの村人には見せず、運営が確認します。",
  request: "とてもつらい気持ちが書かれていたので、この本の希望は、運営が確認します。",
  campfire: "とてもつらい気持ちが書かれていたので、このひとことはほかの村人には見せず、運営が確認します。",
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
  fireInput: {
    backgroundColor: C.paper, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8,
    fontFamily: F.letter, fontSize: 16, lineHeight: 26, color: C.ink, minHeight: 26 * 3 + 16,
  },
  fireCounter: { marginTop: 4, fontSize: 12, textAlign: "right", color: C.sub },
  fireItem: { backgroundColor: "#3a2a1e", borderColor: "#7a5235", borderWidth: 2, borderRadius: 6, padding: 10, marginBottom: 8 },
  fireText: { color: "#fbe9c8", fontFamily: F.letter, fontSize: 15, lineHeight: 22 },
  spine: { width: 6, alignSelf: "stretch", borderRadius: 2 },
  entry: { marginBottom: 12 },
  entryMeta: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  entrySub: { fontSize: 12, color: C.sub },
  entryLink: { fontSize: 12, color: C.error, textDecorationLine: "underline" },
  field: {
    backgroundColor: C.paper, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8,
    fontFamily: F.letter, fontSize: 16, color: C.ink, marginBottom: 4,
  },
  shelfPick: { flexDirection: "row", gap: 8, marginBottom: 4 },
  shelfBtn: { flex: 1, borderWidth: 2, borderColor: C.mossDeep, borderRadius: 6, backgroundColor: C.mossSoft, paddingVertical: 8, alignItems: "center" },
  shelfBtnOn: { backgroundColor: C.leaf },
  shelfBtnText: { fontSize: 14 },
  support: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", backgroundColor: C.moss, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 6 },
  supportText: { fontSize: 15 },
  supportLink: { fontSize: 15, color: C.leaf, textDecorationLine: "underline" },
});
