import * as XLSX from 'xlsx';
import {
  CategoryItem,
  Contact,
  TANPA_KATEGORI_LABEL,
  formatDisplayDateTime,
  normalizePhoneForWA,
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
  filenamePrefix = 'Kontak_Wadah_Digital'
) {
  const rows = contacts.map((c, idx) => {
    const cleanPhone = normalizePhoneForWA(c.noHp);
    const catClean = String(c.kategori || '').trim();
    const catCode = getCategoryCode(catClean, categories);
    return {
      No: idx + 1,
      Nama: c.nama,
      'No HP (WA)': cleanPhone,
      Kategori: catClean || TANPA_KATEGORI_LABEL,
      'Kode Kategori': catCode || '-',
      'Jenis Kelamin': c.jenisKelamin || 'Laki-laki',
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
  filenamePrefix = 'Kontak_Wadah_Digital'
) {
  const headers = [
    'No',
    'Nama',
    'No HP (WA)',
    'Kategori',
    'Kode Kategori',
    'Jenis Kelamin',
    'Waktu',
    'Status',
  ];
  const lines = [headers.map(escapeCsvCell).join(',')];

  for (let i = 0; i < contacts.length; i += 1) {
    const c = contacts[i];
    const cleanPhone = normalizePhoneForWA(c.noHp);
    const catClean = String(c.kategori || '').trim();
    const catCode = getCategoryCode(catClean, categories);
    lines.push(
      [
        i + 1,
        c.nama,
        cleanPhone,
        catClean || TANPA_KATEGORI_LABEL,
        catCode || '-',
        c.jenisKelamin || 'Laki-laki',
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
