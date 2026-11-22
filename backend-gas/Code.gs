/**
 * Wadah Digital - Contact Sync & Management
 * Backend Google Apps Script (Code.gs)
 *
 * Arsitektur 4 Sheet:
 * 1. "Kontak"      -> [Nama, No HP, Kategori, Jenis Kelamin, Waktu, Status] (Database utama hasil input aplikasi)
 * 2. "Kontak_Sync" -> [Nama, No HP, Kategori, Jenis Kelamin] (Dikelola manual/rumus di Sheet; hanya DIBACA untuk sinkronisasi ke Google Kontak)
 * 3. "Kategori"    -> [Nama Kategori, Kode] (Daftar kategori dinamis sesuai urutan baris)
 * 4. "History"     -> [Waktu, Action, Nama, No HP, Detail] (Log audit perubahan)
 *
 * Mesin Google Kontak:
 * - Utama: People API v1 (Services + -> People API -> Add)
 * - Fallback: ContactsApp (beserta System Group: My Contacts)
 */

const CONFIG = {
  CONTACTS_SHEET: 'Kontak',
  SYNC_SHEET: 'Kontak_Sync',
  CATEGORIES_SHEET: 'Kategori',
  HISTORY_SHEET: 'History',
  CONTACT_HEADERS: ['Nama', 'No HP', 'Kategori', 'Jenis Kelamin', 'Waktu', 'Status'],
  SYNC_HEADERS: ['Nama', 'No HP', 'Kategori', 'Jenis Kelamin'],
  CATEGORY_HEADERS: ['Nama Kategori', 'Kode'],
  HISTORY_HEADERS: ['Waktu', 'Action', 'Nama', 'No HP', 'Detail'],
  CONTACT_COL_WIDTHS: [220, 175, 160, 125, 175, 95],
  SYNC_COL_WIDTHS: [220, 175, 160, 140],
  DEFAULT_CATEGORIES: [
    { nama: 'Keluarga', kode: 'Fam' },
    { nama: 'Klien', kode: 'Kln' },
    { nama: 'Partner', kode: 'Prt' },
    { nama: 'VIP', kode: 'VIP' },
    { nama: 'Internal', kode: 'Int' }
  ],
  ALLOWED_GENDERS: ['Laki-laki', 'Perempuan', 'Admin'],
  LEGACY_MAIN_GROUP: 'Wadah Digital',
  LEGACY_GROUP_PREFIX: 'Wadah Digital - ',
  SYNC_MARKER: 'Disinkronkan oleh MR Wadah Digital',
  TRIGGER_HANDLER: 'onSpreadsheetChangeTrigger',
  SCHEDULED_TRIGGER_HANDLER: 'scheduledAutoSyncTrigger',
  PROP_LAST_SYNC: 'LAST_GOOGLE_SYNC_AT',
  PROP_LAST_AUTO_SYNC_MS: 'LAST_AUTO_SYNC_MS',
  PROP_LAST_SYNC_STATS: 'LAST_GOOGLE_SYNC_STATS',
  PROP_QUOTA_STATE: 'PEOPLE_API_QUOTA_STATE_V1',
  PROP_AUTO_SYNC_CONFIG: 'AUTO_SYNC_SCHEDULE_CONFIG_V1',
  PROP_LAST_SYNCED_SHEET_HASH: 'LAST_SYNCED_SHEET_HASH_V1',
  PROP_SYNC_ABORT_AT: 'AUTO_SYNC_ABORT_AT_V1',
  CACHE_PHONES_PREFIX: 'SYNC_PHONES_V1_',
  CACHE_PHONES_TTL_SEC: 1800,
  CACHE_SYNC_LEASE_KEY: 'GOOGLE_SYNC_ACTIVE_LEASE_V1',
  CACHE_SYNC_LEASE_TTL_SEC: 300,
  CACHE_LIVE_PROGRESS_KEY: 'GOOGLE_SYNC_LIVE_PROGRESS_V1',
  CACHE_RECENT_SYNCED_KEY: 'GOOGLE_SYNC_RECENT_PHONES_V1',
  AUTO_SYNC_COOLDOWN_MS: 25000,
  MAX_EXECUTION_MS: 240000,
  DEFAULT_AUTO_SYNC_INTERVAL: 5,
  DEFAULT_AUTO_SYNC_BATCH: 80,
  MANUAL_SYNC_SAFE_BATCH: 80,
  BATCH_CREATE_CHUNK_SIZE: 20,
  ALLOWED_AUTO_SYNC_INTERVALS: [5, 10, 15, 30, 60],
  ALLOWED_AUTO_SYNC_BATCHES: [50, 70, 80],
  QUOTA_MINUTE_READS_LIMIT: 90,
  QUOTA_MINUTE_WRITES_LIMIT: 90,
  QUOTA_DAILY_LIMIT: 20000,
  GOOGLE_CONTACTS_MAX: 25000
};

/**
 * WAJIB DIJALANKAN PERTAMA KALI (atau saat upgrade kolom):
 * Membuat/memverifikasi sheet Kontak (6 kolom), Kontak_Sync (4 kolom), Kategori, dan History
 * pada Spreadsheet aktif, serta memasang trigger sinkronisasi otomatis.
 */
function setupdatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const contactSheet = ensureSheetWithHeaders_(
    ss,
    CONFIG.CONTACTS_SHEET,
    CONFIG.CONTACT_HEADERS,
    '#0A2463',
    CONFIG.CONTACT_COL_WIDTHS,
    2
  );
  contactSheet.getRange('E:E').setNumberFormat('@');

  const syncSheet = ensureSheetWithHeaders_(
    ss,
    CONFIG.SYNC_SHEET,
    CONFIG.SYNC_HEADERS,
    '#0284C7',
    CONFIG.SYNC_COL_WIDTHS,
    2
  );

  const categorySheet = ensureSheetWithHeaders_(
    ss,
    CONFIG.CATEGORIES_SHEET,
    CONFIG.CATEGORY_HEADERS,
    '#1D4ED8',
    [220, 120],
    0
  );

  if (categorySheet.getLastRow() <= 1) {
    const rows = CONFIG.DEFAULT_CATEGORIES.map(function (c) {
      return [c.nama, c.kode];
    });
    categorySheet.getRange(2, 1, rows.length, 2).setValues(rows);
  }

  const historySheet = ensureSheetWithHeaders_(
    ss,
    CONFIG.HISTORY_SHEET,
    CONFIG.HISTORY_HEADERS,
    '#061A40',
    [175, 160, 200, 165, 320],
    4
  );

  const triggerInstalled = ensureChangeTrigger_(ss);
  const googleStatus = inspectGoogleContactsStatus_([]);

  return {
    status: 'success',
    message: 'Setup database selesai. Sheet Kontak, Kontak_Sync, Kategori, dan History siap digunakan.',
    sheets: [
      contactSheet.getName(),
      syncSheet.getName(),
      categorySheet.getName(),
      historySheet.getName()
    ],
    triggerInstalled: triggerInstalled,
    googleEngine: googleStatus.engine,
    googleConnected: googleStatus.connected,
    googleError: googleStatus.error || ''
  };
}

function setupDatabase() {
  return setupdatabase();
}

function ensureSheetWithHeaders_(ss, name, headers, headerBg, colWidths, phoneColIndex) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    const sheets = ss.getSheets();
    if (name === CONFIG.CONTACTS_SHEET && sheets.length === 1 && sheets[0].getLastRow() === 0) {
      sheet = sheets[0];
      sheet.setName(name);
    } else {
      sheet = ss.insertSheet(name);
    }
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange
      .setFontWeight('bold')
      .setBackground(headerBg)
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('left');
    sheet.setFrozenRows(1);
    for (let i = 0; i < colWidths.length; i++) {
      sheet.setColumnWidth(i + 1, colWidths[i]);
    }
  } else {
    const existingCols = sheet.getLastColumn();
    if (existingCols < headers.length) {
      for (let c = existingCols + 1; c <= headers.length; c++) {
        sheet.getRange(1, c)
          .setValue(headers[c - 1])
          .setFontWeight('bold')
          .setBackground(headerBg)
          .setFontColor('#FFFFFF')
          .setHorizontalAlignment('center');
        if (colWidths && colWidths[c - 1]) {
          sheet.setColumnWidth(c, colWidths[c - 1]);
        }
      }
    }
  }

  if (phoneColIndex > 0) {
    const colLetter = String.fromCharCode(64 + phoneColIndex);
    sheet.getRange(colLetter + ':' + colLetter).setNumberFormat('@');
  }

  return sheet;
}

function ensureChangeTrigger_(ss) {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === CONFIG.TRIGGER_HANDLER) {
        return true;
      }
    }
    ScriptApp.newTrigger(CONFIG.TRIGGER_HANDLER)
      .forSpreadsheet(ss)
      .onChange()
      .create();
    return true;
  } catch (_) {
    return false;
  }
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Wadah Digital')
      .addItem('Setup Database (4 Sheet)', 'setupdatabase')
      .addItem('Sinkronkan Kontak_Sync ke Google Kontak (Manual)', 'runManualSyncMenu')
      .addSeparator()
      .addItem('Aktifkan Auto-Sync Terjadwal (Tiap 5 Menit)', 'aktifkanAutoSync5Menit')
      .addItem('Matikan Auto-Sync Terjadwal', 'nonaktifkanAutoSync')
      .addToUi();
  } catch (_) {}
}

function runManualSyncMenu() {
  const result = syncManualSheetToGoogleContacts_('Sinkron Manual Menu');
  try {
    SpreadsheetApp.getUi().alert(result.message);
  } catch (_) {}
}

/**
 * Fungsi praktis untuk mengaktifkan Auto-Sync 5 menit dari Editor Apps Script / Menu Sheet.
 */
function aktifkanAutoSync5Menit() {
  const res = configureAutoSyncSchedule_({
    enabled: true,
    intervalMinutes: 5,
    batchLimit: CONFIG.DEFAULT_AUTO_SYNC_BATCH
  });
  try {
    SpreadsheetApp.getUi().alert(res.message);
  } catch (_) {}
  return res;
}

/**
 * Fungsi praktis untuk mematikan Auto-Sync terjadwal dari Editor Apps Script / Menu Sheet.
 */
function nonaktifkanAutoSync() {
  const res = configureAutoSyncSchedule_({ enabled: false });
  try {
    SpreadsheetApp.getUi().alert(res.message);
  } catch (_) {}
  return res;
}

function computeSyncSheetHash_(syncRows) {
  try {
    if (!Array.isArray(syncRows) || syncRows.length === 0) return 'EMPTY';
    const parts = [];
    for (let i = 0; i < syncRows.length; i++) {
      const r = syncRows[i];
      parts.push(
        String(r.nama || '').trim() + '|' +
        formatPhoneNumber_(r.noHp) + '|' +
        String(r.kategori || '').trim() + '|' +
        String(r.jenisKelamin || '').trim()
      );
    }
    const raw = parts.join('\n');
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw, Utilities.Charset.UTF_8);
    let hex = '';
    for (let i = 0; i < digest.length; i++) {
      const b = digest[i] < 0 ? digest[i] + 256 : digest[i];
      hex += (b < 16 ? '0' : '') + b.toString(16);
    }
    return hex;
  } catch (_) {
    return '';
  }
}

function clearSyncedSheetHash_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROP_LAST_SYNCED_SHEET_HASH);
  } catch (_) {}
}

function formatNumId_(n) {
  const num = Math.round(Number(n) || 0);
  return String(num).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function readAutoSyncConfig_() {
  const defaults = {
    enabled: false,
    intervalMinutes: CONFIG.DEFAULT_AUTO_SYNC_INTERVAL,
    batchLimit: CONFIG.DEFAULT_AUTO_SYNC_BATCH,
    lastRunAt: '',
    lastRunAtMs: 0,
    nextRunAtMs: 0,
    lastStageAdded: 0,
    lastRunStatus: 'never',
    lastRunDetail: '',
    remainingEstimate: 0
  };
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_AUTO_SYNC_CONFIG);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      intervalMinutes: CONFIG.ALLOWED_AUTO_SYNC_INTERVALS.indexOf(Number(parsed.intervalMinutes)) !== -1
        ? Number(parsed.intervalMinutes)
        : defaults.intervalMinutes,
      batchLimit: CONFIG.ALLOWED_AUTO_SYNC_BATCHES.indexOf(Number(parsed.batchLimit)) !== -1
        ? Number(parsed.batchLimit)
        : defaults.batchLimit,
      lastRunAt: String(parsed.lastRunAt || ''),
      lastRunAtMs: Number(parsed.lastRunAtMs || 0),
      nextRunAtMs: Number(parsed.nextRunAtMs || 0),
      lastStageAdded: Number(parsed.lastStageAdded || 0),
      lastRunStatus: String(parsed.lastRunStatus || 'never'),
      lastRunDetail: String(parsed.lastRunDetail || ''),
      remainingEstimate: Number(parsed.remainingEstimate || 0)
    };
  } catch (_) {
    return defaults;
  }
}

function saveAutoSyncConfig_(patch) {
  const current = readAutoSyncConfig_();
  const merged = {
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : current.enabled,
    intervalMinutes: patch.intervalMinutes !== undefined ? Number(patch.intervalMinutes) : current.intervalMinutes,
    batchLimit: patch.batchLimit !== undefined ? Number(patch.batchLimit) : current.batchLimit,
    lastRunAt: patch.lastRunAt !== undefined ? String(patch.lastRunAt) : current.lastRunAt,
    lastRunAtMs: patch.lastRunAtMs !== undefined ? Number(patch.lastRunAtMs) : current.lastRunAtMs,
    nextRunAtMs: patch.nextRunAtMs !== undefined ? Number(patch.nextRunAtMs) : current.nextRunAtMs,
    lastStageAdded: patch.lastStageAdded !== undefined ? Number(patch.lastStageAdded) : current.lastStageAdded,
    lastRunStatus: patch.lastRunStatus !== undefined ? String(patch.lastRunStatus) : current.lastRunStatus,
    lastRunDetail: patch.lastRunDetail !== undefined ? String(patch.lastRunDetail) : current.lastRunDetail,
    remainingEstimate: patch.remainingEstimate !== undefined ? Number(patch.remainingEstimate) : current.remainingEstimate
  };
  try {
    PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_AUTO_SYNC_CONFIG, JSON.stringify(merged));
  } catch (_) {}
  return merged;
}

