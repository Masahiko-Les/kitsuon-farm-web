import type { Timestamp } from "./farm-api";
import { must, supabase } from "./supabase";

/* =========================================================
   図書館（村の南。supabase/migrations/0011）
   - 左の本棚は吃音の本（感想を書き残せる）、右の本棚は心の本（悲しみを癒したり、勇気をくれたりする本）
   - 司書に「並べたい本」を伝えると、運営（村長）が承認したものだけ棚に並ぶ
   - テーブルのノートには、心に残った文章と、そのときの心境や状況を書ける
   - 感想・ノート・希望には名前を出さない
   - 最初から棚にある本と紹介文は、公開前と定期的に見直す
   ========================================================= */

export type Shelf = "stutter" | "heart";
export const SHELF_NAME: Record<Shelf, string> = { stutter: "吃音の本の棚", heart: "心の本の棚" };

export type Book = {
  id: string; shelf: Shelf; title: string; author: string;
  about: string; // 紹介（最初からある本）か、希望した村人のおすすめ
  requested?: boolean; // 村人の希望で並んだ本
  uid?: string; status?: BookStatus; createdAt?: Timestamp | null;
};

// 最初から棚にある本（id は感想の保存に使うので変えない）
export const STUTTER_BOOKS: Book[] = [
  { id: "s-kiyoshiko", shelf: "stutter", title: "きよしこ", author: "重松清", about: "吃音のある少年が、うまく話せないもどかしさを抱えながら、少しずつ大人になっていく物語。" },
  { id: "s-domoru-karada", shelf: "stutter", title: "どもる体", author: "伊藤亜紗", about: "しゃべるとき、体の中で何が起きているのか。吃音のある人たちへの聞き取りから、吃音を「体」の側から考える本。" },
  { id: "s-tsutaerarenai", shelf: "stutter", title: "吃音 伝えられないもどかしさ", author: "近藤雄生", about: "自らも吃音に悩んだ著者が、多くの当事者に話を聞いて書いたノンフィクション。" },
  { id: "s-shino", shelf: "stutter", title: "志乃ちゃんは自分の名前が言えない", author: "押見修造", about: "自分の名前をうまく言えない高校生の志乃と、同級生との、ひと夏の物語（漫画）。" },
  { id: "s-yokuwakaru", shelf: "stutter", title: "吃音のことがよくわかる本", author: "菊池良和（監修）", about: "吃音のしくみや、まわりの人の接し方を、イラストでわかりやすく説明した本。" },
  { id: "s-sekai", shelf: "stutter", title: "吃音の世界", author: "菊池良和", about: "吃音のある医師が、自分の経験と医学の知見から、吃音について語る本。" },
  { id: "s-kinkakuji", shelf: "stutter", title: "金閣寺", author: "三島由紀夫", about: "吃音に悩む若い僧を主人公にした小説。" },
];
export const HEART_BOOKS: Book[] = [
  { id: "h-yoru-to-kiri", shelf: "heart", title: "夜と霧", author: "V・E・フランクル", about: "強制収容所での体験から、どんなときでも人は生きる意味を見いだせると語る本。" },
  { id: "h-hoshi-no-oujisama", shelf: "heart", title: "星の王子さま", author: "サン＝テグジュペリ", about: "「大切なものは、目に見えない」。小さな星から来た王子さまの物語。" },
  { id: "h-momo", shelf: "heart", title: "モモ", author: "ミヒャエル・エンデ", about: "人の話にじっと耳をかたむける少女モモが、時間どろぼうから、みんなの時間を取りもどす物語。" },
  { id: "h-nishi-no-majo", shelf: "heart", title: "西の魔女が死んだ", author: "梨木香歩", about: "学校に行けなくなった少女が、おばあちゃんの家で過ごしながら、自分で決める力を取りもどしていく物語。" },
  { id: "h-100man-kai", shelf: "heart", title: "100万回生きたねこ", author: "佐野洋子", about: "100万回生きて、100万回死んだねこが、はじめて誰かを大切に思う絵本。" },
  { id: "h-pooh", shelf: "heart", title: "クマのプーさん", author: "A・A・ミルン", about: "森の仲間たちと過ごす、のんびりとやさしい日々の物語。" },
  { id: "h-dou-ikiruka", shelf: "heart", title: "君たちはどう生きるか", author: "吉野源三郎", about: "コペル君と、おじさんのノートを通して、どう生きるかを考える本。" },
  { id: "h-kagami-no-kojou", shelf: "heart", title: "かがみの孤城", author: "辻村深月", about: "学校に行けなくなった中学生たちが、鏡の向こうの城で出会う物語。" },
];
export const builtinBooks = (shelf: Shelf) => (shelf === "stutter" ? STUTTER_BOOKS : HEART_BOOKS);

