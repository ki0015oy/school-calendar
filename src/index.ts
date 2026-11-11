/**
 * 学校カレンダー Webアプリ バックエンド (GAS)
 */

const DAY_NAMES_JA = ["日", "月", "火", "水", "木", "金", "土"];

// オプション: バックエンド側でもOAuthクライアントIDを固定検証したい場合に設定（空欄またはYOUR_...の場合はスキップ）
const ALLOWED_OAUTH_CLIENT_ID = "";

const PROP_KEY_SESSIONS = "AUTH_SESSIONS_JSON";
const PROP_KEY_OAUTH_CLIENT_ID = "OAUTH_CLIENT_ID";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日間有効
const MAX_SESSIONS = 30;

/**
 * POSTリクエストのエントリーポイント（GitHub Pages PWAからのJSON API呼び出し）
 */
function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  let req: ApiRequestBody = {};
  try {
    if (e && e.postData && e.postData.contents) {
      req = JSON.parse(e.postData.contents) as ApiRequestBody;
    }
  } catch (_err) {
    return createJsonResponse(
      buildErrorPayload("error", "リクエスト形式が不正です (Invalid JSON)")
    );
  }
  const payload = handleApiRequest(req);
  return createJsonResponse(payload);
}

/**
 * GETリクエストのエントリーポイント（疎通確認・クエリパラメータ呼び出し対応）
 */
function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  const params = (e && e.parameter) || {};
  const req: ApiRequestBody = {
    action: (params.action as ApiRequestBody["action"]) || "getData",
    accessToken: params.accessToken ? String(params.accessToken) : undefined,
    idToken: params.idToken ? String(params.idToken) : undefined,
    sessionToken: params.sessionToken ? String(params.sessionToken) : undefined,
    clientId: params.clientId ? String(params.clientId) : undefined,
    now: params.now ? String(params.now) : undefined,
  };
  const payload = handleApiRequest(req);
  return createJsonResponse(payload);
}

/**
 * GASエディタから初回実行して必要な権限（Drive / Sheets / 外部通信）を承認するためのヘルパー関数
 */
function authorizeBackendScopes(): void {
  const ownerEmail = Session.getEffectiveUser().getEmail();
  DriveApp.getRootFolder().getName();
  PropertiesService.getScriptProperties().getProperties();
  UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo", { muteHttpExceptions: true });
  console.log(`✅ バックエンド権限の承認が完了しました (実行ユーザー: ${ownerEmail})`);
}

/**
 * APIリクエストのルーティング・認証・権限チェック
 */
function handleApiRequest(req: ApiRequestBody): AppDataPayload {
  const action = req.action || "getData";
  const now = parseNowJst(req.now);

  try {
    // 1. ログアウト処理
    if (action === "logout") {
      if (req.sessionToken) {
        revokeSessionToken(req.sessionToken);
      }
      return buildEmptyPayload("logged_out", now, {
        message: "ログアウトしました。",
      });
    }

    // 2. ログイン処理（Google OAuth の access_token または id_token を検証してセッショントークンを発行）
    if (action === "login") {
      const verifiedEmail = verifyGoogleOAuthToken(
        req.accessToken,
        req.idToken,
        req.clientId
      );
      if (!verifiedEmail) {
        return buildEmptyPayload("unauthenticated", now, {
          message: "Googleログインの認証トークンが無効または期限切れです。もう一度ログインしてください。",
        });
      }

      const resolved = resolveSpreadsheetAndFolder();
      if (!hasDrivePermission(verifiedEmail, resolved.ss, resolved.folder)) {
        return buildEmptyPayload("unauthorized", now, {
          userEmail: verifiedEmail,
          message: `ログイン中のアカウント（${verifiedEmail}）には学校カレンダーのアクセス権限がありません。共有設定された保護者のGoogleアカウントでログインしてください。`,
        });
      }

      const newSessionToken = issueSessionToken(verifiedEmail);
      const dataPayload = getAppDataWithResolved(resolved, now);
      dataPayload.userEmail = verifiedEmail;
      dataPayload.sessionToken = newSessionToken;
      return dataPayload;
    }

    // 3. セッショントークンによる認証確認（getData / setup）
    if (!req.sessionToken) {
      return buildEmptyPayload("unauthenticated", now, {
        message: "ログインが必要です。",
      });
    }

    const sessionEmail = validateSessionToken(req.sessionToken);
    if (!sessionEmail) {
      return buildEmptyPayload("unauthenticated", now, {
        message: "ログインの有効期限が切れました。再度Googleアカウントでログインしてください。",
      });
    }

    let resolved = resolveSpreadsheetAndFolder();

    // アクセス権のチェック（共有解除された場合は既存セッションも即座に拒否・破棄）
    if (!hasDrivePermission(sessionEmail, resolved.ss, resolved.folder)) {
      revokeSessionToken(req.sessionToken);
      return buildEmptyPayload("unauthorized", now, {
        userEmail: sessionEmail,
        message: `ログイン中のアカウント（${sessionEmail}）には学校カレンダーのアクセス権限がありません。`,
      });
    }

    // 4. 初期セットアップ実行（スプレッドシート自動作成）
    if (action === "setup") {
      setupTemplateSpreadsheet();
      resolved = resolveSpreadsheetAndFolder();
    }

    // 5. カレンダーデータ取得
    const dataPayload = getAppDataWithResolved(resolved, now);
    dataPayload.userEmail = sessionEmail;
    dataPayload.sessionToken = req.sessionToken;
    return dataPayload;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return buildEmptyPayload("error", now, {
      message: `サーバー処理中にエラーが発生しました: ${message}`,
    });
  }
}