function hasActiveScheduledTrigger_() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === CONFIG.SCHEDULED_TRIGGER_HANDLER) {
        return true;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

function getAutoSyncState_() {
  const cfg = readAutoSyncConfig_();
  const triggerActive = hasActiveScheduledTrigger_();
  const isEnabled = cfg.enabled && triggerActive;
  let nextRunAtMs = cfg.nextRunAtMs || 0;
  if (isEnabled) {
    const intervalMs = Math.max(1, cfg.intervalMinutes) * 60000;
    const nowMs = Date.now();
    if (!nextRunAtMs) {
      nextRunAtMs = (cfg.lastRunAtMs || nowMs) + intervalMs;
    }
    // Jika jadwal lewat karena trigger Apps Script sedikit telat, geser ke slot terdekat agar countdown tetap masuk akal
    if (nextRunAtMs < nowMs - 60000) {
      const elapsed = nowMs - nextRunAtMs;
      const jumps = Math.ceil(elapsed / intervalMs);
      nextRunAtMs = nextRunAtMs + jumps * intervalMs;
    }
  } else {
    nextRunAtMs = 0;
  }
  return {
    enabled: isEnabled,
    intervalMinutes: cfg.intervalMinutes,
    batchLimit: cfg.batchLimit,
    triggerActive: triggerActive,
    lastRunAt: cfg.lastRunAt,
    lastRunAtMs: cfg.lastRunAtMs,
    nextRunAtMs: nextRunAtMs,
    lastStageAdded: cfg.lastStageAdded,
    lastRunStatus: cfg.lastRunStatus,
    lastRunDetail: cfg.lastRunDetail,
    remainingEstimate: cfg.remainingEstimate
  };
}

function acquireSyncLease_(ownerLabel) {
  try {
    const cache = CacheService.getScriptCache();
    const existing = cache.get(CONFIG.CACHE_SYNC_LEASE_KEY);
    if (existing) return null;
    const token = ownerLabel + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    cache.put(CONFIG.CACHE_SYNC_LEASE_KEY, token, CONFIG.CACHE_SYNC_LEASE_TTL_SEC);
    return token;
  } catch (_) {
    return 'fallback_' + Date.now();
  }
}

function releaseSyncLease_(token) {
  if (!token) return;
  try {
    const cache = CacheService.getScriptCache();
    const current = cache.get(CONFIG.CACHE_SYNC_LEASE_KEY);
    if (!current || current === token) {
      cache.remove(CONFIG.CACHE_SYNC_LEASE_KEY);
    }
  } catch (_) {}
}

function markSyncAbortSignal_() {
  try {
    PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_SYNC_ABORT_AT, String(Date.now()));
  } catch (_) {}
}

function clearSyncAbortSignal_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty(CONFIG.PROP_SYNC_ABORT_AT);
  } catch (_) {}
}

function isSyncAborted_(runStartMs) {
  try {
    const abortAt = Number(PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_SYNC_ABORT_AT) || '0');
    return abortAt > 0 && abortAt >= runStartMs;
  } catch (_) {
    return false;
  }
}

function writeLiveSyncProgress_(progressObj) {
  try {
    const cache = CacheService.getScriptCache();
    const payload = {
      active: Boolean(progressObj.active),
      mode: String(progressObj.mode || 'manual'),
      phase: String(progressObj.phase || 'idle'),
      phaseLabel: String(progressObj.phaseLabel || ''),
      stageTarget: Number(progressObj.stageTarget || 0),
      stageDone: Number(progressObj.stageDone || 0),
      stageCreated: Number(progressObj.stageCreated || 0),
      stageUpdated: Number(progressObj.stageUpdated || 0),
      totalInSyncSheet: Number(progressObj.totalInSyncSheet || 0),
      syncedCount: Number(progressObj.syncedCount || 0),
      unsyncedCount: Number(progressObj.unsyncedCount || 0),
      googleContactsCount: Number(progressObj.googleContactsCount || 0),
      startedAtMs: Number(progressObj.startedAtMs || Date.now()),
      updatedAtMs: Date.now()
    };
    cache.put(CONFIG.CACHE_LIVE_PROGRESS_KEY, JSON.stringify(payload), 180);
  } catch (_) {}
}

function clearLiveSyncProgress_() {
  try {
    CacheService.getScriptCache().remove(CONFIG.CACHE_LIVE_PROGRESS_KEY);
  } catch (_) {}
}

function readLiveSyncProgress_() {
  try {
    const raw = CacheService.getScriptCache().get(CONFIG.CACHE_LIVE_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.active) return null;
    // Anggap kedaluwarsa jika tidak ada pembaruan > 150 detik
    if (parsed.updatedAtMs && Date.now() - Number(parsed.updatedAtMs) > 150000) {
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function saveRecentSyncedPhones_(phonesList) {
  try {
    const list = Array.isArray(phonesList) ? phonesList.slice(0, 120) : [];
    CacheService.getScriptCache().put(CONFIG.CACHE_RECENT_SYNCED_KEY, JSON.stringify(list), 600);
  } catch (_) {}
}

function loadRecentSyncedPhones_() {
  try {
    const raw = CacheService.getScriptCache().get(CONFIG.CACHE_RECENT_SYNCED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveSyncStatsQuick_(totalInSheet, syncedCount) {
  try {
    const safeTotal = Math.max(0, Number(totalInSheet || 0));
    const safeSynced = Math.min(safeTotal, Math.max(0, Number(syncedCount || 0)));
    PropertiesService.getScriptProperties().setProperty(
      CONFIG.PROP_LAST_SYNC_STATS,
      JSON.stringify({
        totalInSyncSheet: safeTotal,
        syncedCount: safeSynced,
        unsyncedCount: Math.max(0, safeTotal - safeSynced)
      })
    );
  } catch (_) {}
}

/**
 * Super-cepat (< 0.3 detik, 0 Sheet reads, 0 People API calls):
 * Membaca status sinkronisasi + liveProgress + countdown langsung dari PropertiesService & CacheService.
 */
function buildLightweightSyncStatus_() {
  const props = PropertiesService.getScriptProperties();
  const lastSyncAt = props.getProperty(CONFIG.PROP_LAST_SYNC) || '';
  const probe = detectGoogleContactsEngine_();
  const live = readLiveSyncProgress_();
  const recentPhones = loadRecentSyncedPhones_();

  let totalInSheet = 0;
  let syncedCount = 0;
  let unsyncedCount = 0;

  try {
    const rawStats = props.getProperty(CONFIG.PROP_LAST_SYNC_STATS);
    if (rawStats) {
      const parsed = JSON.parse(rawStats);
      totalInSheet = Number(parsed.totalInSyncSheet || 0);
      syncedCount = Math.min(totalInSheet, Number(parsed.syncedCount || 0));
      unsyncedCount = Math.max(0, totalInSheet - syncedCount);
    }
  } catch (_) {}

  if (live && live.active && live.totalInSyncSheet > 0) {
    totalInSheet = live.totalInSyncSheet;
    syncedCount = Math.min(totalInSheet, live.syncedCount);
    unsyncedCount = Math.max(0, totalInSheet - syncedCount);
  }

  return {
    engine: probe.engine,
    connected: probe.connected,
    rateLimited: false,
    error: probe.error || '',
    totalInSyncSheet: totalInSheet,
    syncedCount: syncedCount,
    unsyncedCount: unsyncedCount,
    unsyncedPhones: [],
    recentSyncedPhones: recentPhones,
    lastSyncAt: lastSyncAt,
    serverNowMs: Date.now(),
    quota: getQuotaSummary_(live && live.googleContactsCount ? live.googleContactsCount : undefined),
    autoSync: getAutoSyncState_(),
    liveProgress: live
  };
}

function inspectGoogleContactsStatusQuick_(syncContacts) {
  const props = PropertiesService.getScriptProperties();
  const lastSyncAt = props.getProperty(CONFIG.PROP_LAST_SYNC) || '';
  const totalInSheet = Array.isArray(syncContacts) ? syncContacts.length : 0;
  const cachedMap = loadCachedGooglePhonesMap_();
  const probe = detectGoogleContactsEngine_();

  if (cachedMap !== null && probe.connected) {
    return buildSyncStatusFromMap_(probe.engine, true, false, '', cachedMap, syncContacts, lastSyncAt);
  }

  let syncedCount = 0;
  let unsyncedCount = totalInSheet;
  try {
    const rawStats = props.getProperty(CONFIG.PROP_LAST_SYNC_STATS);
    if (rawStats) {
      const parsed = JSON.parse(rawStats);
      if (typeof parsed.syncedCount === 'number') {
        syncedCount = Math.min(totalInSheet, parsed.syncedCount);
        unsyncedCount = Math.max(0, totalInSheet - syncedCount);
      }
    }
  } catch (_) {}

  return {
    engine: probe.engine,
    connected: probe.connected,
    rateLimited: false,
    error: probe.error || '',
    totalInSyncSheet: totalInSheet,
    syncedCount: syncedCount,
    unsyncedCount: unsyncedCount,
    unsyncedPhones: [],
    recentSyncedPhones: loadRecentSyncedPhones_(),
    lastSyncAt: lastSyncAt,
    serverNowMs: Date.now(),
    quota: getQuotaSummary_(),
    autoSync: getAutoSyncState_(),
    liveProgress: readLiveSyncProgress_()
  };
}

/**
 * Pengaturan Auto-Sync INSTAN (< 1 detik):
 * - Tidak membaca 25.000 baris sheet Kontak_Sync
 * - Tidak menunggu ScriptLock
 * - Langsung update trigger & kembalikan status ringan
 */
function configureAutoSyncSchedule_(payload) {
  const enable = Boolean(payload && payload.enabled);
  const rawInterval = Number(payload && payload.intervalMinutes);
  const intervalMinutes = CONFIG.ALLOWED_AUTO_SYNC_INTERVALS.indexOf(rawInterval) !== -1
    ? rawInterval
    : readAutoSyncConfig_().intervalMinutes;
  const rawBatch = Number(payload && payload.batchLimit);
  const batchLimit = CONFIG.ALLOWED_AUTO_SYNC_BATCHES.indexOf(rawBatch) !== -1
    ? rawBatch
    : readAutoSyncConfig_().batchLimit;

  if (!enable) {
    markSyncAbortSignal_();
    clearLiveSyncProgress_();
    try {
      CacheService.getScriptCache().remove(CONFIG.CACHE_SYNC_LEASE_KEY);
    } catch (_) {}
  } else {
    clearSyncAbortSignal_();
  }

  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === CONFIG.SCHEDULED_TRIGGER_HANDLER) {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    if (enable) {
      const builder = ScriptApp.newTrigger(CONFIG.SCHEDULED_TRIGGER_HANDLER).timeBased();
      if (intervalMinutes === 60) {
        builder.everyHours(1).create();
      } else {
        builder.everyMinutes(intervalMinutes).create();
      }
      clearSyncedSheetHash_();
    }
  } catch (err) {
    return {
      status: 'error',
      message: 'Gagal mengatur trigger Apps Script: ' + err.message + '. Jalankan fungsi aktifkanAutoSync5Menit() sekali di editor Apps Script untuk memberi izin trigger.',
      autoSync: getAutoSyncState_(),
      syncStatus: buildLightweightSyncStatus_()
    };
  }

  const nowMs = Date.now();
  const nextRunAtMs = enable ? nowMs + intervalMinutes * 60000 : 0;

  saveAutoSyncConfig_({
    enabled: enable,
    intervalMinutes: intervalMinutes,
    batchLimit: batchLimit,
    nextRunAtMs: nextRunAtMs,
    lastRunDetail: enable
      ? 'Aktif: tiap ' + intervalMinutes + ' menit (maks ' + formatNumId_(batchLimit) + ' kontak/tahap)'
      : 'Sinkronisasi otomatis dimatikan oleh pengguna'
  });

  // Catat 1 baris ke History secara ringan (tanpa scan seluruh sheet)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hSheet = ss.getSheetByName(CONFIG.HISTORY_SHEET);
    if (hSheet) {
      appendHistory_(
        hSheet,
        enable ? 'Aktifkan Auto-Sync' : 'Matikan Auto-Sync',
        'Jadwal Server Google',
        '-',
        enable
          ? 'Interval: tiap ' + intervalMinutes + ' menit · Batas aman: ' + formatNumId_(batchLimit) + ' kontak/tahap (Batch API)'
          : 'Trigger otomatis dinonaktifkan. Sinkronisasi manual tetap tersedia.'
      );
    }
  } catch (_) {}

  const lightStatus = buildLightweightSyncStatus_();

  return {
    status: 'success',
    message: enable
      ? 'Auto-Sync aktif tiap ' + intervalMinutes + ' menit (' + formatNumId_(batchLimit) + ' kontak/tahap). Berjalan otomatis 24/7 di server Google.'
      : 'Auto-Sync berhasil dimatikan.',
    autoSync: lightStatus.autoSync,
    syncStatus: lightStatus
  };
}

/**
 * Trigger otomatis terjadwal (berjalan 24/7 di server Google Apps Script setiap 5/10/15/30/60 menit).
 */
function scheduledAutoSyncTrigger() {
  const cfg = readAutoSyncConfig_();
  if (!cfg.enabled) return;

  const leaseToken = acquireSyncLease_('scheduled');
  if (!leaseToken) return;

  const runNowMs = Date.now();
  const nextSlotMs = runNowMs + Math.max(1, cfg.intervalMinutes) * 60000;

  try {
    const sheets = getAllSheets_();
    const syncRows = readContactsFromSheet_(sheets.syncSheet, false);
    const props = PropertiesService.getScriptProperties();

    if (syncRows.length === 0) {
      saveSyncStatsQuick_(0, 0);
      saveAutoSyncConfig_({
        lastRunAt: nowFormatted_(),
        lastRunAtMs: Date.now(),
        nextRunAtMs: nextSlotMs,
        lastStageAdded: 0,
        lastRunStatus: 'idle',
        lastRunDetail: 'Sheet Kontak_Sync masih kosong (0 kuota API)',
        remainingEstimate: 0
      });
      return;
    }

    const currentHash = computeSyncSheetHash_(syncRows);
    const lastSyncedHash = props.getProperty(CONFIG.PROP_LAST_SYNCED_SHEET_HASH) || '';
    if (currentHash && lastSyncedHash && currentHash === lastSyncedHash) {
      saveSyncStatsQuick_(syncRows.length, syncRows.length);
      saveAutoSyncConfig_({
        lastRunAt: nowFormatted_(),
        lastRunAtMs: Date.now(),
        nextRunAtMs: nextSlotMs,
        lastStageAdded: 0,
        lastRunStatus: 'idle',
        lastRunDetail: 'Mode Hemat — semua ' + formatNumId_(syncRows.length) + ' kontak sudah tersinkron (0 kuota API)',
        remainingEstimate: 0
      });
      return;
    }

    const res = syncManualSheetToGoogleContacts_(
      'Auto-Sync Terjadwal',
      true,
      false,
      cfg.batchLimit
    );

    const remaining = res && res.syncStatus ? Number(res.syncStatus.unsyncedCount || 0) : 0;
    const isCompleted = res && res.status === 'success' && !res.batchLimitReached && !res.rateLimited && !res.aborted;
    const nextStatus = res && res.status === 'error'
      ? 'error'
      : isCompleted
        ? 'completed'
        : 'progress';

    saveAutoSyncConfig_({
      lastRunAt: nowFormatted_(),
      lastRunAtMs: Date.now(),
      nextRunAtMs: Date.now() + Math.max(1, cfg.intervalMinutes) * 60000,
      lastStageAdded: Number((res && res.writtenCount) || 0),
      lastRunStatus: nextStatus,
      lastRunDetail: res && res.message ? res.message : 'Selesai dijalankan.',
      remainingEstimate: remaining
    });
  } catch (err) {
    saveAutoSyncConfig_({
      lastRunAt: nowFormatted_(),
      lastRunAtMs: Date.now(),
      nextRunAtMs: nextSlotMs,
      lastStageAdded: 0,
      lastRunStatus: 'error',
      lastRunDetail: 'Error: ' + err.message
    });
  } finally {
    releaseSyncLease_(leaseToken);
  }
}

/**
 * Trigger otomatis saat sheet Kontak_Sync diubah manual di Google Sheets.
 * Jika Auto-Sync Terjadwal aktif atau kontak > 500, cukup reset hash agar diproses rapi oleh jadwal (anti bentrok kuota).
 */
function onSpreadsheetChangeTrigger(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = e && e.source ? e.source.getActiveSheet() : ss.getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== CONFIG.SYNC_SHEET) return;

    clearSyncedSheetHash_();

    // Jika Auto-Sync terjadwal sudah aktif, biarkan jadwal yang memproses agar tidak bentrok kuota
    if (getAutoSyncState_().enabled) return;

    // Untuk database besar (> 500 baris), hindari sinkron mendadak setiap kali rumus/sel berubah
    if (activeSheet.getLastRow() > 501) return;

    const leaseToken = acquireSyncLease_('onchange');
    if (!leaseToken) return;
    try {
      syncManualSheetToGoogleContacts_('Auto-Sync Kontak_Sync', true, true);
    } finally {
      releaseSyncLease_(leaseToken);
    }
  } catch (_) {}
}

function getAllSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let contactSheet = ss.getSheetByName(CONFIG.CONTACTS_SHEET);
  let syncSheet = ss.getSheetByName(CONFIG.SYNC_SHEET);
  let categorySheet = ss.getSheetByName(CONFIG.CATEGORIES_SHEET);
  let historySheet = ss.getSheetByName(CONFIG.HISTORY_SHEET);

  if (
    !contactSheet ||
    !syncSheet ||
    !categorySheet ||
    !historySheet ||
    contactSheet.getLastRow() === 0 ||
    syncSheet.getLastRow() === 0 ||
    categorySheet.getLastRow() === 0 ||
    historySheet.getLastRow() === 0
  ) {
    setupdatabase();
    contactSheet = ss.getSheetByName(CONFIG.CONTACTS_SHEET);
    syncSheet = ss.getSheetByName(CONFIG.SYNC_SHEET);
    categorySheet = ss.getSheetByName(CONFIG.CATEGORIES_SHEET);
    historySheet = ss.getSheetByName(CONFIG.HISTORY_SHEET);
  } else {
    ensureSheetWithHeaders_(ss, CONFIG.CONTACTS_SHEET, CONFIG.CONTACT_HEADERS, '#0A2463', CONFIG.CONTACT_COL_WIDTHS, 2);
    ensureSheetWithHeaders_(ss, CONFIG.SYNC_SHEET, CONFIG.SYNC_HEADERS, '#0284C7', CONFIG.SYNC_COL_WIDTHS, 2);
  }

  return {
    contactSheet: contactSheet,
    syncSheet: syncSheet,
    categorySheet: categorySheet,
    historySheet: historySheet
  };
}

function formatPhoneNumber_(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8') && digits.length >= 9) {
    digits = '62' + digits;
  }
  return digits;
}

