/**
 * Wadah Digital - Contact Sync & Management
 * Backend Google Apps Script (Code.gs)
 *
 * Arsitektur 4 Sheet:
 * 1. "Kontak"      -> [Nama, No HP, Kategori, Jenis Kelamin] (Database utama hasil input aplikasi)
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
  CONTACT_HEADERS: ['Nama', 'No HP', 'Kategori', 'Jenis Kelamin'],
  CATEGORY_HEADERS: ['Nama Kategori', 'Kode'],
  HISTORY_HEADERS: ['Waktu', 'Action', 'Nama', 'No HP', 'Detail'],
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
  PROP_LAST_SYNC: 'LAST_GOOGLE_SYNC_AT',
  PROP_LAST_AUTO_SYNC_MS: 'LAST_AUTO_SYNC_MS',
  PROP_LAST_SYNC_STATS: 'LAST_GOOGLE_SYNC_STATS',
  PROP_QUOTA_STATE: 'PEOPLE_API_QUOTA_STATE_V1',
  CACHE_PHONES_PREFIX: 'SYNC_PHONES_V1_',
  CACHE_PHONES_TTL_SEC: 300,
  AUTO_SYNC_COOLDOWN_MS: 25000,
  MAX_EXECUTION_MS: 270000,
  QUOTA_MINUTE_READS_LIMIT: 90,
  QUOTA_MINUTE_WRITES_LIMIT: 90,
  QUOTA_DAILY_LIMIT: 20000,
  GOOGLE_CONTACTS_MAX: 25000
};

/**
 * WAJIB DIJALANKAN PERTAMA KALI:
 * Membuat/memverifikasi sheet Kontak, Kontak_Sync, Kategori, dan History
 * pada Spreadsheet aktif, serta memasang trigger sinkronisasi otomatis.
 */
function setupdatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const contactSheet = ensureSheetWithHeaders_(
    ss,
    CONFIG.CONTACTS_SHEET,
    CONFIG.CONTACT_HEADERS,
    '#0A2463',
    [220, 175, 160, 140],
    2
  );

  const syncSheet = ensureSheetWithHeaders_(
    ss,
    CONFIG.SYNC_SHEET,
    CONFIG.CONTACT_HEADERS,
    '#0284C7',
    [220, 175, 160, 140],
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
          .setFontColor('#FFFFFF');
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
      .addItem('Sinkronkan Kontak_Sync ke Google Kontak', 'runManualSyncMenu')
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
 * Trigger otomatis saat sheet Kontak_Sync diubah manual di Google Sheets.
 */
function onSpreadsheetChangeTrigger(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = e && e.source ? e.source.getActiveSheet() : ss.getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== CONFIG.SYNC_SHEET) return;

    syncManualSheetToGoogleContacts_('Auto-Sync Kontak_Sync', true, true);
  } catch (_) {
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
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
    ensureSheetWithHeaders_(ss, CONFIG.CONTACTS_SHEET, CONFIG.CONTACT_HEADERS, '#0A2463', [220, 175, 160, 140], 2);
    ensureSheetWithHeaders_(ss, CONFIG.SYNC_SHEET, CONFIG.CONTACT_HEADERS, '#0284C7', [220, 175, 160, 140], 2);
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

function nowFormatted_() {
  const tz = Session.getScriptTimeZone() || 'Asia/Makassar';
  const now = new Date();
  const dd = Utilities.formatDate(now, tz, 'dd');
  const monthIdx = Number(Utilities.formatDate(now, tz, 'M')) - 1;
  const yyyy = Utilities.formatDate(now, tz, 'yyyy');
  const time = Utilities.formatDate(now, tz, 'HH:mm:ss');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return dd + ' ' + (months[monthIdx] || 'Jan') + ' ' + yyyy + ' ' + time;
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

function readContactsFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const contacts = [];
  if (lastRow <= 1) return contacts;

  const colCount = Math.min(Math.max(sheet.getLastColumn(), 3), 4);
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const nama = String(values[i][0] || '').trim();
    const rawNoHp = String(values[i][1] || '').trim();
    const kategori = String(values[i][2] || '').trim(); // Opsional (boleh kosong / tanpa kategori)
    const jenisKelamin = colCount >= 4 && values[i][3] ? normalizeGender_(values[i][3]) : 'Laki-laki';
    const cleanPhone = formatPhoneNumber_(rawNoHp);

    if (!nama && !cleanPhone) continue;

    contacts.push({
      nama: nama,
      noHp: cleanPhone || rawNoHp,
      kategori: kategori,
      jenisKelamin: jenisKelamin
    });
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
    const contacts = readContactsFromSheet_(sheets.contactSheet);
    const syncContacts = readContactsFromSheet_(sheets.syncSheet);
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
 * Endpoint POST: Menangani save, delete, saveCategories, syncManual.
 * CATATAN: save dan delete HANYA menulis ke sheet "Kontak" (tidak menimpa sheet "Kontak_Sync" milik user).
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ status: 'error', message: 'Payload permintaan tidak ditemukan.' });
    }

    const payload = JSON.parse(e.postData.contents);
    const action = String(payload.action || '').toLowerCase();

    if (action === 'setupdatabase' || action === 'setup') {
      return jsonResponse_(setupdatabase());
    }
    if (action === 'save') {
      return handleSaveContact_(payload);
    }
    if (action === 'delete') {
      return handleDeleteContact_(payload);
    }
    if (action === 'savecategories') {
      return handleSaveCategories_(payload);
    }
    if (action === 'syncmanual' || action === 'synckontaksync') {
      return jsonResponse_(syncManualSheetToGoogleContacts_('Sinkron Kontak_Sync -> Google Kontak'));
    }

    return jsonResponse_({ status: 'error', message: 'Aksi tidak dikenali.' });
  } catch (err) {
    return jsonResponse_({ status: 'error', message: 'Kesalahan server: ' + err.message });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function upsertRowInSheet_(sheet, nama, cleanPhone, kategori, jenisKelamin, cleanOrig, allowDuplicate) {
  const lastRow = sheet.getLastRow();
  let matchedRow = -1;
  let duplicateTargetRow = -1;

  if (!allowDuplicate && lastRow > 1) {
    const existingPhones = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < existingPhones.length; i++) {
      const rowNorm = formatPhoneNumber_(existingPhones[i][0]);
      if (!rowNorm) continue;
      if (cleanOrig && rowNorm === cleanOrig) matchedRow = i + 2;
      if (rowNorm === cleanPhone) duplicateTargetRow = i + 2;
    }
  }

  let operationType = 'created';
  if (!allowDuplicate && matchedRow !== -1 && duplicateTargetRow !== -1 && matchedRow !== duplicateTargetRow) {
    sheet.getRange(duplicateTargetRow, 1, 1, 4).setValues([[nama, cleanPhone, kategori, jenisKelamin]]);
    sheet.getRange(duplicateTargetRow, 2).setNumberFormat('@');
    sheet.deleteRow(matchedRow);
    operationType = 'updated';
  } else if (!allowDuplicate && matchedRow !== -1) {
    sheet.getRange(matchedRow, 1, 1, 4).setValues([[nama, cleanPhone, kategori, jenisKelamin]]);
    sheet.getRange(matchedRow, 2).setNumberFormat('@');
    operationType = 'updated';
  } else if (!allowDuplicate && duplicateTargetRow !== -1) {
    sheet.getRange(duplicateTargetRow, 1, 1, 4).setValues([[nama, cleanPhone, kategori, jenisKelamin]]);
    sheet.getRange(duplicateTargetRow, 2).setNumberFormat('@');
    operationType = 'updated';
  } else {
    const nextRow = lastRow + 1;
    sheet.getRange(nextRow, 1, 1, 4).setValues([[nama, cleanPhone, kategori, jenisKelamin]]);
    sheet.getRange(nextRow, 2).setNumberFormat('@');
    operationType = 'created';
  }

  return operationType;
}

function deleteRowsByPhone_(sheet, cleanTarget) {
  const lastRow = sheet.getLastRow();
  let deletedName = '';
  let deleted = false;
  if (lastRow <= 1) return { deleted: false, nama: '' };

  const values = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (formatPhoneNumber_(values[i][1]) === cleanTarget) {
      if (!deletedName) deletedName = String(values[i][0] || '').trim();
      sheet.deleteRow(i + 2);
      deleted = true;
    }
  }
  return { deleted: deleted, nama: deletedName };
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

/**
 * Simpan/Update kontak di sheet "Kontak" SAJA (tidak mengubah rumus/isi manual di "Kontak_Sync").
 * Lalu memicu pembacaan "Kontak_Sync" untuk menyinkronkan ke Google Kontak.
 */
