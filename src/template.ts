/**
 * スプレッドシート テンプレート作成・初期データ投入処理
 */

const DEFAULT_FOLDER_NAME = "学校カレンダー";
const DEFAULT_UPLOAD_FOLDER_NAME = "アップロード用";
const DEFAULT_SPREADSHEET_NAME = "学校カレンダー管理";

const SHEET_NAME_DAILY = "日次予定";
const SHEET_NAME_LUNCH = "昼食";
const SHEET_NAME_EVENT = "イベント";

const PROP_KEY_FOLDER_ID = "FOLDER_ID";
const PROP_KEY_UPLOAD_FOLDER_ID = "UPLOAD_FOLDER_ID";
const PROP_KEY_SPREADSHEET_ID = "SPREADSHEET_ID";

/**
 * 既存のGoogle DriveフォルダIDを設定するユーティリティ関数
 * （GASエディタ上で直接フォルダIDを指定したい場合に使用）
 */
function setConfigFolderId(folderId: string): void {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(PROP_KEY_FOLDER_ID, folderId.trim());
  console.log(`フォルダIDを設定しました: ${folderId}`);
}

/**
 * テンプレートスプレッドシートおよびフォルダ（アップロード用フォルダ含む）をセットアップする関数
 * GASエディタから手動実行、またはWebアプリの初期セットアップボタンから実行可能
 */
function setupTemplateSpreadsheet(customFolderId?: string, forceOverwriteSample = false): {
  folderId: string;
  folderUrl: string;
  uploadFolderId: string;
  uploadFolderUrl: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
} {
  const props = PropertiesService.getScriptProperties();

  // 1. メインフォルダの特定または作成
  let folder: GoogleAppsScript.Drive.Folder | null = null;
  const targetFolderId = customFolderId || props.getProperty(PROP_KEY_FOLDER_ID);

  if (targetFolderId) {
    try {
      folder = DriveApp.getFolderById(targetFolderId);
    } catch (e) {
      console.warn(`指定されたフォルダID (${targetFolderId}) が見つからないため、新規作成または検索します。`);
    }
  }

  if (!folder) {
    const folders = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(DEFAULT_FOLDER_NAME);
    }
  }

  const folderId = folder.getId();
  props.setProperty(PROP_KEY_FOLDER_ID, folderId);

  // 1-2. Gemini Spark用の「アップロード用」サブフォルダの特定または作成
  let uploadFolder: GoogleAppsScript.Drive.Folder | null = null;
  const subFolders = folder.getFoldersByName(DEFAULT_UPLOAD_FOLDER_NAME);
  if (subFolders.hasNext()) {
    uploadFolder = subFolders.next();
  } else {
    uploadFolder = folder.createFolder(DEFAULT_UPLOAD_FOLDER_NAME);
  }
  props.setProperty(PROP_KEY_UPLOAD_FOLDER_ID, uploadFolder.getId());

  // 2. スプレッドシートの特定または作成
  let ss: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;
  const savedSsId = props.getProperty(PROP_KEY_SPREADSHEET_ID);

  if (savedSsId) {
    try {
      ss = SpreadsheetApp.openById(savedSsId);
    } catch (e) {
      console.warn(`保存されていたスプレッドシートID (${savedSsId}) が開けないため再検索します。`);
    }
  }

  if (!ss) {
    const filesInFolder = folder.getFilesByName(DEFAULT_SPREADSHEET_NAME);
    while (filesInFolder.hasNext()) {
      const f = filesInFolder.next();
      if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
        ss = SpreadsheetApp.openById(f.getId());
        break;
      }
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(DEFAULT_SPREADSHEET_NAME);
    const ssFile = DriveApp.getFileById(ss.getId());
    ssFile.moveTo(folder);
  }

  const spreadsheetId = ss.getId();
  props.setProperty(PROP_KEY_SPREADSHEET_ID, spreadsheetId);

  // 3. 3つのシート（日次予定・昼食・イベント）の初期化とサンプルデータの投入
  initDailySheet(ss, forceOverwriteSample);
  initLunchSheet(ss, forceOverwriteSample);
  initEventSheet(ss, forceOverwriteSample);

  // デフォルトの「シート1」「Sheet1」があれば削除
  const defaultSheet = ss.getSheetByName("シート1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    ss.deleteSheet(defaultSheet);
  }

  console.log("==========================================");
  console.log("✅ セットアップが完了しました！");
  console.log(`📁 メインフォルダURL: ${folder.getUrl()}`);
  console.log(`📥 アップロード用フォルダURL: ${uploadFolder.getUrl()}`);
  console.log(`📊 スプレッドシートURL: ${ss.getUrl()}`);
  console.log("==========================================");

  return {
    folderId: folderId,
    folderUrl: folder.getUrl(),
    uploadFolderId: uploadFolder.getId(),
    uploadFolderUrl: uploadFolder.getUrl(),
    spreadsheetId: spreadsheetId,
    spreadsheetUrl: ss.getUrl(),
  };
}

