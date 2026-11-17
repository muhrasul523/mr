export type GenderOption = 'Laki-laki' | 'Perempuan' | 'Admin';

export const GENDER_OPTIONS: GenderOption[] = [
  'Laki-laki',
  'Perempuan',
  'Admin',
];

export interface CategoryItem {
  nama: string;
  kode: string;
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { nama: 'Keluarga', kode: 'Fam' },
  { nama: 'Klien', kode: 'Kln' },
  { nama: 'Partner', kode: 'Prt' },
  { nama: 'VIP', kode: 'VIP' },
  { nama: 'Internal', kode: 'Int' },
];

export interface Contact {
  nama: string;
  noHp: string;
  kategori: string;
  jenisKelamin: GenderOption;
}

export const TANPA_KATEGORI_LABEL = 'Tanpa Kategori';

export interface HistoryLog {
  waktu: string;
  action: string;
  nama: string;
  noHp: string;
  detail: string;
}

export interface GoogleSyncStatus {
  engine: 'PeopleAPI' | 'ContactsApp' | 'Unavailable' | string;
  connected: boolean;
  error: string;
  totalInSyncSheet: number;
  syncedCount: number;
  unsyncedCount: number;
  unsyncedPhones: string[];
  lastSyncAt: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  variant: 'success' | 'error' | 'info';
}

export const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbwhW4FZA-tmNspivfoCzCm4P_yY9vCAckWnG6z6DrBJJVDY-HjAlkRiMYbcNTR8NMLVJQ/exec';

export function sanitizeLivePhoneInput(rawInput: string): string {
  let digits = String(rawInput || '').replace(/\D/g, '');
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  }
  return digits;
}

export function normalizePhoneForWA(rawPhone: string): string {
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

export function buildWhatsAppUrl(rawPhone: string): string {
  const cleanDigits = normalizePhoneForWA(rawPhone);
  return `https://wa.me/${encodeURIComponent(cleanDigits)}`;
}

export function makeDefaultCategoryCode(name: string): string {
  const clean = String(name || '').replace(/[^a-zA-Z0-9]/g, '');
  return (clean.slice(0, 3) || 'KAT').toUpperCase();
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDisplayDateTime(rawInput?: string | Date): string {
  if (!rawInput) return '';
  if (rawInput instanceof Date) {
    if (Number.isNaN(rawInput.getTime())) return '';
    return `${pad2(rawInput.getDate())} ${SHORT_MONTHS[rawInput.getMonth()]} ${rawInput.getFullYear()} ${pad2(rawInput.getHours())}:${pad2(rawInput.getMinutes())}:${pad2(rawInput.getSeconds())}`;
  }

  const trimmed = String(rawInput).trim();
  if (!trimmed) return '';

  // Already formatted as "17 Nov 2026 09:46:57"
  if (/^\d{2}\s[A-Za-z]{3}\s\d{4}\s\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // Match "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss..."
  const m = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/
  );
  if (m) {
    const year = Number(m[1]);
    const monthIdx = Number(m[2]) - 1;
    const day = Number(m[3]);
    const monthLabel = SHORT_MONTHS[monthIdx] || m[2];
    return `${pad2(day)} ${monthLabel} ${year} ${m[4]}:${m[5]}:${m[6]}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return `${pad2(parsed.getDate())} ${SHORT_MONTHS[parsed.getMonth()]} ${parsed.getFullYear()} ${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`;
  }

  return trimmed;
}