function handleSaveContact_(payload) {
  const sheets = getAllSheets_();
  const categories = readCategories_(sheets.categorySheet);

  const nama = String(payload.nama || '').trim();
  const cleanPhone = formatPhoneNumber_(payload.noHp);
  const cleanOrig = formatPhoneNumber_(payload.originalNoHp);
  const allowDuplicate = Boolean(payload.allowDuplicate);
  const catObj = resolveOptionalCategory_(categories, payload.kategori);
  const categoryName = catObj ? catObj.nama : '';
  const jenisKelamin = normalizeGender_(payload.jenisKelamin);

  if (!nama) {
    return jsonResponse_({ status: 'error', message: 'Nama kontak wajib diisi.' });
  }
  if (!cleanPhone || cleanPhone.length < 8) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP tidak valid (minimal 8 digit).' });
  }

  const operationType = upsertRowInSheet_(
    sheets.contactSheet,
    nama,
    cleanPhone,
    categoryName,
    jenisKelamin,
    cleanOrig,
    allowDuplicate
  );

  appendHistory_(
    sheets.historySheet,
    operationType === 'created' ? 'Tambah Kontak' : 'Edit Kontak',
    nama,
    cleanPhone,
    'Kategori: ' + (catObj ? catObj.nama + ' (' + catObj.kode + ')' : 'Tanpa Kategori') + ' · Gender: ' + jenisKelamin
  );

  // Hitung ulang sheet (termasuk rumus di Kontak_Sync) lalu sinkronkan (dengan jeda cooldown agar hemat kuota)
  SpreadsheetApp.flush();
  const syncSummary = syncManualSheetToGoogleContacts_('Auto-Sync Pasca Simpan Kontak', true, true);

  return jsonResponse_({
    status: 'success',
    operation: operationType,
    message: operationType === 'created'
      ? 'Kontak baru berhasil disimpan ke sheet Kontak.'
      : 'Data kontak berhasil diperbarui di sheet Kontak.',
    contact: {
      nama: nama,
      noHp: cleanPhone,
      kategori: categoryName,
      jenisKelamin: jenisKelamin
    },
    syncSummary: syncSummary
  });
}

/**
 * Hapus kontak dari sheet "Kontak" SAJA, lalu catat ke History.
 */
