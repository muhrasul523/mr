/**
 * Wadah Digital - Contact Sync & Management
 * Backend Google Apps Script (Code.gs)
 *
 * Simpan & kelola file ini di repositori GitHub (/backend-gas/Code.gs).
 *
 * Fitur Utama:
 * 1. setupdatabase() -> Membuat sheet "Kontak" dan "Kategori" otomatis pada Spreadsheet aktif.
 * 2. Format Nomor WA -> Otomatis awalan 628 jika input 08..., menolak spasi/tanda baca/huruf,
 *    serta tetap mempertahankan kode negara untuk nomor luar Indonesia.
 * 3. Nomor HP ternormalisasi sebagai Unique Identifier anti-duplikat.
 * 4. Kategori dinamis tersimpan di sheet "Kategori" (bisa tambah & hapus dari aplikasi).
 * 5. Sinkronisasi otomatis ke Google Contacts melalui ContactsApp.
 */

const CONFIG = {
  CONTACTS_SHEET: 'Kontak',
  CATEGORIES_SHEET: 'Kategori',
  CONTACT_HEADERS: ['Nama', 'No HP', 'Kategori'],
  CATEGORY_HEADERS: ['Nama Kategori'],
  DEFAULT_CATEGORIES: ['Klien', 'Partner', 'VIP', 'Internal'],
  GROUP_PREFIX: 'Wadah Digital - ',
  MAIN_GROUP: 'Wadah Digital'
};

/**
 * WAJIB DIJALANKAN PERTAMA KALI (atau otomatis dipanggil saat endpoint diakses):
 * Membuat sheet baru "Kontak" dan "Kategori" pada Google Spreadsheet yang aktif,
 * lengkap dengan header, format kolom teks untuk No HP, dan kategori awal.
 */
function setupdatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Setup Sheet Kontak
  let contactSheet = ss.getSheetByName(CONFIG.CONTACTS_SHEET);
  if (!contactSheet) {
    const sheets = ss.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
      contactSheet = sheets[0];
      contactSheet.setName(CONFIG.CONTACTS_SHEET);
    } else {
      contactSheet = ss.insertSheet(CONFIG.CONTACTS_SHEET);
    }
  }

  if (contactSheet.getLastRow() === 0) {
    contactSheet.appendRow(CONFIG.CONTACT_HEADERS);
    const headerRange = contactSheet.getRange(1, 1, 1, CONFIG.CONTACT_HEADERS.length);
    headerRange
      .setFontWeight('bold')
      .setBackground('#0A2463')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('left');
    contactSheet.setFrozenRows(1);
    contactSheet.setColumnWidth(1, 240);
    contactSheet.setColumnWidth(2, 190);
    contactSheet.setColumnWidth(3, 160);
  }
  contactSheet.getRange('B:B').setNumberFormat('@');

  // 2. Setup Sheet Kategori
  let categorySheet = ss.getSheetByName(CONFIG.CATEGORIES_SHEET);
  if (!categorySheet) {
    categorySheet = ss.insertSheet(CONFIG.CATEGORIES_SHEET);
  }

  if (categorySheet.getLastRow() === 0) {
    categorySheet.appendRow(CONFIG.CATEGORY_HEADERS);
    const catHeaderRange = categorySheet.getRange(1, 1, 1, 1);
    catHeaderRange
      .setFontWeight('bold')
      .setBackground('#1D4ED8')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('left');
    categorySheet.setFrozenRows(1);
    categorySheet.setColumnWidth(1, 220);

    const defaultRows = CONFIG.DEFAULT_CATEGORIES.map(function (cat) {
      return [cat];
    });
    categorySheet.getRange(2, 1, defaultRows.length, 1).setValues(defaultRows);
  }

  return {
    status: 'success',
    message: 'Setup database selesai. Sheet "' + CONFIG.CONTACTS_SHEET + '" dan "' + CONFIG.CATEGORIES_SHEET + '" siap digunakan.',
    sheets: [contactSheet.getName(), categorySheet.getName()]
  };
}

/**
 * Alias PascalCase apabila dipanggil dari menu Apps Script.
 */
function setupDatabase() {
  return setupdatabase();
}

/**
 * Menambahkan menu cepat di Google Sheets agar setupdatabase mudah dijalankan.
 */
function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('Wadah Digital')
      .addItem('Setup Database (Buat Sheet Kontak & Kategori)', 'setupdatabase')
      .addToUi();
  } catch (_) {}
}