/**
 * JSONレスポンスを生成する
 */
function createJsonResponse(payload: AppDataPayload): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/**
 * 空のデータペイロードを生成する
 */
function buildEmptyPayload(
  status: AppDataPayload["status"],
  now: Date,
  extra?: { message?: string; userEmail?: string; sessionToken?: string }
): AppDataPayload {
  const todayStr = formatDateYmd(now);
  return {
    status: status,
    message: extra && extra.message ? extra.message : undefined,
    userEmail: extra && extra.userEmail ? extra.userEmail : undefined,
    sessionToken: extra && extra.sessionToken ? extra.sessionToken : undefined,
    initialRoute: {
      view: "daily",
      targetDate: todayStr,
      targetWeekMonday: getMondayOfDate(todayStr),
      targetEventId: "",
      reasonBanner: "",
      nowIso: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss"),
      todayDate: todayStr,
    },
    dailyMap: {},
    events: [],
  };
}

function buildErrorPayload(
  status: AppDataPayload["status"],
  message: string
): AppDataPayload {
  return buildEmptyPayload(status, new Date(), { message });
}

/**
 * Google OAuth の access_token（scope: email）または id_token を検証してメールアドレスを取得する
 */
function verifyGoogleOAuthToken(
  accessToken?: string,
  idToken?: string,
  clientHintId?: string
): string | null {
  const configuredClientId =
    (PropertiesService.getScriptProperties().getProperty(PROP_KEY_OAUTH_CLIENT_ID) ||
      ALLOWED_OAUTH_CLIENT_ID ||
      "").trim();

  // 1. access_token の検証（scope: email）
  if (accessToken && accessToken.trim()) {
    const token = accessToken.trim();
    const res = UrlFetchApp.fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() === 200) {
      const info = JSON.parse(res.getContentText()) as {
        email?: string;
        email_verified?: string | boolean;
        aud?: string;
        azp?: string;
        error?: string;
      };
      if (!info.error && info.email && String(info.email_verified) !== "false") {
        if (!isClientIdMatched(configuredClientId, clientHintId, info.aud, info.azp)) {
          return null;
        }
        return info.email.trim().toLowerCase();
      }
    }
  }

  // 2. id_token の検証（Sign In With Google 用フォールバック）
  if (idToken && idToken.trim()) {
    const token = idToken.trim();
    const res = UrlFetchApp.fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`,
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() === 200) {
      const info = JSON.parse(res.getContentText()) as {
        email?: string;
        email_verified?: string | boolean;
        aud?: string;
        azp?: string;
        error?: string;
      };
      if (!info.error && info.email && String(info.email_verified) !== "false") {
        if (!isClientIdMatched(configuredClientId, clientHintId, info.aud, info.azp)) {
          return null;
        }
        return info.email.trim().toLowerCase();
      }
    }
  }

  return null;
}

/**
 * OAuth クライアントIDの一致確認
 */
function isClientIdMatched(
  configuredClientId: string,
  clientHintId: string | undefined,
  aud?: string,
  azp?: string
): boolean {
  const effectiveExpected =
    configuredClientId && configuredClientId.indexOf("YOUR_") === -1
      ? configuredClientId
      : clientHintId && clientHintId.indexOf("YOUR_") === -1
      ? clientHintId.trim()
      : "";
  if (!effectiveExpected) return true;
  return aud === effectiveExpected || azp === effectiveExpected;
}

/**
 * 指定されたメールアドレスが「学校カレンダー管理」スプレッドシートまたは「学校カレンダー」フォルダの
 * アクセス権（オーナー・編集者・閲覧者）を持っているかチェックする
 */
function hasDrivePermission(
  email: string,
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet | null,
  folder: GoogleAppsScript.Drive.Folder | null
): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  // GASの実行ユーザー自身（オーナー）は常に許可
  try {
    const ownerEmail = Session.getEffectiveUser().getEmail().trim().toLowerCase();
    if (ownerEmail && ownerEmail === normalized) {
      return true;
    }
  } catch (_e) {
    // 取得不可の場合はファイル権限チェックへ進む
  }

  const checkTargetPermission = (
    target: GoogleAppsScript.Drive.File | GoogleAppsScript.Drive.Folder
  ): boolean => {
    try {
      const owner = target.getOwner();
      if (owner && owner.getEmail() && owner.getEmail().trim().toLowerCase() === normalized) {
        return true;
      }

      const editors = target.getEditors();
      for (const editor of editors) {
        if (editor.getEmail() && editor.getEmail().trim().toLowerCase() === normalized) {
          return true;
        }
      }

      const viewers = target.getViewers();
      for (const viewer of viewers) {
        if (viewer.getEmail() && viewer.getEmail().trim().toLowerCase() === normalized) {
          return true;
        }
      }

      // フォルダ継承やGoogleグループ共有にも対応するため getAccess(email) も確認
      // （ただし誤って「リンクを知っている全員」に公開されていた場合は第三者を弾くため PRIVATE / DOMAIN 時のみ許可）
      const sharingAccess = target.getSharingAccess();
      if (
        sharingAccess === DriveApp.Access.PRIVATE ||
        sharingAccess === DriveApp.Access.DOMAIN ||
        sharingAccess === DriveApp.Access.DOMAIN_WITH_LINK
      ) {
        const perm = target.getAccess(normalized);
        if (
          perm === DriveApp.Permission.OWNER ||
          perm === DriveApp.Permission.ORGANIZER ||
          perm === DriveApp.Permission.EDIT ||
          perm === DriveApp.Permission.COMMENT ||
          perm === DriveApp.Permission.VIEW
        ) {
          return true;
        }
      }
    } catch (e) {
      console.warn("Drive権限チェックエラー:", e);
    }
    return false;
  };

  if (ss) {
    try {
      const ssFile = DriveApp.getFileById(ss.getId());
      if (checkTargetPermission(ssFile)) {
        return true;
      }
    } catch (_e) {
      // ignore
    }
  }

  if (folder) {
    if (checkTargetPermission(folder)) {
      return true;
    }
  }

  return false;
}

/**
 * 独自セッショントークンを発行して PropertiesService に保存する
 */
function issueSessionToken(email: string): string {
  const props = PropertiesService.getScriptProperties();
  const sessions = loadSessionMap(props);
  const nowMs = Date.now();

  const token = `${Utilities.getUuid()}-${Utilities.getUuid()}`;
  sessions[token] = {
    email: email.trim().toLowerCase(),
    createdAt: nowMs,
    expiresAt: nowMs + SESSION_TTL_MS,
  };

  saveSessionMap(props, sessions, nowMs);
  return token;
}

/**
 * セッショントークンを検証し、有効であれば有効期限を延長してメールアドレスを返す
 */
function validateSessionToken(token: string): string | null {
  if (!token || !token.trim()) return null;
  const props = PropertiesService.getScriptProperties();
  const sessions = loadSessionMap(props);
  const nowMs = Date.now();
  const record = sessions[token.trim()];

  if (!record || record.expiresAt <= nowMs) {
    if (record) {
      delete sessions[token.trim()];
      saveSessionMap(props, sessions, nowMs);
    }
    return null;
  }

  // 有効期限を延長（スライディングセッション）
  record.expiresAt = nowMs + SESSION_TTL_MS;
  saveSessionMap(props, sessions, nowMs);
  return record.email;
}

/**
 * セッショントークンを破棄する
 */
function revokeSessionToken(token: string): void {
  if (!token || !token.trim()) return;
  const props = PropertiesService.getScriptProperties();
  const sessions = loadSessionMap(props);
  if (sessions[token.trim()]) {
    delete sessions[token.trim()];
    saveSessionMap(props, sessions, Date.now());
  }
}

function loadSessionMap(
  props: GoogleAppsScript.Properties.Properties
): SessionStoreMap {
  try {
    const raw = props.getProperty(PROP_KEY_SESSIONS);
    return raw ? (JSON.parse(raw) as SessionStoreMap) : {};
  } catch (_e) {
    return {};
  }
}

function saveSessionMap(
  props: GoogleAppsScript.Properties.Properties,
  sessions: SessionStoreMap,
  nowMs: number
): void {
  const validTokens = Object.keys(sessions).filter(
    (k) => sessions[k] && sessions[k].expiresAt > nowMs
  );
  // 古い順にソートして上限数を超えた分を削除
  validTokens.sort((a, b) => sessions[b].expiresAt - sessions[a].expiresAt);
  const trimmed: SessionStoreMap = {};
  for (let i = 0; i < Math.min(validTokens.length, MAX_SESSIONS); i++) {
    const k = validTokens[i];
    trimmed[k] = sessions[k];
  }
  props.setProperty(PROP_KEY_SESSIONS, JSON.stringify(trimmed));
}

/**
 * スプレッドシートおよびGoogle Driveから全データを取得して返す（認証・権限確認済みユーザー用）
 */
function getAppDataWithResolved(
  resolved: {
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet | null;
    folder: GoogleAppsScript.Drive.Folder | null;
  },
  now: Date
): AppDataPayload {
  if (!resolved.ss) {
    return {
      status: "needs_setup",
      message:
        "管理用スプレッドシートがまだ作成されていません。下のボタンからテンプレート（サンプルデータ入り）を自動作成できます。",
      initialRoute: computeInitialRoute(now, {}, []),
      dailyMap: {},
      events: [],
    };
  }

  const { ss, folder } = resolved;
  const fileMap = buildDriveFileUrlMap(folder, ss);

  // 1. 昼食シートの読み込み
  const lunchMap = readLunchSheet(ss, fileMap);

  // 2. イベントシートの読み込み
  const events = readEventSheet(ss, fileMap);

  // 3. 日次予定シートの読み込み & 昼食・イベントとの結合
  const dailyMap = readDailySheet(ss, fileMap, lunchMap, events);

  // 4. 閲覧タイミングに応じた初期表示ルーティングの計算
  const initialRoute = computeInitialRoute(now, dailyMap, events);

  return {
    status: "ok",
    spreadsheetUrl: ss.getUrl(),
    folderUrl: folder ? folder.getUrl() : undefined,
    initialRoute: initialRoute,
    dailyMap: dailyMap,
    events: events,
  };
}

/**
 * スプレッドシートとフォルダを特定する
 */
function resolveSpreadsheetAndFolder(): {
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet | null;
  folder: GoogleAppsScript.Drive.Folder | null;
} {
  const props = PropertiesService.getScriptProperties();
  let folder: GoogleAppsScript.Drive.Folder | null = null;
  let ss: GoogleAppsScript.Spreadsheet.Spreadsheet | null = null;

  const folderId = props.getProperty(PROP_KEY_FOLDER_ID);
  if (folderId) {
    folder = DriveApp.getFolderById(folderId);
  }

  const ssId = props.getProperty(PROP_KEY_SPREADSHEET_ID);
  if (ssId) {
    ss = SpreadsheetApp.openById(ssId);
  }

  // プロパティ未設定の場合、フォルダ名・ファイル名で検索
  if (!folder) {
    const folders = DriveApp.getFoldersByName(DEFAULT_FOLDER_NAME);
    if (folders.hasNext()) {
      folder = folders.next();
      props.setProperty(PROP_KEY_FOLDER_ID, folder.getId());
    }
  }

  if (!ss && folder) {
    const files = folder.getFilesByName(DEFAULT_SPREADSHEET_NAME);
    while (files.hasNext()) {
      const f = files.next();
      if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
        ss = SpreadsheetApp.openById(f.getId());
        props.setProperty(PROP_KEY_SPREADSHEET_ID, ss.getId());
        break;
      }
    }
  }

  if (!ss) {
    const files = DriveApp.getFilesByName(DEFAULT_SPREADSHEET_NAME);
    while (files.hasNext()) {
      const f = files.next();
      if (f.getMimeType() === MimeType.GOOGLE_SHEETS) {
        ss = SpreadsheetApp.openById(f.getId());
        props.setProperty(PROP_KEY_SPREADSHEET_ID, ss.getId());
        break;
      }
    }
  }

  return { ss, folder };
}

/**
 * Google Driveフォルダ内のファイル名 -> 閲覧URL のマップを作成する
 */
function buildDriveFileUrlMap(
  folder: GoogleAppsScript.Drive.Folder | null,
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet
): { [name: string]: string } {
  const map: { [name: string]: string } = {};

  const collectFromFolder = (targetFolder: GoogleAppsScript.Drive.Folder): void => {
    const files = targetFolder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const name = f.getName().trim();
      const url = f.getUrl();
      map[name] = url;
      map[name.toLowerCase()] = url;
    }

    // 1階層下のサブフォルダ（資料フォルダなど）も走査
    const subFolders = targetFolder.getFolders();
    while (subFolders.hasNext()) {
      const sf = subFolders.next();
      const subFiles = sf.getFiles();
      while (subFiles.hasNext()) {
        const f = subFiles.next();
        const name = f.getName().trim();
        const url = f.getUrl();
        map[name] = url;
        map[name.toLowerCase()] = url;
      }
    }
  };

  if (folder) {
    collectFromFolder(folder);
  } else {
    try {
      const ssFile = DriveApp.getFileById(ss.getId());
      const parents = ssFile.getParents();
      if (parents.hasNext()) {
        collectFromFolder(parents.next());
      }
    } catch (e) {
      // 親フォルダ取得不可の場合はスキップ
    }
  }

  return map;
}

/**
 * 参照資料文字列（ファイル名またはURL、カンマ/読点/改行区切り）をReferenceLink配列に変換
 */
function parseReferenceLinks(
  rawCell: string,
  fileMap: { [name: string]: string }
): ReferenceLink[] {
  if (!rawCell || !rawCell.trim()) {
    return [];
  }

  const parts = rawCell
    .split(/[,、\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const results: ReferenceLink[] = [];
  for (const part of parts) {
    // "ラベル|https://..." の形式に対応
    if (part.indexOf("|") !== -1) {
      const [label, url] = part.split("|").map((s) => s.trim());
      results.push({ name: label || "参照資料", url: url || "" });
      continue;
    }

    // 直接URLが貼られている場合
    if (/^https?:\/\//i.test(part)) {
      results.push({ name: "参照資料を開く", url: part });
      continue;
    }

    // フォルダ内のファイル名からURLを解決
    const matchedUrl = fileMap[part] || fileMap[part.toLowerCase()] || "";
    results.push({
      name: part,
      url: matchedUrl,
    });
  }

  return results;
}

/**
 * 重複を除いて参照資料リストをマージする
 */
function mergeReferenceLinks(
  listA: ReferenceLink[],
  listB: ReferenceLink[]
): ReferenceLink[] {
  const seen = new Set<string>();
  const merged: ReferenceLink[] = [];

  for (const item of [...listA, ...listB]) {
    const key = `${item.name}__${item.url}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

/**
 * シート2: 「昼食」を読み込む（同一日付は下の行＝最新データを優先）
 */
function readLunchSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  fileMap: { [name: string]: string }
): { [date: string]: LunchData } {
  const sheet = ss.getSheetByName(SHEET_NAME_LUNCH);
  const lunchMap: { [date: string]: LunchData } = {};
  if (!sheet || sheet.getLastRow() <= 1) {
    return lunchMap;
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  for (const row of rows) {
    const dateStr = normalizeCellDate(row[0]);
    if (!dateStr) continue;

    const dayOfWeek = String(row[1] || "").trim() || getDayOfWeekJa(dateStr);
    const category = String(row[2] || "").trim() || "お弁当持参";
    const menu = String(row[3] || "").trim();
    const note = String(row[4] || "").trim();
    const refs = parseReferenceLinks(String(row[5] || ""), fileMap);

    lunchMap[dateStr] = {
      date: dateStr,
      dayOfWeek: dayOfWeek,
      category: category,
      menu: menu,
      note: note,
      references: refs,
    };
  }

  return lunchMap;
}

/**
 * シート3: 「イベント」を読み込む（同一日付+同一イベント名は下の行を優先、日付昇順ソート）
 */
function readEventSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  fileMap: { [name: string]: string }
): SchoolEventItem[] {
  const sheet = ss.getSheetByName(SHEET_NAME_EVENT);
  if (!sheet || sheet.getLastRow() <= 1) {
    return [];
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  const dedupMap: { [key: string]: SchoolEventItem } = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = normalizeCellDate(row[0]);
    const title = String(row[1] || "").trim();
    if (!dateStr || !title) continue;

    const key = `${dateStr}__${title}`;
    dedupMap[key] = {
      id: `evt_${dateStr}_${i + 2}`,
      date: dateStr,
      dayOfWeek: getDayOfWeekJa(dateStr),
      title: title,
      location: String(row[2] || "").trim(),
      summary: String(row[3] || "").trim(),
      studentSchedule: String(row[4] || "").trim(),
      studentBelongings: String(row[5] || "").trim(),
      parentParticipation: String(row[6] || "").trim() || "なし",
      parentSchedule: String(row[7] || "").trim(),
      parentNotes: String(row[8] || "").trim(),
      references: parseReferenceLinks(String(row[9] || ""), fileMap),
    };
  }

  const events = Object.keys(dedupMap).map((k) => dedupMap[k]);
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events;
}

