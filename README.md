# 学校カレンダー管理 Webアプリ (Google Apps Script + clasp)

Google Drive の特定フォルダに格納されたスプレッドシートと配布資料（PDF・画像）をもとに、子どもの **1日の予定・1週間の予定・イベント情報** をスマホで快適に確認できる保護者向けWebアプリです。

---

## 📁 ファイル構成

```
school_calendar/
├── src/
│   ├── appsscript.json   # GASマニフェスト（Asia/Tokyo、USER_ACCESSING Webアプリ設定）
│   ├── types.ts          # データ構造・型定義
│   ├── template.ts       # スプレッドシート&フォルダの自動作成・サンプルデータ投入
│   ├── index.ts          # バックエンド（シート読込・日付結合・自動初期表示判定）
│   └── app.html          # スマホ最適化WebアプリUI（1日/週間/イベント切替・持ち物チェック）
├── docs/                 # PWAインストール用ラッパー（Manifest / Service Worker / アイコン）
├── AI_PROMPTS.md         # 配布プリントから生成AIでスプレッドシートを更新するプロンプト集
├── package.json          # ビルド・デプロイ用スクリプト
└── tsconfig.json         # TypeScript設定
```

---

## 🚀 デプロイと初期セットアップ手順

### 1. GASへコードをプッシュ
```bash
npm run push:force
```

### 2. Webアプリとしてデプロイ（初回のみ）
1. `npm run open` でブラウザの Google Apps Script エディタを開きます。
2. 右上の **「デプロイ」 ＞ 「新しいデプロイ」** をクリックします。
3. 種類の選択（歯車アイコン）で **「ウェブアプリ」** を選択します。
4. 以下のように設定します：
   - **説明**: `学校カレンダー v1`
   - **次のユーザーとして実行**: **「ウェブアプリケーションにアクセスしているユーザー」**
   - **アクセスできるユーザー**: **「Google アカウントを持つ全員」**
5. **「デプロイ」** をクリックし、表示された **ウェブアプリのURL** を開きます。

### 3. テンプレートスプレッドシートの作成
- デプロイしたWebアプリのURLを開き、画面に表示される **「✨ サンプル入りスプレッドシートを自動作成する」** ボタンを押します（またはGASエディタ上で `setupTemplateSpreadsheet` 関数を実行します）。
- Google Drive 内に **`学校カレンダー`** フォルダと **`学校カレンダー管理`** スプレッドシート（`日次予定` / `昼食` / `イベント` の3シート＋サンプルPDFのデータ投入済み）が自動生成されます。
- クラス通信や弁当控えなどのPDF（`sample_weekly.pdf`, `sample_lunch.pdf`, `sample_event.pdf` 等）をこの **`学校カレンダー`** フォルダ内にアップロードすると、アプリ内の「参照資料リンク」からワンタップで開けるようになります。

### 4. 保護者（ご家族）への共有設定
- Google Drive の **`学校カレンダー`** フォルダを右クリック ＞ **「共有」** を開き、**保護者のGoogleアカウント（ご夫婦など）のみ** を追加します。
- これにより、共有された保護者のGoogleアカウントだけがWebアプリから予定を閲覧でき、第三者がURLを開いてもデータは一切表示されません。

---

## 📱 スマホへのアプリ（PWA）インストール方法

### 方法A：GASのWebアプリURLから直接ホーム画面に追加する（手軽）
GAS側で `mobile-web-app-capable` / `apple-mobile-web-app-capable` およびアプリアイコンを設定済みのため、そのままホーム画面に追加して全画面アプリ風に起動できます。
- **Android (Chrome)**: WebアプリのURLを開き、右上のメニュー「⋮」＞ **「ホーム画面に追加」** をタップ
- **iPhone (Safari)**: WebアプリのURLを開き、下部の共有ボタン「↑」＞ **「ホーム画面に追加」** をタップ

### 方法B：GitHub Pages 経由でネイティブPWAとしてインストールする（Service Worker + Manifest 完全対応）
Google Apps Script の仕様上、`script.google.com` ドメイン直下では Service Worker を配信できないため、Chromeの「アプリをインストール（WebAPK）」を使う場合は `docs/` フォルダを GitHub Pages 等で公開します。
1. GitHub リポジトリの **Settings ＞ Pages** で、Source を `Deploy from a branch`、Branch を `main` / `/docs` に設定して保存します。
2. 公開された GitHub Pages のURL（`https://<ユーザー名>.github.io/school-calendar/?gas=<GASのexecのURL>`）をスマホの Chrome / Safari で開きます。
3. ブラウザのメニューから **「アプリをインストール」**（または「ホーム画面に追加」）を選択すると、独立したPWAアプリとしてインストールされます。

---

## 🛠️ よく使う開発コマンド

| コマンド | 説明 |
| :--- | :--- |
| `npm run typecheck` | TypeScriptの型チェックを実行 |
| `npm run build` | `src/` を `dist/` にビルド |
| `npm run push` | ビルドしてGASへアップロード |
| `npm run push:force` | マニフェスト（`appsscript.json`）ごと強制アップロード |
| `npm run open` | ブラウザでGASエディタを開く |

