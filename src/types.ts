/**
 * 学校カレンダー Webアプリ 型定義
 */

interface ReferenceLink {
  name: string;
  url: string;
}

interface LunchData {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  category: string; // "注文弁当" | "お弁当持参" | "不要" | "未登録"
  menu: string;
  note: string;
  references: ReferenceLink[];
}

interface DailySchedule {
  date: string; // YYYY-MM-DD
  dayOfWeek: string; // 月〜日
  type: string; // "通常" | "イベント" | "休校"
  periods: {
    p0: string;
    p1: string;
    p2: string;
    p3: string;
    p4: string;
    p5: string;
    p6: string;
  };
  dismissal: string; // 下校・バス
  belongings: string[]; // 持ち物リスト
  belongingsRaw: string;
  notes: string; // 特記事項
  lunch: LunchData;
  references: ReferenceLink[];
  linkedEvents: SchoolEventItem[];
  hasScheduleData: boolean;
}

interface SchoolEventItem {
  id: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  title: string;
  location: string;
  summary: string;
  studentSchedule: string;
  studentBelongings: string;
  parentParticipation: string; // "あり" | "なし" | "任意" | string
  parentSchedule: string;
  parentNotes: string;
  references: ReferenceLink[];
}

interface InitialRoute {
  view: "daily" | "weekly" | "event";
  targetDate: string; // YYYY-MM-DD (for daily view)
  targetWeekMonday: string; // YYYY-MM-DD (Monday of target week for weekly view)
  targetEventId: string; // Event ID (for event view)
  reasonBanner: string; // 初期表示理由の説明テキスト
  nowIso: string;
  todayDate: string; // YYYY-MM-DD
}

interface AppDataPayload {
  status: "ok" | "needs_setup" | "unauthorized" | "unauthenticated" | "logged_out" | "error";
  message?: string;
  userEmail?: string;
  sessionToken?: string;
  spreadsheetUrl?: string;
  folderUrl?: string;
  initialRoute: InitialRoute;
  dailyMap: { [date: string]: DailySchedule };
  events: SchoolEventItem[];
}

interface SessionRecord {
  email: string;
  createdAt: number;
  expiresAt: number;
}

interface SessionStoreMap {
  [token: string]: SessionRecord;
}

interface ApiRequestBody {
  action?: "login" | "getData" | "setup" | "logout";
  accessToken?: string;
  idToken?: string;
  sessionToken?: string;
  clientId?: string;
  now?: string;
}

