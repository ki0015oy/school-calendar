# 学校カレンダー管理 PWA (GitHub Pages + Google Apps Script API)

Google Drive の特定フォルダに格納されたスプレッドシートと配布資料（PDF・画像）をもとに、子どもの **1日の予定・1週間の予定・イベント情報** をスマホで快適に確認できる保護者向けPWAアプリです。

---

## 🏗️ アーキテクチャとセキュリティ

- **フロントエンド (`docs/`)**: GitHub Pages 上で動作するネイティブ PWA（Service Worker + Web App Manifest 対応）。
- **認証 (Google Cloud OAuth)**: Google Identity Services を用いてサイト全体に Google ログインを要求します。審査不要の非機密スコープ **`email` のみ** を使用します。
- **バックエンド (`src/`)**: Google Apps Script (GAS) を JSON API バックエンドとして構成（実行ユーザー: **自分 (`ME`)**、アクセス権: **全員 (`ANYONE_ANONYMOUS`)**）。
- **独自のファイルアクセス権チェック & トークン管理**:
  1. フロントエンドから受け取った Google OAuth トークンを GAS 側で Google Tokeninfo API (`https://oauth2.googleapis.com/tokeninfo`) に照会してメールアドレスを検証。
  2. そのメールアドレスが Google Drive 上の **`学校カレンダー管理` スプレッドシート** または **`学校カレンダー` フォルダ** に対してアクセス権（オーナー・編集者・閲覧者）を持っているかを GAS 側で独自にチェック。
  3. アクセス権がある場合のみ、独自セッショントークン（`PropertiesService` 管理）を発行し、カレンダーデータを返却します。アクセス権がないユーザーにはデータを一切返しません。

---

## 📁 ファイル構成

```
school-calendar/
├── docs/                 # GitHub Pages 公開用 PWA フロントエンド
│   ├── index.html        # スマホ最適化 SPA（Google OAuth 認証・1日/週間/イベント表示）
│   ├── config.js         # GOOGLE_CLIENT_ID / GAS_API_URL の設定ファイル
│   ├── manifest.json     # PWA Web App Manifest
│   ├── sw.js             # Service Worker
│   ├── icon-192.png      # PWA アイコン (192x192)
│   └── icon-512.png      # PWA アイコン (512x512)
├── src/                  # Google Apps Script バックエンド（JSON API）
│   ├── appsscript.json   # GASマニフェスト（executeAs: ME, access: ANYONE_ANONYMOUS）
│   ├── types.ts          # データ構造・APIレスポンス・セッション型定義
│   ├── template.ts       # スプレッドシート&フォルダの自動作成・サンプルデータ投入
│   └── index.ts          # JSON API (doPost/doGet)・OAuth検証・Drive権限判定・トークン管理
├── AI_PROMPTS.md         # 配布プリントから生成AIでスプレッドシートを更新するプロンプト集
├── package.json          # ビルド・デプロイ用スクリプト
└── tsconfig.json         # TypeScript設定
```

---

## 🚀 セットアップとデプロイ手順

### 1. Google Cloud で OAuth クライアント ID を作成（スコープ: `email` のみ）
1. [Google Cloud Console](https://console.cloud.google.com/) を開き、プロジェクトを選択（または新規作成）します。
2. **「API とサービス」 ＞ 「OAuth 同意画面」** を開きます：
   - User Type: **外部 (External)**（公開ステータスは「本番環境」にしても、`email` スコープのみのため Google による審査は不要です）
   - スコープ: `.../auth/userinfo.email`（`email`）のみ
3. **「API とサービス」 ＞ 「認証情報」 ＞ 「認証情報を作成」 ＞ 「OAuth クライアント ID」** を選択します：
   - アプリケーションの種類: **ウェブ アプリケーション**
   - **承認済みの JavaScript 生成元**: GitHub Pages のオリジンを登録します
     - 例: `https://ki0015oy.github.io`
4. 作成された **クライアント ID**（`xxxx.apps.googleusercontent.com`）を控えます。

### 2. GAS バックエンドをプッシュ＆スクリプトプロパティ設定
1. コードをビルドして GAS にプッシュします：
   ```bash
   npm run push:force
   ```
2. `npm run open` で Google Apps Script エディタを開きます。
3. 初回のみ、エディタ上部の関数選択で **`authorizeBackendScopes`** を選択して **「実行」** し、Drive / Spreadsheet / UrlFetch の権限を承認します。
4. 手順 1 で取得した **OAuth クライアント ID** をスクリプトプロパティに保存します：
   - **方法A（簡単）**: GAS エディタ上部の関数で `setGoogleClientId` を選び、引数にご自身のクライアント ID を指定して実行するか、実行ログ欄の上のコードで直接呼び出して実行します。
   - **方法B**: 左側メニューの **「プロジェクトの設定（歯車アイコン）」 ＞ 「スクリプト プロパティ」** で、プロパティ名 `GOOGLE_CLIENT_ID`、値に取得したクライアント ID を入力して保存します。
5. 右上の **「デプロイ」 ＞ 「新しいデプロイ」**（または「デプロイを管理」から編集）を開き、**「ウェブアプリ」** として以下の設定でデプロイします：
   - **次のユーザーとして実行**: **「自分」 (`Me`)**
   - **アクセスできるユーザー**: **「全員」 (`Anyone`)**
6. 発行された **ウェブアプリの URL**（`https://script.google.com/macros/s/.../exec`）を控えます。

### 3. `docs/config.js` の設定と GitHub Pages 公開
1. `docs/config.js` を開き、デプロイした GAS ウェブアプリの URL を設定します：
   ```javascript
   window.APP_CONFIG = {
     GAS_API_URL: "https://script.google.com/macros/s/あなたのデプロイID/exec",
   };
   ```
   ※ `GOOGLE_CLIENT_ID` は手順2のスクリプトプロパティからアプリ起動時に自動取得されるため、フロントエンドのコードに書く必要はありません。
2. GitHub にコミット＆プッシュします。
3. GitHub リポジトリの **Settings ＞ Pages** で、Source を `Deploy from a branch`、Branch を `main` / `/docs` に設定して公開します。

### 4. 保護者（ご家族）への共有設定
- Google Drive の **`学校カレンダー`** フォルダ（または **`学校カレンダー管理`** スプレッドシート）を右クリック ＞ **「共有」** を開き、閲覧を許可する保護者の Google アカウントを追加します。
- ここで共有された Google アカウントのみがアプリにログインしてデータを取得できます。

---

## 📱 スマホへの PWA インストール方法

1. スマホのブラウザ（Android は Chrome、iPhone は Safari）で GitHub Pages の URL（`https://<ユーザー名>.github.io/school-calendar/`）を開きます。
2. メニューから **「アプリをインストール」** または **「ホーム画面に追加」** をタップすると、独立したネイティブ PWA としてインストールされます。
3. 初回起動時に Google アカウントでログインすると、以降はセッショントークンによりログイン状態が維持されます。

---

## 🛠️ よく使う開発コマンド

| コマンド | 説明 |
| :--- | :--- |
| `npm run typecheck` | TypeScriptの型チェックを実行 |
| `npm run build` | `src/` を `dist/` にビルド |
| `npm run push` | ビルドしてGASへアップロード |
| `npm run push:force` | マニフェスト（`appsscript.json`）ごと強制アップロード |
| `npm run open` | ブラウザでGASエディタを開く |
