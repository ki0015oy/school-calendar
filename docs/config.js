/**
 * 学校カレンダー PWA フロントエンド設定
 *
 * 1. GOOGLE_CLIENT_ID:
 *    Google Cloud Console (APIs & Services > Credentials) で作成した
 *    「ウェブ アプリケーション」用の OAuth 2.0 クライアント ID を設定してください。
 *    ・「承認済みの JavaScript 生成元」に GitHub Pages のオリジン（例: https://ki0015oy.github.io）を登録してください。
 *    ・使用するスコープは `email` のみです。
 *
 * 2. GAS_API_URL:
 *    Google Apps Script を「ウェブアプリ」としてデプロイした際の URL（.../exec）を設定してください。
 *    ・次のユーザーとして実行: 自分 (Me)
 *    ・アクセスできるユーザー: 全員 (Anyone)
 */
window.APP_CONFIG = {
  GOOGLE_CLIENT_ID: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
  GAS_API_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
};