// 文字数の上限（0011 と同じか、それより小さく）
export const TITLE_MAX = 60;
export const AUTHOR_MAX = 40;

// 通報して隠した感想・ノート（端末に保存）
export const LIBRARY_HIDDEN_KEY = "kitsuon-library-hidden";

/* ---------- 本の希望 ---------- */
export type BookStatus = "pending" | "public" | "private" | "review";
const toBook = (r: Record<string, unknown>): Book => ({
  id: r.id as string, shelf: r.shelf as Shelf, title: r.title as string, author: r.author as string, about: r.reason as string,
  requested: true, uid: r.uid as string, status: r.status as BookStatus, createdAt: r.created_at as string,
});

export async function requestBook(uid: string, b: { shelf: Shelf; title: string; author: string; reason: string }, status: "pending" | "review") {
  must(await supabase.from("library_books").insert({ uid, shelf: b.shelf, title: b.title, author: b.author, reason: b.reason, status }));
}

// 棚に並ぶ本：最初からある本と、承認された本（古いものから）
export async function loadShelf(shelf: Shelf): Promise<Book[]> {
  const rows = must(await supabase.from("library_books").select("*").eq("shelf", shelf).eq("status", "public")
    .order("created_at", { ascending: true }).limit(200)) ?? [];
  return [...builtinBooks(shelf), ...rows.map(toBook)];
}

// 自分の希望のうち、村長と相談中のもの
export async function loadMyRequests(uid: string): Promise<Book[]> {
  const rows = must(await supabase.from("library_books").select("*").eq("uid", uid).eq("status", "pending")
    .order("created_at", { ascending: false })) ?? [];
  return rows.map(toBook);
}

/* ---------- 感想 ---------- */
export type EntryStatus = "ok" | "review" | "hidden";
export type Review = { id: string; bookId: string; uid: string; text: string; status: EntryStatus; createdAt?: Timestamp | null };
const toReview = (r: Record<string, unknown>): Review => ({
  id: r.id as string, bookId: r.book_id as string, uid: r.uid as string, text: r.text as string,
  status: r.status as EntryStatus, createdAt: r.created_at as string,
});

// その本の感想：ふつうのものと、自分のもの（確認中も）。新しいものから
export async function loadReviews(uid: string, bookId: string): Promise<Review[]> {
  const rows = must(await supabase.from("library_reviews").select("*").eq("book_id", bookId)
    .or(`status.eq.ok,uid.eq.${uid}`).order("created_at", { ascending: false }).limit(200)) ?? [];
  return rows.map(toReview).filter((r) => r.status !== "hidden" || r.uid === uid);
}

export async function addReview(uid: string, bookId: string, text: string, status: "ok" | "review") {
  must(await supabase.from("library_reviews").insert({ uid, book_id: bookId, text, status }));
}

/* ---------- ノート ---------- */
export type Note = { id: string; uid: string; quote: string; feeling: string; status: EntryStatus; createdAt?: Timestamp | null };
const toNote = (r: Record<string, unknown>): Note => ({
  id: r.id as string, uid: r.uid as string, quote: r.quote as string, feeling: r.feeling as string,
  status: r.status as EntryStatus, createdAt: r.created_at as string,
});

