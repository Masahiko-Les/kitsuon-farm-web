# 審査用メモ（App Review Information → Notes）

App Store Connect の「App Review に関する情報」に入れます。

- サインイン情報：「サインインが必要」のチェックを**外す**（匿名ログインのため）。
- 連絡先：運営の名前・電話番号・メールアドレス（審査の担当者だけが見ます）。
- メモ：下の英語版を貼り、その下に日本語版を続けて貼ります（合わせて4000字以内）。

---

## English

Kitsuon Farm (吃音農場) is a small farm game for people who stutter. A user "sows" a short text about a hardship caused by stuttering as a seed on a farm tile. Other users find the seed and "water" it by sending a kind letter. When the sower taps "ありがとう" (Thank you), a crop grows and both users receive it.

**Sign-in**
No account or demo login is needed. The app uses Firebase anonymous authentication. On first launch, enter any villager name and agree to the Terms and Guidelines.

**How to test**
- Walk with the D-pad (bottom left) or by swiping on the map. Press the round A button (bottom right) to act.
- We placed sample seeds near the starting point. Other users' seeds are hidden and glow only when you come within 2 tiles.
  - One step up and one step left of the start
  - One step up and two steps right
  - One step down and two steps left
- Stand on a glowing seed and press the A button ("水やり") to read it. Tap "はい" (Yes), write a letter, and tap "水やりする" to send it.
- To sow your own seed, stand on a grass or field tile and press A ("蒔く").
- During the review period we check the sample account's mailbox and tap "Thank you" on your letter. You will then receive a crop and a thank-you message in the mailbox (郵便受け, top right). Crops can be reread in the memory book (思い出帳).

**Safety features (Guideline 1.2)**
- Agreement to the Terms and Guidelines is required on first launch. They include a zero-tolerance policy for objectionable content.
- Before sending, the app blocks text containing offensive words and contact information (email addresses, URLs, phone numbers, social media IDs).
- Every seed and letter has a report button ("この種を通報する" / "この手紙を通報する"). A reported letter disappears from the recipient's mailbox immediately.
- Users can block the sender of a letter ("この人をブロックする"). Letters from blocked users are no longer delivered.
- The operator reviews reports within 24 hours and removes violating content and users.
- The operator's contact is in Settings → 運営への連絡.

**Mental health**
This app is not a medical or counseling service, and the Terms say so. If a seed contains crisis-related words (e.g. suicidal thoughts), it is saved privately for operator review instead of being published, and Japanese crisis hotlines are shown to the user. A letter containing such words is not sent, and the hotlines are shown.

**Account deletion (Guideline 5.1.1(v))**
Settings (設定) → すべてのデータを削除 deletes the user's seeds, letters, crops, profile and the anonymous account.

**Other**
The UI is in Japanese only. The app is distributed in Japan. It contains no ads, tracking, analytics or in-app purchases.

---

## 日本語

吃音農場は、吃音のある人のための小さな農場ゲームです。吃音の苦労を短い文章の「種」として農場のマスに蒔くと、ほかの利用者がそれを見つけ、優しい言葉の手紙で「水やり」をします。蒔いた人が「ありがとう」を押すと作物が実り、2人に届きます。

**ログイン**
アカウントもデモ用のログインも不要です（Firebase の匿名認証）。初回起動時に好きな村人名を入れ、利用規約とガイドラインに同意してください。

**試し方**
- 左下の十字キーか、マップをなぞって歩きます。右下の丸いAボタンで決定します。
- スタート地点の近くに、見本の種を置いてあります。他人の種はふだん見えず、2マス以内に近づくと光ります。
  - スタートから上に1マス・左に1マス
  - 上に1マス・右に2マス
  - 下に1マス・左に2マス
- 光る種の上でAボタン（「水やり」）を押して読み、「はい」→ 手紙を書いて「水やりする」で送ってください。
- 自分の種は、草や畑のマスでAボタン（「蒔く」）を押すと蒔けます。
- 審査期間中は、運営が見本の種の郵便受けを確認し、届いた手紙に「ありがとう」を押します。すると作物と、お礼のメッセージが郵便受け（右上）に届きます。作物は思い出帳で読み返せます。

**安心・安全の機能（ガイドライン1.2）**
- 初回起動時に、利用規約とガイドラインへの同意が必要です。不適切な書き込みを一切許容しないことを明記しています。
- 送信する前に、NGワードと連絡先（メール、URL、電話番号、SNSのID）を含む文章を止めます。
- すべての種と手紙に通報ボタンがあります。通報された手紙は、受け取った人の郵便受けからすぐに消えます。
- 手紙をくれた人をブロックできます。ブロックした人からの手紙は届きません。
- 運営は通報を24時間以内に確認し、規約に反する書き込みと利用者を削除します。
- 運営の連絡先は、設定 → 運営への連絡にあります。

**心の健康について**
このアプリは医療や相談サービスではなく、利用規約にもそう書いています。危機的な言葉（死にたい気持ちなど）を含む種は公開せず、運営の確認待ちとして保存し、本人に日本の相談窓口を表示します。手紙の場合は送らずに、相談窓口を表示します。

**アカウントの削除（ガイドライン5.1.1(v)）**
設定 → すべてのデータを削除 で、自分の種・手紙・作物・ユーザー情報と匿名アカウントを削除できます。

**そのほか**
画面は日本語のみで、日本で配信します。広告、トラッキング、解析ツール、アプリ内課金はありません。