function normalizeGender_(rawGender) {
  const g = String(rawGender || '').trim();
  for (let i = 0; i < CONFIG.ALLOWED_GENDERS.length; i++) {
    if (CONFIG.ALLOWED_GENDERS[i].toLowerCase() === g.toLowerCase()) {
      return CONFIG.ALLOWED_GENDERS[i];
    }
  }
  return 'Laki-laki';
}

function makeDefaultCode_(name) {
  const clean = String(name || '').replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 3) || 'KAT').toUpperCase();
}

function formatDateObj_(dateObj) {
  const tz = Session.getScriptTimeZone() || 'Asia/Makassar';
  const dd = Utilities.formatDate(dateObj, tz, 'dd');
  const monthIdx = Number(Utilities.formatDate(dateObj, tz, 'M')) - 1;
  const yyyy = Utilities.formatDate(dateObj, tz, 'yyyy');
  const time = Utilities.formatDate(dateObj, tz, 'HH:mm:ss');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return dd + ' ' + (months[monthIdx] || 'Jan') + ' ' + yyyy + ' ' + time;
}

function nowFormatted_() {
  return formatDateObj_(new Date());
}

/**
 * Mencegah nomor HP yang tersimpan sebagai tipe angka di Sheets berubah jadi notasi ilmiah (6.28E+12).
 */
function formatSheetPhoneCell_(rawVal, displayVal) {
  if (typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0) {
    return Math.round(rawVal).toFixed(0);
  }
  const disp = String(displayVal || '').trim();
  if (disp && !/[eE][+-]?\d+/.test(disp)) {
    return disp;
  }
  return String(rawVal || disp || '').trim();
}

function formatSheetTimeCell_(rawVal, displayVal) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    return formatDateObj_(rawVal);
  }
  return String(displayVal || rawVal || '').trim();
}

function normalizeActionStatus_(rawStatus) {
  const s = String(rawStatus || '').trim().toLowerCase();
  if (s === 'edit' || s === 'updated' || s === 'ubah' || s === 'diperbarui') return 'updated';
  if (s === 'tambah' || s === 'created' || s === 'baru' || s === 'ditambahkan') return 'created';
  return '';
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendHistory_(historySheet, actionLabel, nama, noHp, detail) {
  const nextRow = historySheet.getLastRow() + 1;
  historySheet.getRange(nextRow, 1, 1, 5).setValues([[
    nowFormatted_(),
    String(actionLabel || '-'),
    String(nama || '-'),
    String(noHp || '-'),
    String(detail || '')
  ]]);
  historySheet.getRange(nextRow, 4).setNumberFormat('@');
}

function readCategories_(categorySheet) {
  const lastRow = categorySheet.getLastRow();
  if (lastRow <= 1) {
    return CONFIG.DEFAULT_CATEGORIES.slice();
  }

  const colCount = Math.min(Math.max(categorySheet.getLastColumn(), 1), 2);
  const values = categorySheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();
  const list = [];
  const seen = {};

  for (let i = 0; i < values.length; i++) {
    const nama = String(values[i][0] || '').trim();
    if (!nama) continue;
    const key = nama.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    const kode = colCount >= 2 && String(values[i][1] || '').trim()
      ? String(values[i][1]).trim()
      : makeDefaultCode_(nama);
    list.push({ nama: nama, kode: kode });
  }

  return list.length > 0 ? list : CONFIG.DEFAULT_CATEGORIES.slice();
}

function readContactsFromSheet_(sheet, includeMeta) {
  const lastRow = sheet.getLastRow();
  const contacts = [];
  if (lastRow <= 1) return contacts;

  const maxCols = includeMeta ? 6 : 4;
  const colCount = Math.min(Math.max(sheet.getLastColumn(), 3), maxCols);
  const range = sheet.getRange(2, 1, lastRow - 1, colCount);
  const rawValues = range.getValues();
  const displayValues = range.getDisplayValues();

  for (let i = 0; i < displayValues.length; i++) {
    const nama = String(displayValues[i][0] || '').trim();
    const rawNoHp = formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]);
    const kategori = String(displayValues[i][2] || '').trim();
    const jenisKelamin = colCount >= 4 && displayValues[i][3]
      ? normalizeGender_(displayValues[i][3])
      : 'Laki-laki';
    const cleanPhone = formatPhoneNumber_(rawNoHp);

    if (!nama && !cleanPhone) continue;

    const item = {
      nama: nama,
      noHp: cleanPhone || rawNoHp,
      kategori: kategori,
      jenisKelamin: jenisKelamin
    };

    if (includeMeta) {
      item.rowIndex = i + 2;
      item.updatedAt = colCount >= 5 ? formatSheetTimeCell_(rawValues[i][4], displayValues[i][4]) : '';
      item.lastAction = colCount >= 6 ? normalizeActionStatus_(displayValues[i][5]) : '';
    }

    contacts.push(item);
  }

  return contacts;
}

function readHistory_(historySheet) {
  const lastRow = historySheet.getLastRow();
  const logs = [];
  if (lastRow <= 1) return logs;

  const startRow = Math.max(2, lastRow - 199);
  const count = lastRow - startRow + 1;
  const values = historySheet.getRange(startRow, 1, count, 5).getDisplayValues();

  for (let i = values.length - 1; i >= 0; i--) {
    logs.push({
      waktu: String(values[i][0] || ''),
      action: String(values[i][1] || ''),
      nama: String(values[i][2] || ''),
      noHp: String(values[i][3] || ''),
      detail: String(values[i][4] || '')
    });
  }

  return logs;
}

/**
 * Endpoint GET: Mengambil Kontak, Kontak_Sync, Kategori, History, dan Status Sinkronisasi Google Kontak.
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? String(e.parameter.action).toLowerCase() : 'list';

    // Endpoint polling realtime super-ringan (< 0.3 dtk, 0 Sheet reads, 0 kuota Google API)
    if (action === 'syncstatus' || action === 'status') {
      return jsonResponse_({
        status: 'success',
        syncStatus: buildLightweightSyncStatus_()
      });
    }

    if (action === 'setup') {
      return jsonResponse_(setupdatabase());
    }

    if (action === 'syncmanual') {
      return jsonResponse_(syncManualSheetToGoogleContacts_('Sinkron Manual Web App'));
    }

    const sheets = getAllSheets_();
    const categories = readCategories_(sheets.categorySheet);

    if (action === 'ping') {
      const probe = detectGoogleContactsEngine_();
      return jsonResponse_({
        status: 'success',
        message: 'Koneksi ke Google Apps Script aktif.',
        sheetName: sheets.contactSheet.getName(),
        categoriesCount: categories.length,
        googleEngine: probe.engine,
        googleConnected: probe.connected,
        googleError: probe.error || '',
        timestamp: new Date().toISOString()
      });
    }

    const forceCheck = Boolean(e && e.parameter && e.parameter.forceCheck === '1');
    const contacts = readContactsFromSheet_(sheets.contactSheet, true);
    const syncContacts = readContactsFromSheet_(sheets.syncSheet, false);
    const history = readHistory_(sheets.historySheet);
    const syncStatus = inspectGoogleContactsStatus_(syncContacts, forceCheck);

    return jsonResponse_({
      status: 'success',
      data: contacts,
      syncContacts: syncContacts,
      categories: categories,
      history: history,
      syncStatus: syncStatus,
      total: contacts.length,
      syncedAt: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'Gagal memuat data: ' + err.message
    });
  }
}

/**
 * Endpoint POST: Menangani save, delete, deleteBatch, saveCategories, syncManual, configureAutoSync.
 * ARSITEKTUR ANTI-LOCK TIMEOUT:
 * - configureAutoSync berjalan INSTAN tanpa menunggu ScriptLock (bisa ubah jadwal / matikan kapan saja meski Auto-Sync sedang berjalan).
 * - syncManual menggunakan Cache Lease terpisah (tidak memblokir save/delete).
 * - save / delete / deleteBatch / saveCategories hanya menahan ScriptLock < 2 detik untuk operasi sheet.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ status: 'error', message: 'Payload permintaan tidak ditemukan.' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || '').toLowerCase();

    // 1. Pengaturan jadwal Auto-Sync TIDAK PERNAH diblokir oleh lock sinkronisasi
    if (action === 'configureautosync' || action === 'setautosync') {
      return jsonResponse_(configureAutoSyncSchedule_(payload));
    }

    // 2. Sinkronisasi manual menggunakan Cache Lease terpisah (bukan ScriptLock)
    if (action === 'syncmanual' || action === 'synckontaksync') {
      const leaseToken = acquireSyncLease_('manual');
      if (!leaseToken) {
        return jsonResponse_({
          status: 'error',
          message: 'Proses sinkronisasi lain sedang berjalan di server Google. Progres realtime sedang tampil di layar.',
          syncStatus: buildLightweightSyncStatus_()
        });
      }
      clearSyncAbortSignal_();
      try {
        return jsonResponse_(syncManualSheetToGoogleContacts_('Sinkron Kontak_Sync -> Google Kontak'));
      } finally {
        releaseSyncLease_(leaseToken);
      }
    }

    // 3. Mutasi Spreadsheet cepat (< 2 detik) menggunakan ScriptLock singkat
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(12000);
      if (action === 'setupdatabase' || action === 'setup') {
        return jsonResponse_(setupdatabase());
      }
      if (action === 'save') {
        return handleSaveContact_(payload);
      }
      if (action === 'delete') {
        return handleDeleteContact_(payload);
      }
      if (action === 'deletebatch' || action === 'bulkdelete') {
        return handleDeleteBatch_(payload);
      }
      if (action === 'savecategories') {
        return handleSaveCategories_(payload);
      }
      return jsonResponse_({ status: 'error', message: 'Aksi tidak dikenali.' });
    } finally {
      try {
        lock.releaseLock();
      } catch (_) {}
    }
  } catch (err) {
    return jsonResponse_({ status: 'error', message: 'Kesalahan server: ' + err.message });
  }
}

function findTargetRowInContactSheet_(sheet, rowIndex, cleanOrig, cleanPhone, origKategori, origNama) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return -1;

  const colCount = Math.min(Math.max(sheet.getLastColumn(), 3), 6);
  const range = sheet.getRange(2, 1, lastRow - 1, colCount);
  const rawValues = range.getValues();
  const displayValues = range.getDisplayValues();

  const origKatLower = String(origKategori || '').trim().toLowerCase();
  const origNamaLower = String(origNama || '').trim().toLowerCase();

  // 1. Verifikasi rowIndex secara langsung (paling presisi untuk data duplikat/multi-kategori)
  if (rowIndex >= 2 && rowIndex <= lastRow) {
    const idx = rowIndex - 2;
    const rowPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[idx][1], displayValues[idx][1]));
    const rowName = String(displayValues[idx][0] || '').trim().toLowerCase();
    if (
      (cleanOrig && rowPhone === cleanOrig) ||
      (cleanPhone && rowPhone === cleanPhone) ||
      (origNamaLower && rowName === origNamaLower)
    ) {
      return rowIndex;
    }
  }

  // 2. Fallback: cocokkan (originalNoHp + originalKategori + originalNama)
  if (cleanOrig) {
    for (let i = 0; i < displayValues.length; i++) {
      const rowPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
      const rowKat = String(displayValues[i][2] || '').trim().toLowerCase();
      const rowName = String(displayValues[i][0] || '').trim().toLowerCase();
      if (rowPhone === cleanOrig && rowKat === origKatLower && (!origNamaLower || rowName === origNamaLower)) {
        return i + 2;
      }
    }
    // 3. Fallback: cocokkan (originalNoHp + originalKategori)
    for (let i = 0; i < displayValues.length; i++) {
      const rowPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
      const rowKat = String(displayValues[i][2] || '').trim().toLowerCase();
      if (rowPhone === cleanOrig && rowKat === origKatLower) {
        return i + 2;
      }
    }
    // 4. Fallback: cocokkan originalNoHp saja
    for (let i = 0; i < displayValues.length; i++) {
      const rowPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
      if (rowPhone === cleanOrig) {
        return i + 2;
      }
    }
  }

  // 5. Fallback terakhir: cocokkan cleanPhone
  if (cleanPhone) {
    for (let i = 0; i < displayValues.length; i++) {
      const rowPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
      if (rowPhone === cleanPhone) {
        return i + 2;
      }
    }
  }

  return -1;
}

function existingPhoneCategorySet_(sheet) {
  const map = {};
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return map;
  const colCount = Math.min(Math.max(sheet.getLastColumn(), 3), 4);
  const range = sheet.getRange(2, 1, lastRow - 1, colCount);
  const rawValues = range.getValues();
  const displayValues = range.getDisplayValues();
  for (let i = 0; i < displayValues.length; i++) {
    const p = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
    const k = String(displayValues[i][2] || '').trim().toLowerCase();
    if (p) map[p + '|' + k] = true;
  }
  return map;
}

function resolveOptionalCategory_(categories, requestedName) {
  const req = String(requestedName || '').trim();
  if (!req) return null;
  for (let i = 0; i < categories.length; i++) {
    if (categories[i].nama.toLowerCase() === req.toLowerCase()) {
      return categories[i];
    }
  }
  return { nama: req, kode: makeDefaultCode_(req) };
}

function normalizeRequestedCategories_(categories, payload) {
  const rawList = Array.isArray(payload.categories)
    ? payload.categories
    : (payload.kategori !== undefined && payload.kategori !== null ? [payload.kategori] : []);
  const seen = {};
  const resolved = [];

  for (let i = 0; i < rawList.length; i++) {
    const item = String(rawList[i] || '').trim();
    if (!item) continue;
    const catObj = resolveOptionalCategory_(categories, item);
    if (!catObj) continue;
    const key = catObj.nama.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    resolved.push(catObj);
  }

  return resolved;
}

/**
 * Simpan/Update kontak di sheet "Kontak" SAJA (tidak mengubah rumus/isi manual di "Kontak_Sync").
 * Mendukung:
 * - Edit presisi berdasarkan rowIndex (tidak menimpa baris lain jika nomor duplikat/multi-kategori)
 * - Tambah multi-kategori sekaligus (1 baris per kategori terpilih)
 * - Isolasi error auto-sync Google Kontak agar penyimpanan Spreadsheet selalu sukses & dikembalikan langsung.
 */
