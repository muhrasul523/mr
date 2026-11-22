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

export type ContactActionState = 'created' | 'updated' | '';

export interface Contact {
  rowIndex?: number;
  nama: string;
  noHp: string;
  kategori: string;
  jenisKelamin: GenderOption;
  updatedAt?: string;
  lastAction?: ContactActionState;
}

export const TANPA_KATEGORI_LABEL = 'Tanpa Kategori';

export interface HistoryLog {
  waktu: string;
  action: string;
  nama: string;
  noHp: string;
  detail: string;
}

export interface GoogleQuotaInfo {
  minuteReadsUsed: number;
  minuteReadsLimit: number;
  minuteWritesUsed: number;
  minuteWritesLimit: number;
  dailyRequestsUsed: number;
  dailyRequestsLimit: number;
  googleContactsCount: number;
  googleContactsLimit: number;
  windowRemainingSec: number;
}

export interface LiveSyncProgress {
  active: boolean;
  mode: 'manual' | 'auto' | string;
  phase: 'reading' | 'creating' | 'updating' | 'finishing' | 'idle' | string;
  phaseLabel: string;
  stageTarget: number;
  stageDone: number;
  stageCreated: number;
  stageUpdated: number;
  startedAtMs: number;
  updatedAtMs: number;
}

export interface AutoSyncScheduleState {
  enabled: boolean;
  intervalMinutes: number;
  batchLimit: number;
  triggerActive: boolean;
  lastRunAt: string;
  lastRunAtMs?: number;
  nextRunAtMs?: number;
  lastStageAdded?: number;
  lastRunStatus: 'idle' | 'progress' | 'completed' | 'error' | 'never' | string;
  lastRunDetail: string;
  remainingEstimate: number;
}

export interface GoogleSyncStatus {
  engine: 'PeopleAPI' | 'ContactsApp' | 'Unavailable' | string;
  connected: boolean;
  rateLimited?: boolean;
  error: string;
  totalInSyncSheet: number;
  syncedCount: number;
  unsyncedCount: number;
  unsyncedPhones: string[];
  recentSyncedPhones?: string[];
  lastSyncAt: string;
  serverNowMs?: number;
  quota?: GoogleQuotaInfo;
  autoSync?: AutoSyncScheduleState;
  liveProgress?: LiveSyncProgress | null;
}

export function formatNumberId(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return Math.round(num).toLocaleString('id-ID');
}

export interface ToastMessage {
  id: string;
  title?: string;
  text: string;
  variant: 'success' | 'error' | 'info' | 'warning';
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

export function getGenderShort(gender: GenderOption | string): 'L' | 'P' | 'A' {
  if (gender === 'Perempuan') return 'P';
  if (gender === 'Admin') return 'A';
  return 'L';
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

const MONTH_INDEX_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mei: 4,
  may: 4,
  jun: 5,
  jul: 6,
  agu: 7,
  aug: 7,
  sep: 8,
  okt: 9,
  oct: 9,
  nov: 10,
  des: 11,
  dec: 11,
};

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

  if (/^\d{2}\s[A-Za-z]{3}\s\d{4}\s\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return trimmed;
  }

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

export function parseDisplayDateTimeToMs(rawInput?: string): number {
  if (!rawInput) return 0;
  const trimmed = String(rawInput).trim();
  if (!trimmed) return 0;

  const idMatch = trimmed.match(
    /^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/
  );
  if (idMatch) {
    const day = Number(idMatch[1]);
    const monthIdx = MONTH_INDEX_MAP[idMatch[2].toLowerCase()];
    const year = Number(idMatch[3]);
    const hh = Number(idMatch[4]);
    const mm = Number(idMatch[5]);
    const ss = Number(idMatch[6]);
    if (monthIdx !== undefined) {
      return new Date(year, monthIdx, day, hh, mm, ss).getTime();
    }
  }

  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/
  );
  if (isoMatch) {
    return new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
      Number(isoMatch[4]),
      Number(isoMatch[5]),
      Number(isoMatch[6])
    ).getTime();
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function splitDateTimeLines(rawInput?: string): { date: string; time: string } {
  const formatted = formatDisplayDateTime(rawInput);
  if (!formatted) return { date: '-', time: '' };
  const match = formatted.match(/^(\d{2}\s[A-Za-z]{3}\s\d{4})\s(\d{2}:\d{2}:\d{2})$/);
  if (match) {
    return { date: match[1], time: match[2] };
  }
  return { date: formatted, time: '' };
}

export function safeStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Abaikan silently bila melebihi kuota ~5MB localStorage saat puluhan ribu kontak aktif
  }
}
