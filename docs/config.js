/**
 * 学校カレンダー PWA フロントエンド設定
 *
 * GAS_API_URL:
 *   Google Apps Script を「ウェブアプリ」としてデプロイした際の URL（.../exec）を設定してください。
 *   ・次のユーザーとして実行: 自分 (Me)
 *   ・アクセスできるユーザー: 全員 (Anyone)
 *
 * ※ GOOGLE_CLIENT_ID は GAS のスクリプトプロパティ（GOOGLE_CLIENT_ID）に設定してください。
 *   アプリ起動時に GAS から自動取得されます。
 */
window.APP_CONFIG = {
  GAS_API_URL: "https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec",
};