function handleSaveContact_(payload) {
  const sheets = getAllSheets_();
  const categories = readCategories_(sheets.categorySheet);

  const nama = String(payload.nama || '').trim();
  const cleanPhone = formatPhoneNumber_(payload.noHp);
  const cleanOrig = formatPhoneNumber_(payload.originalNoHp);
  const origKategori = String(payload.originalKategori || '').trim();
  const origNama = String(payload.originalNama || '').trim();
  const requestedRowIndex = Number(payload.rowIndex || 0);
  const allowDuplicate = Boolean(payload.allowDuplicate);
  const modeRaw = String(payload.mode || '').toLowerCase();
  const isEditMode = modeRaw === 'edit' || (!allowDuplicate && (requestedRowIndex >= 2 || Boolean(cleanOrig)));
  const jenisKelamin = normalizeGender_(payload.jenisKelamin);
  const resolvedCats = normalizeRequestedCategories_(categories, payload);
  const timestamp = nowFormatted_();

  if (!nama) {
    return jsonResponse_({ status: 'error', message: 'Nama kontak wajib diisi.' });
  }
  if (!cleanPhone || cleanPhone.length < 8) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP tidak valid (minimal 8 digit).' });
  }

  const sheet = sheets.contactSheet;
  let operationType = 'created';
  let rowsSavedCount = 0;
  let updatedRowNumber = -1;

  if (isEditMode) {
    const targetRow = findTargetRowInContactSheet_(
      sheet,
      requestedRowIndex,
      cleanOrig,
      cleanPhone,
      origKategori,
      origNama
    );

    const primaryCatName = resolvedCats.length > 0 ? resolvedCats[0].nama : '';
    if (targetRow !== -1) {
      sheet.getRange(targetRow, 1, 1, 6).setValues([[
        nama,
        cleanPhone,
        primaryCatName,
        jenisKelamin,
        timestamp,
        'Edit'
      ]]);
      sheet.getRange(targetRow, 2).setNumberFormat('@');
      sheet.getRange(targetRow, 5).setNumberFormat('@');
      operationType = 'updated';
      rowsSavedCount = 1;
      updatedRowNumber = targetRow;

      // Jika user menambah kategori tambahan saat mode edit, buat baris tambahan untuk kategori ekstra tersebut
      if (resolvedCats.length > 1) {
        const existingPairs = existingPhoneCategorySet_(sheet);
        const extraRows = [];
        for (let i = 1; i < resolvedCats.length; i++) {
          const extraCat = resolvedCats[i].nama;
          const pairKey = cleanPhone + '|' + extraCat.toLowerCase();
          if (existingPairs[pairKey]) continue;
          existingPairs[pairKey] = true;
          extraRows.push([nama, cleanPhone, extraCat, jenisKelamin, timestamp, 'Tambah']);
        }
        if (extraRows.length > 0) {
          const startRow = sheet.getLastRow() + 1;
          sheet.getRange(startRow, 1, extraRows.length, 6).setValues(extraRows);
          sheet.getRange(startRow, 2, extraRows.length, 1).setNumberFormat('@');
          sheet.getRange(startRow, 5, extraRows.length, 1).setNumberFormat('@');
          rowsSavedCount += extraRows.length;
        }
      }
    } else {
      // Baris target sudah tidak ditemukan di sheet -> buat baris baru agar perubahan tetap tersimpan
      const rowsToInsert = resolvedCats.length > 0
        ? resolvedCats.map(function (c) { return [nama, cleanPhone, c.nama, jenisKelamin, timestamp, 'Tambah']; })
        : [[nama, cleanPhone, '', jenisKelamin, timestamp, 'Tambah']];
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rowsToInsert.length, 6).setValues(rowsToInsert);
      sheet.getRange(startRow, 2, rowsToInsert.length, 1).setNumberFormat('@');
      sheet.getRange(startRow, 5, rowsToInsert.length, 1).setNumberFormat('@');
      operationType = 'created';
      rowsSavedCount = rowsToInsert.length;
      updatedRowNumber = startRow;
    }
  } else {
    const rowsToInsert = resolvedCats.length > 0
      ? resolvedCats.map(function (c) { return [nama, cleanPhone, c.nama, jenisKelamin, timestamp, 'Tambah']; })
      : [[nama, cleanPhone, '', jenisKelamin, timestamp, 'Tambah']];
    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToInsert.length, 6).setValues(rowsToInsert);
    sheet.getRange(startRow, 2, rowsToInsert.length, 1).setNumberFormat('@');
    sheet.getRange(startRow, 5, rowsToInsert.length, 1).setNumberFormat('@');
    operationType = 'created';
    rowsSavedCount = rowsToInsert.length;
    updatedRowNumber = startRow;
  }

  const catSummary = resolvedCats.length > 0
    ? resolvedCats.map(function (c) { return c.nama + ' (' + c.kode + ')'; }).join(', ')
    : 'Tanpa Kategori';

  appendHistory_(
    sheets.historySheet,
    operationType === 'created' ? 'Tambah Kontak' : 'Edit Kontak',
    nama,
    cleanPhone,
    'Kategori: ' + catSummary + ' · Gender: ' + jenisKelamin + (rowsSavedCount > 1 ? ' · ' + rowsSavedCount + ' baris' : '')
  );

  // Wajib flush agar Google Sheets langsung menyimpan perubahan sebelum membaca balik
  SpreadsheetApp.flush();
  clearSyncedSheetHash_();

  const freshContacts = readContactsFromSheet_(sheets.contactSheet, true);
  const freshHistory = readHistory_(sheets.historySheet);

  return jsonResponse_({
    status: 'success',
    operation: operationType,
    rowsSaved: rowsSavedCount,
    rowIndex: updatedRowNumber,
    updatedAt: timestamp,
    message: operationType === 'created'
      ? (rowsSavedCount > 1
        ? 'Kontak baru berhasil disimpan ke ' + rowsSavedCount + ' kategori di sheet Kontak.'
        : 'Kontak baru berhasil disimpan ke sheet Kontak.')
      : (rowsSavedCount > 1
        ? 'Data kontak berhasil diperbarui dan ditambahkan ke ' + (rowsSavedCount - 1) + ' kategori tambahan.'
        : 'Perubahan kontak berhasil disimpan ke sheet Kontak.'),
    contacts: freshContacts,
    history: freshHistory
  });
}

/**
 * Hapus HANYA 1 baris kontak yang dipilih dari sheet "Kontak" (aman untuk data duplikat/multi-kategori).
 */
function handleDeleteContact_(payload) {
  const cleanTarget = formatPhoneNumber_(payload.noHp);
  const requestedRowIndex = Number(payload.rowIndex || 0);
  const targetKategori = String(payload.kategori || '').trim();
  const targetNama = String(payload.nama || '').trim();

  if (!cleanTarget && requestedRowIndex < 2) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP atau baris target wajib disertakan untuk menghapus kontak.' });
  }

  const sheets = getAllSheets_();
  const sheet = sheets.contactSheet;
  const targetRow = findTargetRowInContactSheet_(
    sheet,
    requestedRowIndex,
    cleanTarget,
    cleanTarget,
    targetKategori,
    targetNama
  );

  if (targetRow === -1) {
    return jsonResponse_({
      status: 'error',
      message: 'Baris kontak tersebut tidak ditemukan di sheet Kontak.'
    });
  }

  const rowDisplay = sheet.getRange(targetRow, 1, 1, Math.min(4, Math.max(sheet.getLastColumn(), 3))).getDisplayValues()[0];
  const deletedName = String(rowDisplay[0] || targetNama || '-').trim();
  const deletedKat = String(rowDisplay[2] || targetKategori || '').trim();

  sheet.deleteRow(targetRow);

  appendHistory_(
    sheets.historySheet,
    'Hapus Kontak',
    deletedName,
    cleanTarget || String(rowDisplay[1] || '-'),
    'Dihapus dari sheet Kontak (Kategori: ' + (deletedKat || 'Tanpa Kategori') + ')'
  );

  SpreadsheetApp.flush();
  clearSyncedSheetHash_();

  const freshContacts = readContactsFromSheet_(sheets.contactSheet, true);
  const freshHistory = readHistory_(sheets.historySheet);

  return jsonResponse_({
    status: 'success',
    message: 'Kontak "' + deletedName + '" berhasil dihapus dari sheet Kontak.',
    contacts: freshContacts,
    history: freshHistory
  });
}

/**
 * Hapus beberapa baris kontak yang ditandai sekaligus secara atomik (dari bawah ke atas agar nomor baris tidak bergeser).
 */
function handleDeleteBatch_(payload) {
  const items = Array.isArray(payload && payload.items) ? payload.items : [];
  if (items.length === 0) {
    return jsonResponse_({ status: 'error', message: 'Tidak ada kontak yang dipilih untuk dihapus.' });
  }

  const sheets = getAllSheets_();
  const sheet = sheets.contactSheet;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return jsonResponse_({ status: 'error', message: 'Sheet Kontak masih kosong.' });
  }

  const colCount = Math.min(Math.max(sheet.getLastColumn(), 3), 6);
  const range = sheet.getRange(2, 1, lastRow - 1, colCount);
  const rawValues = range.getValues();
  const displayValues = range.getDisplayValues();

  const matchedRowSet = {};
  const matchedNames = [];

  for (let idxItem = 0; idxItem < items.length; idxItem++) {
    const it = items[idxItem] || {};
    const reqRow = Number(it.rowIndex || 0);
    const cleanPhone = formatPhoneNumber_(it.noHp);
    const katLower = String(it.kategori || '').trim().toLowerCase();
    const namaLower = String(it.nama || '').trim().toLowerCase();

    let foundRow = -1;

    // 1. Cek langsung pada rowIndex
    if (reqRow >= 2 && reqRow <= lastRow && !matchedRowSet[reqRow]) {
      const rIdx = reqRow - 2;
      const rPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[rIdx][1], displayValues[rIdx][1]));
      const rName = String(displayValues[rIdx][0] || '').trim().toLowerCase();
      if ((cleanPhone && rPhone === cleanPhone) || (namaLower && rName === namaLower)) {
        foundRow = reqRow;
      }
    }

    // 2. Fallback: cocokkan nomor + kategori + nama
    if (foundRow === -1 && cleanPhone) {
      for (let i = 0; i < displayValues.length; i++) {
        const candidateRow = i + 2;
        if (matchedRowSet[candidateRow]) continue;
        const rPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
        const rKat = String(displayValues[i][2] || '').trim().toLowerCase();
        const rName = String(displayValues[i][0] || '').trim().toLowerCase();
        if (rPhone === cleanPhone && rKat === katLower && (!namaLower || rName === namaLower)) {
          foundRow = candidateRow;
          break;
        }
      }
    }

    // 3. Fallback: cocokkan nomor + kategori
    if (foundRow === -1 && cleanPhone) {
      for (let i = 0; i < displayValues.length; i++) {
        const candidateRow = i + 2;
        if (matchedRowSet[candidateRow]) continue;
        const rPhone = formatPhoneNumber_(formatSheetPhoneCell_(rawValues[i][1], displayValues[i][1]));
        const rKat = String(displayValues[i][2] || '').trim().toLowerCase();
        if (rPhone === cleanPhone && rKat === katLower) {
          foundRow = candidateRow;
          break;
        }
      }
    }

    if (foundRow !== -1) {
      matchedRowSet[foundRow] = true;
      const nm = String(displayValues[foundRow - 2][0] || it.nama || '').trim();
      if (nm && matchedNames.length < 5) matchedNames.push(nm);
    }
  }

  const rowsToDelete = Object.keys(matchedRowSet)
    .map(function (k) { return Number(k); })
    .sort(function (a, b) { return b - a; });

  if (rowsToDelete.length === 0) {
    return jsonResponse_({ status: 'error', message: 'Baris kontak yang ditandai tidak ditemukan di sheet Kontak.' });
  }

  // Hapus berurutan dari bawah ke atas, gabungkan baris bersebelahan dengan deleteRows agar super cepat
  let i = 0;
  while (i < rowsToDelete.length) {
    let runEnd = rowsToDelete[i];
    let runStart = runEnd;
    while (i + 1 < rowsToDelete.length && rowsToDelete[i + 1] === runStart - 1) {
      i++;
      runStart = rowsToDelete[i];
    }
    const count = runEnd - runStart + 1;
    if (count > 1) {
      sheet.deleteRows(runStart, count);
    } else {
      sheet.deleteRow(runStart);
    }
    i++;
  }

  const previewText = matchedNames.join(', ') + (rowsToDelete.length > matchedNames.length ? ' +' + (rowsToDelete.length - matchedNames.length) + ' lainnya' : '');
  appendHistory_(
    sheets.historySheet,
    'Hapus Massal',
    rowsToDelete.length + ' kontak ditandai',
    '-',
    'Dihapus sekaligus dari sheet Kontak: ' + previewText
  );

  SpreadsheetApp.flush();
  clearSyncedSheetHash_();

  const freshContacts = readContactsFromSheet_(sheets.contactSheet, true);
  const freshHistory = readHistory_(sheets.historySheet);

  return jsonResponse_({
    status: 'success',
    deletedCount: rowsToDelete.length,
    message: rowsToDelete.length + ' kontak terpilih berhasil dihapus sekaligus dari Spreadsheet.',
    contacts: freshContacts,
    history: freshHistory
  });
}