/**
 * シート1: 「日次予定」を読み込み、昼食データ・イベントデータと結合する
 * （同一日付が複数行ある場合は、下の行＝最新データを優先する）
 */
function readDailySheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  fileMap: { [name: string]: string },
  lunchMap: { [date: string]: LunchData },
  events: SchoolEventItem[]
): { [date: string]: DailySchedule } {
  const sheet = ss.getSheetByName(SHEET_NAME_DAILY);
  const dailyMap: { [date: string]: DailySchedule } = {};

  // 日付ごとのイベント逆引きマップ
  const eventsByDate: { [date: string]: SchoolEventItem[] } = {};
  for (const evt of events) {
    if (!eventsByDate[evt.date]) {
      eventsByDate[evt.date] = [];
    }
    eventsByDate[evt.date].push(evt);
  }

  if (sheet && sheet.getLastRow() > 1) {
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
    for (const row of rows) {
      const dateStr = normalizeCellDate(row[0]);
      if (!dateStr) continue;

      const dayOfWeek = String(row[1] || "").trim() || getDayOfWeekJa(dateStr);
      const type = String(row[2] || "").trim() || "通常";
      const p0 = String(row[3] || "").trim();
      const p1 = String(row[4] || "").trim();
      const p2 = String(row[5] || "").trim();
      const p3 = String(row[6] || "").trim();
      const p4 = String(row[7] || "").trim();
      const p5 = String(row[8] || "").trim();
      const p6 = String(row[9] || "").trim();
      const dismissal = String(row[10] || "").trim();
      const belongingsRaw = String(row[11] || "").trim();
      const notes = String(row[12] || "").trim();
      const dailyRefs = parseReferenceLinks(String(row[13] || ""), fileMap);

      const belongings = belongingsRaw
        ? belongingsRaw
            .split(/[、,\n]+/)
            .map((s) => s.trim())
            .filter((s) => s.length > 0)
        : [];

      const lunchInfo: LunchData = lunchMap[dateStr] || {
        date: dateStr,
        dayOfWeek: dayOfWeek,
        category: type === "休校" ? "不要" : "未登録",
        menu: type === "休校" ? "休校日のため不要" : "",
        note: "",
        references: [],
      };

      const combinedRefs = mergeReferenceLinks(dailyRefs, lunchInfo.references);

      dailyMap[dateStr] = {
        date: dateStr,
        dayOfWeek: dayOfWeek,
        type: type,
        periods: { p0, p1, p2, p3, p4, p5, p6 },
        dismissal: dismissal,
        belongings: belongings,
        belongingsRaw: belongingsRaw,
        notes: notes,
        lunch: lunchInfo,
        references: combinedRefs,
        linkedEvents: eventsByDate[dateStr] || [],
        hasScheduleData: true,
      };
    }
  }

  // 昼食シートまたはイベントシートのみに存在する日付も補完する
  const extraDates = new Set<string>([
    ...Object.keys(lunchMap),
    ...Object.keys(eventsByDate),
  ]);
  extraDates.forEach((dateStr) => {
    if (!dailyMap[dateStr]) {
      const dayOfWeek = getDayOfWeekJa(dateStr);
      const lunchInfo: LunchData = lunchMap[dateStr] || {
        date: dateStr,
        dayOfWeek: dayOfWeek,
        category: "未登録",
        menu: "",
        note: "",
        references: [],
      };
      const linkedEvts = eventsByDate[dateStr] || [];
      dailyMap[dateStr] = {
        date: dateStr,
        dayOfWeek: dayOfWeek,
        type: linkedEvts.length > 0 ? "イベント" : "通常",
        periods: { p0: "", p1: "", p2: "", p3: "", p4: "", p5: "", p6: "" },
        dismissal: "",
        belongings: [],
        belongingsRaw: "",
        notes: "",
        lunch: lunchInfo,
        references: lunchInfo.references,
        linkedEvents: linkedEvts,
        hasScheduleData: false,
      };
    }
  });

  return dailyMap;
}

