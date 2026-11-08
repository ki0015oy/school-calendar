# 学校カレンダー管理 (Google Apps Script + clasp)

Google Apps Script (GAS) と TypeScript / clasp を利用して、子どもの学校行事・時間割・持っていくものなどを一括管理・通知するカレンダープロジェクトです。

---

## 📁 ディレクトリ構成

```
school_calendar/
├── src/
│   ├── appsscript.json   # GASのマニフェストファイル（タイムゾーン: Asia/Tokyo）
│   └── index.ts          # メイン処理（TypeScript、学校行事・時間割等の登録ロジック）
├── .clasp.json.sample    # clasp設定のサンプル
├── .gitignore            # 認証情報やnode_modulesの除外設定
├── package.json          # プロジェクト依存関係とnpmスクリプト
├── tsconfig.json         # TypeScript設定（@types/google-apps-script対応）
└── README.md
```

---

## 🚀 開発の始め方

### 1. Google Apps Script API の有効化（初回のみ）
clasp を使用して Google Drive / GAS と通信するために、以下の設定ページを開き、**「Google Apps Script API」を「オン」** に変更してください。
👉 [Google Apps Script ユーザー設定](https://script.google.com/home/usersettings)

### 2. Googleアカウントへログイン
ターミナルで以下のコマンドを実行し、ブラウザでGoogleアカウントの認証を行います。
```bash
npm run login
```
※ リモート環境などでブラウザが自動で開かない場合は、以下を実行してURLから認証コードを取得できます。
```bash
npx clasp login --no-localhost
```

### 3. プロジェクトの作成 または 紐付け

#### パターンA: 新規にGASプロジェクトを作成する場合
```bash
npm run create -- --title "学校カレンダー管理" --type standalone
```
実行すると、自動的に `.clasp.json` が生成され、GASプロジェクトとローカルフォルダが紐づきます。

#### パターンB: 既存のGASプロジェクトを連携する場合
Google Apps Script エディタの「プロジェクトの設定」にある「スクリプト ID」をコピーし、以下を実行します。
```bash
npm run clone <スクリプトID>
```

---

## 🛠️ 日常の開発コマンド

| コマンド | 説明 |
| :--- | :--- |
| `npm run typecheck` | TypeScriptの型チェックをローカルで実行 |
| `npm run push` | ローカルのコード (`src/`) をGASにアップロード（TypeScriptは自動トランスパイルされます） |
| `npm run push:watch` | ファイル変更を監視して自動でGASにプッシュ |
| `npm run pull` | GAS上の最新コードをローカル (`src/`) にダウンロード |
| `npm run open` | ブラウザで紐付いたGoogle Apps Scriptエディタを開く |
| `npm run login:status` | 現在のログイン状態を確認 |

---

## 📅 本プロジェクトで実装予定の機能イメージ

- **学校行事カレンダー連携**:
  - 行事予定（運動会、保護者会、学年閉鎖、遠足など）の終日イベント登録
- **時間割 & 持ち物リマインダー**:
  - 曜日ごとの時間割（1〜6校時）や特別な時間割変更の管理
  - 「体操着」「絵の具」「連絡帳」「水筒」などの持ち物リストをカレンダーの説明欄や通知に自動反映
- **前日リマインド通知**:
  - 毎夕（例: 18:00）にトリガー実行し、翌日の時間割と必要な持ち物をLINEやGoogleカレンダー通知/メールでお知らせ