function handleSaveCategories_(payload) {
  const incoming = Array.isArray(payload.categories) ? payload.categories : [];
  if (incoming.length === 0) {
    return jsonResponse_({ status: 'error', message: 'Minimal harus ada satu kategori.' });
  }

  const sheets = getAllSheets_();
  const seen = {};
  const cleaned = [];

  for (let i = 0; i < incoming.length; i++) {
    const nama = String(incoming[i].nama || '').trim();
    if (!nama) continue;
    const key = nama.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    const kode = String(incoming[i].kode || '').trim() || makeDefaultCode_(nama);
    cleaned.push({ nama: nama, kode: kode });
  }

  if (cleaned.length === 0) {
    return jsonResponse_({ status: 'error', message: 'Daftar kategori tidak valid.' });
  }

  const renameMap = payload.renameMap && typeof payload.renameMap === 'object' ? payload.renameMap : null;
  if (renameMap) {
    updateRenamedCategoriesInSheet_(sheets.contactSheet, renameMap);
  }

  const catSheet = sheets.categorySheet;
  const lastRow = catSheet.getLastRow();
  if (lastRow > 1) {
    catSheet.getRange(2, 1, lastRow - 1, 2).clearContent();
  }
  const rows = cleaned.map(function (c) {
    return [c.nama, c.kode];
  });
  catSheet.getRange(2, 1, rows.length, 2).setValues(rows);

  const actionNote = String(payload.historyAction || 'Kelola Kategori');
  const detailNote = String(payload.historyDetail || ('Total kategori aktif: ' + cleaned.length));
  appendHistory_(sheets.historySheet, actionNote, '-', '-', detailNote);

  return jsonResponse_({
    status: 'success',
    message: 'Daftar kategori berhasil diperbarui.',
    categories: cleaned
  });
}

function updateRenamedCategoriesInSheet_(sheet, renameMap) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return;
  const range = sheet.getRange(2, 3, lastRow - 1, 1);
  const values = range.getDisplayValues();
  let changed = false;
  for (let i = 0; i < values.length; i++) {
    const current = String(values[i][0] || '').trim();
    if (renameMap[current]) {
      values[i][0] = renameMap[current];
      changed = true;
    }
  }
  if (changed) {
    range.setValues(values);
  }
}

/* ============================================================================
 * GOOGLE CONTACTS ENGINE (PEOPLE API V1 + CONTACTSAPP FALLBACK + CACHE/QUOTA)
 * ========================================================================== */

function isQuotaError_(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return (
    msg.indexOf('quota exceeded') !== -1 ||
    msg.indexOf('rate limit') !== -1 ||
    msg.indexOf('ratelimitexceeded') !== -1 ||
    msg.indexOf('resource_exhausted') !== -1 ||
    msg.indexOf('too many requests') !== -1
  );
}

function explainSyncError_(err) {
  const raw = String((err && err.message) || err || '').trim();
  const lower = raw.toLowerCase();

  if (isQuotaError_(err)) {
    return {
      reason: 'Batas kuota permintaan per menit Google People API tercapai (' + raw + ')',
      solution: 'Tunggu 60-90 detik hingga jendela kuota per menit Google reset, pastikan Code.gs memakai versi terbaru (cache & diff-check), lalu klik Sinkronkan Google Kontak kembali.'
    };
  }
  if (
    lower.indexOf('people') !== -1 ||
    lower.indexOf('permission') !== -1 ||
    lower.indexOf('access not configured') !== -1 ||
    lower.indexOf('not been used') !== -1 ||
    lower.indexOf('authorization') !== -1
  ) {
    return {
      reason: 'Layanan People API belum aktif atau izin akses Google Kontak belum lengkap (' + raw + ')',
      solution: 'Buka editor Apps Script -> klik Services (+) -> People API -> Add -> jalankan setupdatabase() dan setujui izin -> Deploy New version.'
    };
  }
  if (lower.indexOf('exceeded maximum execution time') !== -1 || lower.indexOf('timeout') !== -1) {
    return {
      reason: 'Waktu eksekusi Google Apps Script mencapai batas 6 menit (' + raw + ')',
      solution: 'Klik Sinkronkan Google Kontak lagi untuk melanjutkan sisa kontak secara bertahap (kontak yang sudah tersinkron otomatis dilewati).'
    };
  }
  return {
    reason: raw || 'Terjadi gangguan koneksi atau respons tidak valid dari Google Kontak',
    solution: 'Buka Konfigurasi GAS -> klik Uji Koneksi, tunggu ±60 detik, lalu jalankan Sinkronkan Google Kontak kembali.'
  };
}

function readQuotaState_() {
  const tz = Session.getScriptTimeZone() || 'Asia/Makassar';
  const todayKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const nowMs = Date.now();
  let state = {
    dayKey: todayKey,
    dailyRequestsUsed: 0,
    minuteStartMs: nowMs,
    minuteReadsUsed: 0,
    minuteWritesUsed: 0,
    googleContactsCount: 0
  };

  try {
    const raw = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_QUOTA_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        state = {
          dayKey: String(parsed.dayKey || todayKey),
          dailyRequestsUsed: Number(parsed.dailyRequestsUsed || 0),
          minuteStartMs: Number(parsed.minuteStartMs || nowMs),
          minuteReadsUsed: Number(parsed.minuteReadsUsed || 0),
          minuteWritesUsed: Number(parsed.minuteWritesUsed || 0),
          googleContactsCount: Number(parsed.googleContactsCount || 0)
        };
      }
    }
  } catch (_) {}

  if (state.dayKey !== todayKey) {
    state.dayKey = todayKey;
    state.dailyRequestsUsed = 0;
  }
  if (!state.minuteStartMs || nowMs - state.minuteStartMs >= 60000) {
    state.minuteStartMs = nowMs;
    state.minuteReadsUsed = 0;
    state.minuteWritesUsed = 0;
  }

  return state;
}

function trackQuotaUsage_(readDelta, writeDelta, googleContactsCountOverride) {
  const state = readQuotaState_();
  const r = Math.max(0, Number(readDelta || 0));
  const w = Math.max(0, Number(writeDelta || 0));

  if ((r > 0 || w > 0) && state.minuteReadsUsed === 0 && state.minuteWritesUsed === 0) {
    state.minuteStartMs = Date.now();
  }
  state.minuteReadsUsed += r;
  state.minuteWritesUsed += w;
  state.dailyRequestsUsed += r + w;
  if (typeof googleContactsCountOverride === 'number' && googleContactsCountOverride >= 0) {
    state.googleContactsCount = googleContactsCountOverride;
  }

  try {
    PropertiesService.getScriptProperties().setProperty(CONFIG.PROP_QUOTA_STATE, JSON.stringify(state));
  } catch (_) {}
  return state;
}

function getQuotaSummary_(googleContactsCountOverride) {
  const state = readQuotaState_();
  const nowMs = Date.now();
  const elapsedMs = Math.max(0, nowMs - state.minuteStartMs);
  const windowActive = state.minuteReadsUsed > 0 || state.minuteWritesUsed > 0;
  const remainingSec = windowActive ? Math.max(0, Math.ceil((60000 - elapsedMs) / 1000)) : 0;
  const gCount =
    typeof googleContactsCountOverride === 'number' && googleContactsCountOverride >= 0
      ? googleContactsCountOverride
      : state.googleContactsCount;

  return {
    minuteReadsUsed: state.minuteReadsUsed,
    minuteReadsLimit: CONFIG.QUOTA_MINUTE_READS_LIMIT,
    minuteWritesUsed: state.minuteWritesUsed,
    minuteWritesLimit: CONFIG.QUOTA_MINUTE_WRITES_LIMIT,
    dailyRequestsUsed: state.dailyRequestsUsed,
    dailyRequestsLimit: CONFIG.QUOTA_DAILY_LIMIT,
    googleContactsCount: gCount,
    googleContactsLimit: CONFIG.GOOGLE_CONTACTS_MAX,
    windowRemainingSec: remainingSec
  };
}

function detectGoogleContactsEngine_() {
  if (typeof People !== 'undefined' && People && People.People && People.People.Connections) {
    return { engine: 'PeopleAPI', connected: true, error: '' };
  }
  if (typeof ContactsApp !== 'undefined' && ContactsApp) {
    return { engine: 'ContactsApp', connected: true, error: '' };
  }
  return {
    engine: 'Unavailable',
    connected: false,
    error: 'Aktifkan layanan People API di Apps Script (menu Services + -> People API -> Add), lalu jalankan setupdatabase().'
  };
}

function saveSyncedPhonesCache_(googlePhonesMap, syncContacts) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = Object.keys(googlePhonesMap || {}).join(',');
    const chunkSize = 85000;
    const chunkCount = Math.max(1, Math.ceil(raw.length / chunkSize));
    const batch = {};
    batch[CONFIG.CACHE_PHONES_PREFIX + 'COUNT'] = String(chunkCount);
    for (let i = 0; i < chunkCount; i++) {
      batch[CONFIG.CACHE_PHONES_PREFIX + i] = raw.slice(i * chunkSize, (i + 1) * chunkSize);
    }
    cache.putAll(batch, CONFIG.CACHE_PHONES_TTL_SEC);
  } catch (_) {}

  try {
    const totalInSheet = Array.isArray(syncContacts) ? syncContacts.length : 0;
    let syncedCount = 0;
    for (let i = 0; i < totalInSheet; i++) {
      const p = formatPhoneNumber_(syncContacts[i].noHp);
      if (p && googlePhonesMap[p]) syncedCount++;
    }
    PropertiesService.getScriptProperties().setProperty(
      CONFIG.PROP_LAST_SYNC_STATS,
      JSON.stringify({
        totalInSyncSheet: totalInSheet,
        syncedCount: syncedCount,
        unsyncedCount: Math.max(0, totalInSheet - syncedCount)
      })
    );
  } catch (_) {}
}

function loadCachedGooglePhonesMap_() {
  try {
    const cache = CacheService.getScriptCache();
    const countStr = cache.get(CONFIG.CACHE_PHONES_PREFIX + 'COUNT');
    if (!countStr) return null;
    const chunkCount = Number(countStr);
    if (!chunkCount || chunkCount < 1 || chunkCount > 40) return null;

    const keys = [];
    for (let i = 0; i < chunkCount; i++) {
      keys.push(CONFIG.CACHE_PHONES_PREFIX + i);
    }
    const fetched = cache.getAll(keys);
    let combined = '';
    for (let i = 0; i < keys.length; i++) {
      if (typeof fetched[keys[i]] !== 'string') return null;
      combined += fetched[keys[i]];
    }

    const map = {};
    if (combined) {
      const parts = combined.split(',');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) map[parts[i]] = true;
      }
    }
    return map;
  } catch (_) {
    return null;
  }
}

function buildSyncStatusFromMap_(engine, connected, rateLimited, errorMsg, googlePhonesMap, syncContacts, lastSyncAt, googleCountOverride) {
  const totalInSheet = Array.isArray(syncContacts) ? syncContacts.length : 0;
  let syncedCount = 0;
  const unsyncedPhones = [];
  for (let i = 0; i < totalInSheet; i++) {
    const phone = formatPhoneNumber_(syncContacts[i].noHp);
    if (phone && googlePhonesMap && googlePhonesMap[phone]) {
      syncedCount++;
    } else if (phone) {
      unsyncedPhones.push(phone);
    }
  }

  return {
    engine: engine,
    connected: connected,
    rateLimited: Boolean(rateLimited),
    error: errorMsg || '',
    totalInSyncSheet: totalInSheet,
    syncedCount: syncedCount,
    unsyncedCount: unsyncedPhones.length,
    unsyncedPhones: unsyncedPhones,
    recentSyncedPhones: loadRecentSyncedPhones_(),
    lastSyncAt: lastSyncAt || '',
    serverNowMs: Date.now(),
    quota: getQuotaSummary_(googleCountOverride),
    autoSync: getAutoSyncState_(),
    liveProgress: readLiveSyncProgress_()
  };
}