/**
 * 閲覧するタイミングによって初期表示される画面・期間を判定する
 *
 * - イベント日：該当するイベント
 * - 土日、週の最終日の午後(12:00以降)：1週間の予定（翌週分）
 * - 平日の午前(0:00〜11:59)：1日の予定表示（本日）
 * - 平日の午後(12:00〜23:59, 週の最終日を除く)：1日の予定表示（翌日）
 */
function computeInitialRoute(
  now: Date,
  dailyMap: { [date: string]: DailySchedule },
  events: SchoolEventItem[]
): InitialRoute {
  const todayStr = formatDateYmd(now);
  const hour = Number(Utilities.formatDate(now, "Asia/Tokyo", "H"));
  const dayOfWeekNum = getDayOfWeekNumber(todayStr); // 0=Sun, 1=Mon, ..., 6=Sat
  const defaultEventId = selectDefaultEventId(todayStr, events);

  // 1. 本日がイベント日の場合 -> イベント画面を優先表示
  const todayEvents = events.filter((e) => e.date === todayStr);
  if (todayEvents.length > 0) {
    return {
      view: "event",
      targetDate: todayStr,
      targetWeekMonday: getMondayOfDate(todayStr),
      targetEventId: todayEvents[0].id,
      reasonBanner: "",
      nowIso: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss"),
      todayDate: todayStr,
    };
  }

  // 2. 土日の場合 -> 翌週の「1週間の予定」を表示
  if (dayOfWeekNum === 0 || dayOfWeekNum === 6) {
    const nextMonday = getNextWeekMonday(todayStr);
    return {
      view: "weekly",
      targetDate: nextMonday,
      targetWeekMonday: nextMonday,
      targetEventId: defaultEventId,
      reasonBanner: "",
      nowIso: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss"),
      todayDate: todayStr,
    };
  }

  // 今週の最終登校日（通常は金曜、金曜が休校の場合は木曜など）を算出
  const currentMonday = getMondayOfDate(todayStr);
  const lastSchoolDay = getLastSchoolDayOfWeek(currentMonday, dailyMap);

  // 3. 週の最終登校日の午後（12:00以降） -> 翌週の「1週間の予定」を表示
  if (todayStr >= lastSchoolDay && hour >= 12) {
    const nextMonday = addDaysYmd(currentMonday, 7);
    return {
      view: "weekly",
      targetDate: nextMonday,
      targetWeekMonday: nextMonday,
      targetEventId: defaultEventId,
      reasonBanner: "",
      nowIso: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss"),
      todayDate: todayStr,
    };
  }

  // 4. 平日の午前（0:00〜11:59） -> 本日の「1日の予定」を表示
  if (hour < 12) {
    return {
      view: "daily",
      targetDate: todayStr,
      targetWeekMonday: currentMonday,
      targetEventId: defaultEventId,
      reasonBanner: "",
      nowIso: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss"),
      todayDate: todayStr,
    };
  }

  // 5. 平日の午後（週の最終登校日を除く） -> 翌日の「1日の予定」を表示
  const tomorrowStr = addDaysYmd(todayStr, 1);
  return {
    view: "daily",
    targetDate: tomorrowStr,
    targetWeekMonday: getMondayOfDate(tomorrowStr),
    targetEventId: defaultEventId,
    reasonBanner: "",
    nowIso: Utilities.formatDate(now, "Asia/Tokyo", "yyyy-MM-dd'T'HH:mm:ss"),
    todayDate: todayStr,
  };
}

