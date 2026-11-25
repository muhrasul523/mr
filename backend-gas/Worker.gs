/**
 * Wadah Digital - Contact Sync & Management
 * WORKER SCRIPT untuk Akun Google Tambahan (Akun 2, Akun 3, dst.)
 *
 * CARA PASANG (cukup 2 menit per akun email tambahan):
 * 1. Login ke Google Drive / Apps Script memakai Akun Gmail ke-2 (atau ke-3) di browser.
 * 2. Buka https://script.new untuk membuat proyek Apps Script baru, beri nama mis. "Worker Kontak Akun 2".
 * 3. Hapus kode bawaan lalu tempel seluruh isi file Worker.gs ini.
 * 4. (Opsional tapi disarankan) Isi WORKER_SECRET di bawah dengan kata sandi bebas yang sama dengan
 *    kolom "Kunci Rahasia" saat mendaftarkan akun di aplikasi.
 * 5. Di panel kiri klik Services (+) -> People API -> Add.
 * 6. Jalankan fungsi cekKoneksiWorker() sekali di editor untuk menyetujui izin akses Google Kontak.
 * 7. Klik Deploy -> New deployment -> Web app:
 *    - Execute as: Me (akun email ke-2 / ke-3 ini)
 *    - Who has access: Anyone
 * 8. Salin URL Web App (/exec) lalu tempel di menu "Kelola Akun Google" pada aplikasi MR Wadah Digital.
 */

const WORKER_CONFIG = {
  // Isi kata sandi bebas jika ingin mengunci akses Worker (harus sama dengan Kunci Rahasia di aplikasi).
  // Biarkan kosong '' jika ingin tanpa kata sandi tambahan.
  WORKER_SECRET: '',
  SYNC_MARKER: 'Disinkronkan oleh MR Wadah Digital',
  BATCH_CREATE_CHUNK_SIZE: 25,
  MAX_EXECUTION_MS: 240000
};

/**
 * Jalankan fungsi ini SATU KALI di editor Apps Script Akun ke-2 / ke-3
 * untuk memicu persetujuan izin People API dan memastikan koneksi aktif.
 */
function cekKoneksiWorker() {
  const email = getWorkerEmail_();
  const probe = detectWorkerEngine_();
  if (!probe.connected) {
    throw new Error(probe.error);
  }
  const list = listWorkerPeopleContacts_('phoneNumbers');
  const summary = {
    status: 'success',
    email: email,
    engine: probe.engine,
    connected: true,
    totalContacts: list.length,
    message: 'Worker Google Kontak aktif untuk ' + email + ' (' + list.length + ' kontak tersimpan).'
  };
  Logger.log(JSON.stringify(summary));
  return summary;
}

function getWorkerEmail_() {
  try {
    return Session.getEffectiveUser().getEmail() || Session.getActiveUser().getEmail() || '';
  } catch (_) {
    return '';
  }
}

function workerJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function validateWorkerSecret_(incomingSecret) {
  const expected = String(WORKER_CONFIG.WORKER_SECRET || '').trim();
  if (!expected) return true;
  return String(incomingSecret || '').trim() === expected;
}

function detectWorkerEngine_() {
  if (typeof People !== 'undefined' && People && People.People && People.People.Connections) {
    return { engine: 'PeopleAPI', connected: true, error: '' };
  }
  if (typeof ContactsApp !== 'undefined' && ContactsApp) {
    return { engine: 'ContactsApp', connected: true, error: '' };
  }
  return {
    engine: 'Unavailable',
    connected: false,
    error: 'People API belum aktif di Worker ini. Buka Services (+) -> People API -> Add, lalu jalankan cekKoneksiWorker().'
  };
}

function formatWorkerPhone_(rawPhone) {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8') && digits.length >= 9) {
    digits = '62' + digits;
  }
  return digits;
}

