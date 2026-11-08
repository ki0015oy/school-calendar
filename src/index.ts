/**
 * 学校行事・時間割・持ち物管理アプリ (GAS + TypeScript)
 */

interface SchoolEvent {
  title: string;
  date: Date;
  isAllDay: boolean;
  timetable?: string[];
  belongings?: string[];
  notes?: string;
}

/**
 * 動作確認用テスト関数
 */
function testSchoolCalendar(): void {
  const now = new Date();
  console.log(`[School Calendar] 実行時刻: ${now.toLocaleString("ja-JP")}`);

  // サンプルイベント定義
  const sampleEvent: SchoolEvent = {
    title: "学校行事テスト（授業参観）",
    date: now,
    isAllDay: true,
    timetable: ["1: 国語", "2: 算数", "3: 参観授業(理科)", "4: 帰りの会"],
    belongings: ["上履き", "名札", "筆記用具", "保護者証"],
    notes: "午後から保護者懇談会あり",
  };

  console.log("作成予定のイベント情報:", JSON.stringify(sampleEvent, null, 2));
}

/**
 * デフォルトカレンダーに学校行事・時間割・持ち物を登録するサンプル関数
 */
function registerSampleEventToCalendar(): void {
  const calendar = CalendarApp.getDefaultCalendar();
  const today = new Date();

  const title = "【学校】学年閉鎖明け・持ち物確認";
  const description = [
    "【時間割】",
    "1. 国語",
    "2. 算数",
    "3. 図工",
    "4. 体育",
    "",
    "【持っていくもの】",
    "- 連絡帳",
    "- 体操着",
    "- 絵の具セット",
    "- 水筒",
    "",
    "【備考】",
    "体温記録カードにサインを忘れずに"
  ].join("\n");

  const event = calendar.createAllDayEvent(title, today, {
    description: description,
  });

  console.log(`カレンダーに登録しました: ${event.getTitle()} (ID: ${event.getId()})`);
}
