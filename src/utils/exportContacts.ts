import * as XLSX from 'xlsx';
import {
  CategoryItem,
  Contact,
  GoogleAccountConfig,
  TANPA_KATEGORI_LABEL,
  formatDisplayDateTime,
  getAccountLabelById,
  normalizePhoneForWA,
  parseStoredAccountIds,
} from '../types/contact';

function buildDateStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getCategoryCode(catName: string, categories: CategoryItem[]): string {
  if (!catName) return '';
  const found = categories.find(
    (c) => c.nama.toLowerCase() === catName.toLowerCase()
  );
  return found ? found.kode : '';
}

function formatStatusLabel(lastAction?: Contact['lastAction']): string {
  if (lastAction === 'created') return 'Tambah';
  if (lastAction === 'updated') return 'Edit';
  return '-';
}

export function exportContactsToXlsx(
  contacts: Contact[],
  categories: CategoryItem[],
  filenamePrefix = 'Kontak_Wadah_Digital',
  accounts: GoogleAccountConfig[] = []
) {
  const rows = contacts.map((c, idx) => {
    const cleanPhone = normalizePhoneForWA(c.noHp);
    const catClean = String(c.kategori || '').trim();
    const catCode = getCategoryCode(catClean, categories);
    const storedIds = parseStoredAccountIds(c.akun, accounts);
    const accLabel =
      storedIds.length > 0
        ? storedIds.map((id) => getAccountLabelById(id, accounts)).join(', ')
        : String(c.akun || '').trim();
    return {
      No: idx + 1,
      Nama: c.nama,
      'No HP (WA)': cleanPhone,
      Kategori: catClean || TANPA_KATEGORI_LABEL,
      'Kode Kategori': catCode || '-',
      'Jenis Kelamin': c.jenisKelamin || 'Laki-laki',
      'Akun Google': accLabel,
      Waktu: c.updatedAt ? formatDisplayDateTime(c.updatedAt) : '-',
      Status: formatStatusLabel(c.lastAction),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 6 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 22 },
    { wch: 10 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Kontak');
  XLSX.writeFile(workbook, `${filenamePrefix}_${buildDateStamp()}.xlsx`);
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportContactsToCsv(
  contacts: Contact[],
  categories: CategoryItem[],
  filenamePrefix = 'Kontak_Wadah_Digital',
  accounts: GoogleAccountConfig[] = []
) {
  const headers = [
    'No',
    'Nama',
    'No HP (WA)',
    'Kategori',
    'Kode Kategori',
    'Jenis Kelamin',
    'Akun Google',
    'Waktu',
    'Status',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];

  for (let i = 0; i < contacts.length; i += 1) {
    const c = contacts[i];
    const cleanPhone = normalizePhoneForWA(c.noHp);
    const catClean = String(c.kategori || '').trim();
    const catCode = getCategoryCode(catClean, categories);
    const storedIds = parseStoredAccountIds(c.akun, accounts);
    const accLabel =
      storedIds.length > 0
        ? storedIds.map((id) => getAccountLabelById(id, accounts)).join(', ')
        : String(c.akun || '').trim();
    lines.push(
      [
        i + 1,
        c.nama,
        cleanPhone,
        catClean || TANPA_KATEGORI_LABEL,
        catCode || '-',
        c.jenisKelamin || 'Laki-laki',
        accLabel,
        c.updatedAt ? formatDisplayDateTime(c.updatedAt) : '-',
        formatStatusLabel(c.lastAction),
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, `${filenamePrefix}_${buildDateStamp()}.csv`);
}

function escapeVCardText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function exportContactsToVcf(
  contacts: Contact[],
  categories: CategoryItem[],
  filenamePrefix = 'Kontak_Wadah_Digital'
) {
  const cards: string[] = [];

  for (let i = 0; i < contacts.length; i += 1) {
    const c = contacts[i];
    const cleanPhone = normalizePhoneForWA(c.noHp);
    if (!cleanPhone && !c.nama.trim()) continue;

    const fullName = c.nama.trim() || `+${cleanPhone}`;
    const catClean = String(c.kategori || '').trim();
    const catCode = getCategoryCode(catClean, categories);
    const catNote = catClean
      ? `${catClean}${catCode ? ` (${catCode})` : ''}`
      : TANPA_KATEGORI_LABEL;
    const gender = c.jenisKelamin || 'Laki-laki';

    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${escapeVCardText(fullName)}`,
      `N:;${escapeVCardText(fullName)};;;`,
      `TEL;TYPE=CELL:+${cleanPhone}`,
    ];

    if (catClean) {
      lines.push(`CATEGORIES:${escapeVCardText(catClean)}`);
    }

    lines.push(
      `NOTE:${escapeVCardText(`Kategori: ${catNote} | Jenis Kelamin: ${gender} | WA: https://wa.me/${cleanPhone}`)}`
    );
    lines.push('END:VCARD');
    cards.push(lines.join('\r\n'));
  }

  const vcfContent = cards.join('\r\n') + '\r\n';
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
  triggerBlobDownload(blob, `${filenamePrefix}_${buildDateStamp()}.vcf`);
}

export interface GroupedGoogleExportItem {
  cleanPhone: string;
  nama: string;
  jenisKelamin: string;
  catObjs: Array<{ nama: string; kode: string }>;
  savedAccountLabels: string[];
}

const GOOGLE_SYNC_MARKER = 'Disinkronkan oleh MR Wadah Digital';

function slugifyFilenamePart(raw: string): string {
  return String(raw || '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

/**
 * Mengelompokkan baris Kontak_Sync berdasarkan nomor HP unik secara instan di browser
 * (menggabungkan multi-kategori ke 1 entri Google Kontak berlabel lengkap).
 */
export function buildGroupedGoogleContacts(
  rows: Contact[],
  categories: CategoryItem[],
  resolveSavedLabels?: (c: Contact, cleanPhone: string) => string[]
): GroupedGoogleExportItem[] {
  const catCodeByLower = new Map<string, { nama: string; kode: string }>();
  for (const cat of categories) {
    catCodeByLower.set(cat.nama.toLowerCase(), { nama: cat.nama, kode: cat.kode });
  }

  const byPhone = new Map<string, GroupedGoogleExportItem>();
  const order: string[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const cleanPhone = normalizePhoneForWA(r.noHp);
    if (!cleanPhone || cleanPhone.length < 8) continue;

    const namaClean = String(r.nama || '').trim();
    const catClean = String(r.kategori || '').trim();
    const genderClean = r.jenisKelamin || 'Laki-laki';

    let catObj: { nama: string; kode: string } | null = null;
    if (catClean) {
      const found = catCodeByLower.get(catClean.toLowerCase());
      catObj = found || {
        nama: catClean,
        kode: (catClean.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3) || 'KAT').toUpperCase(),
      };
    }

    let existing = byPhone.get(cleanPhone);
    if (!existing) {
      existing = {
        cleanPhone,
        nama: namaClean || `+${cleanPhone}`,
        jenisKelamin: genderClean,
        catObjs: [],
        savedAccountLabels: resolveSavedLabels ? resolveSavedLabels(r, cleanPhone) : [],
      };
      byPhone.set(cleanPhone, existing);
      order.push(cleanPhone);
    } else if ((!existing.nama || existing.nama.startsWith('+')) && namaClean) {
      existing.nama = namaClean;
    }

    if (
      catObj &&
      !existing.catObjs.some((c) => c.nama.toLowerCase() === catObj!.nama.toLowerCase())
    ) {
      existing.catObjs.push(catObj);
    }
  }

  return order.map((phone) => byPhone.get(phone)!);
}

export interface MassExportFilenameMeta {
  selectedCategories: string[];
  gender: string;
  accountTag: string;
  onlyUnsynced: boolean;
}

function buildMassExportSlug(meta: MassExportFilenameMeta): string {
  const parts = ['Google_Kontak'];
  if (meta.selectedCategories.length === 0) {
    parts.push('SemuaKat');
  } else if (meta.selectedCategories.length === 1) {
    parts.push(slugifyFilenamePart(meta.selectedCategories[0]));
  } else {
    parts.push(`${meta.selectedCategories.length}Kategori`);
  }
  if (meta.gender && meta.gender !== 'ALL') {
    parts.push(slugifyFilenamePart(meta.gender));
  }
  if (meta.accountTag) {
    parts.push(slugifyFilenamePart(meta.accountTag));
  }
  parts.push(meta.onlyUnsynced ? 'BelumTersimpan' : 'Semua');
  return parts.filter(Boolean).join('_');
}

/**
 * Mengunduh 1 batch (atau 1 file utuh) CSV format resmi Google Kontak secara instan di browser (0 loading server).
 */
export function downloadGoogleContactsCsvBatch(
  slice: GroupedGoogleExportItem[],
  part: number,
  totalParts: number,
  isSingleFile: boolean,
  meta: MassExportFilenameMeta
): string {
  const headers = [
    'Name',
    'Given Name',
    'Group Membership',
    'Phone 1 - Type',
    'Phone 1 - Value',
    'Notes',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];

  for (let i = 0; i < slice.length; i += 1) {
    const item = slice[i];
    const displayName = item.nama || `+${item.cleanPhone}`;
    const groups = ['* myContacts'];
    for (let c = 0; c < item.catObjs.length; c += 1) {
      if (item.catObjs[c].nama) groups.push(item.catObjs[c].nama);
    }
    const catBioLine =
      item.catObjs.length > 0
        ? item.catObjs.map((c) => `${c.nama} (${c.kode})`).join(', ')
        : TANPA_KATEGORI_LABEL;
    const bioText =
      `Kategori: ${catBioLine}\n` +
      `Jenis Kelamin: ${item.jenisKelamin}\n` +
      `WA: https://wa.me/${item.cleanPhone}\n` +
      GOOGLE_SYNC_MARKER;

    lines.push(
      [
        displayName,
        displayName,
        groups.join(' ::: '),
        'Mobile',
        `+${item.cleanPhone}`,
        bioText,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  const slug = buildMassExportSlug(meta);
  const partSuffix = isSingleFile
    ? `Utuh_${slice.length}`
    : `Batch_${part}_dari_${totalParts}`;
  const filename = `${slug}_${partSuffix}_${buildDateStamp()}.csv`;

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
  return filename;
}

/**
 * Mengunduh seluruh hasil filter aktif Kontak_Sync ke Excel (.xlsx) secara instan di browser.
 */
export function downloadSyncContactsExcel(
  items: GroupedGoogleExportItem[],
  meta: MassExportFilenameMeta
): string {
  const rows = items.map((item, idx) => ({
    No: idx + 1,
    'Nama di Google Kontak': item.nama,
    'No HP (WA)': item.cleanPhone,
    Kategori:
      item.catObjs.length > 0
        ? item.catObjs.map((c) => c.nama).join(', ')
        : TANPA_KATEGORI_LABEL,
    'Kode Kategori':
      item.catObjs.length > 0 ? item.catObjs.map((c) => c.kode).join(', ') : '-',
    'Jenis Kelamin': item.jenisKelamin || 'Laki-laki',
    'Akun Google': item.savedAccountLabels.join(', '),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet['!cols'] = [
    { wch: 7 },
    { wch: 30 },
    { wch: 18 },
    { wch: 24 },
    { wch: 16 },
    { wch: 14 },
    { wch: 22 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Kontak_Sync');
  const slug = buildMassExportSlug(meta);
  const filename = `${slug}_${items.length}_Kontak_${buildDateStamp()}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return filename;
}

export interface ConvertedGoogleContact {
  cleanPhone: string;
  nama: string;
  labels: string[];
  jenisKelamin: string;
}

export interface ExcelConversionResult {
  fileName: string;
  sheetName: string;
  totalRawRows: number;
  validRows: number;
  skippedRows: number;
  duplicatePhonesMerged: number;
  uniqueContacts: ConvertedGoogleContact[];
  detectedLabels: string[];
  detectedColumns: {
    nama: string;
    kategori: string;
    noHp: string;
  };
}

/**
 * Mengunduh file Template Excel (.xlsx) untuk diisi manual (Nama Kontak, Kategori/Label, No HP)
 * lalu dikonversi instan ke CSV Google Kontak tanpa perlu disimpan ke Google Drive.
 */
export function downloadManualContactExcelTemplate(): string {
  const templateRows = [
    {
      'Nama Kontak': '.L Ahmad Fauzi',
      'Kategori / Label': 'Keluarga',
      'No HP': '081234567890',
    },
    {
      'Nama Kontak': '.P Siti Rahmah',
      'Kategori / Label': 'STIBA 23, Alumni',
      'No HP': '6285242540658',
    },
    {
      'Nama Kontak': 'Admin Layanan',
      'Kategori / Label': 'Admin',
      'No HP': '082292228903',
    },
  ];

  const dataSheet = XLSX.utils.json_to_sheet(templateRows);
  dataSheet['!cols'] = [{ wch: 32 }, { wch: 28 }, { wch: 20 }];

  // Paksa kolom No HP (kolom C) bertipe teks agar angka 0 di depan tidak hilang di Excel
  for (let r = 2; r <= templateRows.length + 1; r += 1) {
    const cellRef = `C${r}`;
    if (dataSheet[cellRef]) {
      dataSheet[cellRef].t = 's';
      dataSheet[cellRef].z = '@';
    }
  }

  const guideRows = [
    { Panduan: '1. Isi daftar kontak pada sheet "Data_Kontak" (baris contoh boleh dihapus atau ditimpa).' },
    { Panduan: '2. Kolom "Nama Kontak": masukkan nama lengkap sesuai keinginan tampil di Google Kontak.' },
    { Panduan: '3. Kolom "Kategori / Label": boleh kosong, 1 label (mis. Keluarga), atau banyak label dipisah koma (mis. STIBA 23, Alumni).' },
    { Panduan: '4. Kolom "No HP": boleh awalan 08..., 628..., atau +628... — sistem otomatis merapikan ke format +62... saat konversi CSV.' },
    { Panduan: '5. Nomor HP yang sama pada beberapa baris otomatis digabung menjadi 1 kontak dengan semua labelnya.' },
    { Panduan: '6. Simpan file Excel ini di HP/komputer Anda, lalu unggah ke Konverter Excel -> CSV (100% di browser, tidak disimpan ke Drive).' },
  ];
  const guideSheet = XLSX.utils.json_to_sheet(guideRows);
  guideSheet['!cols'] = [{ wch: 96 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data_Kontak');
  XLSX.utils.book_append_sheet(workbook, guideSheet, 'Panduan');

  const filename = `Template_Kontak_Manual_${buildDateStamp()}.xlsx`;
  XLSX.writeFile(workbook, filename);
  return filename;
}

function normalizeCellText(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' && Number.isFinite(val)) {
    return Number.isInteger(val) ? val.toFixed(0) : String(val);
  }
  const str = String(val).trim();
  // Tangani notasi ilmiah Excel seperti "6.28524E+11" atau "6,28524E+11"
  if (/^\d+[.,]\d+[eE]\+\d+$/.test(str)) {
    const parsed = Number(str.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed).toFixed(0);
    }
  }
  return str;
}

function scoreHeaderCell(header: string): 'nama' | 'kategori' | 'noHp' | 'gender' | null {
  const h = header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!h) return null;
  if (
    h === 'no hp' ||
    h === 'nomor hp' ||
    h === 'no hp wa' ||
    h === 'hp' ||
    h === 'wa' ||
    h === 'whatsapp' ||
    h === 'no wa' ||
    h === 'nomor wa' ||
    h === 'telepon' ||
    h === 'telp' ||
    h === 'phone' ||
    h === 'mobile' ||
    h.includes('phone') ||
    h.includes('no hp') ||
    h.includes('nomor hp') ||
    h.includes('whatsapp')
  ) {
    return 'noHp';
  }
  if (
    h === 'kategori' ||
    h === 'kategori label' ||
    h === 'label' ||
    h === 'group' ||
    h === 'grup' ||
    h === 'group membership' ||
    h === 'tags' ||
    h.includes('kategori') ||
    h.includes('label')
  ) {
    return 'kategori';
  }
  if (
    h === 'jenis kelamin' ||
    h === 'jk' ||
    h === 'gender' ||
    h.includes('kelamin')
  ) {
    return 'gender';
  }
  if (
    h === 'nama' ||
    h === 'nama kontak' ||
    h === 'nama di google kontak' ||
    h === 'name' ||
    h === 'full name' ||
    h === 'given name' ||
    h.includes('nama') ||
    h.includes('name')
  ) {
    return 'nama';
  }
  return null;
}

function looksLikePhone(val: string): boolean {
  const digits = val.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15 && /^(08|62|8)/.test(digits);
}

/**
 * Membaca file Excel (.xlsx/.xls) atau CSV langsung di browser (TANPA unggah ke server/Drive)
 * dan mengubahnya menjadi daftar kontak unik siap ekspor ke CSV resmi Google Kontak.
 */
export function parseExcelToGoogleContacts(
  arrayBuffer: ArrayBuffer,
  fileName: string
): ExcelConversionResult {
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: true });
  const preferredSheet =
    workbook.SheetNames.find((n) => n.toLowerCase() === 'data_kontak') ||
    workbook.SheetNames.find((n) => n.toLowerCase() !== 'panduan') ||
    workbook.SheetNames[0];

  if (!preferredSheet) {
    throw new Error('File tidak memiliki sheet yang dapat dibaca.');
  }

  const sheet = workbook.Sheets[preferredSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (!matrix || matrix.length === 0) {
    throw new Error('Sheet pada file Excel masih kosong.');
  }

  // Cari baris header terbaik dalam 5 baris pertama
  let headerRowIdx = -1;
  let colNama = -1;
  let colKategori = -1;
  let colNoHp = -1;
  let colGender = -1;

  const scanLimit = Math.min(matrix.length, 5);
  for (let r = 0; r < scanLimit; r += 1) {
    const row = Array.isArray(matrix[r]) ? matrix[r] : [];
    let foundNama = -1;
    let foundKat = -1;
    let foundHp = -1;
    let foundGender = -1;

    for (let c = 0; c < row.length; c += 1) {
      const text = normalizeCellText(row[c]);
      const role = scoreHeaderCell(text);
      if (role === 'nama' && foundNama === -1) foundNama = c;
      else if (role === 'kategori' && foundKat === -1) foundKat = c;
      else if (role === 'noHp' && foundHp === -1) foundHp = c;
      else if (role === 'gender' && foundGender === -1) foundGender = c;
    }

    const matchedCount = [foundNama, foundKat, foundHp].filter((idx) => idx !== -1).length;
    if (matchedCount >= 2 || (foundHp !== -1 && foundNama !== -1)) {
      headerRowIdx = r;
      colNama = foundNama;
      colKategori = foundKat;
      colNoHp = foundHp;
      colGender = foundGender;
      break;
    }
  }

  // Fallback jika file tanpa header (mis. hasil paste langsung 3 kolom)
  let startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;
  if (headerRowIdx === -1) {
    const sample = Array.isArray(matrix[0]) ? matrix[0] : [];
    const c1Phone = looksLikePhone(normalizeCellText(sample[1]));
    const c2Phone = looksLikePhone(normalizeCellText(sample[2]));
    colNama = 0;
    if (c1Phone && !c2Phone) {
      // Format Kontak_Sync: [Nama, No HP, Kategori]
      colNoHp = 1;
      colKategori = sample.length >= 3 ? 2 : -1;
    } else {
      // Format Template Manual: [Nama, Kategori, No HP]
      colKategori = 1;
      colNoHp = 2;
    }
    startRow = 0;
  }

  if (colNoHp === -1) {
    throw new Error(
      'Kolom "No HP" tidak ditemukan. Gunakan Template Excel atau pastikan ada kolom bernama "No HP" / "HP" / "Phone".'
    );
  }

  const headerRow = headerRowIdx >= 0 && Array.isArray(matrix[headerRowIdx]) ? matrix[headerRowIdx] : [];
  const detectedColumns = {
    nama:
      colNama >= 0
        ? normalizeCellText(headerRow[colNama]) || `Kolom ${colNama + 1}`
        : '(Otomatis dari No HP)',
    kategori:
      colKategori >= 0
        ? normalizeCellText(headerRow[colKategori]) || `Kolom ${colKategori + 1}`
        : '(Tidak ada)',
    noHp: normalizeCellText(headerRow[colNoHp]) || `Kolom ${colNoHp + 1}`,
  };

  const byPhone = new Map<string, ConvertedGoogleContact>();
  const order: string[] = [];
  const labelSet = new Set<string>();
  let totalRawRows = 0;
  let validRows = 0;
  let skippedRows = 0;
  let duplicatePhonesMerged = 0;

  for (let r = startRow; r < matrix.length; r += 1) {
    const row = Array.isArray(matrix[r]) ? matrix[r] : [];
    const rawNama = colNama >= 0 ? normalizeCellText(row[colNama]) : '';
    const rawKat = colKategori >= 0 ? normalizeCellText(row[colKategori]) : '';
    const rawHp = normalizeCellText(row[colNoHp]);
    const rawGender = colGender >= 0 ? normalizeCellText(row[colGender]) : '';

    if (!rawNama && !rawKat && !rawHp) continue;
    totalRawRows += 1;

    const cleanPhone = normalizePhoneForWA(rawHp);
    if (!cleanPhone || cleanPhone.length < 8) {
      skippedRows += 1;
      continue;
    }

    validRows += 1;
    const parsedLabels = rawKat
      ? rawKat
          .split(/[,;|]+|:::/)
          .map((s) => s.trim())
          .filter((s) => s && s !== '* myContacts' && s.toLowerCase() !== 'tanpa kategori')
      : [];

    let existing = byPhone.get(cleanPhone);
    if (!existing) {
      existing = {
        cleanPhone,
        nama: rawNama || `+${cleanPhone}`,
        labels: [],
        jenisKelamin: rawGender || '',
      };
      byPhone.set(cleanPhone, existing);
      order.push(cleanPhone);
    } else {
      duplicatePhonesMerged += 1;
      if ((!existing.nama || existing.nama.startsWith('+')) && rawNama) {
        existing.nama = rawNama;
      }
      if (!existing.jenisKelamin && rawGender) {
        existing.jenisKelamin = rawGender;
      }
    }

    for (let i = 0; i < parsedLabels.length; i += 1) {
      const lbl = parsedLabels[i];
      if (!existing.labels.some((x) => x.toLowerCase() === lbl.toLowerCase())) {
        existing.labels.push(lbl);
      }
      labelSet.add(lbl);
    }
  }

  const uniqueContacts = order.map((phone) => byPhone.get(phone)!);
  if (uniqueContacts.length === 0) {
    throw new Error(
      'Tidak ada nomor HP valid yang ditemukan. Pastikan kolom "No HP" berisi nomor minimal 8 digit (mis. 0812... atau 62812...).'
    );
  }

  return {
    fileName,
    sheetName: preferredSheet,
    totalRawRows,
    validRows,
    skippedRows,
    duplicatePhonesMerged,
    uniqueContacts,
    detectedLabels: Array.from(labelSet).sort((a, b) => a.localeCompare(b, 'id')),
    detectedColumns,
  };
}

/**
 * Mengunduh CSV resmi Google Kontak hasil konversi file Excel manual (0 panggilan server, 0 Drive).
 */
export function downloadConvertedGoogleCsvBatch(
  slice: ConvertedGoogleContact[],
  part: number,
  totalParts: number,
  isSingleFile: boolean,
  sourceFileName: string
): string {
  const headers = [
    'Name',
    'Given Name',
    'Group Membership',
    'Phone 1 - Type',
    'Phone 1 - Value',
    'Notes',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];

  for (let i = 0; i < slice.length; i += 1) {
    const item = slice[i];
    const displayName = item.nama || `+${item.cleanPhone}`;
    const groups = ['* myContacts', ...item.labels];
    const noteParts = [
      `Kategori: ${item.labels.length > 0 ? item.labels.join(', ') : TANPA_KATEGORI_LABEL}`,
    ];
    if (item.jenisKelamin) {
      noteParts.push(`Jenis Kelamin: ${item.jenisKelamin}`);
    }
    noteParts.push(`WA: https://wa.me/${item.cleanPhone}`);
    noteParts.push(GOOGLE_SYNC_MARKER);

    lines.push(
      [
        displayName,
        displayName,
        groups.join(' ::: '),
        'Mobile',
        `+${item.cleanPhone}`,
        noteParts.join('\n'),
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }

  const baseClean = slugifyFilenamePart(sourceFileName.replace(/\.(xlsx|xls|csv)$/i, '')) || 'Excel';
  const partSuffix = isSingleFile
    ? `Utuh_${slice.length}`
    : `Batch_${part}_dari_${totalParts}`;
  const filename = `Google_Kontak_${baseClean}_${partSuffix}_${buildDateStamp()}.csv`;

  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerBlobDownload(blob, filename);
  return filename;
}