/**
 * シート1: 「日次予定」の初期化
 */
function initDailySheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  forceOverwrite: boolean
): void {
  let sheet = ss.getSheetByName(SHEET_NAME_DAILY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_DAILY);
  }

  const headers = [
    "日付",
    "曜日",
    "種別",
    "0校時",
    "1校時",
    "2校時",
    "3校時",
    "4校時",
    "5校時",
    "6校時",
    "下校・バス",
    "持ち物",
    "特記事項",
    "参照資料",
  ];

  const isEmpty = sheet.getLastRow() <= 1;
  if (!isEmpty && !forceOverwrite) {
    return;
  }

  sheet.clear();

  // サンプルデータ（sample_weekly.pdf + sample_lunch.pdf + 持ち物特例ルール準拠）
  const sampleRows = [
    [
      "2026-11-02",
      "月",
      "通常",
      "",
      "こくご（くじらぐも）",
      "せいしょ",
      "ずこう（ニョロニョロ）",
      "",
      "",
      "",
      "下校12:00 / スクバ12:05",
      "はさみ、セロテープ、カラーペン",
      "3時間授業",
      "sample_weekly.pdf",
    ],
    [
      "2026-11-03",
      "火",
      "イベント",
      "",
      "バザー",
      "バザー",
      "バザー",
      "バザー",
      "",
      "",
      "自由下校（帰り方・待ち合わせ場所はお子様と確認）",
      "ナップザック、お小遣い（2000円まで・小銭とお札の組み合わせ）",
      "8:25通常登校（早すぎないように・制服・ナップザック登校） / 登校後の教室：音楽室",
      "sample_weekly.pdf",
    ],
    [
      "2026-11-04",
      "水",
      "休校",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "バザー代休",
      "sample_weekly.pdf",
    ],
    [
      "2026-11-05",
      "木",
      "通常",
      "",
      "がっきゅうかい",
      "えいかいわ",
      "こくご（くじらぐも）",
      "さんすう（くりさがり）",
      "としょ",
      "",
      "",
      "弁当、図書の本",
      "",
      "sample_weekly.pdf",
    ],
    [
      "2026-11-06",
      "金",
      "通常",
      "",
      "こくご（かんじ）",
      "さんすう（ドリル）",
      "おんがく（きらきらぼし）",
      "こくご（くじらぐも）",
      "たいいく（はばとび）",
      "",
      "",
      "弁当",
      "",
      "sample_weekly.pdf",
    ],
    [
      "2026-11-09",
      "月",
      "通常",
      "",
      "こくご",
      "せいしょ",
      "さんすう",
      "おんがく（きらきらぼし）",
      "さんすう",
      "",
      "",
      "",
      "終日 次年度のパンフレット撮影あり（生活のしおり記載の制服の組み合わせで）",
      "sample_weekly.pdf, sample_lunch.pdf",
    ],
    [
      "2026-11-10",
      "火",
      "通常",
      "",
      "たいいく（はばとび）",
      "こくご",
      "ずこう（1・2年生 クリスマス・オーナメントづくり）",
      "ずこう（1・2年生 クリスマス・オーナメントづくり）",
      "こくご",
      "",
      "",
      "はさみ、ボンド、飾りになるもの（モール・毛糸・ビーズなど）、弁当",
      "",
      "sample_weekly.pdf, sample_lunch.pdf",
    ],
    [
      "2026-11-11",
      "水",
      "イベント",
      "特別礼拝についての説明（8:30-9:05）",
      "とくべつれいはい",
      "とくべつじゅぎょう",
      "こくご（保護者参観）",
      "しょしゃ・みずふで（保護者参観）",
      "",
      "",
      "",
      "弁当申込書、代金",
      "8:30-9:05 0時間目 / 1時間目：特別礼拝・2時間目：特別授業（保護者参加可） / 3・4時間目：授業参観",
      "sample_weekly.pdf, sample_lunch.pdf",
    ],
    [
      "2026-11-12",
      "木",
      "通常",
      "",
      "がっきゅうかい",
      "えいかいわ",
      "こくご",
      "さんすう",
      "としょ",
      "",
      "",
      "カトラリー、図書の本",
      "",
      "sample_weekly.pdf, sample_lunch.pdf",
    ],
    [
      "2026-11-13",
      "金",
      "通常",
      "",
      "こくご（かんじ）",
      "さんすう",
      "おんがく（シンコペーテッドクロック）",
      "こくご",
      "たいいく（たかとび）",
      "",
      "",
      "カトラリー",
      "",
      "sample_weekly.pdf, sample_lunch.pdf",
    ],
  ];

  const allValues = [headers, ...sampleRows];
  sheet.getRange(1, 1, allValues.length, headers.length).setValues(allValues);

  // スタイル調整
  sheet.setFrozenRows(1);
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange
    .setBackground("#1a73e8")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  // 日付列をYYYY-MM-DD表示に設定
  sheet.getRange(2, 1, sampleRows.length, 1).setNumberFormat("yyyy-mm-dd");

  // 列幅の調整
  sheet.setColumnWidth(1, 105); // 日付
  sheet.setColumnWidth(2, 50); // 曜日
  sheet.setColumnWidth(3, 75); // 種別
  for (let col = 4; col <= 10; col++) {
    sheet.setColumnWidth(col, 150); // 0〜6校時
  }
  sheet.setColumnWidth(11, 180); // 下校・バス
  sheet.setColumnWidth(12, 240); // 持ち物
  sheet.setColumnWidth(13, 260); // 特記事項
  sheet.setColumnWidth(14, 180); // 参照資料
}