function handleDeleteContact_(payload) {
  const cleanTarget = formatPhoneNumber_(payload.noHp);
  if (!cleanTarget) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP wajib disertakan untuk menghapus kontak.' });
  }

  const sheets = getAllSheets_();
  const delMain = deleteRowsByPhone_(sheets.contactSheet, cleanTarget);

  if (!delMain.deleted) {
    return jsonResponse_({
      status: 'error',
      message: 'Kontak dengan nomor tersebut tidak ditemukan di sheet Kontak.'
    });
  }

  appendHistory_(
    sheets.historySheet,
    'Hapus Kontak',
    delMain.nama || String(payload.nama || '-'),
    cleanTarget,
    'Dihapus dari sheet Kontak'
  );

  SpreadsheetApp.flush();
  const syncSummary = syncManualSheetToGoogleContacts_('Auto-Sync Pasca Hapus Kontak', true, true);

  return jsonResponse_({
    status: 'success',
    message: 'Kontak berhasil dihapus dari sheet Kontak.',
    syncSummary: syncSummary
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
    lastSyncAt: lastSyncAt || '',
    quota: getQuotaSummary_(googleCountOverride)
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
      quota: getQuotaSummary_()
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
      lastSyncAt: lastSyncAt,
      quota: getQuotaSummary_()
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
 * Hemat kuota:
 * - Auto-sync memakai cooldown 25 detik agar edit beruntun tidak menabrak kuota per menit People API.
 * - Diff-before-write: kontak yang nama/no HP/kategori tidak berubah tidak dikirim ulang (0 write quota).
 * - Mencatat status Gagal / Sebagian ke sheet History lengkap dengan Alasan dan Solusi.
 */
function syncManualSheetToGoogleContacts_(sourceLabel, skipHistoryIfEmpty, isAutoTrigger) {
  const startTimeMs = Date.now();
  const props = PropertiesService.getScriptProperties();

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
  for (let i = 0; i < syncRows.length; i++) {
    const p = formatPhoneNumber_(syncRows[i].noHp);
    if (p) activePhonesMap[p] = true;
  }

  const googlePhonesMap = {};
  let googleTotalCount = 0;
  let syncedCount = 0;
  let writtenCount = 0;
  let unchangedCount = 0;
  let deletedCount = 0;
  let rateLimited = false;
  let failReason = '';
  let failSolution = '';

  props.setProperty(CONFIG.PROP_LAST_AUTO_SYNC_MS, String(Date.now()));

  if (probe.engine === 'PeopleAPI') {
    let existingPeople = [];
    let groupMaps = { nameToRes: {}, resToName: {} };
    try {
      existingPeople = listAllPeopleContacts_('names,phoneNumbers,memberships,biographies');
      googleTotalCount = existingPeople.length;
      groupMaps = loadPeopleGroupMaps_();
    } catch (readErr) {
      const isQuota = isQuotaError_(readErr);
      const errExplain = explainSyncError_(readErr);
      appendHistory_(
        sheets.historySheet,
        'Sinkron Gagal',
        'Batch (' + syncRows.length + ' kontak)',
        '-',
        'Alasan: ' + errExplain.reason + ' | Solusi: ' + errExplain.solution
      );
      return {
        status: 'error',
        rateLimited: isQuota,
        message: isQuota
          ? 'Batas kuota baca per menit Google People API tercapai. Tunggu ±60 detik lalu klik Sinkronkan Google Kontak.'
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

    for (let i = 0; i < syncRows.length; i++) {
      if (Date.now() - startTimeMs >= CONFIG.MAX_EXECUTION_MS) {
        failReason = 'Batas waktu eksekusi Apps Script (4,5 menit) tercapai setelah memeriksa ' + syncedCount + ' kontak';
        failSolution = 'Klik Sinkronkan Google Kontak lagi untuk melanjutkan sisa kontak (kontak yang sudah tersinkron otomatis dilewati).';
        break;
      }

      const row = syncRows[i];
      const cleanPhone = formatPhoneNumber_(row.noHp);
      if (!cleanPhone) continue;

      const catObj = resolveOptionalCategory_(categories, row.kategori);
      const catLabel = catObj ? catObj.nama : '';
      let catGroupRes = null;
      try {
        catGroupRes = catLabel ? getOrCreatePeopleGroupResourceName_(catLabel, groupMaps) : null;
      } catch (grpErr) {
        const errInfo = explainSyncError_(grpErr);
        rateLimited = isQuotaError_(grpErr);
        failReason = errInfo.reason;
        failSolution = errInfo.solution;
        break;
      }

      const bioText =
        'Kategori: ' + (catObj ? catObj.nama + ' (' + catObj.kode + ')' : 'Tanpa Kategori') + '\n' +
        'Jenis Kelamin: ' + row.jenisKelamin + '\n' +
        'WA: https://wa.me/' + cleanPhone + '\n' +
        CONFIG.SYNC_MARKER;

      const existing = phoneToPerson[cleanPhone];
      if (!existing) {
        const desiredMemberships = [
          { contactGroupMembership: { contactGroupResourceName: 'contactGroups/myContacts' } }
        ];
        if (catGroupRes) {
          desiredMemberships.push({
            contactGroupMembership: { contactGroupResourceName: catGroupRes }
          });
        }

        try {
          People.People.createContact({
            names: [{ givenName: row.nama }],
            phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }],
            biographies: [{ value: bioText, contentType: 'TEXT_PLAIN' }],
            memberships: desiredMemberships
          });
          trackQuotaUsage_(0, 1);
          googleTotalCount++;
          googlePhonesMap[cleanPhone] = true;
          syncedCount++;
          writtenCount++;
        } catch (createErr) {
          trackQuotaUsage_(0, 1);
          const errInfo = explainSyncError_(createErr);
          rateLimited = isQuotaError_(createErr);
          failReason = errInfo.reason;
          failSolution = errInfo.solution;
          break;
        }
      } else {
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
        if (catGroupRes && !keptMap[catGroupRes]) {
          keptMemberships.push({ contactGroupMembership: { contactGroupResourceName: catGroupRes } });
        }

        const existingName = (existing.names && existing.names[0] && existing.names[0].givenName) || '';
        const existingPhoneVal = (existing.phoneNumbers && existing.phoneNumbers[0] && existing.phoneNumbers[0].value) || '';
        const existingBioVal = (existing.biographies && existing.biographies[0] && existing.biographies[0].value) || '';

        const needsUpdate =
          existingName !== row.nama ||
          existingPhoneVal !== '+' + cleanPhone ||
          existingBioVal !== bioText ||
          !membershipsEqual_(oldMemberships, keptMemberships);

        if (!needsUpdate) {
          syncedCount++;
          unchangedCount++;
          continue;
        }

        try {
          People.People.updateContact(
            {
              etag: existing.etag,
              names: [{ givenName: row.nama }],
              phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }],
              biographies: [{ value: bioText, contentType: 'TEXT_PLAIN' }],
              memberships: keptMemberships
            },
            existing.resourceName,
            { updatePersonFields: 'names,phoneNumbers,biographies,memberships' }
          );
          trackQuotaUsage_(0, 1);
          googlePhonesMap[cleanPhone] = true;
          syncedCount++;
          writtenCount++;
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

    // Hapus kontak yang dikelola MR Wadah Digital jika sudah tidak ada di Kontak_Sync
    if (!failReason) {
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

      for (let i = 0; i < syncRows.length; i++) {
        if (Date.now() - startTimeMs >= CONFIG.MAX_EXECUTION_MS) {
          failReason = 'Batas waktu eksekusi Apps Script tercapai setelah memeriksa ' + syncedCount + ' kontak';
          failSolution = 'Klik Sinkronkan Google Kontak lagi untuk melanjutkan sisa kontak.';
          break;
        }
        const row = syncRows[i];
        const cleanPhone = formatPhoneNumber_(row.noHp);
        if (!cleanPhone) continue;

        const catObj = resolveOptionalCategory_(categories, row.kategori);
        const desiredGroupName = catObj ? catObj.nama : '';
        const formattedPhone = '+' + cleanPhone;
        let contact = phoneToContact[cleanPhone] || null;

        if (!contact) {
          contact = ContactsApp.createContact(row.nama, '', '');
          contact.addPhone(ContactsApp.Field.MOBILE_PHONE, formattedPhone);
          googleTotalCount++;
          writtenCount++;
        } else {
          if (contact.getFullName() !== row.nama) {
            contact.setFullName(row.nama);
            writtenCount++;
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
            (gName && managedCategoryMap[gName.toLowerCase()] && gName !== desiredGroupName);
          if (isOldManaged) {
            existingGroups[g].removeContact(contact);
          }
        }
        if (desiredGroupName) {
          getOrCreateContactsAppGroup_(desiredGroupName).addContact(contact);
        }

        contact.setNotes(
          'Kategori: ' + (catObj ? catObj.nama + ' (' + catObj.kode + ')' : 'Tanpa Kategori') + '\n' +
          'Jenis Kelamin: ' + row.jenisKelamin + '\n' +
          'WA: https://wa.me/' + cleanPhone + '\n' +
          CONFIG.SYNC_MARKER
        );
        googlePhonesMap[cleanPhone] = true;
        syncedCount++;
      }

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
    } catch (caErr) {
      const errInfo = explainSyncError_(caErr);
      failReason = errInfo.reason;
      failSolution = errInfo.solution;
    }
  }

  trackQuotaUsage_(0, 0, googleTotalCount);
  saveSyncedPhonesCache_(googlePhonesMap, syncRows);

  const prevLastSync = props.getProperty(CONFIG.PROP_LAST_SYNC) || '';
  const hasProgress = !failReason || writtenCount > 0 || deletedCount > 0 || syncedCount > 0;
  const syncTimestamp = hasProgress ? nowFormatted_() : prevLastSync;
  if (hasProgress) {
    props.setProperty(CONFIG.PROP_LAST_SYNC, syncTimestamp);
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

  if (failReason) {
    const historyAction = writtenCount > 0 || deletedCount > 0 ? 'Sinkron Sebagian' : 'Sinkron Gagal';
    appendHistory_(
      sheets.historySheet,
      historyAction,
      'Batch (' + syncRows.length + ' kontak)',
      '-',
      'Engine: ' + probe.engine + ' · Diperiksa: ' + syncedCount + ' (Update: ' + writtenCount + ') | Alasan: ' + failReason + ' | Solusi: ' + failSolution
    );

    return {
      status: writtenCount > 0 || deletedCount > 0 ? 'success' : 'error',
      rateLimited: rateLimited,
      message: failReason + '. ' + failSolution,
      syncedCount: syncedCount,
      writtenCount: writtenCount,
      unchangedCount: unchangedCount,
      deletedCount: deletedCount,
      lastSyncAt: syncTimestamp,
      syncStatus: finalSyncStatus
    };
  }

  appendHistory_(
    sheets.historySheet,
    sourceLabel || 'Sinkron Kontak_Sync',
    'Batch (' + syncRows.length + ' kontak)',
    '-',
    'Engine: ' + probe.engine + ' · Diperiksa: ' + syncedCount + ' (Baru/Update: ' + writtenCount + ', Lewati/Sama: ' + unchangedCount + ') · Dihapus: ' + deletedCount
  );

  return {
    status: 'success',
    rateLimited: false,
    message: 'Sinkronisasi Google Kontak (' + probe.engine + ') selesai. Tersinkron: ' + finalSyncStatus.syncedCount + '/' + syncRows.length + ' (Update: ' + writtenCount + ', Dihapus: ' + deletedCount + ').',
    syncedCount: syncedCount,
    writtenCount: writtenCount,
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