/**
 * Mengambil sheet Kontak & Kategori (otomatis menjalankan setupdatabase jika belum ada).
 */
function getSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let contactSheet = ss.getSheetByName(CONFIG.CONTACTS_SHEET);
  let categorySheet = ss.getSheetByName(CONFIG.CATEGORIES_SHEET);

  if (!contactSheet || !categorySheet || contactSheet.getLastRow() === 0 || categorySheet.getLastRow() === 0) {
    setupdatabase();
    contactSheet = ss.getSheetByName(CONFIG.CONTACTS_SHEET);
    categorySheet = ss.getSheetByName(CONFIG.CATEGORIES_SHEET);
  } else {
    contactSheet.getRange('B:B').setNumberFormat('@');
  }

  return {
    contactSheet: contactSheet,
    categorySheet: categorySheet
  };
}

/**
 * Membersihkan nomor HP dari spasi, tanda baca, dan huruf.
 * Aturan Format WA:
 * - Jika awalan "08" -> otomatis dikonversi menjadi "628..."
 * - Jika awalan "8" (minimal 9 digit) -> dikonversi menjadi "628..."
 * - Jika awalan "00" (kode akses internasional) -> "00" dihapus, sisanya dipertahankan
 * - Nomor luar Indonesia (misal 60..., 65..., 1..., 44..., 966...) tetap dipertahankan sebagai digit murni.
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

/**
 * Membentuk respons JSON standar.
 */
function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Membaca daftar kategori dari sheet "Kategori".
 */
function readCategories_(categorySheet) {
  const lastRow = categorySheet.getLastRow();
  if (lastRow <= 1) {
    return CONFIG.DEFAULT_CATEGORIES.slice();
  }

  const values = categorySheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const list = [];
  const seen = {};

  for (let i = 0; i < values.length; i++) {
    const name = String(values[i][0] || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen[key]) {
      seen[key] = true;
      list.push(name);
    }
  }

  return list.length > 0 ? list : CONFIG.DEFAULT_CATEGORIES.slice();
}

