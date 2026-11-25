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

