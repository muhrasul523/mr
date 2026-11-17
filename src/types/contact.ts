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