/**
 * シート2: 「昼食」の初期化
 */
function initLunchSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  forceOverwrite: boolean
): void {
  let sheet = ss.getSheetByName(SHEET_NAME_LUNCH);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_LUNCH);
  }

  const headers = ["日付", "曜日", "昼食区分", "メニュー・内容", "備考", "参照資料"];

  const isEmpty = sheet.getLastRow() <= 1;
  if (!isEmpty && !forceOverwrite) {
    return;
  }

  sheet.clear();

  // サンプルデータ（sample_lunch.pdf 申込用紙控え + 水曜午前授業ルール準拠）
  const sampleRows = [
    ["2026-11-02", "月", "不要", "3時間授業（12:00下校のため昼食なし）", "", "sample_weekly.pdf"],
    ["2026-11-03", "火", "不要", "バザー当日", "", "sample_weekly.pdf"],
    ["2026-11-04", "水", "不要", "バザー代休", "", "sample_weekly.pdf"],
    ["2026-11-05", "木", "お弁当持参", "ご家庭のお弁当", "", ""],
    ["2026-11-06", "金", "お弁当持参", "ご家庭のお弁当", "", ""],
    ["2026-11-09", "月", "注文弁当", "カレーライス", "500円（申込済）", "sample_lunch.pdf"],
    ["2026-11-10", "火", "お弁当持参", "ご家庭のお弁当", "注文なし", "sample_lunch.pdf"],
    ["2026-11-11", "水", "不要", "水曜午前授業のため昼食なし", "", "sample_lunch.pdf"],
    [
      "2026-11-12",
      "木",
      "注文弁当",
      "おにぎり・おかずAセット（塩むすび・焼たらこ）",
      "550円（申込済）",
      "sample_lunch.pdf",
    ],
    [
      "2026-11-13",
      "金",
      "注文弁当",
      "おにぎり・おかずAセット（塩むすび・鶏そぼろ）",
      "550円（申込済）",
      "sample_lunch.pdf",
    ],
  ];

  const allValues = [headers, ...sampleRows];
  sheet.getRange(1, 1, allValues.length, headers.length).setValues(allValues);

  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, headers.length)
    .setBackground("#0f9d58")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange(2, 1, sampleRows.length, 1).setNumberFormat("yyyy-mm-dd");

  sheet.setColumnWidth(1, 105); // 日付
  sheet.setColumnWidth(2, 50); // 曜日
  sheet.setColumnWidth(3, 110); // 昼食区分
  sheet.setColumnWidth(4, 280); // メニュー・内容
  sheet.setColumnWidth(5, 160); // 備考
  sheet.setColumnWidth(6, 160); // 参照資料
}

/**
 * シート3: 「イベント」の初期化
 */
function initEventSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  forceOverwrite: boolean
): void {
  let sheet = ss.getSheetByName(SHEET_NAME_EVENT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_EVENT);
  }

  const headers = [
    "日付",
    "イベント名",
    "場所",
    "概要・内容",
    "児童スケジュール",
    "児童の持ち物・服装",
    "保護者参加",
    "保護者スケジュール",
    "保護者の持ち物・注意事項",
    "参照資料",
  ];

  const isEmpty = sheet.getLastRow() <= 1;
  if (!isEmpty && !forceOverwrite) {
    return;
  }

  sheet.clear();

  // サンプルデータ（sample_event.pdf および sample_weekly.pdf より・推測による持ち物追加なし）
  const sampleRows = [
    [
      "2026-05-30",
      "感謝の日礼拝・発表",
      "賀川村島記念講堂",
      "学校法人平和学園創立80周年記念 感謝の日礼拝・発表\n・第1部 礼拝：お話 石黒 敬子先生（低学年担当）\n・第2部 感謝の発表：1年生〜6年生",
      "8:25 登校\n9:00〜10:30 礼拝・発表\n11:00 下校",
      "",
      "あり",
      "8:40〜 受付（センターホール1階エントランス）\n9:00〜10:30 礼拝・発表（人数制限なし／参加は自由です）",
      "・会場での撮影は可能ですが、座席からの移動はお控えください。\n・写真等の取扱いにご注意いただき、SNS等での公開はお控えください。\n・児童・保護者・一般の方の座席を区分けいたします。\n・PTA主催の制服交換会は今年度は実施しません。\n・自転車でご来校の際は、北校地スロープ下駐輪場をご利用ください。",
      "sample_event.pdf",
    ],
    [
      "2026-11-03",
      "バザー",
      "音楽室（登校後の教室）・グレーニアホール（いわしコーナー）",
      "子どもたちがいよいよ楽しみにしている毎年恒例のバザー開催。始まる前にもちょっとした「お楽しみ」があります。\n限られた大事なお小遣いを自分なりに上手に「やりくり」して過ごす行事です（支払いで困った場合はお店の人に相談すると助けてくれます）。",
      "8:25 登校（いつも通り・早すぎないように）\n登校後の教室：音楽室\n終了後：自由下校（帰り方・待ち合わせ場所はお子様と事前に相談）",
      "・制服・ナップザック登校\n・お小遣い：一人2000円まで（小銭とお札の組み合わせがおすすめ）",
      "あり",
      "下校は自由ですので、帰り方・待ち合わせ場所などに関してはお子様とお話しください。",
      "・お小遣いは一人2000円までとなっています。\n・担任は当日グレーニアホールにて「いわしコーナー」を担当しております。",
      "sample_weekly.pdf",
    ],
    [
      "2026-11-11",
      "特別礼拝と授業参観",
      "",
      "1時間目は特別礼拝、2時間目は特別授業となります。保護者の方も参加が出来ますので、お時間が合えばご参加ください。\nまた、同日の3・4時間目は授業参観（3時間目：こくご、4時間目：書写「みずふで」）となります。",
      "8:30〜9:05 0時間目（特別礼拝についての説明）\n1時間目：特別礼拝\n2時間目：特別授業\n3時間目：こくご（授業参観）\n4時間目：書写・みずふで（授業参観）",
      "",
      "あり",
      "1時間目：特別礼拝（保護者参加可）\n2時間目：特別授業（保護者参加可）\n3・4時間目：授業参観",
      "・詳しくは10月9日にClassroomにて配信された「学校から」のお手紙をお読みください。",
      "sample_weekly.pdf",
    ],
  ];

  const allValues = [headers, ...sampleRows];
  sheet.getRange(1, 1, allValues.length, headers.length).setValues(allValues);

  sheet.setFrozenRows(1);
  sheet
    .getRange(1, 1, 1, headers.length)
    .setBackground("#e65100")
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setHorizontalAlignment("center");

  sheet.getRange(2, 1, sampleRows.length, 1).setNumberFormat("yyyy-mm-dd");

  sheet.setColumnWidth(1, 105); // 日付
  sheet.setColumnWidth(2, 180); // イベント名
  sheet.setColumnWidth(3, 180); // 場所
  sheet.setColumnWidth(4, 260); // 概要・内容
  sheet.setColumnWidth(5, 220); // 児童スケジュール
  sheet.setColumnWidth(6, 200); // 児童の持ち物・服装
  sheet.setColumnWidth(7, 90); // 保護者参加
  sheet.setColumnWidth(8, 220); // 保護者スケジュール
  sheet.setColumnWidth(9, 260); // 保護者の持ち物・注意事項
  sheet.setColumnWidth(10, 160); // 参照資料
}
