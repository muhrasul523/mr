export type GenderOption = 'Laki-laki' | 'Perempuan' | 'Admin';

export const GENDER_OPTIONS: GenderOption[] = [
  'Laki-laki',
  'Perempuan',
  'Admin',
];

export interface GoogleAccountConfig {
  id: string;
  label: string;
  email: string;
  workerUrl: string;
  secretKey?: string;
  maxCapacity: number;
  status: 'Aktif' | 'Nonaktif';
  isPrimary?: boolean;
}

export const DEFAULT_GOOGLE_ACCOUNTS: GoogleAccountConfig[] = [
  {
    id: 'AKUN-1',
    label: 'Akun Utama',
    email: '',
    workerUrl: '',
    secretKey: '',
    maxCapacity: 25000,
    status: 'Aktif',
    isPrimary: true,
  },
];

export interface CategoryItem {
  nama: string;
  kode: string;
  akunDefault?: string;
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { nama: 'Keluarga', kode: 'Fam', akunDefault: '' },
  { nama: 'Klien', kode: 'Kln', akunDefault: '' },
  { nama: 'Partner', kode: 'Prt', akunDefault: '' },
  { nama: 'VIP', kode: 'VIP', akunDefault: '' },
  { nama: 'Internal', kode: 'Int', akunDefault: '' },
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
  akun?: string;
}

export const TANPA_KATEGORI_LABEL = 'Tanpa Kategori';
export const TANPA_AKUN_ID = '__NO_ACCOUNT__';
export const TANPA_AKUN_LABEL = 'Tidak Ada Akun (Belum Tersimpan)';
export const CSV_TANPA_KATEGORI_TOKEN = '__TANPA_KATEGORI__';

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

export interface AccountSyncSummary {
  id: string;
  label: string;
  email: string;
  isPrimary: boolean;
  status: 'Aktif' | 'Nonaktif' | string;
  connected: boolean;
  error?: string;
  totalTargetRows: number;
  syncedRows: number;
  unsyncedRows: number;
  googleContactsCount: number;
  maxCapacity: number;
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
  syncedPhonesByAccount?: Record<string, string[]>;
  accountSummaries?: AccountSyncSummary[];
  lastSyncAt: string;
  serverNowMs?: number;
  quota?: GoogleQuotaInfo;
  autoSync?: AutoSyncScheduleState;
  liveProgress?: LiveSyncProgress | null;
}

export interface GoogleCsvExportOptions {
  onlyUnsynced: boolean;
  accountId: string; // 'ALL' | '__NO_ACCOUNT__' | specific account ID
  categories: string[]; // empty = all categories; may include TANPA_KATEGORI_LABEL
  gender: 'ALL' | GenderOption;
  chunkSize: number; // 0 = single file (all in 1); or 500, 1000, 2000, 2500, 3000
}

export interface GoogleCsvExportPlan {
  accountId: string;
  accountLabel: string;
  accountEmail: string;
  totalSyncRows: number;
  totalUniquePhones: number;
  alreadySyncedUnique: number;
  unsyncedUnique: number;
  exportTargetCount: number;
  googleContactsCount: number;
  googleContactsLimit: number;
  remainingGoogleCapacity: number;
  chunkSize: number;
  isSingleFile?: boolean;
  totalParts: number;
  onlyUnsynced: boolean;
  categories?: string[];
  gender?: string;
  filterSummary?: string;
}

export function parseStoredAccountIds(
  rawAkun: string | undefined,
  accounts: GoogleAccountConfig[]
): string[] {
  const text = String(rawAkun || '').trim();
  if (!text) return [];
  const activeAccounts = accounts.length > 0 ? accounts : DEFAULT_GOOGLE_ACCOUNTS;
  const parts = text
    .split(/[,;|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const resolved: string[] = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    const found = activeAccounts.find(
      (a) =>
        a.id.toLowerCase() === lower ||
        a.label.toLowerCase() === lower ||
        (a.email && a.email.toLowerCase() === lower)
    );
    if (found && !resolved.includes(found.id)) {
      resolved.push(found.id);
    }
  }
  return resolved;
}

export function resolveEffectiveAccountId(
  explicitAkun: string | undefined,
  kategoriName: string | undefined,
  categories: CategoryItem[],
  accounts: GoogleAccountConfig[]
): string {
  const activeAccounts = accounts.length > 0 ? accounts : DEFAULT_GOOGLE_ACCOUNTS;
  const primaryId =
    activeAccounts.find((a) => a.isPrimary)?.id || activeAccounts[0]?.id || 'AKUN-1';

  const matchAccount = (raw: string | undefined): string => {
    const clean = String(raw || '').trim().toLowerCase();
    if (!clean) return '';
    const firstToken = clean.split(/[,;|]+/)[0].trim();
    const found = activeAccounts.find(
      (a) =>
        a.id.toLowerCase() === firstToken ||
        a.label.toLowerCase() === firstToken ||
        (a.email && a.email.toLowerCase() === firstToken)
    );
    return found ? found.id : '';
  };

  const explicitId = matchAccount(explicitAkun);
  if (explicitId) return explicitId;

  const cleanCat = String(kategoriName || '').trim().toLowerCase();
  if (cleanCat) {
    const cat = categories.find((c) => c.nama.toLowerCase() === cleanCat);
    const catAccId = matchAccount(cat?.akunDefault);
    if (catAccId) return catAccId;
  }

  return primaryId;
}

export function getAccountLabelById(
  accountId: string | undefined,
  accounts: GoogleAccountConfig[]
): string {
  const clean = String(accountId || '').trim();
  if (clean === TANPA_AKUN_ID) return 'Tidak Ada Akun';
  if (!clean) {
    const p = accounts.find((a) => a.isPrimary) || accounts[0];
    return p ? p.label : 'Akun Utama';
  }
  const found = accounts.find(
    (a) =>
      a.id.toLowerCase() === clean.toLowerCase() ||
      a.label.toLowerCase() === clean.toLowerCase() ||
      (a.email && a.email.toLowerCase() === clean.toLowerCase())
  );
  return found ? found.label : clean;
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
    // Hapus cache lama agar data parsial lawas (mis. 933 baris) tidak tersisa saat melebihi kuota ~5MB
    try {
      localStorage.removeItem(key);
    } catch {
      // Abaikan jika browser memblokir storage
    }
  }
}