function isWorkerQuotaError_(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  return (
    msg.indexOf('quota exceeded') !== -1 ||
    msg.indexOf('rate limit') !== -1 ||
    msg.indexOf('ratelimitexceeded') !== -1 ||
    msg.indexOf('resource_exhausted') !== -1 ||
    msg.indexOf('too many requests') !== -1
  );
}

function listWorkerPeopleContacts_(personFields) {
  const results = [];
  let pageToken = null;
  const fields = personFields || 'phoneNumbers';
  do {
    const opts = {
      personFields: fields,
      pageSize: 1000
    };
    if (pageToken) opts.pageToken = pageToken;
    const resp = People.People.Connections.list('people/me', opts);
    if (resp && Array.isArray(resp.connections)) {
      for (let i = 0; i < resp.connections.length; i++) {
        results.push(resp.connections[i]);
      }
    }
    pageToken = resp && resp.nextPageToken ? resp.nextPageToken : null;
  } while (pageToken);
  return results;
}

function loadWorkerGroupMaps_() {
  const nameToRes = {};
  const resToName = {};
  let pageToken = null;
  do {
    const opts = { pageSize: 1000 };
    if (pageToken) opts.pageToken = pageToken;
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
  return { nameToRes: nameToRes, resToName: resToName };
}

function getOrCreateWorkerGroup_(groupTitle, maps) {
  if (maps.nameToRes[groupTitle]) return maps.nameToRes[groupTitle];
  const created = People.ContactGroups.create({
    contactGroup: { name: groupTitle }
  });
  maps.nameToRes[groupTitle] = created.resourceName;
  maps.resToName[created.resourceName] = groupTitle;
  return created.resourceName;
}

function attachWorkerContactsToGroupBulk_(groupResName, resourceNames) {
  if (!groupResName || !Array.isArray(resourceNames) || resourceNames.length === 0) return;
  if (!People || !People.ContactGroups || !People.ContactGroups.Members || typeof People.ContactGroups.Members.modify !== 'function') {
    return;
  }
  const chunkLimit = 900;
  for (let i = 0; i < resourceNames.length; i += chunkLimit) {
    const slice = resourceNames.slice(i, i + chunkLimit);
    People.ContactGroups.Members.modify({ resourceNamesToAdd: slice }, groupResName);
  }
}

function doGet(e) {
  try {
    const secret = e && e.parameter ? e.parameter.secret : '';
    if (!validateWorkerSecret_(secret)) {
      return workerJson_({ status: 'error', message: 'Kunci Rahasia Worker tidak cocok.' });
    }
    const probe = detectWorkerEngine_();
    const email = getWorkerEmail_();
    if (!probe.connected) {
      return workerJson_({
        status: 'error',
        email: email,
        engine: probe.engine,
        connected: false,
        totalContacts: 0,
        message: probe.error
      });
    }
    const action = e && e.parameter && e.parameter.action ? String(e.parameter.action).toLowerCase() : 'ping';
    if (action === 'listphones') {
      return workerJson_(handleWorkerListPhones_(probe, email));
    }
    const list = probe.engine === 'PeopleAPI'
      ? listWorkerPeopleContacts_('phoneNumbers')
      : ContactsApp.getContacts();
    return workerJson_({
      status: 'success',
      email: email,
      engine: probe.engine,
      connected: true,
      totalContacts: list.length,
      message: 'Worker Google Kontak terhubung (' + email + ').'
    });
  } catch (err) {
    return workerJson_({
      status: 'error',
      email: getWorkerEmail_(),
      rateLimited: isWorkerQuotaError_(err),
      message: 'Worker error: ' + err.message
    });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return workerJson_({ status: 'error', message: 'Payload Worker kosong.' });
    }
    const payload = JSON.parse(e.postData.contents);
    if (!validateWorkerSecret_(payload.secret)) {
      return workerJson_({ status: 'error', message: 'Kunci Rahasia Worker tidak cocok.' });
    }

    const probe = detectWorkerEngine_();
    const email = getWorkerEmail_();
    if (!probe.connected) {
      return workerJson_({
        status: 'error',
        email: email,
        engine: probe.engine,
        connected: false,
        totalContacts: 0,
        message: probe.error
      });
    }

    const action = String(payload.action || 'ping').toLowerCase();

    if (action === 'ping') {
      const list = probe.engine === 'PeopleAPI'
        ? listWorkerPeopleContacts_('phoneNumbers')
        : ContactsApp.getContacts();
      return workerJson_({
        status: 'success',
        email: email,
        engine: probe.engine,
        connected: true,
        totalContacts: list.length,
        message: 'Worker terhubung ke ' + (email || 'akun ini') + ' (' + list.length + ' kontak).'
      });
    }

    if (action === 'listphones') {
      return workerJson_(handleWorkerListPhones_(probe, email));
    }

    if (action === 'createbatch') {
      return workerJson_(handleWorkerCreateBatch_(payload, probe, email));
    }

    if (action === 'clearcontacts') {
      return workerJson_(handleWorkerClearContacts_(probe, email));
    }

    return workerJson_({ status: 'error', message: 'Aksi Worker tidak dikenali: ' + action });
  } catch (err) {
    return workerJson_({
      status: 'error',
      email: getWorkerEmail_(),
      rateLimited: isWorkerQuotaError_(err),
      message: 'Kesalahan Worker: ' + err.message
    });
  }
}