/**
 * Endpoint GET: Mengambil daftar kontak dan daftar kategori dinamis berformat JSON.
 * Mendukung ?action=ping dan ?action=setup.
 */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action ? String(e.parameter.action).toLowerCase() : 'list';

    if (action === 'setup') {
      return jsonResponse_(setupdatabase());
    }

    const sheets = getSheets_();
    const categories = readCategories_(sheets.categorySheet);

    if (action === 'ping') {
      return jsonResponse_({
        status: 'success',
        message: 'Koneksi ke Google Apps Script berhasil.',
        sheetName: sheets.contactSheet.getName(),
        categoriesCount: categories.length,
        timestamp: new Date().toISOString()
      });
    }

    const lastRow = sheets.contactSheet.getLastRow();
    const contacts = [];

    if (lastRow > 1) {
      const values = sheets.contactSheet.getRange(2, 1, lastRow - 1, 3).getDisplayValues();
      for (let i = 0; i < values.length; i++) {
        const nama = String(values[i][0] || '').trim();
        const rawNoHp = String(values[i][1] || '').trim();
        const kategori = String(values[i][2] || categories[0] || 'Klien').trim();
        const cleanPhone = formatPhoneNumber_(rawNoHp);

        if (!nama && !cleanPhone) continue;

        contacts.push({
          nama: nama,
          noHp: cleanPhone || rawNoHp,
          kategori: kategori
        });
      }
    }

    return jsonResponse_({
      status: 'success',
      data: contacts,
      categories: categories,
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
 * Endpoint POST: Menangani save, delete, addCategory, deleteCategory, dan setupDatabase.
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({
        status: 'error',
        message: 'Payload permintaan tidak ditemukan.'
      });
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
    if (action === 'addcategory') {
      return handleAddCategory_(payload);
    }
    if (action === 'deletecategory') {
      return handleDeleteCategory_(payload);
    }

    return jsonResponse_({
      status: 'error',
      message: 'Aksi tidak dikenali.'
    });
  } catch (err) {
    return jsonResponse_({
      status: 'error',
      message: 'Terjadi kesalahan pada server: ' + err.message
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

/**
 * Menambah kategori baru ke sheet "Kategori".
 */
function handleAddCategory_(payload) {
  const newCat = String(payload.kategori || '').trim();
  if (!newCat) {
    return jsonResponse_({ status: 'error', message: 'Nama kategori tidak boleh kosong.' });
  }

  const sheets = getSheets_();
  const existing = readCategories_(sheets.categorySheet);
  const exists = existing.some(function (item) {
    return item.toLowerCase() === newCat.toLowerCase();
  });

  if (exists) {
    return jsonResponse_({
      status: 'error',
      message: 'Kategori "' + newCat + '" sudah ada di daftar.',
      categories: existing
    });
  }

  sheets.categorySheet.appendRow([newCat]);
  const updated = readCategories_(sheets.categorySheet);

  return jsonResponse_({
    status: 'success',
    message: 'Kategori "' + newCat + '" berhasil ditambahkan.',
    categories: updated
  });
}

/**
 * Menghapus kategori dari sheet "Kategori" (minimal menyisakan 1 kategori).
 */
function handleDeleteCategory_(payload) {
  const targetCat = String(payload.kategori || '').trim();
  if (!targetCat) {
    return jsonResponse_({ status: 'error', message: 'Nama kategori wajib disertakan.' });
  }

  const sheets = getSheets_();
  const existing = readCategories_(sheets.categorySheet);

  if (existing.length <= 1) {
    return jsonResponse_({
      status: 'error',
      message: 'Minimal harus terdapat satu kategori aktif.',
      categories: existing
    });
  }

  const lastRow = sheets.categorySheet.getLastRow();
  let removed = false;
  if (lastRow > 1) {
    const values = sheets.categorySheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    for (let i = values.length - 1; i >= 0; i--) {
      if (String(values[i][0] || '').trim().toLowerCase() === targetCat.toLowerCase()) {
        sheets.categorySheet.deleteRow(i + 2);
        removed = true;
      }
    }
  }

  const updated = readCategories_(sheets.categorySheet);
  return jsonResponse_({
    status: removed ? 'success' : 'error',
    message: removed
      ? 'Kategori "' + targetCat + '" berhasil dihapus.'
      : 'Kategori "' + targetCat + '" tidak ditemukan.',
    categories: updated
  });
}

/**
 * Menyimpan atau memperbarui kontak berdasarkan Unique Identifier (No HP bersih).
 */
function handleSaveContact_(payload) {
  const sheets = getSheets_();
  const availableCategories = readCategories_(sheets.categorySheet);

  const nama = String(payload.nama || '').trim();
  const cleanPhone = formatPhoneNumber_(payload.noHp);
  const cleanOrig = formatPhoneNumber_(payload.originalNoHp);
  const requestedCategory = String(payload.kategori || '').trim();

  // Pastikan kategori yang dipilih berasal dari daftar kategori aktif
  let matchedCategory = availableCategories[0] || 'Klien';
  for (let i = 0; i < availableCategories.length; i++) {
    if (availableCategories[i].toLowerCase() === requestedCategory.toLowerCase()) {
      matchedCategory = availableCategories[i];
      break;
    }
  }

  if (!nama) {
    return jsonResponse_({ status: 'error', message: 'Nama kontak wajib diisi.' });
  }
  if (!cleanPhone || cleanPhone.length < 8) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP tidak valid (minimal 8 digit).' });
  }

  const contactSheet = sheets.contactSheet;
  const lastRow = contactSheet.getLastRow();
  let matchedRow = -1;
  let duplicateTargetRow = -1;

  if (lastRow > 1) {
    const existingPhones = contactSheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    for (let i = 0; i < existingPhones.length; i++) {
      const rowNorm = formatPhoneNumber_(existingPhones[i][0]);
      if (!rowNorm) continue;

      if (cleanOrig && rowNorm === cleanOrig) {
        matchedRow = i + 2;
      }
      if (rowNorm === cleanPhone) {
        duplicateTargetRow = i + 2;
      }
    }
  }

  let operationType = 'created';
  if (matchedRow !== -1 && duplicateTargetRow !== -1 && matchedRow !== duplicateTargetRow) {
    contactSheet.getRange(duplicateTargetRow, 1, 1, 3).setValues([[nama, cleanPhone, matchedCategory]]);
    contactSheet.getRange(duplicateTargetRow, 2).setNumberFormat('@');
    contactSheet.deleteRow(matchedRow);
    operationType = 'updated';
  } else if (matchedRow !== -1) {
    contactSheet.getRange(matchedRow, 1, 1, 3).setValues([[nama, cleanPhone, matchedCategory]]);
    contactSheet.getRange(matchedRow, 2).setNumberFormat('@');
    operationType = 'updated';
  } else if (duplicateTargetRow !== -1) {
    contactSheet.getRange(duplicateTargetRow, 1, 1, 3).setValues([[nama, cleanPhone, matchedCategory]]);
    contactSheet.getRange(duplicateTargetRow, 2).setNumberFormat('@');
    operationType = 'updated';
  } else {
    const nextRow = lastRow + 1;
    contactSheet.getRange(nextRow, 1, 1, 3).setValues([[nama, cleanPhone, matchedCategory]]);
    contactSheet.getRange(nextRow, 2).setNumberFormat('@');
    operationType = 'created';
  }

  const googleContactResult = syncToGoogleContacts_(nama, cleanPhone, matchedCategory, cleanOrig || cleanPhone);

  return jsonResponse_({
    status: 'success',
    operation: operationType,
    message: operationType === 'created'
      ? 'Kontak baru berhasil disimpan dan disinkronkan.'
      : 'Data kontak berhasil diperbarui dan disinkronkan.',
    contact: {
      nama: nama,
      noHp: cleanPhone,
      kategori: matchedCategory
    },
    googleContacts: googleContactResult
  });
}

/**
 * Menghapus kontak dari Google Sheets dan Google Contacts berdasarkan No HP.
 */
function handleDeleteContact_(payload) {
  const cleanTarget = formatPhoneNumber_(payload.noHp);
  if (!cleanTarget) {
    return jsonResponse_({ status: 'error', message: 'Nomor HP wajib disertakan untuk menghapus kontak.' });
  }

  const sheets = getSheets_();
  const contactSheet = sheets.contactSheet;
  const lastRow = contactSheet.getLastRow();
  let deletedFromSheet = false;

  if (lastRow > 1) {
    const existingPhones = contactSheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
    for (let i = existingPhones.length - 1; i >= 0; i--) {
      const rowNorm = formatPhoneNumber_(existingPhones[i][0]);
      if (rowNorm === cleanTarget) {
        contactSheet.deleteRow(i + 2);
        deletedFromSheet = true;
      }
    }
  }

  const googleDeleteResult = deleteFromGoogleContacts_(cleanTarget);

  if (!deletedFromSheet && !googleDeleteResult.deleted) {
    return jsonResponse_({
      status: 'error',
      message: 'Kontak dengan nomor tersebut tidak ditemukan di Spreadsheet maupun Google Kontak.'
    });
  }

  return jsonResponse_({
    status: 'success',
    message: 'Kontak berhasil dihapus dari Spreadsheet dan Google Kontak.',
    deletedFromSheet: deletedFromSheet,
    googleContacts: googleDeleteResult
  });
}

/**
 * Mencari kontak di Google Contacts berdasarkan nomor HP ternormalisasi.
 */
function findGoogleContactByPhone_(cleanTarget) {
  if (!cleanTarget) return null;

  const localFormat = cleanTarget.startsWith('62') ? '0' + cleanTarget.slice(2) : cleanTarget;
  const searchCandidates = [
    '+' + cleanTarget,
    cleanTarget,
    localFormat
  ];

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

/**
 * Membuat atau mengambil ContactGroup di Google Contacts.
 */
function getOrCreateContactGroup_(groupName) {
  let group = ContactsApp.getContactGroup(groupName);
  if (!group) {
    group = ContactsApp.createContactGroup(groupName);
  }
  return group;
}

/**
 * Membuat atau memperbarui entri di Google Contacts melalui ContactsApp.
 */
function syncToGoogleContacts_(nama, cleanPhone, kategori, lookupCleanPhone) {
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

    const existingGroups = contact.getContactGroups();
    const desiredCategoryGroupName = CONFIG.GROUP_PREFIX + kategori;
    for (let i = 0; i < existingGroups.length; i++) {
      const gName = existingGroups[i].getName();
      if (gName.indexOf(CONFIG.GROUP_PREFIX) === 0 && gName !== desiredCategoryGroupName) {
        existingGroups[i].removeContact(contact);
      }
    }

    const categoryGroup = getOrCreateContactGroup_(desiredCategoryGroupName);
    categoryGroup.addContact(contact);
    contact.setNotes('Kategori: ' + kategori + '\nWA: https://wa.me/' + cleanPhone + '\nDisinkronkan oleh Wadah Digital');

    return {
      synced: true,
      action: actionTaken
    };
  } catch (err) {
    return {
      synced: false,
      error: err.message
    };
  }
}

/**
 * Menghapus kontak terkait di Google Contacts melalui ContactsApp.
 */
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