function inspectGoogleContactsStatus_(syncContacts, forceLiveFetch) {
  const probe = detectGoogleContactsEngine_();
  const props = PropertiesService.getScriptProperties();
  const lastSyncAt = props.getProperty(CONFIG.PROP_LAST_SYNC) || '';
  const totalInSheet = Array.isArray(syncContacts) ? syncContacts.length : 0;

  if (!probe.connected) {
    return {
      engine: probe.engine,
      connected: false,
      rateLimited: false,
      error: probe.error,
      totalInSyncSheet: totalInSheet,
      syncedCount: 0,
      unsyncedCount: totalInSheet,
      unsyncedPhones: (syncContacts || []).map(function (c) { return formatPhoneNumber_(c.noHp); }),
      lastSyncAt: lastSyncAt,
      quota: getQuotaSummary_(),
      autoSync: getAutoSyncState_()
    };
  }

  if (!forceLiveFetch) {
    const cachedMap = loadCachedGooglePhonesMap_();
    if (cachedMap !== null) {
      return buildSyncStatusFromMap_(probe.engine, true, false, '', cachedMap, syncContacts, lastSyncAt);
    }
  }

  const googlePhonesMap = {};
  let googleTotalCount = 0;
  try {
    if (probe.engine === 'PeopleAPI') {
      const list = listAllPeopleContacts_('phoneNumbers');
      googleTotalCount = list.length;
      for (let i = 0; i < list.length; i++) {
        const phones = list[i].phoneNumbers || [];
        for (let j = 0; j < phones.length; j++) {
          const norm = formatPhoneNumber_(phones[j].value);
          if (norm) googlePhonesMap[norm] = true;
        }
      }
    } else {
      const allContacts = ContactsApp.getContacts();
      googleTotalCount = allContacts.length;
      for (let i = 0; i < allContacts.length; i++) {
        const phones = allContacts[i].getPhones();
        for (let j = 0; j < phones.length; j++) {
          const norm = formatPhoneNumber_(phones[j].getPhoneNumber());
          if (norm) googlePhonesMap[norm] = true;
        }
      }
    }
    saveSyncedPhonesCache_(googlePhonesMap, syncContacts);
  } catch (err) {
    const quotaHit = isQuotaError_(err);
    let fallbackSynced = 0;
    let fallbackUnsynced = totalInSheet;
    try {
      const rawStats = props.getProperty(CONFIG.PROP_LAST_SYNC_STATS);
      if (rawStats) {
        const parsedStats = JSON.parse(rawStats);
        if (typeof parsedStats.syncedCount === 'number') {
          fallbackSynced = Math.min(totalInSheet, parsedStats.syncedCount);
          fallbackUnsynced = Math.max(0, totalInSheet - fallbackSynced);
        }
      }
    } catch (_) {}

    return {
      engine: probe.engine,
      connected: quotaHit ? true : false,
      rateLimited: quotaHit,
      error: err.message,
      totalInSyncSheet: totalInSheet,
      syncedCount: fallbackSynced,
      unsyncedCount: fallbackUnsynced,
      unsyncedPhones: [],
      recentSyncedPhones: loadRecentSyncedPhones_(),
      lastSyncAt: lastSyncAt,
      serverNowMs: Date.now(),
      quota: getQuotaSummary_(),
      autoSync: getAutoSyncState_(),
      liveProgress: readLiveSyncProgress_()
    };
  }

  return buildSyncStatusFromMap_(probe.engine, true, false, '', googlePhonesMap, syncContacts, lastSyncAt, googleTotalCount);
}

function listAllPeopleContacts_(personFields) {
  const results = [];
  let pageToken = null;
  let pageCount = 0;
  const fields = personFields || 'names,phoneNumbers,memberships,biographies';
  try {
    do {
      const opts = {
        personFields: fields,
        pageSize: 1000
      };
      if (pageToken) opts.pageToken = pageToken;
      pageCount++;
      const resp = People.People.Connections.list('people/me', opts);
      if (resp && Array.isArray(resp.connections)) {
        for (let i = 0; i < resp.connections.length; i++) {
          results.push(resp.connections[i]);
        }
      }
      pageToken = resp && resp.nextPageToken ? resp.nextPageToken : null;
    } while (pageToken);
    trackQuotaUsage_(pageCount, 0, results.length);
    return results;
  } catch (err) {
    trackQuotaUsage_(Math.max(1, pageCount), 0);
    throw err;
  }
}

function loadPeopleGroupMaps_() {
  const nameToRes = {};
  const resToName = {};
  let pageToken = null;
  let pageCount = 0;
  try {
    do {
      const opts = { pageSize: 1000 };
      if (pageToken) opts.pageToken = pageToken;
      pageCount++;
      const listed = People.ContactGroups.list(opts);
      const groups = listed && Array.isArray(listed.contactGroups) ? listed.contactGroups : [];
      for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (g.name && g.resourceName) {
          nameToRes[g.name] = g.resourceName;
          resToName[g.resourceName] = g.name;
        }
      }
      pageToken = listed && listed.nextPageToken ? listed.nextPageToken : null;
    } while (pageToken);
    trackQuotaUsage_(pageCount, 0);
    return { nameToRes: nameToRes, resToName: resToName };
  } catch (err) {
    trackQuotaUsage_(Math.max(1, pageCount), 0);
    throw err;
  }
}

function getOrCreatePeopleGroupResourceName_(groupTitle, maps) {
  if (maps.nameToRes[groupTitle]) return maps.nameToRes[groupTitle];

  try {
    const created = People.ContactGroups.create({
      contactGroup: { name: groupTitle }
    });
    trackQuotaUsage_(0, 1);
    maps.nameToRes[groupTitle] = created.resourceName;
    maps.resToName[created.resourceName] = groupTitle;
    return created.resourceName;
  } catch (err) {
    trackQuotaUsage_(0, 1);
    throw err;
  }
}

function isLegacyWadahGroupName_(name) {
  if (!name) return false;
  return name === CONFIG.LEGACY_MAIN_GROUP || name.indexOf(CONFIG.LEGACY_GROUP_PREFIX) === 0;
}

function membershipsEqual_(oldMemberships, newMemberships) {
  const oldSet = {};
  const oldKeys = [];
  for (let i = 0; i < (oldMemberships || []).length; i++) {
    const res = oldMemberships[i].contactGroupMembership && oldMemberships[i].contactGroupMembership.contactGroupResourceName;
    if (res && !oldSet[res]) {
      oldSet[res] = true;
      oldKeys.push(res);
    }
  }
  const newSet = {};
  const newKeys = [];
  for (let i = 0; i < (newMemberships || []).length; i++) {
    const res = newMemberships[i].contactGroupMembership && newMemberships[i].contactGroupMembership.contactGroupResourceName;
    if (res && !newSet[res]) {
      newSet[res] = true;
      newKeys.push(res);
    }
  }
  if (oldKeys.length !== newKeys.length) return false;
  for (let i = 0; i < newKeys.length; i++) {
    if (!oldSet[newKeys[i]]) return false;
  }
  return true;
}

/**
 * Membaca seluruh baris dari sheet "Kontak_Sync" lalu menyinkronkan dengan Google Kontak.
 * Hemat kuota & aman untuk 20.000+ kontak:
 * - Auto-sync onChange memakai cooldown 25 detik agar edit beruntun tidak menabrak kuota per menit People API.
 * - Diff-before-write: kontak yang nama/no HP/kategori tidak berubah tidak dikirim ulang (0 write quota).
 * - Batas tulis aman per tahap (maxWrites: 50/70/80 untuk terjadwal, 75 untuk manual) agar tidak terkena limit 90 tulis/menit Google.
 * - Mencatat status Gagal / Sebagian / Bertahap ke sheet History lengkap dengan Alasan dan Solusi.
 */