function handleWorkerListPhones_(probe, email) {
  const seen = {};
  const phones = [];
  let totalContacts = 0;

  if (probe.engine === 'PeopleAPI') {
    const list = listWorkerPeopleContacts_('phoneNumbers');
    totalContacts = list.length;
    for (let i = 0; i < list.length; i++) {
      const arr = list[i].phoneNumbers || [];
      for (let j = 0; j < arr.length; j++) {
        const norm = formatWorkerPhone_(arr[j].value);
        if (norm && !seen[norm]) {
          seen[norm] = true;
          phones.push(norm);
        }
      }
    }
  } else {
    const all = ContactsApp.getContacts();
    totalContacts = all.length;
    for (let i = 0; i < all.length; i++) {
      const arr = all[i].getPhones();
      for (let j = 0; j < arr.length; j++) {
        const norm = formatWorkerPhone_(arr[j].getPhoneNumber());
        if (norm && !seen[norm]) {
          seen[norm] = true;
          phones.push(norm);
        }
      }
    }
  }

  return {
    status: 'success',
    email: email,
    engine: probe.engine,
    connected: true,
    totalContacts: totalContacts,
    phones: phones
  };
}

function handleWorkerCreateBatch_(payload, probe, email) {
  const startTimeMs = Date.now();
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return {
      status: 'success',
      email: email,
      createdPhones: [],
      createdCount: 0,
      rateLimited: false,
      message: 'Tidak ada kontak baru pada batch ini.'
    };
  }

  const createdPhones = [];
  let rateLimited = false;
  let errorMsg = '';

  if (probe.engine === 'PeopleAPI') {
    const groupMaps = loadWorkerGroupMaps_();

    // 1. Pastikan semua label kategori tersedia di akun ini
    const neededMap = {};
    for (let i = 0; i < items.length; i++) {
      const cats = Array.isArray(items[i].catObjs) ? items[i].catObjs : [];
      for (let c = 0; c < cats.length; c++) {
        const nm = String(cats[c].nama || '').trim();
        if (nm && !groupMaps.nameToRes[nm] && !neededMap[nm]) {
          neededMap[nm] = true;
          try {
            getOrCreateWorkerGroup_(nm, groupMaps);
          } catch (grpErr) {
            rateLimited = isWorkerQuotaError_(grpErr);
            errorMsg = grpErr.message;
            break;
          }
        }
      }
      if (errorMsg) break;
    }

    if (errorMsg) {
      return {
        status: 'error',
        email: email,
        createdPhones: createdPhones,
        createdCount: 0,
        rateLimited: rateLimited,
        message: errorMsg
      };
    }

    // 2. Buat kontak memakai batchCreateContacts (tanpa memberships agar tidak 400)
    const chunkSize = Number(payload.chunkSize || WORKER_CONFIG.BATCH_CREATE_CHUNK_SIZE) || 25;
    const supportsBatch = Boolean(People.People && typeof People.People.batchCreateContacts === 'function');
    const createdByGroupRes = {};

    for (let offset = 0; offset < items.length; offset += chunkSize) {
      if (Date.now() - startTimeMs >= WORKER_CONFIG.MAX_EXECUTION_MS) break;
      const slice = items.slice(offset, offset + chunkSize);
      const batchEntries = [];

      for (let s = 0; s < slice.length; s++) {
        const item = slice[s];
        const cleanPhone = formatWorkerPhone_(item.cleanPhone || item.noHp);
        if (!cleanPhone) continue;
        const cats = Array.isArray(item.catObjs) ? item.catObjs : [];
        const catBioLine = cats.length > 0
          ? cats.map(function (c) { return c.nama + (c.kode ? ' (' + c.kode + ')' : ''); }).join(', ')
          : 'Tanpa Kategori';
        const bioText =
          'Kategori: ' + catBioLine + '\n' +
          'Jenis Kelamin: ' + (item.jenisKelamin || 'Laki-laki') + '\n' +
          'WA: https://wa.me/' + cleanPhone + '\n' +
          WORKER_CONFIG.SYNC_MARKER;

        const customGroupResList = [];
        const addedRes = {};
        for (let g = 0; g < cats.length; g++) {
          const rName = groupMaps.nameToRes[cats[g].nama];
          if (rName && !addedRes[rName]) {
            addedRes[rName] = true;
            customGroupResList.push(rName);
          }
        }

        batchEntries.push({
          cleanPhone: cleanPhone,
          customGroupResList: customGroupResList,
          contactPerson: {
            names: [{ givenName: String(item.nama || ('+' + cleanPhone)).trim() }],
            phoneNumbers: [{ value: '+' + cleanPhone, type: 'mobile' }],
            biographies: [{ value: bioText, contentType: 'TEXT_PLAIN' }]
          }
        });
      }

      if (batchEntries.length === 0) continue;

      let chunkCreated = 0;
      let batchQuota = false;
      let firstErr = '';

      if (supportsBatch) {
        try {
          const resp = People.People.batchCreateContacts({
            contacts: batchEntries.map(function (entry) {
              return { contactPerson: entry.contactPerson };
            }),
            readMask: 'metadata,phoneNumbers'
          });
          const createdList = resp && Array.isArray(resp.createdPeople) ? resp.createdPeople : [];
          for (let k = 0; k < Math.min(batchEntries.length, createdList.length); k++) {
            const cp = createdList[k];
            const code = Number((cp && cp.httpStatusCode) || 0);
            const resName = cp && cp.person && cp.person.resourceName ? String(cp.person.resourceName) : '';
            const ok = Boolean(resName) && (!code || (code >= 200 && code < 300));
            if (ok) {
              const entry = batchEntries[k];
              createdPhones.push(entry.cleanPhone);
              chunkCreated++;
              for (let g = 0; g < entry.customGroupResList.length; g++) {
                const gRes = entry.customGroupResList[g];
                if (!createdByGroupRes[gRes]) createdByGroupRes[gRes] = [];
                createdByGroupRes[gRes].push(resName);
              }
            } else if (!firstErr) {
              const stMsg = cp && cp.status && cp.status.message ? cp.status.message : ('HTTP ' + (code || 'Unknown'));
              firstErr = stMsg;
              if (code === 429 || isWorkerQuotaError_(stMsg)) batchQuota = true;
            }
          }
        } catch (bErr) {
          firstErr = bErr.message;
          if (isWorkerQuotaError_(bErr)) batchQuota = true;
        }
      }

      if (batchQuota) {
        rateLimited = true;
        if (createdPhones.length === 0) errorMsg = firstErr;
        break;
      }

      if (chunkCreated === 0 && !errorMsg) {
        for (let k = 0; k < batchEntries.length; k++) {
          try {
            const entry = batchEntries[k];
            const person = People.People.createContact(entry.contactPerson);
            const resName = person && person.resourceName ? String(person.resourceName) : '';
            createdPhones.push(entry.cleanPhone);
            chunkCreated++;
            if (resName) {
              for (let g = 0; g < entry.customGroupResList.length; g++) {
                const gRes = entry.customGroupResList[g];
                if (!createdByGroupRes[gRes]) createdByGroupRes[gRes] = [];
                createdByGroupRes[gRes].push(resName);
              }
            }
          } catch (cErr) {
            rateLimited = isWorkerQuotaError_(cErr);
            if (!rateLimited || createdPhones.length === 0) {
              errorMsg = cErr.message;
            }
            break;
          }
        }
      }

      if (errorMsg || rateLimited) break;
      if (offset + chunkSize < items.length) Utilities.sleep(350);
    }

    // 3. Tempelkan label kategori secara massal (1 API call per kategori)
    const grpKeys = Object.keys(createdByGroupRes);
    for (let g = 0; g < grpKeys.length; g++) {
      try {
        attachWorkerContactsToGroupBulk_(grpKeys[g], createdByGroupRes[grpKeys[g]]);
      } catch (_) {}
    }
  } else {
    // Fallback ContactsApp
    const myContactsGroup = ContactsApp.getContactGroup('System Group: My Contacts');
    for (let i = 0; i < items.length; i++) {
      if (Date.now() - startTimeMs >= WORKER_CONFIG.MAX_EXECUTION_MS) break;
      const item = items[i];
      const cleanPhone = formatWorkerPhone_(item.cleanPhone || item.noHp);
      if (!cleanPhone) continue;
      try {
        const contact = ContactsApp.createContact(String(item.nama || ('+' + cleanPhone)).trim(), '', '');
        contact.addPhone(ContactsApp.Field.MOBILE_PHONE, '+' + cleanPhone);
        if (myContactsGroup) myContactsGroup.addContact(contact);
        const cats = Array.isArray(item.catObjs) ? item.catObjs : [];
        for (let c = 0; c < cats.length; c++) {
          const nm = String(cats[c].nama || '').trim();
          if (!nm) continue;
          let grp = ContactsApp.getContactGroup(nm);
          if (!grp) grp = ContactsApp.createContactGroup(nm);
          grp.addContact(contact);
        }
        createdPhones.push(cleanPhone);
      } catch (caErr) {
        errorMsg = caErr.message;
        break;
      }
    }
  }

  return {
    status: createdPhones.length > 0 || !errorMsg ? 'success' : 'error',
    email: email,
    createdPhones: createdPhones,
    createdCount: createdPhones.length,
    rateLimited: rateLimited,
    message: errorMsg || ('Berhasil menyinkronkan +' + createdPhones.length + ' kontak di ' + (email || 'akun Worker') + '.')
  };
}