/**
 * イベント画面遷移時のデフォルトイベントIDを選択する
 * （直近の未開催イベント。なければ過去の最新イベント）
 */
function selectDefaultEventId(todayStr: string, events: SchoolEventItem[]): string {
  if (events.length === 0) return "";
  for (const evt of events) {
    if (evt.date >= todayStr) {
      return evt.id;
    }
  }
  return events[events.length - 1].id;
}

/**
 * 指定した週（月曜起点）の最終登校日（月〜金のうち「休校」でない最後の日）を返す
 */
function getLastSchoolDayOfWeek(
  mondayStr: string,
  dailyMap: { [date: string]: DailySchedule }
): string {
  const weekDays: string[] = [];
  for (let i = 0; i < 5; i++) {
    weekDays.push(addDaysYmd(mondayStr, i));
  }
  for (let i = weekDays.length - 1; i >= 0; i--) {
    const d = weekDays[i];
    const info = dailyMap[d];
    if (!info || info.type !== "休校") {
      return d;
    }
  }
  return weekDays[4]; // デフォルトは金曜日
}

/**
 * 現在時刻（またはテスト用オーバーライド時刻）を取得
 */
function parseNowJst(overrideNowIso?: string): Date {
  if (overrideNowIso) {
    const parsed = new Date(overrideNowIso);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

/**
 * セルの値（Dateオブジェクトまたは文字列）を YYYY-MM-DD 形式に正規化する
 */
function normalizeCellDate(cellValue: unknown): string {
  if (!cellValue) return "";
  if (cellValue instanceof Date) {
    if (isNaN(cellValue.getTime())) return "";
    return formatDateYmd(cellValue);
  }
  const raw = String(cellValue).trim();
  if (!raw) return "";

  // YYYY-MM-DD or YYYY/M/D or YYYY.M.D
  const match = raw.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = ("0" + match[2]).slice(-2);
    const d = ("0" + match[3]).slice(-2);
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return formatDateYmd(parsed);
  }
  return "";
}

/**
 * Dateを Asia/Tokyo の YYYY-MM-DD に変換
 */
function formatDateYmd(date: Date): string {
  return Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd");
}

/**
 * YYYY-MM-DD から曜日番号 (0=日, 1=月, ..., 6=土) を返す
 */
function getDayOfWeekNumber(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return dt.getUTCDay();
}

/**
 * YYYY-MM-DD から日本語曜日 ("月"〜"日") を返す
 */
function getDayOfWeekJa(ymd: string): string {
  return DAY_NAMES_JA[getDayOfWeekNumber(ymd)] || "";
}

/**
 * YYYY-MM-DD に指定日数を加算した YYYY-MM-DD を返す
 */
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const ny = dt.getUTCFullYear();
  const nm = ("0" + (dt.getUTCMonth() + 1)).slice(-2);
  const nd = ("0" + dt.getUTCDate()).slice(-2);
  return `${ny}-${nm}-${nd}`;
}

/**
 * 指定日が含まれる週の月曜日 (YYYY-MM-DD) を返す
 * （日曜日の場合は翌日の月曜日ではなく、その週の月曜日＝6日前を返す）
 */
function getMondayOfDate(ymd: string): string {
  const dow = getDayOfWeekNumber(ymd); // 0(Sun) .. 6(Sat)
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  return addDaysYmd(ymd, diffToMonday);
}

/**
 * 翌週の月曜日 (YYYY-MM-DD) を返す
 * （土曜・日曜に開いた場合、これから来る直近の月曜日を返す）
 */
function getNextWeekMonday(ymd: string): string {
  const dow = getDayOfWeekNumber(ymd);
  if (dow === 6) {
    // 土曜日 -> 2日後が月曜日
    return addDaysYmd(ymd, 2);
  }
  if (dow === 0) {
    // 日曜日 -> 1日後が月曜日
    return addDaysYmd(ymd, 1);
  }
  // 平日 -> 今週の月曜 + 7日
  return addDaysYmd(getMondayOfDate(ymd), 7);
}
