/**
 * Wadah Digital - Contact Sync & Management
 * Backend Google Apps Script (Code.gs)
 *
 * Simpan & kelola file ini di repositori GitHub (/backend-gas/Code.gs).
 *
 * Struktur Sheet Otomatis (via setupdatabase()):
 * 1. "Kontak"      -> [Nama, No HP, Kategori, Jenis Kelamin] (Database utama hasil input aplikasi)
 * 2. "Kontak_Sync" -> [Nama, No HP, Kategori, Jenis Kelamin] (Sheet khusus edit manual & sumber sinkronisasi ke Google Kontak)
 * 3. "Kategori"    -> [Nama Kategori, Kode] (Daftar kategori dinamis sesuai urutan baris)
 * 4. "History"     -> [Waktu, Action, Nama, No HP, Detail] (Log audit setiap perubahan)
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
  GROUP_PREFIX: 'Wadah Digital - ',
  MAIN_GROUP: 'Wadah Digital',
  TRIGGER_HANDLER: 'onSpreadsheetChangeTrigger'
};

/**
 * WAJIB DIJALANKAN PERTAMA KALI:
 * Membuat/memverifikasi sheet Kontak, Kontak_Sync, Kategori, dan History
 * pada Spreadsheet yang aktif, serta memasang trigger sinkronisasi otomatis.
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

  return {
    status: 'success',
    message: 'Setup database selesai. Sheet Kontak, Kontak_Sync, Kategori, dan History siap digunakan.',
    sheets: [
      contactSheet.getName(),
      syncSheet.getName(),
      categorySheet.getName(),
      historySheet.getName()
    ],
    triggerInstalled: triggerInstalled
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
    // Pastikan header kolom ke-4 (Jenis Kelamin) ikut ditambahkan jika migrasi dari versi lama
    const existingCols = sheet.getLastColumn();
    if (existingCols < headers.length) {
      for (let c = existingCols + 1; c <= headers.length; c++) {
        const cell = sheet.getRange(1, c);
        cell
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

/**
 * Menu cepat di Google Sheets.
 */
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
 * Trigger otomatis saat sheet Kontak_Sync diedit atau barisnya dihapus manual di Spreadsheet.
 */