/**
 * Menghapus isi Google Kontak di akun Worker ini (Akun 2 / Akun 3 / dst.) memakai batchDeleteContacts (500 kontak/panggilan).
 * TIDAK menyentuh Spreadsheet sama sekali.
 * Catatan Google API: kontak terhapus masuk ke Sampah Google Kontak (contacts.google.com/trash) karena People API tidak menyediakan endpoint pengosongan Sampah permanen.
 */
function handleWorkerClearContacts_(probe, email) {
  const startTimeMs = Date.now();
  let deletedCount = 0;
  let totalBefore = 0;
  let rateLimited = false;
  let errorMsg = '';

  if (probe.engine === 'PeopleAPI') {
    const connections = listWorkerPeopleContacts_('names');
    const resourceNames = [];
    for (let i = 0; i < connections.length; i++) {
      if (connections[i] && connections[i].resourceName) {
        resourceNames.push(connections[i].resourceName);
      }
    }
    totalBefore = resourceNames.length;
    if (totalBefore === 0) {
      return {
        status: 'success',
        email: email,
        deletedCount: 0,
        remainingCount: 0,
        hasMore: false,
        rateLimited: false,
        message: 'Google Kontak di ' + (email || 'akun ini') + ' sudah kosong (0 kontak).'
      };
    }

    const supportsBatchDelete = Boolean(
      People.People && typeof People.People.batchDeleteContacts === 'function'
    );
    const batchChunkSize = 500;

    if (supportsBatchDelete) {
      for (let offset = 0; offset < resourceNames.length; offset += batchChunkSize) {
        if (Date.now() - startTimeMs >= WORKER_CONFIG.MAX_EXECUTION_MS) break;
        const slice = resourceNames.slice(offset, offset + batchChunkSize);
        try {
          People.People.batchDeleteContacts({ resourceNames: slice });
          deletedCount += slice.length;
        } catch (batchErr) {
          rateLimited = isWorkerQuotaError_(batchErr);
          if (rateLimited) {
            errorMsg = 'Batas kuota per menit Google API tercapai sementara.';
            break;
          }
          // Fallback hapus satu-per-satu jika batchDeleteContacts ditolak
          for (let j = 0; j < slice.length; j++) {
            if (Date.now() - startTimeMs >= WORKER_CONFIG.MAX_EXECUTION_MS) break;
            try {
              People.People.deleteContact(slice[j]);
              deletedCount += 1;
            } catch (singleErr) {
              rateLimited = isWorkerQuotaError_(singleErr);
              errorMsg = singleErr.message;
              break;
            }
          }
          if (rateLimited || errorMsg) break;
        }
        if (offset + batchChunkSize < resourceNames.length) Utilities.sleep(300);
      }
    } else {
      for (let i = 0; i < resourceNames.length; i++) {
        if (Date.now() - startTimeMs >= WORKER_CONFIG.MAX_EXECUTION_MS) break;
        try {
          People.People.deleteContact(resourceNames[i]);
          deletedCount += 1;
        } catch (err) {
          rateLimited = isWorkerQuotaError_(err);
          errorMsg = err.message;
          break;
        }
      }
    }
  } else {
    const allContacts = ContactsApp.getContacts();
    totalBefore = allContacts.length;
    for (let i = 0; i < allContacts.length; i++) {
      if (Date.now() - startTimeMs >= WORKER_CONFIG.MAX_EXECUTION_MS) break;
      try {
        ContactsApp.deleteContact(allContacts[i]);
        deletedCount += 1;
      } catch (caErr) {
        errorMsg = caErr.message;
        break;
      }
    }
  }

  const remainingCount = Math.max(0, totalBefore - deletedCount);
  return {
    status: deletedCount > 0 || !errorMsg ? 'success' : 'error',
    email: email,
    deletedCount: deletedCount,
    remainingCount: remainingCount,
    hasMore: remainingCount > 0,
    rateLimited: rateLimited,
    message: remainingCount === 0
      ? ('Berhasil menghapus seluruh ' + deletedCount + ' kontak di ' + (email || 'akun Worker') + '. Lanjutkan buka Sampah Google Kontak untuk mengosongkan permanen.')
      : ('Berhasil menghapus ' + deletedCount + ' kontak (sisa ' + remainingCount + ' kontak). ' + (errorMsg || 'Klik lagi untuk melanjutkan penghapusan sisa.'))
  };
}