export async function loadNotes(uid: string): Promise<Note[]> {
  const rows = must(await supabase.from("library_notes").select("*")
    .or(`status.eq.ok,uid.eq.${uid}`).order("created_at", { ascending: false }).limit(200)) ?? [];
  return rows.map(toNote).filter((n) => n.status !== "hidden" || n.uid === uid);
}

export async function addNote(uid: string, quote: string, feeling: string, status: "ok" | "review") {
  must(await supabase.from("library_notes").insert({ uid, quote, feeling, status }));
}

/* ---------- 通報 ---------- */
export type LibraryTarget = "libraryReview" | "libraryNote";
export async function reportEntry(uid: string, type: LibraryTarget, id: string) {
  must(await supabase.from("reports").insert({ target_type: type, target_id: id, reporter_uid: uid }));
}

/* ---------- 運営 ---------- */
export async function loadBooksByStatus(status: BookStatus): Promise<Book[]> {
  const rows = must(await supabase.from("library_books").select("*").eq("status", status).order("created_at", { ascending: true })) ?? [];
  return rows.map(toBook);
}
export async function setBookStatus(id: string, status: "public" | "private") {
  must(await supabase.from("library_books").update({ status }).eq("id", id));
}

export async function loadReviewEntries(): Promise<{ reviews: Review[]; notes: Note[] }> {
  const [r, n] = await Promise.all([
    supabase.from("library_reviews").select("*").eq("status", "review").order("created_at", { ascending: true }),
    supabase.from("library_notes").select("*").eq("status", "review").order("created_at", { ascending: true }),
  ]);
  return { reviews: (must(r) ?? []).map(toReview), notes: (must(n) ?? []).map(toNote) };
}

const TABLE: Record<LibraryTarget, string> = { libraryReview: "library_reviews", libraryNote: "library_notes" };
export async function setEntryStatus(type: LibraryTarget, id: string, status: EntryStatus) {
  must(await supabase.from(TABLE[type]).update({ status }).eq("id", id));
}
export async function deleteEntry(type: LibraryTarget, id: string) {
  must(await supabase.from(TABLE[type]).delete().eq("id", id));
}

export type EntryReportGroup = { type: LibraryTarget; targetId: string; reportIds: string[]; review?: Review; note?: Note; bookTitle?: string };
export async function loadEntryReports(): Promise<EntryReportGroup[]> {
  const open = must(await supabase.from("reports").select("id, target_type, target_id")
    .in("target_type", ["libraryReview", "libraryNote"]).eq("handled", false)) ?? [];
  const groups = new Map<string, EntryReportGroup>();
  for (const r of open) {
    const key = `${r.target_type}:${r.target_id}`;
    const g = groups.get(key) ?? { type: r.target_type as LibraryTarget, targetId: r.target_id as string, reportIds: [] };
    g.reportIds.push(r.id as string);
    groups.set(key, g);
  }
  const list = [...groups.values()];
  const rIds = list.filter((g) => g.type === "libraryReview").map((g) => g.targetId);
  const nIds = list.filter((g) => g.type === "libraryNote").map((g) => g.targetId);
  const reviews = rIds.length ? (must(await supabase.from("library_reviews").select("*").in("id", rIds)) ?? []).map(toReview) : [];
  const notes = nIds.length ? (must(await supabase.from("library_notes").select("*").in("id", nIds)) ?? []).map(toNote) : [];
  const requested = reviews.length
    ? (must(await supabase.from("library_books").select("id, title").in("id", reviews.map((r) => r.bookId).filter((id) => !id.startsWith("s-")))) ?? [])
    : [];
  const titleOf = (bookId: string) =>
    [...STUTTER_BOOKS, ...HEART_BOOKS].find((b) => b.id === bookId)?.title ?? (requested.find((b) => b.id === bookId)?.title as string | undefined);
  for (const g of list) {
    if (g.type === "libraryReview") {
      g.review = reviews.find((r) => r.id === g.targetId);
      if (g.review) g.bookTitle = titleOf(g.review.bookId);
    } else g.note = notes.find((n) => n.id === g.targetId);
  }
  return list;
}