function onSpreadsheetChangeTrigger(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(5000)) return;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const activeSheet = e && e.source ? e.source.getActiveSheet() : ss.getActiveSheet();
    if (!activeSheet || activeSheet.getName() !== CONFIG.SYNC_SHEET) return;

    syncManualSheetToGoogleContacts_('Auto-Sync Edit/Hapus Manual Sheet');
  } catch (_) {
    // Abaikan error trigger latar belakang agar tidak mengganggu Spreadsheet
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
    // Pastikan kolom No HP tetap berformat teks & kolom Jenis Kelamin ada
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

/**
 * Format Nomor WA:
 * - Menolak/menghapus seluruh spasi, tanda baca, dan huruf.
 * - Awalan 08 -> otomatis 628...
 * - Awalan 8 (>= 9 digit) -> 628...
 * - Awalan 00 -> hapus 00
 * - Nomor luar Indonesia (60..., 65..., 1..., 44..., dll) tetap dipertahankan.
 */
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

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mencatat setiap aktivitas perubahan ke sheet "History".
 */
function appendHistory_(historySheet, actionLabel, nama, noHp, detail) {
  const nowStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
  const nextRow = historySheet.getLastRow() + 1;
  historySheet.getRange(nextRow, 1, 1, 5).setValues([[
    nowStr,
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

function readContactsFromSheet_(sheet, defaultCategory) {
  const lastRow = sheet.getLastRow();
  const contacts = [];
  if (lastRow <= 1) return contacts;

  const colCount = Math.min(Math.max(sheet.getLastColumn(), 3), 4);
  const values = sheet.getRange(2, 1, lastRow - 1, colCount).getDisplayValues();

  for (let i = 0; i < values.length; i++) {
    const nama = String(values[i][0] || '').trim();
    const rawNoHp = String(values[i][1] || '').trim();
    const kategori = String(values[i][2] || defaultCategory || 'Klien').trim();
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
 * Endpoint GET: Mengambil data Kontak, Kontak_Sync, Kategori, dan History.
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
      return jsonResponse_({
        status: 'success',
        message: 'Koneksi ke Google Apps Script aktif.',
        sheetName: sheets.contactSheet.getName(),
        categoriesCount: categories.length,
        timestamp: new Date().toISOString()
      });
    }

    const defaultCat = categories[0] ? categories[0].nama : 'Klien';
    const contacts = readContactsFromSheet_(sheets.contactSheet, defaultCat);
    const syncContacts = readContactsFromSheet_(sheets.syncSheet, defaultCat);
    const history = readHistory_(sheets.historySheet);

    return jsonResponse_({
      status: 'success',
      data: contacts,
      syncContacts: syncContacts,
      categories: categories,
      history: history,
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
 * Endpoint POST: Menangani save, delete, saveCategories, syncManual, saveManualRow, deleteManualRow.
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
    if (action === 'savemanualrow') {
      return handleSaveManualRow_(payload);
    }
    if (action === 'deletemanualrow') {
      return handleDeleteManualRow_(payload);
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

function upsertRowInSheet_(sheet, nama, cleanPhone, kategori, jenisKelamin, cleanOrig) {
  const lastRow = sheet.getLastRow();
  let matchedRow = -1;
  let duplicateTargetRow = -1;

  if (lastRow > 1) {
    const existingPhones = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < existingPhones.length; i++) {
      const rowNorm = formatPhoneNumber_(existingPhones[i][0]);
      if (!rowNorm) continue;
      if (cleanOrig && rowNorm === cleanOrig) matchedRow = i + 2;
      if (rowNorm === cleanPhone) duplicateTargetRow = i + 2;
    }
  }

  let operationType = 'created';
  if (matchedRow !== -1 && duplicateTargetRow !== -1 && matchedRow !== duplicateTargetRow) {
    sheet.getRange(duplicateTargetRow, 1, 1, 4).setValues([[nama, cleanPhone, kategori, jenisKelamin]]);
    sheet.getRange(duplicateTargetRow, 2).setNumberFormat('@');
    sheet.deleteRow(matchedRow);
    operationType = 'updated';
  } else if (matchedRow !== -1) {
    sheet.getRange(matchedRow, 1, 1, 4).setValues([[nama, cleanPhone, kategori, jenisKelamin]]);
    sheet.getRange(matchedRow, 2).setNumberFormat('@');
    operationType = 'updated';
  } else if (duplicateTargetRow !== -1) {
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

function resolveCategoryObject_(categories, requestedName) {
  const req = String(requestedName || '').trim().toLowerCase();
  for (let i = 0; i < categories.length; i++) {
    if (categories[i].nama.toLowerCase() === req) {
      return categories[i];
    }
  }
  return categories[0] || { nama: 'Klien', kode: 'Kln' };
}

/**
 * Simpan/Update kontak dari aplikasi -> Sheet Kontak + Sheet Kontak_Sync + Google Contacts + History.
 */
function handleSaveContact_(payload) {
  const sheets = getAllSheets_();
  const categories = readCategories_(sheets.categorySheet);

  const nama = String(payload.nama || '').trim();
  const cleanPhone = formatPhoneNumber_(payload.noHp);
  const cleanOrig = formatPhoneNumber_(payload.originalNoHp);
  const catObj = resolveCategoryObject_(categories, payload.kategori);
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
    catObj.nama,
    jenisKelamin,
    cleanOrig
  );

  // Sinkronkan juga ke sheet Kontak_Sync agar siap disinkron ke Google Contacts
  upsertRowInSheet_(
    sheets.syncSheet,
    nama,
    cleanPhone,
    catObj.nama,
    jenisKelamin,
    cleanOrig
  );

  const googleContactResult = syncToGoogleContacts_(
    nama,
    cleanPhone,
    catObj,
    jenisKelamin,
    cleanOrig || cleanPhone
  );

  appendHistory_(
    sheets.historySheet,
    operationType === 'created' ? 'Tambah Kontak' : 'Edit Kontak',
    nama,
    cleanPhone,
    'Kategori: ' + catObj.nama + ' (' + catObj.kode + ') · Gender: ' + jenisKelamin
  );

  return jsonResponse_({
    status: 'success',
    operation: operationType,
    message: operationType === 'created'
      ? 'Kontak baru berhasil disimpan ke Sheet Kontak, Kontak_Sync, dan Google Kontak.'
      : 'Data kontak berhasil diperbarui dan disinkronkan ke Google Kontak.',
    contact: {
      nama: nama,
      noHp: cleanPhone,
      kategori: catObj.nama,
      jenisKelamin: jenisKelamin
    },
    googleContacts: googleContactResult
  });
}

/**
 * Hapus kontak dari Kontak, Kontak_Sync, Google Contacts, lalu catat ke History.
 */
function handleDeleteContact_(payload) {
  const cleanTarget = formatPhoneNumber_(payload.noHp);
  if (!cleanTarget) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP wajib disertakan untuk menghapus kontak.' });
  }

  const sheets = getAllSheets_();
  const delMain = deleteRowsByPhone_(sheets.contactSheet, cleanTarget);
  const delSync = deleteRowsByPhone_(sheets.syncSheet, cleanTarget);
  const googleDeleteResult = deleteFromGoogleContacts_(cleanTarget);

  if (!delMain.deleted && !delSync.deleted && !googleDeleteResult.deleted) {
    return jsonResponse_({
      status: 'error',
      message: 'Kontak dengan nomor tersebut tidak ditemukan.'
    });
  }

  appendHistory_(
    sheets.historySheet,
    'Hapus Kontak',
    delMain.nama || delSync.nama || String(payload.nama || '-'),
    cleanTarget,
    'Dihapus dari Kontak, Kontak_Sync, dan Google Kontak'
  );

  return jsonResponse_({
    status: 'success',
    message: 'Kontak berhasil dihapus dari Spreadsheet dan Google Kontak.',
    googleContacts: googleDeleteResult
  });
}

/**
 * Simpan ulang daftar kategori (mendukung tambah, edit nama/kode, hapus, dan ubah urutan).
 */
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

  // Jika ada kategori yang diganti namanya (renameMap: { oldName: newName }), perbarui di Kontak & Kontak_Sync
  const renameMap = payload.renameMap && typeof payload.renameMap === 'object' ? payload.renameMap : null;
  if (renameMap) {
    updateRenamedCategoriesInSheet_(sheets.contactSheet, renameMap);
    updateRenamedCategoriesInSheet_(sheets.syncSheet, renameMap);
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

/**
 * Edit satu baris di sheet Kontak_Sync langsung dari Web App (tanpa mengubah sheet Kontak).
 */
function handleSaveManualRow_(payload) {
  const sheets = getAllSheets_();
  const categories = readCategories_(sheets.categorySheet);

  const nama = String(payload.nama || '').trim();
  const cleanPhone = formatPhoneNumber_(payload.noHp);
  const cleanOrig = formatPhoneNumber_(payload.originalNoHp);
  const catObj = resolveCategoryObject_(categories, payload.kategori);
  const jenisKelamin = normalizeGender_(payload.jenisKelamin);

  if (!nama || cleanPhone.length < 8) {
    return jsonResponse_({ status: 'error', message: 'Nama dan No HP valid wajib diisi.' });
  }

  upsertRowInSheet_(sheets.syncSheet, nama, cleanPhone, catObj.nama, jenisKelamin, cleanOrig);
  const googleResult = syncToGoogleContacts_(nama, cleanPhone, catObj, jenisKelamin, cleanOrig || cleanPhone);

  appendHistory_(
    sheets.historySheet,
    'Edit Kontak_Sync',
    nama,
    cleanPhone,
    'Diperbarui khusus di sheet Kontak_Sync -> Google Kontak'
  );

  return jsonResponse_({
    status: 'success',
    message: 'Baris Kontak_Sync diperbarui & disinkronkan ke Google Kontak.',
    googleContacts: googleResult
  });
}

/**
 * Hapus satu baris di sheet Kontak_Sync langsung dari Web App -> hapus juga di Google Kontak.
 */
function handleDeleteManualRow_(payload) {
  const cleanTarget = formatPhoneNumber_(payload.noHp);
  if (!cleanTarget) {
    return jsonResponse_({ status: 'error', message: 'No HP wajib diisi.' });
  }

  const sheets = getAllSheets_();
  const delSync = deleteRowsByPhone_(sheets.syncSheet, cleanTarget);
  const googleResult = deleteFromGoogleContacts_(cleanTarget);

  appendHistory_(
    sheets.historySheet,
    'Hapus Kontak_Sync',
    delSync.nama || String(payload.nama || '-'),
    cleanTarget,
    'Dihapus dari Kontak_Sync -> otomatis dihapus dari Google Kontak'
  );

  return jsonResponse_({
    status: 'success',
    message: 'Kontak dihapus dari Kontak_Sync dan Google Kontak.',
    googleContacts: googleResult
  });
}

/**
 * SINKRONISASI PENUH SHEET "Kontak_Sync" -> GOOGLE CONTACTS:
 * - Setiap baris di Kontak_Sync dibuat/diperbarui di Google Contacts (nama sesuai editan manual).
 * - Setiap kontak di grup/label "Wadah Digital" yang TIDAK ADA lagi di Kontak_Sync otomatis DIHAPUS dari Google Contacts.
 */
function syncManualSheetToGoogleContacts_(sourceLabel) {
  const sheets = getAllSheets_();
  const categories = readCategories_(sheets.categorySheet);
  const defaultCat = categories[0] ? categories[0].nama : 'Klien';
  const syncRows = readContactsFromSheet_(sheets.syncSheet, defaultCat);

  const activePhonesMap = {};
  let syncedCount = 0;
  let deletedCount = 0;

  for (let i = 0; i < syncRows.length; i++) {
    const row = syncRows[i];
    const cleanPhone = formatPhoneNumber_(row.noHp);
    if (!cleanPhone) continue;
    activePhonesMap[cleanPhone] = true;
    const catObj = resolveCategoryObject_(categories, row.kategori);
    const res = syncToGoogleContacts_(row.nama, cleanPhone, catObj, row.jenisKelamin, cleanPhone);
    if (res.synced) syncedCount++;
  }

  try {
    const mainGroup = ContactsApp.getContactGroup(CONFIG.MAIN_GROUP);
    if (mainGroup) {
      const groupContacts = mainGroup.getContacts();
      for (let i = 0; i < groupContacts.length; i++) {
        const contact = groupContacts[i];
        const phones = contact.getPhones();
        let belongsToSyncSheet = false;
        for (let j = 0; j < phones.length; j++) {
          const norm = formatPhoneNumber_(phones[j].getPhoneNumber());
          if (norm && activePhonesMap[norm]) {
            belongsToSyncSheet = true;
            break;
          }
        }
        if (!belongsToSyncSheet) {
          ContactsApp.deleteContact(contact);
          deletedCount++;
        }
      }
    }
  } catch (_) {}

  appendHistory_(
    sheets.historySheet,
    sourceLabel || 'Sinkron Kontak_Sync',
    'Batch (' + syncRows.length + ' kontak)',
    '-',
    'Disinkronkan: ' + syncedCount + ', Dihapus dari Google Kontak: ' + deletedCount
  );

  return {
    status: 'success',
    message: 'Sinkronisasi Kontak_Sync selesai. Disinkronkan: ' + syncedCount + ', Dihapus dari Google Kontak: ' + deletedCount + '.',
    syncedCount: syncedCount,
    deletedCount: deletedCount
  };
}

function findGoogleContactByPhone_(cleanTarget) {
  if (!cleanTarget) return null;

  const localFormat = cleanTarget.startsWith('62') ? '0' + cleanTarget.slice(2) : cleanTarget;
  const searchCandidates = ['+' + cleanTarget, cleanTarget, localFormat];

  for (let i = 0; i < searchCandidates.length; i++) {
    const matches = ContactsApp.getContactsByPhone(searchCandidates[i]);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  }

  const allContacts = ContactsApp.getContacts();
  for (let i = 0; i < allContacts.length; i++) {
    const phones = allContacts[i].getPhones();
    for (let j = 0; j < phones.length; j++) {
      if (formatPhoneNumber_(phones[j].getPhoneNumber()) === cleanTarget) {
        return allContacts[i];
      }
    }
  }

  return null;
}

function getOrCreateContactGroup_(groupName) {
  let group = ContactsApp.getContactGroup(groupName);
  if (!group) {
    group = ContactsApp.createContactGroup(groupName);
  }
  return group;
}

function syncToGoogleContacts_(nama, cleanPhone, catObj, jenisKelamin, lookupCleanPhone) {
  try {
    const formattedForGoogle = '+' + cleanPhone;
    let contact = findGoogleContactByPhone_(lookupCleanPhone);
    if (!contact && cleanPhone !== lookupCleanPhone) {
      contact = findGoogleContactByPhone_(cleanPhone);
    }

    let actionTaken = 'updated';
    if (!contact) {
      contact = ContactsApp.createContact(nama, '', '');
      contact.addPhone(ContactsApp.Field.MOBILE_PHONE, formattedForGoogle);
      actionTaken = 'created';
    } else {
      contact.setFullName(nama);
      const phones = contact.getPhones();
      if (phones.length > 0) {
        phones[0].setPhoneNumber(formattedForGoogle);
      } else {
        contact.addPhone(ContactsApp.Field.MOBILE_PHONE, formattedForGoogle);
      }
    }

    const mainGroup = getOrCreateContactGroup_(CONFIG.MAIN_GROUP);
    mainGroup.addContact(contact);

    const desiredCategoryGroupName = CONFIG.GROUP_PREFIX + catObj.nama + ' (' + catObj.kode + ')';
    const existingGroups = contact.getContactGroups();
    for (let i = 0; i < existingGroups.length; i++) {
      const gName = existingGroups[i].getName();
      if (gName.indexOf(CONFIG.GROUP_PREFIX) === 0 && gName !== desiredCategoryGroupName) {
        existingGroups[i].removeContact(contact);
      }
    }

    const categoryGroup = getOrCreateContactGroup_(desiredCategoryGroupName);
    categoryGroup.addContact(contact);
    contact.setNotes(
      'Kategori: ' + catObj.nama + ' (' + catObj.kode + ')\n' +
      'Jenis Kelamin: ' + jenisKelamin + '\n' +
      'WA: https://wa.me/' + cleanPhone + '\n' +
      'Disinkronkan oleh MR Wadah Digital'
    );

    return { synced: true, action: actionTaken };
  } catch (err) {
    return { synced: false, error: err.message };
  }
}

function deleteFromGoogleContacts_(cleanTarget) {
  try {
    const contact = findGoogleContactByPhone_(cleanTarget);
    if (!contact) {
      return { deleted: false, message: 'Tidak ditemukan di Google Kontak.' };
    }
    ContactsApp.deleteContact(contact);
    return { deleted: true };
  } catch (err) {
    return { deleted: false, error: err.message };
  }
}