function syncManualSheetToGoogleContacts_(sourceLabel, skipHistoryIfEmpty, isAutoTrigger, maxWritesOverride) {
  const startTimeMs = Date.now();
  const props = PropertiesService.getScriptProperties();
  const maxWrites = (typeof maxWritesOverride === 'number' && maxWritesOverride > 0)
    ? maxWritesOverride
    : CONFIG.MANUAL_SYNC_SAFE_BATCH;

  if (isAutoTrigger) {
    const lastAutoMs = Number(props.getProperty(CONFIG.PROP_LAST_AUTO_SYNC_MS) || '0');
    if (lastAutoMs && startTimeMs - lastAutoMs < CONFIG.AUTO_SYNC_COOLDOWN_MS) {
      const sheetsFast = getAllSheets_();
      const syncRowsFast = readContactsFromSheet_(sheetsFast.syncSheet);
      return {
        status: 'success',
        skippedCooldown: true,
        message: 'Data sheet diperbarui. Sinkronisasi Google Kontak mengikuti jeda hemat kuota (klik Sinkronkan untuk proses instan).',
        syncedCount: 0,
        deletedCount: 0,
        syncStatus: inspectGoogleContactsStatus_(syncRowsFast, false)
      };
    }
  }

  const sheets = getAllSheets_();
  const categories = readCategories_(sheets.categorySheet);
  const syncRows = readContactsFromSheet_(sheets.syncSheet);

  if (syncRows.length === 0 && skipHistoryIfEmpty) {
    return {
      status: 'success',
      message: 'Sheet Kontak_Sync masih kosong. Tambahkan data atau rumus di Kontak_Sync untuk disinkronkan ke Google Kontak.',
      syncedCount: 0,
      deletedCount: 0,
      syncStatus: inspectGoogleContactsStatus_(syncRows, false)
    };
  }

  const probe = detectGoogleContactsEngine_();
  if (!probe.connected) {
    const failInfo = explainSyncError_(probe.error);
    appendHistory_(
      sheets.historySheet,
      'Sinkron Gagal',
      'Batch (' + syncRows.length + ' kontak)',
      '-',
      'Alasan: ' + failInfo.reason + ' | Solusi: ' + failInfo.solution
    );
    return {
      status: 'error',
      message: 'Google Kontak belum terhubung: ' + probe.error,
      syncedCount: 0,
      deletedCount: 0,
      syncStatus: inspectGoogleContactsStatus_(syncRows, false)
    };
  }

  const managedCategoryMap = {};
  for (let i = 0; i < categories.length; i++) {
    managedCategoryMap[categories[i].nama.toLowerCase()] = true;
  }
  for (let i = 0; i < syncRows.length; i++) {
    const rCat = String(syncRows[i].kategori || '').trim();
    if (rCat) managedCategoryMap[rCat.toLowerCase()] = true;
  }

  const activePhonesMap = {};
  const groupedByPhone = {};
  const groupedSyncList = [];
  for (let i = 0; i < syncRows.length; i++) {
    const row = syncRows[i];
    const p = formatPhoneNumber_(row.noHp);
    if (!p) continue;
    activePhonesMap[p] = true;
    const catObj = resolveOptionalCategory_(categories, row.kategori);
    if (!groupedByPhone[p]) {
      groupedByPhone[p] = {
        cleanPhone: p,
        nama: row.nama,
        jenisKelamin: row.jenisKelamin,
        catObjs: [],
        catSeen: {}
      };
      groupedSyncList.push(groupedByPhone[p]);
    } else if (row.nama && !groupedByPhone[p].nama) {
      groupedByPhone[p].nama = row.nama;
    }
    if (catObj) {
      const ck = catObj.nama.toLowerCase();
      if (!groupedByPhone[p].catSeen[ck]) {
        groupedByPhone[p].catSeen[ck] = true;
        groupedByPhone[p].catObjs.push(catObj);
      }
    }
  }

  const googlePhonesMap = {};
  const newlySyncedPhones = [];
  let googleTotalCount = 0;
  let syncedCount = 0;
  let writtenCount = 0;
  let createdInStage = 0;
  let updatedInStage = 0;
  let unchangedCount = 0;
  let deletedCount = 0;
  let batchLimitReached = false;
  let aborted = false;
  let rateLimited = false;
  let failReason = '';
  let failSolution = '';
  const syncModeLabel = sourceLabel === 'Auto-Sync Terjadwal' ? 'auto' : 'manual';

  // Hitung baris Kontak_Sync per nomor agar kenaikan syncedCount realtime 100% akurat sesuai jumlah baris sheet
  const rowWeightByPhone = {};
  for (let i = 0; i < syncRows.length; i++) {
    const p = formatPhoneNumber_(syncRows[i].noHp);
    if (p) rowWeightByPhone[p] = (rowWeightByPhone[p] || 0) + 1;
  }

  function countSyncedSheetRowsFromMap_() {
    let total = 0;
    for (let i = 0; i < syncRows.length; i++) {
      const p = formatPhoneNumber_(syncRows[i].noHp);
      if (p && googlePhonesMap[p]) total++;
    }
    return total;
  }

  props.setProperty(CONFIG.PROP_LAST_AUTO_SYNC_MS, String(Date.now()));

  writeLiveSyncProgress_({
    active: true,
    mode: syncModeLabel,
    phase: 'reading',
    phaseLabel: 'Membaca daftar Google Kontak...',
    stageTarget: maxWrites,
    stageDone: 0,
    stageCreated: 0,
    stageUpdated: 0,
    totalInSyncSheet: syncRows.length,
    syncedCount: 0,
    unsyncedCount: syncRows.length,
    googleContactsCount: 0,
    startedAtMs: startTimeMs
  });

  if (probe.engine === 'PeopleAPI') {
    let existingPeople = [];
    let groupMaps = { nameToRes: {}, resToName: {} };
    try {
      existingPeople = listAllPeopleContacts_('names,phoneNumbers,memberships,biographies');
      googleTotalCount = existingPeople.length;
      groupMaps = loadPeopleGroupMaps_();
    } catch (readErr) {
      clearLiveSyncProgress_();
      const isQuota = isQuotaError_(readErr);
      const errExplain = explainSyncError_(readErr);
      appendHistory_(
        sheets.historySheet,
        'Sinkron Gagal',
        'Batch (' + formatNumId_(syncRows.length) + ' kontak)',
        '-',
        'Alasan: ' + errExplain.reason + ' | Solusi: ' + errExplain.solution
      );
      return {
        status: 'error',
        rateLimited: isQuota,
        message: isQuota
          ? 'Batas kuota baca per menit Google People API tercapai. Tunggu ±60 detik lalu coba lagi.'
          : 'Gagal membaca Google Kontak: ' + readErr.message,
        syncedCount: 0,
        deletedCount: 0,
        syncStatus: inspectGoogleContactsStatus_(syncRows, false)
      };
    }

    const phoneToPerson = {};
    for (let i = 0; i < existingPeople.length; i++) {
      const pPhones = existingPeople[i].phoneNumbers || [];
      for (let j = 0; j < pPhones.length; j++) {
        const norm = formatPhoneNumber_(pPhones[j].value);
        if (norm) {
          googlePhonesMap[norm] = true;
          if (!phoneToPerson[norm]) {
            phoneToPerson[norm] = existingPeople[i];
          }
        }
      }
    }

    let liveSheetSyncedCount = countSyncedSheetRowsFromMap_();
    saveSyncStatsQuick_(syncRows.length, liveSheetSyncedCount);

    // PASS 1A (PRIORITAS UTAMA: KONTAK BARU / BELUM ADA DI GOOGLE KONTAK)
    // Memastikan kontak baru SELALU diproses lebih dulu dan tidak pernah terblokir oleh antrean update kontak lama!
    const createQueue = [];
    const updateCandidates = [];

    for (let i = 0; i < groupedSyncList.length; i++) {
      if (isSyncAborted_(startTimeMs)) {
        aborted = true;
        break;
      }
      const item = groupedSyncList[i];
      const cleanPhone = item.cleanPhone;
      if (!cleanPhone) continue;

      const existing = phoneToPerson[cleanPhone];
      if (!existing) {
        if (createQueue.length < maxWrites) {
          createQueue.push(item);
        } else {
          batchLimitReached = true;
        }
      } else {
        updateCandidates.push({ item: item, existing: existing });
      }
    }

    // PASS 1B: Jika masih ada slot sisa (createQueue < maxWrites), periksa kontak lama yang benar-benar berubah
    const updateQueue = [];
    const remainingSlots = Math.max(0, maxWrites - createQueue.length);

    if (!aborted) {
      for (let i = 0; i < updateCandidates.length; i++) {
        if (isSyncAborted_(startTimeMs)) {
          aborted = true;
          break;
        }
        const pair = updateCandidates[i];
        const item = pair.item;
        const existing = pair.existing;
        const cleanPhone = item.cleanPhone;

        const catBioLine = item.catObjs.length > 0
          ? item.catObjs.map(function (c) { return c.nama + ' (' + c.kode + ')'; }).join(', ')
          : 'Tanpa Kategori';

        const bioText =
          'Kategori: ' + catBioLine + '\n' +
          'Jenis Kelamin: ' + item.jenisKelamin + '\n' +
          'WA: https://wa.me/' + cleanPhone + '\n' +
          CONFIG.SYNC_MARKER;

        let missingGroup = false;
        const catGroupResources = [];
        for (let cIdx = 0; cIdx < item.catObjs.length; cIdx++) {
          const resName = groupMaps.nameToRes[item.catObjs[cIdx].nama];
          if (!resName) {
            missingGroup = true;
          } else if (catGroupResources.indexOf(resName) === -1) {
            catGroupResources.push(resName);
          }
        }

        const keptMap = {};
        const keptMemberships = [];
        const oldMemberships = existing.memberships || [];
        for (let m = 0; m < oldMemberships.length; m++) {
          const cg = oldMemberships[m].contactGroupMembership;
          if (!cg || !cg.contactGroupResourceName) continue;
          const resName = cg.contactGroupResourceName;
          const gName = groupMaps.resToName[resName] || '';
          const isManaged =
            resName === 'contactGroups/myContacts' ||
            isLegacyWadahGroupName_(gName) ||
            (gName && managedCategoryMap[gName.toLowerCase()]);

          if (!isManaged && !keptMap[resName]) {
            keptMap[resName] = true;
            keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: resName } });
          }
        }
        keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } });
        for (let gIdx = 0; gIdx < catGroupResources.length; gIdx++) {
          const resName = catGroupResources[gIdx];
          if (!keptMap[resName]) {
            keptMap[resName] = true;
            keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: resName } });
          }
        }

        // Perbandingan ternormalisasi (anti-loop update karena Google memformat spasi/strip nomor HP atau memisah displayName)
        const nameObj = (existing.names && existing.names[0]) || {};
        const targetNameTrim = String(item.nama || '').trim();
        const existingGiven = String(nameObj.givenName || '').trim();
        const existingDisplay = String(nameObj.displayName || '').trim();
        const nameMatches = existingGiven === targetNameTrim || existingDisplay === targetNameTrim;

        const existingPhonesArr = existing.phoneNumbers || [];
        const phoneMatches = existingPhonesArr.some(function (ph) {
          return formatPhoneNumber_(ph.value) === cleanPhone;
        });

        const existingBioVal = String((existing.biographies && existing.biographies[0] && existing.biographies[0].value) || '').trim();
        const bioMatches = existingBioVal === bioText.trim();
        const groupsMatch = !missingGroup && membershipsEqual_(oldMemberships, keptMemberships);

        const needsUpdate = !nameMatches || !phoneMatches || !bioMatches || !groupsMatch;

        if (!needsUpdate) {
          syncedCount++;
          unchangedCount++;
          continue;
        }

        if (updateQueue.length >= remainingSlots) {
          batchLimitReached = true;
          break;
        }

        updateQueue.push({
          item: item,
          existing: existing,
          bioText: bioText
        });
      }
    }

    const totalStageTarget = createQueue.length + updateQueue.length;

    writeLiveSyncProgress_({
      active: true,
      mode: syncModeLabel,
      phase: totalStageTarget > 0 ? 'creating' : 'finishing',
      phaseLabel: totalStageTarget > 0
        ? 'Menyiapkan ' + formatNumId_(totalStageTarget) + ' kontak untuk tahap ini...'
        : 'Memverifikasi status akhir...',
      stageTarget: totalStageTarget,
      stageDone: 0,
      stageCreated: 0,
      stageUpdated: 0,
      totalInSyncSheet: syncRows.length,
      syncedCount: liveSheetSyncedCount,
      unsyncedCount: Math.max(0, syncRows.length - liveSheetSyncedCount),
      googleContactsCount: googleTotalCount,
      startedAtMs: startTimeMs
    });

    // PASS 2: Pastikan semua label kategori yang dibutuhkan oleh antrean tahap ini tersedia di Google Kontak
    if (!failReason && !aborted && totalStageTarget > 0) {
      const neededCatsMap = {};
      const neededCats = [];
      for (let i = 0; i < createQueue.length; i++) {
        for (let c = 0; c < createQueue[i].catObjs.length; c++) {
          const nm = createQueue[i].catObjs[c].nama;
          if (nm && !groupMaps.nameToRes[nm] && !neededCatsMap[nm]) {
            neededCatsMap[nm] = true;
            neededCats.push(nm);
          }
        }
      }
      for (let i = 0; i < updateQueue.length; i++) {
        for (let c = 0; c < updateQueue[i].item.catObjs.length; c++) {
          const nm = updateQueue[i].item.catObjs[c].nama;
          if (nm && !groupMaps.nameToRes[nm] && !neededCatsMap[nm]) {
            neededCatsMap[nm] = true;
            neededCats.push(nm);
          }
        }
      }
      for (let i = 0; i < neededCats.length; i++) {
        if (isSyncAborted_(startTimeMs)) {
          aborted = true;
          break;
        }
        try {
          getOrCreatePeopleGroupResourceName_(neededCats[i], groupMaps);
        } catch (grpErr) {
          const errInfo = explainSyncError_(grpErr);
          rateLimited = isQuotaError_(grpErr);
          failReason = errInfo.reason;
          failSolution = errInfo.solution;
          break;
        }
      }
    }

    // PASS 3: Buat kontak baru memakai People.People.batchCreateContacts (20 kontak/chunk -> update progres realtime tiap ~1-2 detik!)
    if (!failReason && !aborted && createQueue.length > 0) {
      const chunkSize = CONFIG.BATCH_CREATE_CHUNK_SIZE || 20;
      const supportsBatchCreate = Boolean(People.People && typeof People.People.batchCreateContacts === 'function');

      for (let offset = 0; offset < createQueue.length; offset += chunkSize) {
        if (isSyncAborted_(startTimeMs)) {
          aborted = true;
          break;
        }
        if (Date.now() - startTimeMs >= CONFIG.MAX_EXECUTION_MS) {
          batchLimitReached = true;
          break;
        }

        const slice = createQueue.slice(offset, offset + chunkSize);
        const batchEntries = [];

        for (let s = 0; s < slice.length; s++) {
          const item = slice[s];
          const cleanPhone = item.cleanPhone;
          const catBioLine = item.catObjs.length > 0
            ? item.catObjs.map(function (c) { return c.nama + ' (' + c.kode + ')'; }).join(', ')
            : 'Tanpa Kategori';
          const bioText =
            'Kategori: ' + catBioLine + '\n' +
            'Jenis Kelamin: ' + item.jenisKelamin + '\n' +
            'WA: https://wa.me/' + cleanPhone + '\n' +
            CONFIG.SYNC_MARKER;

          const desiredMemberships = [
            { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } }
          ];
          const addedRes = {};
          for (let gIdx = 0; gIdx < item.catObjs.length; gIdx++) {
            const rName = groupMaps.nameToRes[item.catObjs[gIdx].nama];
            if (rName && !addedRes[rName]) {
              addedRes[rName] = true;
              desiredMemberships.push({
                contactGroupMembership: { contactGroupResourceName: rName }
              });
            }
          }

          batchEntries.push({
            cleanPhone: cleanPhone,
            contactPerson: {
              names: [{ givenName: item.nama }],
              phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }],
              biographies: [{ value: bioText, contentType: 'TEXT_PLAIN' }],
              memberships: desiredMemberships
            }
          });
        }

        let batchSucceeded = false;
        if (supportsBatchCreate) {
          try {
            const resp = People.People.batchCreateContacts({
              contacts: batchEntries.map(function (entry) {
                return { contactPerson: entry.contactPerson };
              }),
              readMask: 'phoneNumbers'
            });
            trackQuotaUsage_(0, batchEntries.length);
            const createdList = resp && Array.isArray(resp.createdPeople) ? resp.createdPeople : [];
            if (createdList.length > 0) {
              for (let k = 0; k < batchEntries.length; k++) {
                const cp = createdList[k];
                const ok = !cp || !cp.httpStatusCode || (cp.httpStatusCode >= 200 && cp.httpStatusCode < 300);
                if (ok) {
                  const p = batchEntries[k].cleanPhone;
                  if (!googlePhonesMap[p]) {
                    liveSheetSyncedCount += (rowWeightByPhone[p] || 1);
                  }
                  googleTotalCount++;
                  googlePhonesMap[p] = true;
                  newlySyncedPhones.push(p);
                  syncedCount++;
                  writtenCount++;
                  createdInStage++;
                }
              }
            } else {
              for (let k = 0; k < batchEntries.length; k++) {
                const p = batchEntries[k].cleanPhone;
                if (!googlePhonesMap[p]) {
                  liveSheetSyncedCount += (rowWeightByPhone[p] || 1);
                }
                googleTotalCount++;
                googlePhonesMap[p] = true;
                newlySyncedPhones.push(p);
                syncedCount++;
                writtenCount++;
                createdInStage++;
              }
            }
            batchSucceeded = true;
          } catch (batchErr) {
            if (isQuotaError_(batchErr)) {
              trackQuotaUsage_(0, batchEntries.length);
              const errInfo = explainSyncError_(batchErr);
              rateLimited = true;
              failReason = errInfo.reason;
              failSolution = errInfo.solution;
              break;
            }
            batchSucceeded = false;
          }
        }

        if (!batchSucceeded && !failReason) {
          for (let k = 0; k < batchEntries.length; k++) {
            if (isSyncAborted_(startTimeMs)) {
              aborted = true;
              break;
            }
            try {
              People.People.createContact(batchEntries[k].contactPerson);
              trackQuotaUsage_(0, 1);
              const p = batchEntries[k].cleanPhone;
              if (!googlePhonesMap[p]) {
                liveSheetSyncedCount += (rowWeightByPhone[p] || 1);
              }
              googleTotalCount++;
              googlePhonesMap[p] = true;
              newlySyncedPhones.push(p);
              syncedCount++;
              writtenCount++;
              createdInStage++;
            } catch (createErr) {
              trackQuotaUsage_(0, 1);
              const errInfo = explainSyncError_(createErr);
              rateLimited = isQuotaError_(createErr);
              failReason = errInfo.reason;
              failSolution = errInfo.solution;
              break;
            }
          }
        }

        // Update progres REALTIME setelah setiap chunk selesai (langsung terlihat di UI!)
        saveSyncStatsQuick_(syncRows.length, liveSheetSyncedCount);
        writeLiveSyncProgress_({
          active: true,
          mode: syncModeLabel,
          phase: 'creating',
          phaseLabel: 'Menyinkronkan kontak baru: ' + formatNumId_(writtenCount) + ' / ' + formatNumId_(totalStageTarget),
          stageTarget: totalStageTarget,
          stageDone: writtenCount,
          stageCreated: createdInStage,
          stageUpdated: updatedInStage,
          totalInSyncSheet: syncRows.length,
          syncedCount: Math.min(syncRows.length, liveSheetSyncedCount),
          unsyncedCount: Math.max(0, syncRows.length - liveSheetSyncedCount),
          googleContactsCount: googleTotalCount,
          startedAtMs: startTimeMs
        });

        if (failReason || aborted) break;
      }
    }

    // PASS 4: Perbarui kontak yang datanya benar-benar berubah (hanya jika ada sisa slot)
    if (!failReason && !aborted && updateQueue.length > 0) {
      for (let u = 0; u < updateQueue.length; u++) {
        if (isSyncAborted_(startTimeMs)) {
          aborted = true;
          break;
        }
        if (Date.now() - startTimeMs >= CONFIG.MAX_EXECUTION_MS) {
          batchLimitReached = true;
          break;
        }

        const entry = updateQueue[u];
        const item = entry.item;
        const existing = entry.existing;
        const cleanPhone = item.cleanPhone;

        const keptMap = {};
        const keptMemberships = [];
        const oldMemberships = existing.memberships || [];
        for (let m = 0; m < oldMemberships.length; m++) {
          const cg = oldMemberships[m].contactGroupMembership;
          if (!cg || !cg.contactGroupResourceName) continue;
          const resName = cg.contactGroupResourceName;
          const gName = groupMaps.resToName[resName] || '';
          const isManaged =
            resName === 'contactGroups/myContacts' ||
            isLegacyWadahGroupName_(gName) ||
            (gName && managedCategoryMap[gName.toLowerCase()]);

          if (!isManaged && !keptMap[resName]) {
            keptMap[resName] = true;
            keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: resName } });
          }
        }
        keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } });
        for (let gIdx = 0; gIdx < item.catObjs.length; gIdx++) {
          const rName = groupMaps.nameToRes[item.catObjs[gIdx].nama];
          if (rName && !keptMap[rName]) {
            keptMap[rName] = true;
            keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: rName } });
          }
        }

        try {
          People.People.updateContact(
            {
              etag: existing.etag,
              names: [{ givenName: item.nama }],
              phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }],
              biographies: [{ value: entry.bioText, contentType: 'TEXT_PLAIN' }],
              memberships: keptMemberships
            },
            existing.resourceName,
            { updatePersonFields: 'names,phoneNumbers,biographies,memberships' }
          );
          trackQuotaUsage_(0, 1);
          googlePhonesMap[cleanPhone] = true;
          newlySyncedPhones.push(cleanPhone);
          syncedCount++;
          writtenCount++;
          updatedInStage++;

          if (updatedInStage % 5 === 0 || u === updateQueue.length - 1) {
            writeLiveSyncProgress_({
              active: true,
              mode: syncModeLabel,
              phase: 'updating',
              phaseLabel: 'Memperbarui kontak: ' + formatNumId_(writtenCount) + ' / ' + formatNumId_(totalStageTarget),
              stageTarget: totalStageTarget,
              stageDone: writtenCount,
              stageCreated: createdInStage,
              stageUpdated: updatedInStage,
              totalInSyncSheet: syncRows.length,
              syncedCount: Math.min(syncRows.length, liveSheetSyncedCount),
              unsyncedCount: Math.max(0, syncRows.length - liveSheetSyncedCount),
              googleContactsCount: googleTotalCount,
              startedAtMs: startTimeMs
            });
          }
        } catch (updErr) {
          trackQuotaUsage_(0, 1);
          const errInfo = explainSyncError_(updErr);
          rateLimited = isQuotaError_(updErr);
          failReason = errInfo.reason;
          failSolution = errInfo.solution;
          break;
        }
      }
    }

    // Hapus kontak yang dikelola MR Wadah Digital HANYA jika seluruh antrean selesai (bukan tahap parsial / aborted)
    if (!failReason && !batchLimitReached && !aborted) {
      for (let i = 0; i < existingPeople.length; i++) {
        if (Date.now() - startTimeMs >= CONFIG.MAX_EXECUTION_MS) break;
        const person = existingPeople[i];
        const bios = person.biographies || [];
        const hasMarker = bios.some(function (b) {
          return b.value && b.value.indexOf(CONFIG.SYNC_MARKER) !== -1;
        });
        const memberships = person.memberships || [];
        const inLegacyGroup = memberships.some(function (m) {
          const resName = m.contactGroupMembership && m.contactGroupMembership.contactGroupResourceName;
          const gName = resName ? groupMaps.resToName[resName] || '' : '';
          return isLegacyWadahGroupName_(gName);
        });
        if (!hasMarker && !inLegacyGroup) continue;

        const pPhones = person.phoneNumbers || [];
        const stillInSheet = pPhones.some(function (p) {
          const norm = formatPhoneNumber_(p.value);
          return norm && activePhonesMap[norm];
        });
        if (!stillInSheet) {
          try {
            People.People.deleteContact(person.resourceName);
            trackQuotaUsage_(0, 1);
            googleTotalCount = Math.max(0, googleTotalCount - 1);
            for (let j = 0; j < pPhones.length; j++) {
              const delNorm = formatPhoneNumber_(pPhones[j].value);
              if (delNorm) delete googlePhonesMap[delNorm];
            }
            deletedCount++;
          } catch (delErr) {
            trackQuotaUsage_(0, 1);
            const errInfo = explainSyncError_(delErr);
            rateLimited = isQuotaError_(delErr);
            failReason = errInfo.reason;
            failSolution = errInfo.solution;
            break;
          }
        }
      }

      if (!failReason) {
        const allGroupNames = Object.keys(groupMaps.nameToRes);
        for (let i = 0; i < allGroupNames.length; i++) {
          const gName = allGroupNames[i];
          if (isLegacyWadahGroupName_(gName)) {
            try {
              People.ContactGroups.remove(groupMaps.nameToRes[gName], { deleteContacts: false });
              trackQuotaUsage_(0, 1);
            } catch (_) {}
          }
        }
      }
    }
  } else {
    // Fallback ContactsApp
    try {
      const myContactsGroup = ContactsApp.getContactGroup('System Group: My Contacts');
      const allExisting = ContactsApp.getContacts();
      googleTotalCount = allExisting.length;
      const phoneToContact = {};
      for (let i = 0; i < allExisting.length; i++) {
        const phones = allExisting[i].getPhones();
        for (let j = 0; j < phones.length; j++) {
          const norm = formatPhoneNumber_(phones[j].getPhoneNumber());
          if (norm) {
            googlePhonesMap[norm] = true;
            if (!phoneToContact[norm]) phoneToContact[norm] = allExisting[i];
          }
        }
      }

      for (let i = 0; i < groupedSyncList.length; i++) {
        if (Date.now() - startTimeMs >= CONFIG.MAX_EXECUTION_MS) {
          failReason = 'Batas waktu eksekusi Apps Script tercapai setelah memeriksa ' + formatNumId_(syncedCount) + ' kontak';
          failSolution = 'Klik Sinkronkan lagi untuk melanjutkan sisa kontak.';
          break;
        }
        const item = groupedSyncList[i];
        const cleanPhone = item.cleanPhone;
        if (!cleanPhone) continue;

        const desiredGroupSet = {};
        for (let cIdx = 0; cIdx < item.catObjs.length; cIdx++) {
          desiredGroupSet[item.catObjs[cIdx].nama.toLowerCase()] = item.catObjs[cIdx].nama;
        }
        const formattedPhone = '+' + cleanPhone;
        let contact = phoneToContact[cleanPhone] || null;

        if (!contact) {
          if (writtenCount >= maxWrites) {
            batchLimitReached = true;
            break;
          }
          contact = ContactsApp.createContact(item.nama, '', '');
          contact.addPhone(ContactsApp.Field.MOBILE_PHONE, formattedPhone);
          googleTotalCount++;
          writtenCount++;
          createdInStage++;
        } else {
          if (contact.getFullName() !== item.nama) {
            if (writtenCount >= maxWrites) {
              batchLimitReached = true;
              break;
            }
            contact.setFullName(item.nama);
            writtenCount++;
            updatedInStage++;
          }
          const phones = contact.getPhones();
          if (phones.length === 0) {
            contact.addPhone(ContactsApp.Field.MOBILE_PHONE, formattedPhone);
          }
        }

        if (myContactsGroup) myContactsGroup.addContact(contact);

        const existingGroups = contact.getContactGroups();
        for (let g = 0; g < existingGroups.length; g++) {
          const gName = existingGroups[g].getName();
          const isOldManaged =
            isLegacyWadahGroupName_(gName) ||
            (gName && managedCategoryMap[gName.toLowerCase()] && !desiredGroupSet[gName.toLowerCase()]);
          if (isOldManaged) {
            existingGroups[g].removeContact(contact);
          }
        }
        for (let cIdx = 0; cIdx < item.catObjs.length; cIdx++) {
          getOrCreateContactsAppGroup_(item.catObjs[cIdx].nama).addContact(contact);
        }

        const catBioLine = item.catObjs.length > 0
          ? item.catObjs.map(function (c) { return c.nama + ' (' + c.kode + ')'; }).join(', ')
          : 'Tanpa Kategori';

        contact.setNotes(
          'Kategori: ' + catBioLine + '\n' +
          'Jenis Kelamin: ' + item.jenisKelamin + '\n' +
          'WA: https://wa.me/' + cleanPhone + '\n' +
          CONFIG.SYNC_MARKER
        );
        googlePhonesMap[cleanPhone] = true;
        newlySyncedPhones.push(cleanPhone);
        syncedCount++;
      }

      if (!failReason && !batchLimitReached) {
        for (let i = 0; i < allExisting.length; i++) {
          const c = allExisting[i];
          const notes = c.getNotes ? String(c.getNotes() || '') : '';
          if (notes.indexOf(CONFIG.SYNC_MARKER) === -1) continue;
          const phones = c.getPhones();
          const stillInSheet = phones.some(function (p) {
            const norm = formatPhoneNumber_(p.getPhoneNumber());
            return norm && activePhonesMap[norm];
          });
          if (!stillInSheet) {
            ContactsApp.deleteContact(c);
            googleTotalCount = Math.max(0, googleTotalCount - 1);
            for (let j = 0; j < phones.length; j++) {
              const delNorm = formatPhoneNumber_(phones[j].getPhoneNumber());
              if (delNorm) delete googlePhonesMap[delNorm];
            }
            deletedCount++;
          }
        }
      }
    } catch (caErr) {
      const errInfo = explainSyncError_(caErr);
      failReason = errInfo.reason;
      failSolution = errInfo.solution;
    }
  }

  clearLiveSyncProgress_();
  trackQuotaUsage_(0, 0, googleTotalCount);
  saveSyncedPhonesCache_(googlePhonesMap, syncRows);
  saveRecentSyncedPhones_(newlySyncedPhones);

  const prevLastSync = props.getProperty(CONFIG.PROP_LAST_SYNC) || '';
  const hasProgress = !failReason || writtenCount > 0 || deletedCount > 0 || syncedCount > 0;
  const syncTimestamp = hasProgress ? nowFormatted_() : prevLastSync;
  if (hasProgress) {
    props.setProperty(CONFIG.PROP_LAST_SYNC, syncTimestamp);
  }

  // Simpan hash MD5 HANYA jika 100% antrean selesai tanpa error agar Mode Hemat aktif pada jadwal berikutnya
  if (!failReason && !batchLimitReached && !aborted) {
    const doneHash = computeSyncSheetHash_(syncRows);
    if (doneHash) {
      props.setProperty(CONFIG.PROP_LAST_SYNCED_SHEET_HASH, doneHash);
    }
  } else {
    clearSyncedSheetHash_();
  }

  const finalSyncStatus = buildSyncStatusFromMap_(
    probe.engine,
    true,
    rateLimited,
    failReason ? failReason + ' — Solusi: ' + failSolution : '',
    googlePhonesMap,
    syncRows,
    syncTimestamp,
    googleTotalCount
  );

  saveAutoSyncConfig_({
    remainingEstimate: finalSyncStatus.unsyncedCount,
    lastStageAdded: writtenCount
  });

  if (aborted) {
    return {
      status: 'success',
      aborted: true,
      rateLimited: false,
      batchLimitReached: true,
      remainingCount: finalSyncStatus.unsyncedCount,
      message: 'Sinkronisasi dihentikan sesuai permintaan (+' + formatNumId_(writtenCount) + ' kontak sempat tersimpan).',
      syncedCount: syncedCount,
      writtenCount: writtenCount,
      createdInStage: createdInStage,
      updatedInStage: updatedInStage,
      unchangedCount: unchangedCount,
      deletedCount: deletedCount,
      lastSyncAt: syncTimestamp,
      syncStatus: finalSyncStatus
    };
  }

  if (failReason) {
    const historyAction = writtenCount > 0 || deletedCount > 0 ? 'Sinkron Sebagian' : 'Sinkron Gagal';
    appendHistory_(
      sheets.historySheet,
      historyAction,
      'Batch (' + formatNumId_(syncRows.length) + ' kontak)',
      '-',
      'Engine: ' + probe.engine + ' · Berhasil tahap ini: +' + formatNumId_(writtenCount) + ' | Alasan: ' + failReason + ' | Solusi: ' + failSolution
    );

    return {
      status: writtenCount > 0 || deletedCount > 0 ? 'success' : 'error',
      aborted: false,
      rateLimited: rateLimited,
      batchLimitReached: batchLimitReached,
      remainingCount: finalSyncStatus.unsyncedCount,
      message: failReason + '. ' + failSolution,
      syncedCount: syncedCount,
      writtenCount: writtenCount,
      createdInStage: createdInStage,
      updatedInStage: updatedInStage,
      unchangedCount: unchangedCount,
      deletedCount: deletedCount,
      lastSyncAt: syncTimestamp,
      syncStatus: finalSyncStatus
    };
  }

  if (batchLimitReached) {
    const remainingCount = finalSyncStatus.unsyncedCount;
    const stageAction = sourceLabel === 'Auto-Sync Terjadwal' ? 'Auto-Sync Bertahap' : 'Sinkron Bertahap';
    appendHistory_(
      sheets.historySheet,
      stageAction,
      'Batch (' + formatNumId_(syncRows.length) + ' kontak)',
      '-',
      'Berhasil: +' + formatNumId_(writtenCount) + ' (' + formatNumId_(createdInStage) + ' baru, ' + formatNumId_(updatedInStage) + ' ubah) · Tersinkron: ' + formatNumId_(finalSyncStatus.syncedCount) + '/' + formatNumId_(syncRows.length) + ' · Sisa: ' + formatNumId_(remainingCount)
    );

    return {
      status: 'success',
      aborted: false,
      rateLimited: false,
      batchLimitReached: true,
      remainingCount: remainingCount,
      message: 'Tahap selesai: +' + formatNumId_(writtenCount) + ' kontak tersinkron (' + formatNumId_(createdInStage) + ' baru, ' + formatNumId_(updatedInStage) + ' ubah). Total: ' + formatNumId_(finalSyncStatus.syncedCount) + ' / ' + formatNumId_(syncRows.length) + ' (sisa ' + formatNumId_(remainingCount) + ').',
      syncedCount: syncedCount,
      writtenCount: writtenCount,
      createdInStage: createdInStage,
      updatedInStage: updatedInStage,
      unchangedCount: unchangedCount,
      deletedCount: deletedCount,
      lastSyncAt: syncTimestamp,
      syncStatus: finalSyncStatus
    };
  }

  appendHistory_(
    sheets.historySheet,
    sourceLabel || 'Sinkron Kontak_Sync',
    'Batch (' + formatNumId_(syncRows.length) + ' kontak)',
    '-',
    'Selesai 100% · Baru/Ubah: +' + formatNumId_(writtenCount) + ' · Dihapus: ' + formatNumId_(deletedCount) + ' · Total: ' + formatNumId_(finalSyncStatus.syncedCount) + '/' + formatNumId_(syncRows.length)
  );

  return {
    status: 'success',
    aborted: false,
    rateLimited: false,
    batchLimitReached: false,
    remainingCount: finalSyncStatus.unsyncedCount,
    message: 'Sinkronisasi Google Kontak selesai 100%. Tersinkron: ' + formatNumId_(finalSyncStatus.syncedCount) + ' / ' + formatNumId_(syncRows.length) + ' (+' + formatNumId_(writtenCount) + ' baru/ubah).',
    syncedCount: syncedCount,
    writtenCount: writtenCount,
    createdInStage: createdInStage,
    updatedInStage: updatedInStage,
    unchangedCount: unchangedCount,
    deletedCount: deletedCount,
    lastSyncAt: syncTimestamp,
    syncStatus: finalSyncStatus
  };
}

function getOrCreateContactsAppGroup_(groupName) {
  let group = ContactsApp.getContactGroup(groupName);
  if (!group) {
    group = ContactsApp.createContactGroup(groupName);
  }
  return group;
}

function findContactsAppByPhone_(cleanTarget) {
  const localFormat = cleanTarget.startsWith('62') ? '0' + cleanTarget.slice(2) : cleanTarget;
  const candidates = ['+' + cleanTarget, cleanTarget, localFormat];
  for (let i = 0; i < candidates.length; i++) {
    const matches = ContactsApp.getContactsByPhone(candidates[i]);
    if (matches && matches.length > 0) return matches[0];
  }
  const all = ContactsApp.getContacts();
  for (let i = 0; i < all.length; i++) {
    const phones = all[i].getPhones();
    for (let j = 0; j < phones.length; j++) {
      if (formatPhoneNumber_(phones[j].getPhoneNumber()) === cleanTarget) return all[i];
    }
  }
  return null;
}
