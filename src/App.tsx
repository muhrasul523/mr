import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Info,
  Loader2,
  MessageCircle,
  Pencil,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Smartphone,
  Tag,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  CategoryItem,
  Contact,
  ContactActionState,
  DEFAULT_CATEGORIES,
  DEFAULT_GAS_URL,
  GENDER_OPTIONS,
  GenderOption,
  GoogleSyncStatus,
  HistoryLog,
  TANPA_KATEGORI_LABEL,
  ToastMessage,
  buildWhatsAppUrl,
  formatDisplayDateTime,
  getGenderShort,
  normalizePhoneForWA,
  parseDisplayDateTimeToMs,
  safeStorageSet,
  sanitizeLivePhoneInput,
  splitDateTimeLines,
} from './types/contact';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CodeDeployView } from './components/CodeDeployView';
import { ContactLogo } from './components/ContactLogo';
import { DuplicatePhoneModal } from './components/DuplicatePhoneModal';
import { ActiveFilterState, FilterModal } from './components/FilterModal';
import { HistoryView } from './components/HistoryView';
import { LandingPage } from './components/LandingPage';
import { PaginationBar } from './components/PaginationBar';
import { RecapView } from './components/RecapView';
import { SyncSheetView } from './components/SyncSheetView';
import {
  exportContactsToCsv,
  exportContactsToVcf,
  exportContactsToXlsx,
} from './utils/exportContacts';

const STORAGE_GAS_URL = 'wadah_digital_gas_url';
const STORAGE_LOCAL_CONTACTS = 'wadah_digital_local_contacts';
const STORAGE_LOCAL_SYNC = 'wadah_digital_local_sync_contacts';
const STORAGE_LOCAL_CATEGORIES = 'wadah_digital_local_categories_v2';
const STORAGE_LOCAL_HISTORY = 'wadah_digital_local_history';
const STORAGE_LOCAL_SYNC_STATUS = 'wadah_digital_local_sync_status';

const DEFAULT_DEMO_CONTACTS: Contact[] = [
  {
    rowIndex: 2,
    nama: 'Ust. Muhammad Yusuf',
    noHp: '6281241001122',
    kategori: 'Internal',
    jenisKelamin: 'Laki-laki',
    updatedAt: '17 Nov 2026 09:30:15',
    lastAction: 'created',
  },
  {
    rowIndex: 3,
    nama: 'Dr. Hendra Wijaya',
    noHp: '6281144556677',
    kategori: 'VIP',
    jenisKelamin: 'Laki-laki',
    updatedAt: '17 Nov 2026 09:42:10',
    lastAction: 'updated',
  },
  {
    rowIndex: 4,
    nama: 'Hj. Aminah Nur',
    noHp: '6285299887766',
    kategori: 'Keluarga',
    jenisKelamin: 'Perempuan',
    updatedAt: '17 Nov 2026 09:45:00',
    lastAction: 'created',
  },
  {
    rowIndex: 5,
    nama: 'Admin Pusat Layanan',
    noHp: '6281355443322',
    kategori: '',
    jenisKelamin: 'Admin',
    updatedAt: '17 Nov 2026 09:46:57',
    lastAction: 'created',
  },
];

type RoutePath = 'landing' | 'kontak';
type KontakTab = 'directory' | 'recap' | 'sync' | 'history' | 'code';
type SortOption =
  | 'default'
  | 'waktu-desc'
  | 'waktu-asc'
  | 'nama-asc'
  | 'nama-desc'
  | 'kategori-asc'
  | 'gender-asc';

const EMPTY_FILTERS: ActiveFilterState = {
  categories: [],
  genders: [],
  onlyDuplicates: false,
};

function detectRouteFromPath(): RoutePath {
  const path = window.location.pathname.toLowerCase();
  if (path === '/kontak' || path.startsWith('/kontak/')) {
    return 'kontak';
  }
  return 'landing';
}

function readJsonCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizeRemoteAction(raw: unknown): ContactActionState {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'updated' || s === 'edit') return 'updated';
  if (s === 'created' || s === 'tambah') return 'created';
  return '';
}

function mapRemoteContact(c: Partial<Contact>, idx: number): Contact {
  return {
    rowIndex: typeof c.rowIndex === 'number' && c.rowIndex >= 2 ? c.rowIndex : idx + 2,
    nama: String(c.nama || ''),
    noHp: String(c.noHp || ''),
    kategori: String(c.kategori || '').trim(),
    jenisKelamin: GENDER_OPTIONS.includes(c.jenisKelamin as GenderOption)
      ? (c.jenisKelamin as GenderOption)
      : 'Laki-laki',
    updatedAt: String(c.updatedAt || '').trim(),
    lastAction: normalizeRemoteAction(c.lastAction),
  };
}

function mapRemoteSyncStatus(raw: Record<string, unknown>, fallbackSyncCount: number): GoogleSyncStatus {
  const q = raw.quota as Record<string, unknown> | undefined;
  return {
    engine: String(raw.engine || 'Unavailable'),
    connected: Boolean(raw.connected),
    rateLimited: Boolean(raw.rateLimited),
    error: String(raw.error || ''),
    totalInSyncSheet: Number(raw.totalInSyncSheet ?? fallbackSyncCount),
    syncedCount: Number(raw.syncedCount ?? 0),
    unsyncedCount: Number(raw.unsyncedCount ?? fallbackSyncCount),
    unsyncedPhones: Array.isArray(raw.unsyncedPhones) ? (raw.unsyncedPhones as string[]) : [],
    lastSyncAt: String(raw.lastSyncAt || ''),
    quota: q
      ? {
          minuteReadsUsed: Number(q.minuteReadsUsed ?? 0),
          minuteReadsLimit: Number(q.minuteReadsLimit ?? 90),
          minuteWritesUsed: Number(q.minuteWritesUsed ?? 0),
          minuteWritesLimit: Number(q.minuteWritesLimit ?? 90),
          dailyRequestsUsed: Number(q.dailyRequestsUsed ?? 0),
          dailyRequestsLimit: Number(q.dailyRequestsLimit ?? 20000),
          googleContactsCount: Number(q.googleContactsCount ?? 0),
          googleContactsLimit: Number(q.googleContactsLimit ?? 25000),
          windowRemainingSec: Number(q.windowRemainingSec ?? 0),
        }
      : undefined,
  };
}

export default function App() {
  const [route, setRoute] = useState<RoutePath>(() => detectRouteFromPath());
  const [activeTab, setActiveTab] = useState<KontakTab>('directory');
  const [showConfig, setShowConfig] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);

  const [gasUrl, setGasUrl] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_GAS_URL);
    return stored !== null ? stored : DEFAULT_GAS_URL;
  });
  const [gasUrlDraft, setGasUrlDraft] = useState<string>(() => {
    const stored = localStorage.getItem(STORAGE_GAS_URL);
    return stored !== null ? stored : DEFAULT_GAS_URL;
  });
  const [isTestingGas, setIsTestingGas] = useState(false);
  const [isSettingUpDb, setIsSettingUpDb] = useState(false);

  // Instant hydration from localStorage
  const [contacts, setContacts] = useState<Contact[]>(() =>
    readJsonCache<Contact[]>(STORAGE_LOCAL_CONTACTS, [])
  );
  const [syncContacts, setSyncContacts] = useState<Contact[]>(() =>
    readJsonCache<Contact[]>(STORAGE_LOCAL_SYNC, [])
  );
  const [categories, setCategories] = useState<CategoryItem[]>(() =>
    readJsonCache<CategoryItem[]>(STORAGE_LOCAL_CATEGORIES, DEFAULT_CATEGORIES)
  );
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>(() =>
    readJsonCache<HistoryLog[]>(STORAGE_LOCAL_HISTORY, [])
  );
  const [syncStatus, setSyncStatus] = useState<GoogleSyncStatus | null>(() =>
    readJsonCache<GoogleSyncStatus | null>(STORAGE_LOCAL_SYNC_STATUS, null)
  );

  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [bgSyncCount, setBgSyncCount] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'done'>('idle');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMutatingCategory, setIsMutatingCategory] = useState(false);
  const [isSyncingBatch, setIsSyncingBatch] = useState(false);

  // Form states (supports multi-category selection & exact rowIndex editing)
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);
  const [originalPhone, setOriginalPhone] = useState('');
  const [editingOrigKategori, setEditingOrigKategori] = useState('');
  const [editingOrigNama, setEditingOrigNama] = useState('');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [catFormSearch, setCatFormSearch] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState<GenderOption>('Laki-laki');
  const [isFormHighlighted, setIsFormHighlighted] = useState(false);

  // Filter, Search, Sort & Pagination states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<ActiveFilterState>(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // Modals & Toast
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [pendingDuplicates, setPendingDuplicates] = useState<Contact[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const formCardRef = useRef<HTMLElement>(null);
  const namaInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const mutationSeqRef = useRef(0);
  const lastDeletedNamePosRef = useRef<number | null>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isEditingMode = editingRowIndex !== null || Boolean(originalPhone);

  useEffect(() => {
    if (!showExportMenu) return;
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [showExportMenu]);

  useEffect(() => {
    const onPopState = () => {
      setRoute(detectRouteFromPath());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function navigateTo(target: RoutePath) {
    const targetPath = target === 'kontak' ? '/kontak' : '/';
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoute(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const dismissToast = useCallback((id: string) => {
    const existingTimer = toastTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (
      text: string,
      variant: ToastMessage['variant'] = 'info',
      options?: { title?: string; replaceId?: string; durationMs?: number }
    ): string => {
      const id =
        options?.replaceId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      const existingTimer = toastTimersRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        toastTimersRef.current.delete(id);
      }

      const defaultDuration =
        variant === 'error'
          ? 9500
          : variant === 'warning'
            ? 8000
            : variant === 'success'
              ? 7500
              : 6500;
      const durationMs = options?.durationMs ?? defaultDuration;

      const defaultTitle =
        options?.title ??
        (variant === 'success'
          ? 'Berhasil'
          : variant === 'error'
            ? 'Gagal'
            : variant === 'warning'
              ? 'Perhatian'
              : 'Memproses');

      setToasts((prev) => {
        const nextItem: ToastMessage = { id, title: defaultTitle, text, variant };
        const existsIdx = prev.findIndex((item) => item.id === id);
        if (existsIdx !== -1) {
          const copy = [...prev];
          copy[existsIdx] = nextItem;
          return copy;
        }
        return [...prev.slice(-3), nextItem];
      });

      if (durationMs > 0) {
        const timer = setTimeout(() => {
          toastTimersRef.current.delete(id);
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, durationMs);
        toastTimersRef.current.set(id, timer);
      }

      return id;
    },
    []
  );

  const persistLocalCategories = useCallback((cats: CategoryItem[]) => {
    safeStorageSet(STORAGE_LOCAL_CATEGORIES, JSON.stringify(cats));
  }, []);

  const pushLocalHistory = useCallback(
    (action: string, contactName: string, phone: string, detail: string) => {
      const waktu = formatDisplayDateTime(new Date());
      const entry: HistoryLog = {
        waktu,
        action,
        nama: contactName,
        noHp: phone,
        detail,
      };
      setHistoryLogs((prev) => {
        const next = [entry, ...prev].slice(0, 200);
        safeStorageSet(STORAGE_LOCAL_HISTORY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const fetchContacts = useCallback(
    async (
      targetUrl?: string,
      options?: { silent?: boolean; forceRefresh?: boolean; showResultToast?: boolean }
    ) => {
      const endpoint = targetUrl !== undefined ? targetUrl : gasUrl;
      const isSilent = Boolean(options?.silent);
      const isManualRefresh = Boolean(options?.forceRefresh);
      const capturedSeq = mutationSeqRef.current;

      if (isManualRefresh) {
        setIsRefreshing(true);
      } else if (!isSilent) {
        setIsLoading(true);
      }

      try {
        if (!endpoint) {
          const cachedCats = readJsonCache<CategoryItem[]>(
            STORAGE_LOCAL_CATEGORIES,
            DEFAULT_CATEGORIES
          );
          const localCats = cachedCats.length > 0 ? cachedCats : DEFAULT_CATEGORIES;
          const cachedContacts = readJsonCache<Contact[]>(
            STORAGE_LOCAL_CONTACTS,
            DEFAULT_DEMO_CONTACTS
          );
          const cachedSync = readJsonCache<Contact[]>(
            STORAGE_LOCAL_SYNC,
            DEFAULT_DEMO_CONTACTS
          );
          setCategories(localCats);
          setContacts(cachedContacts);
          setSyncContacts(cachedSync);
          setHistoryLogs(readJsonCache<HistoryLog[]>(STORAGE_LOCAL_HISTORY, []));
          if (options?.showResultToast) {
            notify(
              `Mode Lokal aktif (${cachedContacts.length.toLocaleString('id-ID')} kontak dimuat).`,
              'success',
              { title: 'Data Lokal Dimuat' }
            );
          }
          return;
        }

        const sep = endpoint.includes('?') ? '&' : '?';
        const requestUrl = `${endpoint}${sep}_t=${Date.now()}`;
        const response = await fetch(requestUrl, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store',
        });
        const result = await response.json();
        if (result.status !== 'success') {
          throw new Error(result.message || 'Respons server tidak valid.');
        }

        // Guard against stale GET overwriting a newer optimistic/committed mutation
        if (capturedSeq !== mutationSeqRef.current) {
          return;
        }

        const remoteContacts: Contact[] = Array.isArray(result.data)
          ? result.data.map((c: Partial<Contact>, idx: number) => mapRemoteContact(c, idx))
          : [];

        const remoteSync: Contact[] = Array.isArray(result.syncContacts)
          ? result.syncContacts.map((c: Partial<Contact>, idx: number) => mapRemoteContact(c, idx))
          : [];

        const remoteCats: CategoryItem[] =
          Array.isArray(result.categories) && result.categories.length > 0
            ? result.categories.map((item: string | CategoryItem) =>
                typeof item === 'string'
                  ? { nama: item, kode: item.slice(0, 3).toUpperCase() }
                  : item
              )
            : DEFAULT_CATEGORIES;

        const remoteHistory: HistoryLog[] = Array.isArray(result.history)
          ? result.history
          : [];

        const remoteSyncStatus = result.syncStatus
          ? mapRemoteSyncStatus(result.syncStatus, remoteSync.length)
          : null;

        setContacts(remoteContacts);
        setSyncContacts(remoteSync);
        setCategories(remoteCats);
        setHistoryLogs(remoteHistory);
        setSyncStatus(remoteSyncStatus);

        safeStorageSet(STORAGE_LOCAL_CONTACTS, JSON.stringify(remoteContacts));
        safeStorageSet(STORAGE_LOCAL_SYNC, JSON.stringify(remoteSync));
        safeStorageSet(STORAGE_LOCAL_CATEGORIES, JSON.stringify(remoteCats));
        safeStorageSet(STORAGE_LOCAL_HISTORY, JSON.stringify(remoteHistory));
        if (remoteSyncStatus) {
          safeStorageSet(STORAGE_LOCAL_SYNC_STATUS, JSON.stringify(remoteSyncStatus));
        }

        if (options?.showResultToast) {
          notify(
            `Berhasil memuat ${remoteContacts.length.toLocaleString('id-ID')} entri kontak terbaru dari Google Sheets.`,
            'success',
            { title: 'Data Terbaru Dimuat' }
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat data.';
        if (!isSilent || options?.showResultToast) {
          notify(`Gagal mengambil data dari Google Sheets: ${msg}`, 'error', {
            title: 'Gagal Muat Ulang',
          });
        }
      } finally {
        if (isManualRefresh) {
          setIsRefreshing(false);
        } else if (!isSilent) {
          setIsLoading(false);
        }
      }
    },
    [gasUrl, notify]
  );

  useEffect(() => {
    const hasCache = contacts.length > 0;
    fetchContacts(undefined, { silent: hasCache });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasUrl]);

  function handleManualReload() {
    if (isRefreshing || isSyncingBatch) return;
    fetchContacts(undefined, { forceRefresh: true, showResultToast: true });
  }

  function resetForm() {
    setEditingRowIndex(null);
    setOriginalPhone('');
    setEditingOrigKategori('');
    setEditingOrigNama('');
    setNama('');
    setNoHp('');
    setSelectedCategories([]);
    setCatFormSearch('');
    setJenisKelamin('Laki-laki');
    lastDeletedNamePosRef.current = null;
  }

  function handleStartEdit(contact: Contact) {
    const cleanPhone = normalizePhoneForWA(contact.noHp);
    const catClean = String(contact.kategori || '').trim();
    setEditingRowIndex(typeof contact.rowIndex === 'number' ? contact.rowIndex : null);
    setOriginalPhone(cleanPhone);
    setEditingOrigKategori(catClean);
    setEditingOrigNama(contact.nama);
    setNama(contact.nama);
    setNoHp(cleanPhone);
    setSelectedCategories(catClean ? [catClean] : []);
    setJenisKelamin(
      GENDER_OPTIONS.includes(contact.jenisKelamin) ? contact.jenisKelamin : 'Laki-laki'
    );
    lastDeletedNamePosRef.current = null;
    setActiveTab('directory');

    // Auto-scroll smoothly to Edit Form + highlight box + focus input
    setTimeout(() => {
      if (formCardRef.current) {
        formCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      setIsFormHighlighted(true);
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
      highlightTimerRef.current = setTimeout(() => {
        setIsFormHighlighted(false);
      }, 1800);
      namaInputRef.current?.focus({ preventScroll: true });
    }, 60);
  }

  /**
   * Smart Auto-Capitalize after space:
   * - Automatically capitalizes the first letter of each word (start of input & right after space).
   * - Does NOT force full caps lock.
   * - Respects manual lowercase override: if user backspaces a capitalized letter and retypes lowercase,
   *   it keeps the lowercase letter!
   */
  function handleNamaChange(e: ChangeEvent<HTMLInputElement>) {
    const inputEl = e.target;
    const rawNext = inputEl.value;
    const prevVal = nama;
    const caret = inputEl.selectionStart;

    // User deleted characters -> remember cursor position so manual lowercase retype is honored
    if (rawNext.length < prevVal.length) {
      lastDeletedNamePosRef.current = caret ?? rawNext.length;
      setNama(rawNext);
      return;
    }

    // User inserted exactly 1 character
    if (rawNext.length === prevVal.length + 1 && caret !== null && caret > 0) {
      const insertedIdx = caret - 1;
      const insertedChar = rawNext[insertedIdx];
      const isWordStart = insertedIdx === 0 || rawNext[insertedIdx - 1] === ' ';

      if (isWordStart && /[a-z]/.test(insertedChar)) {
        if (lastDeletedNamePosRef.current === insertedIdx) {
          // User explicitly deleted this position to type lowercase manually
          lastDeletedNamePosRef.current = null;
          setNama(rawNext);
          return;
        }
        const transformed =
          rawNext.slice(0, insertedIdx) +
          insertedChar.toUpperCase() +
          rawNext.slice(insertedIdx + 1);
        lastDeletedNamePosRef.current = null;
        setNama(transformed);
        requestAnimationFrame(() => {
          if (namaInputRef.current) {
            namaInputRef.current.setSelectionRange(caret, caret);
          }
        });
        return;
      }
    }

    lastDeletedNamePosRef.current = null;
    setNama(rawNext);
  }

  function handlePhoneChange(rawValue: string) {
    setNoHp(sanitizeLivePhoneInput(rawValue));
  }

  function toggleFormCategory(catName: string) {
    setSelectedCategories((prev) =>
      prev.includes(catName)
        ? prev.filter((item) => item !== catName)
        : [...prev, catName]
    );
  }

  // All existing entries matching the typed phone number (excluding the exact row currently being edited)
  const duplicateMatches = useMemo(() => {
    const normCurrent = normalizePhoneForWA(noHp);
    if (!normCurrent || normCurrent.length < 8) return [];
    return contacts.filter((c) => {
      const n = normalizePhoneForWA(c.noHp);
      if (n !== normCurrent) return false;
      if (isEditingMode) {
        if (editingRowIndex !== null && c.rowIndex === editingRowIndex) return false;
        if (
          editingRowIndex === null &&
          normalizePhoneForWA(originalPhone) === normCurrent &&
          String(c.kategori || '').trim() === editingOrigKategori
        ) {
          return false;
        }
      }
      return true;
    });
  }, [contacts, noHp, isEditingMode, editingRowIndex, originalPhone, editingOrigKategori]);

  function executeSaveContact(allowDuplicate: boolean) {
    const cleanNama = nama.trim();
    const cleanPhone = normalizePhoneForWA(noHp);
    const cleanOrig = normalizePhoneForWA(originalPhone);
    const editModeNow = isEditingMode && !allowDuplicate;
    const targetRowIndex = editModeNow ? editingRowIndex : null;
    const origKatNow = editModeNow ? editingOrigKategori : '';
    const origNamaNow = editModeNow ? editingOrigNama : '';
    const chosenCategories = [...selectedCategories];
    const selectedGender = jenisKelamin;
    const nowDisplay = formatDisplayDateTime(new Date());

    mutationSeqRef.current += 1;
    const currentSeq = mutationSeqRef.current;

    // Optimistic update on local Kontak state ONLY (never overwrite Kontak_Sync!)
    setContacts((prev) => {
      const next = [...prev];
      if (editModeNow) {
        const primaryCat = chosenCategories[0] || '';
        const matchIdx = next.findIndex((c) => {
          if (targetRowIndex !== null && c.rowIndex === targetRowIndex) return true;
          return (
            normalizePhoneForWA(c.noHp) === cleanOrig &&
            String(c.kategori || '').trim().toLowerCase() === origKatNow.toLowerCase()
          );
        });

        const updatedRecord: Contact = {
          rowIndex: targetRowIndex ?? next[matchIdx]?.rowIndex,
          nama: cleanNama,
          noHp: cleanPhone,
          kategori: primaryCat,
          jenisKelamin: selectedGender,
          updatedAt: nowDisplay,
          lastAction: 'updated',
        };

        if (matchIdx !== -1) {
          next[matchIdx] = updatedRecord;
        } else {
          next.push(updatedRecord);
        }

        // If additional categories were ticked during edit, append extra rows optimistically
        if (chosenCategories.length > 1) {
          for (let i = 1; i < chosenCategories.length; i += 1) {
            const extraCat = chosenCategories[i];
            const existsSame = next.some(
              (c) =>
                normalizePhoneForWA(c.noHp) === cleanPhone &&
                String(c.kategori || '').trim().toLowerCase() === extraCat.toLowerCase()
            );
            if (!existsSame) {
              next.push({
                nama: cleanNama,
                noHp: cleanPhone,
                kategori: extraCat,
                jenisKelamin: selectedGender,
                updatedAt: nowDisplay,
                lastAction: 'created',
              });
            }
          }
        }
      } else {
        const catsToInsert = chosenCategories.length > 0 ? chosenCategories : [''];
        for (const catName of catsToInsert) {
          next.push({
            nama: cleanNama,
            noHp: cleanPhone,
            kategori: catName,
            jenisKelamin: selectedGender,
            updatedAt: nowDisplay,
            lastAction: 'created',
          });
        }
      }

      safeStorageSet(STORAGE_LOCAL_CONTACTS, JSON.stringify(next));
      return next;
    });

    const catDetail =
      chosenCategories.length > 0
        ? chosenCategories
            .map((cn) => {
              const found = categories.find((c) => c.nama === cn);
              return found ? `${cn} (${found.kode})` : cn;
            })
            .join(', ')
        : TANPA_KATEGORI_LABEL;

    pushLocalHistory(
      editModeNow ? 'Edit Kontak' : 'Tambah Kontak',
      cleanNama,
      cleanPhone,
      `Kategori: ${catDetail} · Gender: ${selectedGender}`
    );

    // Quick ~0.9s button feedback so user can immediately continue inputting next contact
    setSaveFeedback('saving');
    setTimeout(() => {
      setSaveFeedback('done');
      resetForm();
      setTimeout(() => {
        setSaveFeedback('idle');
      }, 500);
    }, 450);

    if (!gasUrl) {
      notify(
        editModeNow
          ? `Perubahan "${cleanNama}" berhasil disimpan di Mode Lokal.`
          : chosenCategories.length > 1
            ? `"${cleanNama}" berhasil disimpan ke ${chosenCategories.length} kategori (Mode Lokal).`
            : `"${cleanNama}" berhasil disimpan di Mode Lokal.`,
        'success',
        { title: editModeNow ? 'Edit Berhasil (Lokal)' : 'Kontak Ditambahkan (Lokal)' }
      );
      return;
    }

    const progressToastId = notify(
      editModeNow
        ? `Mengirim perubahan "${cleanNama}" ke Google Sheets...`
        : chosenCategories.length > 1
          ? `Menyimpan "${cleanNama}" ke ${chosenCategories.length} kategori di Google Sheets...`
          : `Menyimpan "${cleanNama}" ke Google Sheets...`,
      'info',
      { title: editModeNow ? 'Menyimpan Perubahan' : 'Menyimpan Kontak', durationMs: 25000 }
    );

    setBgSyncCount((c) => c + 1);
    fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save',
        mode: editModeNow ? 'edit' : 'create',
        rowIndex: targetRowIndex,
        nama: cleanNama,
        noHp: cleanPhone,
        originalNoHp: cleanOrig,
        originalKategori: origKatNow,
        originalNama: origNamaNow,
        kategori: chosenCategories[0] || '',
        categories: chosenCategories,
        jenisKelamin: selectedGender,
        allowDuplicate,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.status !== 'success') {
          throw new Error(result.message || 'Gagal menyimpan kontak ke server.');
        }

        // Update state directly from authoritative GAS response (no stale GET race!)
        if (currentSeq === mutationSeqRef.current && Array.isArray(result.contacts)) {
          const freshContacts: Contact[] = result.contacts.map(
            (c: Partial<Contact>, idx: number) => mapRemoteContact(c, idx)
          );
          setContacts(freshContacts);
          safeStorageSet(STORAGE_LOCAL_CONTACTS, JSON.stringify(freshContacts));
        }
        if (Array.isArray(result.history)) {
          setHistoryLogs(result.history);
          safeStorageSet(STORAGE_LOCAL_HISTORY, JSON.stringify(result.history));
        }
        if (result.syncSummary?.syncStatus) {
          const parsedStatus = mapRemoteSyncStatus(
            result.syncSummary.syncStatus,
            syncContacts.length
          );
          setSyncStatus(parsedStatus);
          safeStorageSet(STORAGE_LOCAL_SYNC_STATUS, JSON.stringify(parsedStatus));
        }

        notify(
          result.message ||
            (editModeNow
              ? `Perubahan "${cleanNama}" telah tersimpan permanen di Spreadsheet.`
              : `"${cleanNama}" telah tersimpan permanen di Spreadsheet.`),
          'success',
          {
            replaceId: progressToastId,
            title: editModeNow
              ? 'Perubahan Tersimpan di Spreadsheet'
              : 'Kontak Tersimpan di Spreadsheet',
            durationMs: 7500,
          }
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan.';
        notify(
          `Perubahan gagal tersimpan di Spreadsheet: ${msg}. Silakan pastikan Code.gs versi terbaru sudah di-Deploy.`,
          'error',
          {
            replaceId: progressToastId,
            title: 'Gagal Menyimpan ke Spreadsheet',
            durationMs: 9500,
          }
        );
        fetchContacts(undefined, { silent: true });
      })
      .finally(() => {
        setBgSyncCount((c) => Math.max(0, c - 1));
      });
  }

  function handleSubmitContact(e: FormEvent) {
    e.preventDefault();
    const cleanNama = nama.trim();
    const cleanPhone = normalizePhoneForWA(noHp);

    if (!cleanNama) {
      notify('Nama lengkap wajib diisi.', 'error', { title: 'Data Belum Lengkap' });
      namaInputRef.current?.focus();
      return;
    }
    if (cleanPhone.length < 8) {
      notify('Masukkan nomor HP yang valid (minimal 8 digit angka).', 'error', {
        title: 'Nomor HP Tidak Valid',
      });
      phoneInputRef.current?.focus();
      return;
    }

    // If creating a new contact (or editing into a phone already owned by another row), notify & confirm
    if (!isEditingMode && duplicateMatches.length > 0) {
      setPendingDuplicates(duplicateMatches);
      return;
    }

    executeSaveContact(false);
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    const targetContact = pendingDelete;
    const cleanTarget = normalizePhoneForWA(targetContact.noHp);
    const targetRowIdx = targetContact.rowIndex;
    const targetKat = String(targetContact.kategori || '').trim();

    mutationSeqRef.current += 1;
    const currentSeq = mutationSeqRef.current;

    setIsDeleting(true);
    setContacts((prev) => {
      let removedOne = false;
      const next = prev.filter((c) => {
        if (removedOne) return true;
        if (targetRowIdx !== undefined && c.rowIndex === targetRowIdx) {
          removedOne = true;
          return false;
        }
        if (
          targetRowIdx === undefined &&
          normalizePhoneForWA(c.noHp) === cleanTarget &&
          String(c.kategori || '').trim() === targetKat &&
          c.nama === targetContact.nama
        ) {
          removedOne = true;
          return false;
        }
        return true;
      });
      safeStorageSet(STORAGE_LOCAL_CONTACTS, JSON.stringify(next));
      return next;
    });

    pushLocalHistory(
      'Hapus Kontak',
      targetContact.nama,
      cleanTarget,
      `Dihapus dari sheet Kontak (Kategori: ${targetKat || TANPA_KATEGORI_LABEL})`
    );

    setTimeout(() => {
      setIsDeleting(false);
      setPendingDelete(null);
    }, 380);

    if (!gasUrl) {
      notify(`"${targetContact.nama}" berhasil dihapus di Mode Lokal.`, 'success', {
        title: 'Kontak Dihapus (Lokal)',
      });
      return;
    }

    const progressToastId = notify(
      `Menghapus "${targetContact.nama}" (${targetKat || TANPA_KATEGORI_LABEL}) dari Google Sheets...`,
      'info',
      { title: 'Menghapus Kontak', durationMs: 25000 }
    );

    setBgSyncCount((c) => c + 1);
    fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete',
        rowIndex: targetRowIdx,
        noHp: cleanTarget,
        kategori: targetKat,
        nama: targetContact.nama,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.status !== 'success') {
          throw new Error(result.message || 'Gagal menghapus kontak.');
        }
        if (currentSeq === mutationSeqRef.current && Array.isArray(result.contacts)) {
          const freshContacts: Contact[] = result.contacts.map(
            (c: Partial<Contact>, idx: number) => mapRemoteContact(c, idx)
          );
          setContacts(freshContacts);
          safeStorageSet(STORAGE_LOCAL_CONTACTS, JSON.stringify(freshContacts));
        }
        if (Array.isArray(result.history)) {
          setHistoryLogs(result.history);
          safeStorageSet(STORAGE_LOCAL_HISTORY, JSON.stringify(result.history));
        }
        if (result.syncSummary?.syncStatus) {
          const parsedStatus = mapRemoteSyncStatus(
            result.syncSummary.syncStatus,
            syncContacts.length
          );
          setSyncStatus(parsedStatus);
          safeStorageSet(STORAGE_LOCAL_SYNC_STATUS, JSON.stringify(parsedStatus));
        }

        notify(
          result.message || `"${targetContact.nama}" berhasil dihapus dari Spreadsheet.`,
          'success',
          {
            replaceId: progressToastId,
            title: 'Berhasil Dihapus dari Spreadsheet',
            durationMs: 7500,
          }
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.';
        notify(`Gagal menghapus kontak di Spreadsheet: ${msg}`, 'error', {
          replaceId: progressToastId,
          title: 'Gagal Menghapus',
          durationMs: 9500,
        });
        fetchContacts(undefined, { silent: true });
      })
      .finally(() => {
        setBgSyncCount((c) => Math.max(0, c - 1));
      });
  }

  async function handleSaveCategories(
    nextList: CategoryItem[],
    historyAction: string,
    historyDetail: string,
    renameMap?: Record<string, string>
  ): Promise<boolean> {
    if (nextList.length === 0) return false;

    setCategories(nextList);
    persistLocalCategories(nextList);

    if (renameMap) {
      setContacts((prev) => {
        const updated = prev.map((c) =>
          renameMap[c.kategori] ? { ...c, kategori: renameMap[c.kategori] } : c
        );
        safeStorageSet(STORAGE_LOCAL_CONTACTS, JSON.stringify(updated));
        return updated;
      });
    }

    setSelectedCategories((prev) =>
      prev
        .map((cn) => (renameMap && renameMap[cn] ? renameMap[cn] : cn))
        .filter((cn) => nextList.some((c) => c.nama === cn))
    );

    setActiveFilters((prev) => ({
      ...prev,
      categories: prev.categories
        .map((cn) => (renameMap && renameMap[cn] ? renameMap[cn] : cn))
        .filter(
          (cn) => cn === TANPA_KATEGORI_LABEL || nextList.some((c) => c.nama === cn)
        ),
    }));

    pushLocalHistory(historyAction, '-', '-', historyDetail);

    if (!gasUrl) {
      notify('Daftar kategori berhasil diperbarui di Mode Lokal.', 'success', {
        title: 'Kategori Diperbarui',
      });
      return true;
    }

    setIsMutatingCategory(true);
    setTimeout(() => setIsMutatingCategory(false), 350);

    const progressId = notify('Menyimpan perubahan kategori ke Google Sheets...', 'info', {
      title: 'Menyimpan Kategori',
      durationMs: 20000,
    });

    setBgSyncCount((c) => c + 1);
    fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'saveCategories',
        categories: nextList,
        historyAction,
        historyDetail,
        renameMap: renameMap || null,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.status !== 'success') {
          throw new Error(result.message || 'Gagal memperbarui kategori.');
        }
        notify('Perubahan daftar kategori berhasil tersimpan di Google Sheets.', 'success', {
          replaceId: progressId,
          title: 'Kategori Tersimpan',
        });
        return fetchContacts(undefined, { silent: true });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Gagal memperbarui kategori.';
        notify(`Gagal sinkron kategori ke GAS: ${msg}`, 'error', {
          replaceId: progressId,
          title: 'Gagal Menyimpan Kategori',
        });
      })
      .finally(() => {
        setBgSyncCount((c) => Math.max(0, c - 1));
      });

    return true;
  }

  async function handleSyncManualSheet() {
    if (isSyncingBatch || isLoading || isRefreshing || bgSyncCount > 0) {
      return;
    }
    if (!gasUrl) {
      pushLocalHistory(
        'Sinkron Kontak_Sync',
        `Batch (${syncContacts.length} kontak)`,
        '-',
        'Simulasi sinkronisasi Kontak_Sync ke Google Kontak'
      );
      notify('Mode Lokal: Kontak_Sync siap disinkronkan saat URL GAS terhubung.', 'info', {
        title: 'Mode Lokal',
      });
      return;
    }

    setIsSyncingBatch(true);
    const syncToastId = notify(
      'Sedang menyinkronkan sheet Kontak_Sync ke Google Kontak...',
      'info',
      { title: 'Sinkronisasi Berjalan', durationMs: 60000 }
    );
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'syncManual' }),
      });
      const result = await response.json();
      if (result.syncStatus) {
        const parsedStatus = mapRemoteSyncStatus(result.syncStatus, syncContacts.length);
        setSyncStatus(parsedStatus);
        safeStorageSet(STORAGE_LOCAL_SYNC_STATUS, JSON.stringify(parsedStatus));
      }
      if (result.status !== 'success') {
        throw new Error(result.message || 'Sinkronisasi Kontak_Sync gagal.');
      }
      notify(
        result.message || 'Sinkronisasi Kontak_Sync ke Google Kontak selesai.',
        result.rateLimited ? 'warning' : 'success',
        {
          replaceId: syncToastId,
          title: result.rateLimited ? 'Sinkronisasi Sebagian (Jeda Kuota)' : 'Sinkronisasi Selesai',
        }
      );
      await fetchContacts(undefined, { silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan.';
      notify(msg, 'error', {
        replaceId: syncToastId,
        title: 'Sinkronisasi Gagal',
      });
      await fetchContacts(undefined, { silent: true });
    } finally {
      setIsSyncingBatch(false);
    }
  }

  async function handleTestGasConnection() {
    const trimmed = gasUrlDraft.trim();
    if (!trimmed) {
      notify('Masukkan URL Web App Google Apps Script terlebih dahulu.', 'error');
      return;
    }

    setIsTestingGas(true);
    try {
      const sep = trimmed.includes('?') ? '&' : '?';
      const response = await fetch(`${trimmed}${sep}action=ping&_t=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow',
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Endpoint tidak merespons dengan status sukses.');
      }
      const gNote = result.googleConnected
        ? `Google Kontak aktif (${result.googleEngine || 'PeopleAPI'}).`
        : `Google Kontak belum aktif: ${result.googleError || 'Aktifkan People API di Apps Script.'}`;
      notify(`Koneksi Sheet aktif (${result.sheetName || 'Kontak'}). ${gNote}`, 'success', {
        title: 'Koneksi GAS Aktif',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Koneksi gagal.';
      notify(`Uji koneksi gagal: ${msg}`, 'error', { title: 'Uji Koneksi Gagal' });
    } finally {
      setIsTestingGas(false);
    }
  }

  async function handleRunSetupDatabase() {
    const targetUrl = gasUrlDraft.trim() || gasUrl;
    if (!targetUrl) {
      notify('Masukkan URL Web App Google Apps Script terlebih dahulu.', 'error');
      return;
    }

    setIsSettingUpDb(true);
    try {
      const sep = targetUrl.includes('?') ? '&' : '?';
      const response = await fetch(`${targetUrl}${sep}action=setup&_t=${Date.now()}`, {
        method: 'GET',
        redirect: 'follow',
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Setup database gagal.');
      }
      notify(
        result.message || '4 Sheet (Kontak, Kontak_Sync, Kategori, History) siap.',
        'success',
        { title: 'Setup Database Selesai' }
      );
      await fetchContacts(targetUrl, { silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menjalankan setupdatabase.';
      notify(`Setup database gagal: ${msg}`, 'error', { title: 'Setup Database Gagal' });
    } finally {
      setIsSettingUpDb(false);
    }
  }

  function handleSaveGasUrl() {
    const trimmed = gasUrlDraft.trim();
    setGasUrl(trimmed);
    localStorage.setItem(STORAGE_GAS_URL, trimmed);
    if (trimmed) {
      notify('URL Google Apps Script disimpan.', 'success', { title: 'Konfigurasi Disimpan' });
    } else {
      notify('URL dikosongkan. Beralih ke Mode Pratinjau Lokal.', 'info', {
        title: 'Mode Lokal Aktif',
      });
    }
    setShowConfig(false);
    fetchContacts(trimmed);
  }

  // Phone duplicate counts across entire contacts directory
  const phoneCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts) {
      const p = normalizePhoneForWA(c.noHp);
      if (!p) continue;
      map.set(p, (map.get(p) || 0) + 1);
    }
    return map;
  }, [contacts]);

  const { duplicatePhonesCount, duplicateRowsCount } = useMemo(() => {
    let phones = 0;
    let rows = 0;
    for (const count of phoneCountMap.values()) {
      if (count > 1) {
        phones += 1;
        rows += count;
      }
    }
    return { duplicatePhonesCount: phones, duplicateRowsCount: rows };
  }, [phoneCountMap]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Semua: contacts.length,
      [TANPA_KATEGORI_LABEL]: 0,
    };
    for (const cat of categories) {
      counts[cat.nama] = 0;
    }
    for (const c of contacts) {
      const cat = String(c.kategori || '').trim();
      if (!cat) {
        counts[TANPA_KATEGORI_LABEL] += 1;
      } else {
        counts[cat] = (counts[cat] || 0) + 1;
      }
    }
    return counts;
  }, [contacts, categories]);

  const genderCounts = useMemo(() => {
    const counts: Record<string, number> = { Semua: contacts.length };
    for (const g of GENDER_OPTIONS) counts[g] = 0;
    for (const c of contacts) {
      counts[c.jenisKelamin] = (counts[c.jenisKelamin] || 0) + 1;
    }
    return counts;
  }, [contacts]);

  const applyFilterPredicates = useCallback(
    (list: Contact[], filters: ActiveFilterState, queryText: string) => {
      const q = queryText.trim().toLowerCase();
      const digitsQ = q.replace(/\D/g, '');
      const hasCatFilter = filters.categories.length > 0;
      const hasGenderFilter = filters.genders.length > 0;

      return list.filter((c) => {
        const catClean = String(c.kategori || '').trim();
        const normPhone = normalizePhoneForWA(c.noHp);

        if (filters.onlyDuplicates) {
          if (!normPhone || (phoneCountMap.get(normPhone) || 0) < 2) {
            return false;
          }
        }

        if (hasCatFilter) {
          const catKey = catClean || TANPA_KATEGORI_LABEL;
          if (!filters.categories.includes(catKey)) {
            return false;
          }
        }

        if (hasGenderFilter) {
          if (!filters.genders.includes(c.jenisKelamin)) {
            return false;
          }
        }

        if (!q) return true;

        const nameMatch = c.nama.toLowerCase().includes(q);
        const catMatch = (catClean || TANPA_KATEGORI_LABEL).toLowerCase().includes(q);
        const genderMatch = c.jenisKelamin.toLowerCase().includes(q);
        const phoneRawMatch = c.noHp.toLowerCase().includes(q);
        const phoneNormMatch = Boolean(digitsQ && normPhone.includes(digitsQ));

        return nameMatch || catMatch || genderMatch || phoneRawMatch || phoneNormMatch;
      });
    },
    [phoneCountMap]
  );

  const computeFilterPreviewCount = useCallback(
    (draft: ActiveFilterState) => applyFilterPredicates(contacts, draft, searchQuery).length,
    [applyFilterPredicates, contacts, searchQuery]
  );

  const filteredContacts = useMemo(
    () => applyFilterPredicates(contacts, activeFilters, searchQuery),
    [applyFilterPredicates, contacts, activeFilters, searchQuery]
  );

  const sortedContacts = useMemo(() => {
    if (sortBy === 'default') return filteredContacts;
    const copy = [...filteredContacts];
    if (sortBy === 'waktu-desc') {
      copy.sort((a, b) => {
        const diff = parseDisplayDateTimeToMs(b.updatedAt) - parseDisplayDateTimeToMs(a.updatedAt);
        if (diff !== 0) return diff;
        return (b.rowIndex || 0) - (a.rowIndex || 0);
      });
    } else if (sortBy === 'waktu-asc') {
      copy.sort((a, b) => {
        const msA = parseDisplayDateTimeToMs(a.updatedAt);
        const msB = parseDisplayDateTimeToMs(b.updatedAt);
        if (msA === 0 && msB === 0) return (a.rowIndex || 0) - (b.rowIndex || 0);
        if (msA === 0) return 1;
        if (msB === 0) return -1;
        return msA - msB;
      });
    } else if (sortBy === 'nama-asc') {
      copy.sort((a, b) => a.nama.localeCompare(b.nama, 'id', { sensitivity: 'base' }));
    } else if (sortBy === 'nama-desc') {
      copy.sort((a, b) => b.nama.localeCompare(a.nama, 'id', { sensitivity: 'base' }));
    } else if (sortBy === 'kategori-asc') {
      copy.sort((a, b) =>
        (a.kategori || TANPA_KATEGORI_LABEL).localeCompare(
          b.kategori || TANPA_KATEGORI_LABEL,
          'id',
          { sensitivity: 'base' }
        )
      );
    } else if (sortBy === 'gender-asc') {
      copy.sort((a, b) =>
        (a.jenisKelamin || '').localeCompare(b.jenisKelamin || '', 'id', {
          sensitivity: 'base',
        })
      );
    }
    return copy;
  }, [filteredContacts, sortBy]);

  const totalPages = Math.max(1, Math.ceil(sortedContacts.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedContacts = useMemo(
    () => sortedContacts.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedContacts, safePage, pageSize]
  );

  const activeFilterCount =
    activeFilters.categories.length +
    activeFilters.genders.length +
    (activeFilters.onlyDuplicates ? 1 : 0);

  const hasAnySearchOrFilter = activeFilterCount > 0 || Boolean(searchQuery.trim());

  const formFilteredCategories = useMemo(() => {
    const q = catFormSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) => c.nama.toLowerCase().includes(q) || c.kode.toLowerCase().includes(q)
    );
  }, [categories, catFormSearch]);

  function handleResetAllFilters() {
    setSearchQuery('');
    setActiveFilters(EMPTY_FILTERS);
    setSortBy('default');
    setCurrentPage(1);
  }

  function handleExportFormat(format: 'xlsx' | 'csv' | 'vcf') {
    setShowExportMenu(false);
    if (sortedContacts.length === 0) {
      notify('Tidak ada kontak pada filter aktif untuk diunduh.', 'error');
      return;
    }
    const countLabel = sortedContacts.length.toLocaleString('id-ID');
    if (format === 'xlsx') {
      exportContactsToXlsx(sortedContacts, categories);
      notify(`Mengunduh ${countLabel} kontak ke Excel (.xlsx).`, 'success', {
        title: 'Ekspor Excel Dimulai',
      });
    } else if (format === 'csv') {
      exportContactsToCsv(sortedContacts, categories);
      notify(`Mengunduh ${countLabel} kontak ke CSV (.csv).`, 'success', {
        title: 'Ekspor CSV Dimulai',
      });
    } else {
      exportContactsToVcf(sortedContacts, categories);
      notify(`Mengunduh ${countLabel} kontak ke vCard Android (.vcf).`, 'success', {
        title: 'Ekspor vCard Dimulai',
      });
    }
  }

  function getCategoryCode(catName: string): string {
    const found = categories.find((c) => c.nama === catName);
    return found ? found.kode : '';
  }

  function getCategoryTextStyle(cat: string): string {
    if (!cat.trim()) return 'text-[#64748B] font-medium';
    const lower = cat.toLowerCase();
    if (lower === 'vip') return 'text-[#B45309]';
    if (lower === 'partner') return 'text-[#0284C7]';
    if (lower === 'internal') return 'text-[#0A2463]';
    if (lower === 'keluarga') return 'text-[#0369A1]';
    return 'text-[#1D4ED8]';
  }

  const showInitialSkeleton = isLoading && contacts.length === 0;
  const isAppBusy = isLoading || isRefreshing || isSyncingBatch || bgSyncCount > 0;
  const unsyncedTotal = syncStatus ? syncStatus.unsyncedCount : syncContacts.length;
  const quotaSummary = syncStatus?.quota;

  const quickSyncHint = useMemo(() => {
    if (syncStatus?.rateLimited) {
      return 'Jeda kuota API · tunggu ±60 detik sebelum sinkron lagi';
    }
    if (!syncStatus?.connected) {
      return 'Aktifkan People API di Apps Script';
    }
    if (unsyncedTotal === 0) {
      return 'Semua tersinkron · belum perlu sinkron ulang';
    }
    if (unsyncedTotal <= 60) {
      return `Saran: ${unsyncedTotal} kontak baru siap disinkronkan (1 tahap)`;
    }
    const estStages = Math.ceil(unsyncedTotal / 65);
    return `Saran: ${unsyncedTotal.toLocaleString('id-ID')} kontak belum sinkron (±${estStages} tahap bertahap)`;
  }, [syncStatus, unsyncedTotal]);

  if (route === 'landing') {
    return (
      <LandingPage
        onOpenKontak={() => navigateTo('kontak')}
        totalContacts={contacts.length}
        totalCategories={categories.length}
      />
    );
  }

  return (
    <div className="relative min-h-screen text-[#091B3A]">
      {/* Animated Multi-Blue Aurora Background */}
      <div className="aurora-canvas" aria-hidden="true">
        <div className="aurora-orb aurora-orb-navy" />
        <div className="aurora-orb aurora-orb-sky" />
        <div className="aurora-orb aurora-orb-indigo" />
        <div className="aurora-orb aurora-orb-gold" />
      </div>

      <div className="relative z-10">
        {/* 3-Zone Top Bar */}
        <header className="glass-header sticky top-0 z-40">
          <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-4 px-3 py-3 sm:w-[95%] sm:px-0 sm:py-3.5">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('landing');
              }}
              className="flex items-center gap-2.5 bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-base font-bold tracking-tight text-transparent sm:text-lg whitespace-nowrap shrink-0"
            >
              <ContactLogo className="h-7 w-7 shrink-0" />
              <span>Wadah Digital</span>
            </a>

            <nav className="hidden md:flex items-center gap-5" aria-label="Navigasi utama">
              <button
                type="button"
                onClick={() => navigateTo('landing')}
                className="border-b-2 border-transparent py-1.5 text-[13px] font-semibold text-[#475569] transition-colors hover:text-[#0A2463] whitespace-nowrap shrink-0"
              >
                Portal MR
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('directory');
                  setShowConfig(false);
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'directory' && !showConfig
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                Kontak
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('recap');
                  setShowConfig(false);
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'recap'
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                Rekap
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('sync');
                  setShowConfig(false);
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'sync'
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                Kontak_Sync
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('history');
                  setShowConfig(false);
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'history'
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                History
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfig((prev) => !prev);
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  showConfig
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                Konfigurasi GAS
              </button>
            </nav>

            <button
              type="button"
              onClick={handleManualReload}
              disabled={isRefreshing || isSyncingBatch}
              className="btn-ocean-sheen inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:px-4 sm:text-[13px] whitespace-nowrap shrink-0"
            >
              {isRefreshing || isSyncingBatch || bgSyncCount > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isSyncingBatch
                  ? 'Menyinkronkan...'
                  : isRefreshing
                    ? 'Memuat Ulang...'
                    : bgSyncCount > 0
                      ? 'Menyimpan...'
                      : 'Muat Ulang'}
              </span>
            </button>
          </div>

          <div className="header-energy-line" aria-hidden="true" />

          {/* Mobile Quick Nav */}
          <div className="flex md:hidden items-center justify-between gap-3 overflow-x-auto border-t border-[#1D4ED8]/10 px-4 py-2 text-xs font-semibold text-[#475569]">
            <button
              type="button"
              onClick={() => navigateTo('landing')}
              className="py-1 whitespace-nowrap shrink-0"
            >
              Portal
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('directory');
                setShowConfig(false);
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === 'directory' && !showConfig
                  ? 'text-[#0A2463] underline underline-offset-4'
                  : ''
              }`}
            >
              Kontak
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('recap');
                setShowConfig(false);
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === 'recap' ? 'text-[#0A2463] underline underline-offset-4' : ''
              }`}
            >
              Rekap
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('sync');
                setShowConfig(false);
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === 'sync' ? 'text-[#0A2463] underline underline-offset-4' : ''
              }`}
            >
              Kontak_Sync
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('history');
                setShowConfig(false);
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeTab === 'history' ? 'text-[#0A2463] underline underline-offset-4' : ''
              }`}
            >
              History
            </button>
            <button
              type="button"
              onClick={() => setShowConfig((prev) => !prev)}
              className={`py-1 whitespace-nowrap shrink-0 ${
                showConfig ? 'text-[#0A2463] underline underline-offset-4' : ''
              }`}
            >
              GAS
            </button>
          </div>
        </header>

        <main id="top" className="mx-auto w-full max-w-[1920px] px-3 py-5 sm:w-[95%] sm:px-0 sm:py-6">
          <section className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <ContactLogo className="hidden h-11 w-11 shrink-0 sm:block" />
              <div>
                <p className="mb-0.5 text-xs font-semibold text-[#1D4ED8]">
                  mr.wadahdigital.my.id/kontak
                </p>
                <h1 className="text-balance bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-[28px]">
                  Direktori Kontak Terintegrasi
                </h1>
                <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#475569]">
                  Kelola daftar relasi multi-kategori, rekapitulasi &amp; deteksi duplikat, serta pantau status sinkronisasi Google Kontak secara real-time.
                </p>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#475569]"
              aria-live="polite"
            >
              <span>
                <strong className="tabular-mono font-bold text-[#0A2463]">
                  {contacts.length.toLocaleString('id-ID')}
                </strong>{' '}
                Entri
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="tabular-mono font-bold text-[#1D4ED8]">
                  {categories.length}
                </strong>{' '}
                Kategori
              </span>
              {duplicatePhonesCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveFilters({
                        categories: [],
                        genders: [],
                        onlyDuplicates: true,
                      });
                      setCurrentPage(1);
                      setActiveTab('directory');
                    }}
                    className="font-semibold text-[#0284C7] hover:underline"
                  >
                    <strong className="tabular-mono">{duplicatePhonesCount}</strong> Multi-Kat/Duplikat
                  </button>
                </>
              )}
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => setActiveTab(activeTab === 'code' ? 'directory' : 'code')}
                className="font-semibold text-[#1D4ED8] underline underline-offset-3 hover:text-[#0A2463]"
              >
                {activeTab === 'code' ? 'Kembali ke Kontak' : 'GitHub & Deploy'}
              </button>
            </div>
          </section>

          {/* Compact Real-Time Google Contacts Sync Status Bar */}
          <section
            className="glass-surface mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 text-xs sm:px-5"
            aria-label="Status Sinkronisasi Google Kontak"
          >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <button
                type="button"
                onClick={() => setActiveTab('sync')}
                className="inline-flex items-center gap-1.5 font-bold hover:underline"
              >
                {syncStatus?.rateLimited ? (
                  <>
                    <Clock className="h-4 w-4 text-[#B45309]" aria-hidden="true" />
                    <span className="text-[#B45309]">
                      Jeda Kuota Google API ({syncStatus.engine}) — Klik untuk Detail
                    </span>
                  </>
                ) : syncStatus?.connected ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    <span className="text-emerald-800">
                      Google Kontak Aktif ({syncStatus.engine})
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 text-[#B45309]" aria-hidden="true" />
                    <span className="text-[#B45309]">
                      {syncStatus
                        ? 'Google Kontak Belum Aktif — Klik untuk Panduan'
                        : 'Menunggu status Google Kontak...'}
                    </span>
                  </>
                )}
              </button>

              <span className="text-[#CBD5E1]" aria-hidden="true">|</span>

              <span className="text-[#475569]">
                Kontak_Sync:{' '}
                <strong className="tabular-mono text-[#0A2463]">
                  {syncStatus ? syncStatus.totalInSyncSheet : syncContacts.length}
                </strong>
              </span>
              <span className="text-[#475569]">
                Tersinkron:{' '}
                <strong className="tabular-mono text-emerald-800">
                  {syncStatus ? syncStatus.syncedCount : 0}
                </strong>
              </span>
              <span className="text-[#475569]">
                Belum:{' '}
                <strong className="tabular-mono text-[#B45309]">
                  {unsyncedTotal}
                </strong>
              </span>

              {quotaSummary && (
                <>
                  <span className="text-[#CBD5E1]" aria-hidden="true">|</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('sync')}
                    className="tabular-mono text-[#475569] hover:text-[#0A2463] hover:underline"
                    title="Lihat detail kuota & rekomendasi sinkronisasi"
                  >
                    Kuota/mnt: Baca{' '}
                    <strong className="text-[#0A2463]">
                      {Math.max(0, quotaSummary.minuteReadsLimit - quotaSummary.minuteReadsUsed)}/
                      {quotaSummary.minuteReadsLimit}
                    </strong>{' '}
                    · Tulis{' '}
                    <strong className="text-[#0A2463]">
                      {Math.max(0, quotaSummary.minuteWritesLimit - quotaSummary.minuteWritesUsed)}/
                      {quotaSummary.minuteWritesLimit}
                    </strong>
                  </button>
                </>
              )}

              <span className="text-[#CBD5E1]" aria-hidden="true">|</span>
              <button
                type="button"
                onClick={() => setActiveTab('sync')}
                className="font-medium text-[#1D4ED8] hover:underline"
              >
                {quickSyncHint}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[#475569]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                <span>Sinkron Terakhir:</span>
                <strong className="tabular-mono text-[#0A2463]">
                  {formatDisplayDateTime(syncStatus?.lastSyncAt) || 'Belum pernah'}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleSyncManualSheet}
                disabled={isAppBusy}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-[#1D4ED8]/10 px-3 py-1 font-semibold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8]/18 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
              >
                {isAppBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>
                  {isSyncingBatch
                    ? 'Menyinkronkan...'
                    : isRefreshing || isLoading || bgSyncCount > 0
                      ? 'Sedang Memuat...'
                      : 'Sinkronkan Google Kontak'}
                </span>
              </button>
            </div>
          </section>

          {/* Collapsible GAS Configuration Panel */}
          {showConfig && (
            <section
              className="glass-surface mb-6 rounded-[22px] p-5 sm:p-6"
              aria-label="Konfigurasi Google Apps Script"
            >
              <h2 className="text-base font-bold text-[#0A2463]">
                Konfigurasi Endpoint Google Apps Script
              </h2>
              <p className="mt-1 text-[13px] text-[#475569]">
                URL Web App Anda sudah terpasang secara default. Setelah memperbarui kode{' '}
                <span className="tabular-mono font-semibold">Code.gs</span> dan mengaktifkan{' '}
                <strong>People API</strong> di Apps Script, klik <strong>Setup Database</strong>{' '}
                atau <strong>Uji Koneksi</strong>.
              </p>

              <div className="mt-4 grid gap-2.5 lg:grid-cols-[1fr_auto_auto_auto] lg:items-end">
                <div>
                  <label
                    htmlFor="gas-url-input"
                    className="mb-1.5 block text-xs font-semibold text-[#0A2463]"
                  >
                    URL Web App Google Apps Script
                  </label>
                  <input
                    id="gas-url-input"
                    type="url"
                    value={gasUrlDraft}
                    onChange={(e) => setGasUrlDraft(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="tabular-mono min-h-[44px] w-full rounded-[10px] border border-[#1D4ED8]/20 bg-white/90 px-3.5 py-2.5 text-[13px] text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleTestGasConnection}
                  disabled={isTestingGas}
                  className="min-h-[44px] rounded-xl border border-[#1D4ED8]/18 bg-white px-4 py-2 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {isTestingGas ? 'Menguji...' : 'Uji Koneksi'}
                </button>
                <button
                  type="button"
                  onClick={handleRunSetupDatabase}
                  disabled={isSettingUpDb}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#0284C7]/25 bg-[#E0F2FE]/80 px-4 py-2 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#E0F2FE] disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Database className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                  {isSettingUpDb ? 'Menyiapkan...' : 'Setup Database'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveGasUrl}
                  className="btn-ocean-sheen min-h-[44px] rounded-xl px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-95 whitespace-nowrap shrink-0"
                >
                  Simpan &amp; Muat
                </button>
              </div>
            </section>
          )}

          {activeTab === 'code' ? (
            <CodeDeployView onNotify={(text, variant) => notify(text, variant)} />
          ) : activeTab === 'recap' ? (
            <RecapView
              contacts={contacts}
              syncContacts={syncContacts}
              categories={categories}
              syncStatus={syncStatus}
              onFilterByCategory={(catName) => {
                setActiveFilters({
                  categories: [catName],
                  genders: [],
                  onlyDuplicates: false,
                });
                setSearchQuery('');
                setCurrentPage(1);
                setActiveTab('directory');
              }}
              onFilterByGender={(g) => {
                setActiveFilters({
                  categories: [],
                  genders: [g],
                  onlyDuplicates: false,
                });
                setSearchQuery('');
                setCurrentPage(1);
                setActiveTab('directory');
              }}
              onFilterDuplicates={() => {
                setActiveFilters({
                  categories: [],
                  genders: [],
                  onlyDuplicates: true,
                });
                setSearchQuery('');
                setCurrentPage(1);
                setActiveTab('directory');
              }}
              onFilterByPhone={(phone) => {
                setActiveFilters(EMPTY_FILTERS);
                setSearchQuery(phone);
                setCurrentPage(1);
                setActiveTab('directory');
              }}
              onOpenSyncTab={() => setActiveTab('sync')}
            />
          ) : activeTab === 'history' ? (
            <HistoryView logs={historyLogs} isLoading={showInitialSkeleton} />
          ) : activeTab === 'sync' ? (
            <SyncSheetView
              syncContacts={syncContacts}
              syncStatus={syncStatus}
              isLoading={showInitialSkeleton}
              isSyncingBatch={isSyncingBatch}
              isBusy={isAppBusy}
              onSyncAllToGoogleContacts={handleSyncManualSheet}
            />
          ) : (
            /* Balanced 2-Column Workspace */
            <div className="grid items-start gap-5 lg:grid-cols-[360px_1fr]">
              {/* Left: Form Tambah / Edit Kontak */}
              <aside
                ref={formCardRef}
                className={`glass-surface scroll-mt-24 rounded-[22px] p-5 transition-all duration-300 lg:sticky lg:top-[82px] ${
                  isFormHighlighted
                    ? 'ring-4 ring-[#1D4ED8]/45 shadow-[0_0_0_1px_rgba(29,78,216,0.45),0_20px_42px_-12px_rgba(29,78,216,0.35)]'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-white ${
                        isEditingMode
                          ? 'bg-gradient-to-br from-[#0284C7] to-[#1D4ED8]'
                          : 'bg-gradient-to-br from-[#0A2463] to-[#1D4ED8]'
                      }`}
                    >
                      {isEditingMode ? (
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <UserPlus className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                    <h2 className="text-base font-bold text-[#0A2463]">
                      {isEditingMode ? 'Edit Kontak' : 'Tambah Kontak Baru'}
                    </h2>
                  </div>
                  {isEditingMode && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-xs font-semibold text-[#64748B] hover:text-[#0A2463] hover:underline"
                    >
                      Batal Edit
                    </button>
                  )}
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#475569]">
                  {isEditingMode
                    ? `Mengubah baris #${editingRowIndex ? editingRowIndex - 1 : '-'} (${editingOrigKategori || TANPA_KATEGORI_LABEL}). Perubahan langsung tersimpan ke Google Sheets.`
                    : 'Bisa centang 1 atau beberapa kategori sekaligus (otomatis tersimpan ke tiap kategori).'}
                </p>

                <form onSubmit={handleSubmitContact} className="mt-4 space-y-3.5" noValidate>
                  <div>
                    <label
                      htmlFor="contact-nama"
                      className="mb-1 block text-xs font-semibold text-[#0A2463]"
                    >
                      Nama Lengkap
                    </label>
                    <input
                      ref={namaInputRef}
                      id="contact-nama"
                      type="text"
                      autoCapitalize="words"
                      value={nama}
                      onChange={handleNamaChange}
                      placeholder="Contoh: Ahmad Fauzi"
                      className="min-h-[42px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                      required
                    />
                    <p className="mt-1 text-[11px] text-[#64748B]">
                      Huruf awal kata otomatis kapital setelah spasi (tetap bisa diubah huruf kecil manual).
                    </p>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-hp"
                      className="mb-1 block text-xs font-semibold text-[#0A2463]"
                    >
                      Nomor HP / WhatsApp
                    </label>
                    <input
                      ref={phoneInputRef}
                      id="contact-hp"
                      type="tel"
                      inputMode="numeric"
                      value={noHp}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="081234567890 atau 60123456789"
                      className="tabular-mono min-h-[42px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                      required
                    />
                    {duplicateMatches.length > 0 && !isEditingMode ? (
                      <div className="mt-1.5 rounded-lg border border-amber-500/35 bg-amber-50/90 px-2.5 py-1.5 text-[11.5px] leading-snug text-[#92400E]">
                        <strong className="font-bold">
                          Nomor sudah ada ({duplicateMatches.length} entri):
                        </strong>{' '}
                        {duplicateMatches
                          .slice(0, 2)
                          .map((d) => `${d.nama} (${d.kategori || TANPA_KATEGORI_LABEL})`)
                          .join(', ')}
                        {duplicateMatches.length > 2
                          ? ` +${duplicateMatches.length - 2} lainnya`
                          : ''}
                        . Klik Simpan untuk konfirmasi multi-kategori atau edit.
                      </div>
                    ) : (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-[#475569]">
                        {normalizePhoneForWA(noHp).length >= 8
                          ? `Format WA aktif: wa.me/${normalizePhoneForWA(noHp)}`
                          : 'Hanya angka. Awalan 08 otomatis menjadi 628 (kecuali nomor luar negeri).'}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-semibold text-[#0A2463]">
                      Jenis Kelamin
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#0A2463]/6 p-1">
                      {GENDER_OPTIONS.map((g) => {
                        const selected = jenisKelamin === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setJenisKelamin(g)}
                            className={`min-h-[36px] rounded-lg px-2 py-1 text-xs font-semibold transition-all whitespace-nowrap ${
                              selected
                                ? 'bg-white text-[#0A2463] shadow-sm'
                                : 'text-[#475569] hover:text-[#0A2463]'
                            }`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Multi-Category Checkbox Selector */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="block text-xs font-semibold text-[#0A2463]">
                        Kategori{' '}
                        <span className="font-normal text-[#64748B]">
                          ({selectedCategories.length === 0
                            ? 'Opsional / Tanpa Kategori'
                            : `${selectedCategories.length} dipilih`})
                        </span>
                      </span>
                      <div className="flex items-center gap-2.5">
                        {selectedCategories.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSelectedCategories([])}
                            className="text-[11px] font-semibold text-[#64748B] hover:text-[#0A2463] hover:underline"
                          >
                            Kosongkan
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowCategoryModal(true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] underline underline-offset-3 hover:text-[#0A2463]"
                        >
                          <Tag className="h-3 w-3" aria-hidden="true" />
                          Kelola
                        </button>
                      </div>
                    </div>

                    {categories.length > 6 && (
                      <div className="relative mb-1.5">
                        <Search
                          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
                          aria-hidden="true"
                        />
                        <input
                          type="search"
                          value={catFormSearch}
                          onChange={(e) => setCatFormSearch(e.target.value)}
                          placeholder="Cari kategori..."
                          className="min-h-[34px] w-full rounded-lg border border-[#1D4ED8]/16 bg-white/90 py-1 pl-8 pr-2.5 text-xs text-[#091B3A] outline-none focus:border-[#1D4ED8]"
                        />
                      </div>
                    )}

                    <div className="max-h-[168px] space-y-1 overflow-y-auto rounded-xl border border-[#1D4ED8]/16 bg-white/85 p-2">
                      {formFilteredCategories.map((cat) => {
                        const checked = selectedCategories.includes(cat.nama);
                        return (
                          <label
                            key={cat.nama}
                            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                              checked
                                ? 'bg-[#EFF6FF] font-semibold text-[#0A2463]'
                                : 'text-[#334155] hover:bg-[#F8FAFC]'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFormCategory(cat.nama)}
                                className="h-4 w-4 shrink-0 rounded border-[#1D4ED8]/35 text-[#1D4ED8] focus:ring-[#38BDF8]"
                              />
                              <span className="truncate">{cat.nama}</span>
                            </div>
                            <span className="tabular-mono shrink-0 text-[11px] font-medium text-[#1D4ED8]">
                              ({cat.kode})
                            </span>
                          </label>
                        );
                      })}
                      {formFilteredCategories.length === 0 && (
                        <div className="py-3 text-center text-xs text-[#64748B]">
                          Kategori tidak ditemukan.
                        </div>
                      )}
                    </div>
                    {selectedCategories.length > 1 && (
                      <p className="mt-1 text-[11px] font-medium text-[#1D4ED8]">
                        {isEditingMode
                          ? `Kategori utama "${selectedCategories[0]}" diperbarui + ${selectedCategories.length - 1} kategori tambahan dibuat.`
                          : `Otomatis disimpan ke ${selectedCategories.length} kategori terpilih sekaligus.`}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1.5">
                    <button
                      type="submit"
                      disabled={saveFeedback === 'saving'}
                      className="btn-ocean-sheen inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-80 whitespace-nowrap"
                    >
                      {saveFeedback === 'saving' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : saveFeedback === 'done' ? (
                        <Check className="h-4 w-4" aria-hidden="true" />
                      ) : null}
                      <span>
                        {saveFeedback === 'saving'
                          ? 'Menyimpan...'
                          : saveFeedback === 'done'
                            ? 'Diproses!'
                            : isEditingMode
                              ? 'Simpan Perubahan'
                              : selectedCategories.length > 1
                                ? `Simpan (${selectedCategories.length} Kategori)`
                                : 'Simpan Kontak'}
                      </span>
                    </button>

                    {isEditingMode && (
                      <button
                        type="button"
                        onClick={resetForm}
                        className="min-h-[44px] rounded-xl border border-[#1D4ED8]/18 bg-white px-4 py-2.5 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap shrink-0"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </form>
              </aside>

              {/* Right: Directory List */}
              <section
                className="glass-surface min-h-[540px] min-w-0 rounded-[22px] p-5 sm:p-6"
                aria-label="Daftar Kontak"
              >
                {/* Compact Toolbar: Search + Filter Popup Button + Sort + Download */}
                <div className="mb-4 space-y-2.5 border-b border-[#1D4ED8]/10 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="relative min-w-[200px] flex-1">
                      <Search
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Cari nama, nomor 628..., kategori, atau gender..."
                        aria-label="Cari kontak"
                        className="min-h-[40px] w-full rounded-[11px] border border-[#1D4ED8]/16 bg-white/90 py-2 pl-10 pr-3.5 text-[13px] text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/22"
                      />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Popup Filter Trigger Button */}
                      <button
                        type="button"
                        onClick={() => setShowFilterModal(true)}
                        className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-[11px] border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          activeFilterCount > 0
                            ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white hover:bg-[#1E40AF]'
                            : 'border-[#1D4ED8]/20 bg-white text-[#0A2463] hover:bg-[#EFF6FF]'
                        }`}
                      >
                        <Filter className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Filter</span>
                        {activeFilterCount > 0 && (
                          <span className="tabular-mono ml-0.5 rounded-md bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">
                            {activeFilterCount}
                          </span>
                        )}
                      </button>

                      {hasAnySearchOrFilter && (
                        <button
                          type="button"
                          onClick={handleResetAllFilters}
                          title="Reset semua filter & pencarian"
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-[11px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0A2463] whitespace-nowrap"
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reset</span>
                        </button>
                      )}

                      {/* Sort Dropdown (includes Timestamp Sorting) */}
                      <div className="relative inline-flex items-center">
                        <ArrowUpDown
                          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#1D4ED8]"
                          aria-hidden="true"
                        />
                        <select
                          value={sortBy}
                          onChange={(e) => {
                            setSortBy(e.target.value as SortOption);
                            setCurrentPage(1);
                          }}
                          aria-label="Urutkan daftar kontak"
                          className="min-h-[40px] rounded-[11px] border border-[#1D4ED8]/18 bg-white/90 py-2 pl-8 pr-3 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
                        >
                          <option value="default">Urut: Asli</option>
                          <option value="waktu-desc">Terbaru (Waktu)</option>
                          <option value="waktu-asc">Terlama (Waktu)</option>
                          <option value="nama-asc">Nama A–Z</option>
                          <option value="nama-desc">Nama Z–A</option>
                          <option value="kategori-asc">Kategori A–Z</option>
                          <option value="gender-asc">Jenis Kelamin</option>
                        </select>
                      </div>

                      {/* Download / Export Menu */}
                      <div className="relative" ref={exportMenuRef}>
                        <button
                          type="button"
                          onClick={() => setShowExportMenu((prev) => !prev)}
                          aria-expanded={showExportMenu}
                          aria-haspopup="menu"
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[11px] border border-[#1D4ED8]/20 bg-white px-3.5 py-2 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                          <span>
                            Unduh ({sortedContacts.length.toLocaleString('id-ID')})
                          </span>
                        </button>

                        {showExportMenu && (
                          <div
                            role="menu"
                            aria-label="Pilih format unduhan"
                            className="glass-surface absolute right-0 z-30 mt-2 w-64 rounded-2xl bg-white/95 p-1.5 shadow-xl"
                          >
                            <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#64748B]">
                              Ekspor {sortedContacts.length.toLocaleString('id-ID')} kontak (semua halaman)
                            </div>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleExportFormat('xlsx')}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
                            >
                              <FileSpreadsheet
                                className="h-4 w-4 shrink-0 text-emerald-700"
                                aria-hidden="true"
                              />
                              <div>
                                <div>Excel (.xlsx)</div>
                                <div className="text-[11px] font-normal text-[#64748B]">
                                  Spreadsheet rapi siap olah
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleExportFormat('csv')}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
                            >
                              <FileText
                                className="h-4 w-4 shrink-0 text-[#0284C7]"
                                aria-hidden="true"
                              />
                              <div>
                                <div>CSV (.csv)</div>
                                <div className="text-[11px] font-normal text-[#64748B]">
                                  Format teks tabel universal
                                </div>
                              </div>
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => handleExportFormat('vcf')}
                              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
                            >
                              <Smartphone
                                className="h-4 w-4 shrink-0 text-[#1D4ED8]"
                                aria-hidden="true"
                              />
                              <div>
                                <div>vCard Android (.vcf)</div>
                                <div className="text-[11px] font-normal text-[#64748B]">
                                  Langsung impor ke Kontak HP
                                </div>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Active Filter Summary Strip (Compact, removable) */}
                  {activeFilterCount > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                      <span className="font-semibold text-[#64748B]">Filter aktif:</span>

                      {activeFilters.onlyDuplicates && (
                        <button
                          type="button"
                          onClick={() => {
                            setActiveFilters((prev) => ({ ...prev, onlyDuplicates: false }));
                            setCurrentPage(1);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#1D4ED8]/25 bg-[#EFF6FF] px-2.5 py-1 font-semibold text-[#1D4ED8] hover:bg-[#DBEAFE]"
                        >
                          <Copy className="h-3 w-3" aria-hidden="true" />
                          <span>Hanya Duplikat</span>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}

                      {activeFilters.genders.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            setActiveFilters((prev) => ({
                              ...prev,
                              genders: prev.genders.filter((x) => x !== g),
                            }));
                            setCurrentPage(1);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#0284C7]/25 bg-[#E0F2FE]/80 px-2.5 py-1 font-semibold text-[#0369A1] hover:bg-[#BAE6FD]"
                        >
                          <span>Gender: {g}</span>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ))}

                      {activeFilters.categories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setActiveFilters((prev) => ({
                              ...prev,
                              categories: prev.categories.filter((x) => x !== cat),
                            }));
                            setCurrentPage(1);
                          }}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold ${
                            cat === TANPA_KATEGORI_LABEL
                              ? 'border-amber-400/50 bg-amber-50 text-[#92400E] hover:bg-amber-100'
                              : 'border-[#1D4ED8]/20 bg-white text-[#0A2463] hover:bg-[#EFF6FF]'
                          }`}
                        >
                          <span>{cat}</span>
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      ))}

                      <span className="tabular-mono ml-auto text-[11px] font-semibold text-[#64748B]">
                        {sortedContacts.length.toLocaleString('id-ID')} dari{' '}
                        {contacts.length.toLocaleString('id-ID')} entri
                      </span>
                    </div>
                  )}
                </div>

                {showInitialSkeleton ? (
                  <div className="space-y-2.5 py-2" aria-label="Memuat kontak">
                    {[1, 2, 3, 4].map((idx) => (
                      <div
                        key={idx}
                        className="h-11 animate-pulse rounded-xl bg-[#1D4ED8]/8"
                      />
                    ))}
                  </div>
                ) : sortedContacts.length === 0 ? (
                  <div className="py-12 text-center">
                    <h3 className="text-base font-bold text-[#0A2463]">
                      Belum ada kontak yang ditampilkan
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[#475569]">
                      {hasAnySearchOrFilter
                        ? 'Tidak ada kontak yang cocok dengan pencarian atau filter yang dicentang.'
                        : 'Tambahkan kontak pertama melalui formulir di samping.'}
                    </p>
                    {hasAnySearchOrFilter && (
                      <button
                        type="button"
                        onClick={handleResetAllFilters}
                        className="mt-4 min-h-[40px] rounded-xl border border-[#1D4ED8]/18 bg-white px-4 py-2 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
                      >
                        Reset Semua Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop High-Density Proportional Table */}
                    <div className="hidden overflow-x-auto rounded-xl border border-[#1D4ED8]/15 md:block">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-[#0A2463] text-xs font-semibold text-white">
                            <th className="w-11 px-2.5 py-3 text-center whitespace-nowrap">No</th>
                            <th className="min-w-[170px] px-3 py-3 text-center whitespace-nowrap">
                              Nama
                            </th>
                            <th className="w-[140px] px-2.5 py-3 text-center whitespace-nowrap">
                              No HP (WA)
                            </th>
                            <th className="min-w-[125px] max-w-[190px] px-3 py-3 text-center whitespace-nowrap">
                              Kategori
                            </th>
                            <th
                              className="w-12 px-2 py-3 text-center whitespace-nowrap"
                              title="Jenis Kelamin (L=Laki-laki, P=Perempuan, A=Admin)"
                            >
                              JK
                            </th>
                            <th className="w-[128px] px-2.5 py-3 text-center whitespace-nowrap">
                              Waktu
                            </th>
                            <th className="w-[162px] px-2.5 py-3 text-center whitespace-nowrap">
                              Aksi
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1D4ED8]/10 text-[13px]">
                          {paginatedContacts.map((c, idx) => {
                            const globalNo = (safePage - 1) * pageSize + idx + 1;
                            const waPhone = normalizePhoneForWA(c.noHp);
                            const catClean = String(c.kategori || '').trim();
                            const catCode = catClean ? getCategoryCode(catClean) : '';
                            const genderShort = getGenderShort(c.jenisKelamin);
                            const dupCount = waPhone ? phoneCountMap.get(waPhone) || 0 : 0;
                            const { date: dateLine, time: timeLine } = splitDateTimeLines(c.updatedAt);
                            const isBeingEdited =
                              isEditingMode &&
                              editingRowIndex !== null &&
                              c.rowIndex === editingRowIndex;

                            return (
                              <tr
                                key={`${c.rowIndex ?? globalNo}-${waPhone}-${catClean}`}
                                className={`row-enter transition-colors hover:bg-[#38BDF8]/15 ${
                                  isBeingEdited
                                    ? 'bg-[#DBEAFE]/90'
                                    : 'odd:bg-white/60 even:bg-[#EFF6FF]/85'
                                }`}
                              >
                                <td className="tabular-mono px-2.5 py-2.5 text-center text-xs font-semibold text-[#64748B]">
                                  {globalNo}
                                </td>
                                <td className="max-w-[260px] px-3 py-2.5 text-left">
                                  <div className="flex items-start gap-1.5">
                                    <div
                                      className="line-clamp-2 break-words font-semibold leading-snug text-[#061A40]"
                                      title={c.nama}
                                    >
                                      {c.nama}
                                    </div>
                                    {dupCount > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSearchQuery(waPhone);
                                          setCurrentPage(1);
                                        }}
                                        title={`Nomor ini ada di ${dupCount} baris/kategori. Klik untuk melihat semuanya.`}
                                        className="tabular-mono mt-0.5 shrink-0 rounded bg-[#1D4ED8]/12 px-1.5 py-0.5 text-[10px] font-bold text-[#1D4ED8] hover:bg-[#1D4ED8]/22"
                                      >
                                        {dupCount}x
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="tabular-mono px-2.5 py-2.5 text-center text-[12.5px] font-semibold text-[#1D4ED8] whitespace-nowrap">
                                  {waPhone}
                                </td>
                                <td className="max-w-[190px] px-3 py-2.5 text-left">
                                  <div
                                    className={`line-clamp-2 break-words text-[12.5px] font-semibold leading-snug ${getCategoryTextStyle(
                                      catClean
                                    )}`}
                                    title={`${catClean || TANPA_KATEGORI_LABEL}${catCode ? ` (${catCode})` : ''}`}
                                  >
                                    {catClean || TANPA_KATEGORI_LABEL}
                                    {catCode ? ` (${catCode})` : ''}
                                  </div>
                                </td>
                                <td
                                  className="px-2 py-2.5 text-center"
                                  title={c.jenisKelamin}
                                >
                                  <span
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                                      genderShort === 'P'
                                        ? 'bg-pink-500/12 text-pink-700'
                                        : genderShort === 'A'
                                          ? 'bg-amber-500/15 text-[#B45309]'
                                          : 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                                    }`}
                                  >
                                    {genderShort}
                                  </span>
                                </td>
                                <td className="px-2.5 py-2.5 text-center">
                                  {dateLine ? (
                                    <div
                                      className="inline-flex items-center justify-center gap-1.5"
                                      title={
                                        c.lastAction === 'updated'
                                          ? `Diedit pada ${c.updatedAt}`
                                          : c.lastAction === 'created'
                                            ? `Ditambahkan pada ${c.updatedAt}`
                                            : c.updatedAt
                                      }
                                    >
                                      {c.lastAction === 'updated' ? (
                                        <Pencil
                                          className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8]"
                                          aria-label="Diedit"
                                        />
                                      ) : c.lastAction === 'created' ? (
                                        <PlusCircle
                                          className="h-3.5 w-3.5 shrink-0 text-emerald-700"
                                          aria-label="Ditambahkan"
                                        />
                                      ) : null}
                                      <div className="tabular-mono text-[11px] leading-tight text-[#475569]">
                                        <div className="font-semibold text-[#0A2463] whitespace-nowrap">
                                          {dateLine}
                                        </div>
                                        {timeLine && (
                                          <div className="text-[10.5px] text-[#64748B]">
                                            {timeLine}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className="tabular-mono text-xs text-[#94A3B8]">—</span>
                                  )}
                                </td>
                                <td className="px-2.5 py-2.5 text-center">
                                  <div className="inline-flex items-center justify-center gap-1">
                                    <a
                                      href={buildWhatsAppUrl(waPhone)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title="Chat via WhatsApp"
                                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-emerald-700/10 px-2 py-1 text-xs font-semibold text-emerald-800 transition-transform hover:-translate-y-0.5 hover:bg-emerald-700/18 whitespace-nowrap shrink-0"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>WA</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(c)}
                                      title="Edit kontak ini"
                                      className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-[#1D4ED8]/10 px-2 py-1 text-xs font-semibold text-[#1D4ED8] transition-transform hover:-translate-y-0.5 hover:bg-[#1D4ED8]/18 whitespace-nowrap shrink-0"
                                    >
                                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                      <span>Edit</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDelete(c)}
                                      title="Hapus baris kontak ini"
                                      aria-label={`Hapus ${c.nama}`}
                                      className="inline-flex min-h-[32px] items-center justify-center rounded-lg bg-red-700/10 px-2 py-1 text-xs font-semibold text-red-700 transition-transform hover:-translate-y-0.5 hover:bg-red-700/18 whitespace-nowrap shrink-0"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Responsive Cards with Pagination & Zebra Shading */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {paginatedContacts.map((c, idx) => {
                        const globalNo = (safePage - 1) * pageSize + idx + 1;
                        const waPhone = normalizePhoneForWA(c.noHp);
                        const catClean = String(c.kategori || '').trim();
                        const catCode = catClean ? getCategoryCode(catClean) : '';
                        const genderShort = getGenderShort(c.jenisKelamin);
                        const dupCount = waPhone ? phoneCountMap.get(waPhone) || 0 : 0;
                        return (
                          <article
                            key={`${c.rowIndex ?? globalNo}-${waPhone}-${catClean}`}
                            className="row-enter rounded-[14px] border border-[#1D4ED8]/14 odd:bg-white/85 even:bg-[#EFF6FF]/85 p-4"
                          >
                            <div className="mb-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex min-w-0 items-baseline gap-2">
                                  <span className="tabular-mono shrink-0 text-xs font-bold text-[#64748B]">
                                    #{globalNo}
                                  </span>
                                  <h3 className="line-clamp-2 break-words text-[14.5px] font-bold text-[#061A40]">
                                    {c.nama}
                                  </h3>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {dupCount > 1 && (
                                    <span className="tabular-mono rounded bg-[#1D4ED8]/12 px-1.5 py-0.5 text-[10px] font-bold text-[#1D4ED8]">
                                      {dupCount}x
                                    </span>
                                  )}
                                  <span
                                    title={c.jenisKelamin}
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                                      genderShort === 'P'
                                        ? 'bg-pink-500/12 text-pink-700'
                                        : genderShort === 'A'
                                          ? 'bg-amber-500/15 text-[#B45309]'
                                          : 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                                    }`}
                                  >
                                    {genderShort}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#475569]">
                                <span className="tabular-mono font-semibold text-[#1D4ED8]">
                                  {waPhone}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-semibold ${getCategoryTextStyle(catClean)}`}
                                >
                                  {catClean || TANPA_KATEGORI_LABEL}
                                  {catCode ? ` (${catCode})` : ''}
                                </span>
                              </div>

                              {c.updatedAt && (
                                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] text-[#64748B]">
                                  {c.lastAction === 'updated' ? (
                                    <Pencil className="h-3 w-3 text-[#1D4ED8]" aria-hidden="true" />
                                  ) : c.lastAction === 'created' ? (
                                    <PlusCircle
                                      className="h-3 w-3 text-emerald-700"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <Clock className="h-3 w-3 text-[#64748B]" aria-hidden="true" />
                                  )}
                                  <span className="tabular-mono">
                                    {formatDisplayDateTime(c.updatedAt)}
                                  </span>
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                              <a
                                href={buildWhatsAppUrl(waPhone)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-emerald-700/10 px-3 py-2 text-xs font-semibold text-emerald-800 whitespace-nowrap"
                              >
                                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                                WhatsApp
                              </a>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(c)}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-[#1D4ED8]/10 px-3.5 py-2 text-xs font-semibold text-[#1D4ED8] whitespace-nowrap"
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(c)}
                                aria-label={`Hapus ${c.nama}`}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-red-700/10 px-3.5 py-2 text-xs font-semibold text-red-700"
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    <PaginationBar
                      totalItems={sortedContacts.length}
                      currentPage={safePage}
                      pageSize={pageSize}
                      onPageChange={setCurrentPage}
                      onPageSizeChange={(size) => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                    />
                  </>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Filter Popup Modal */}
      <FilterModal
        isOpen={showFilterModal}
        categories={categories}
        categoryCounts={categoryCounts}
        genderCounts={genderCounts}
        duplicateRowsCount={duplicateRowsCount}
        duplicatePhonesCount={duplicatePhonesCount}
        uncategorizedCount={categoryCounts[TANPA_KATEGORI_LABEL] ?? 0}
        activeFilters={activeFilters}
        computeMatchCount={computeFilterPreviewCount}
        onApply={(next) => {
          setActiveFilters(next);
          setCurrentPage(1);
        }}
        onReset={handleResetAllFilters}
        onClose={() => setShowFilterModal(false)}
      />

      <CategoryManagerModal
        isOpen={showCategoryModal}
        categories={categories}
        isMutating={isMutatingCategory}
        onClose={() => setShowCategoryModal(false)}
        onSaveCategories={handleSaveCategories}
      />

      <DuplicatePhoneModal
        existingContacts={pendingDuplicates}
        draftName={nama}
        draftPhone={noHp}
        draftCategories={selectedCategories}
        onEditExisting={(target) => {
          setPendingDuplicates([]);
          handleStartEdit(target);
          notify(
            `Kontak "${target.nama}" (${target.kategori || TANPA_KATEGORI_LABEL}) dimuat ke mode edit.`,
            'info',
            { title: 'Mode Edit Aktif' }
          );
        }}
        onCreateNewAnyway={() => {
          setPendingDuplicates([]);
          executeSaveContact(true);
        }}
        onCancel={() => {
          setPendingDuplicates([]);
          phoneInputRef.current?.focus();
        }}
      />

      <ConfirmDeleteModal
        contact={pendingDelete}
        isDeleting={isDeleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* High-Visibility Toast Notifications (Longer Duration + Clear Color Coding + Manual Close) */}
      <div
        className="fixed bottom-4 right-4 left-4 z-50 flex flex-col gap-2.5 sm:left-auto sm:bottom-5 sm:right-5 sm:w-[400px]"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const cardTone =
            t.variant === 'success'
              ? 'border-emerald-400 bg-emerald-50/98 text-emerald-950 shadow-emerald-900/15'
              : t.variant === 'error'
                ? 'border-red-400 bg-red-50/98 text-red-950 shadow-red-900/15'
                : t.variant === 'warning'
                  ? 'border-amber-400 bg-amber-50/98 text-[#78350F] shadow-amber-900/15'
                  : 'border-sky-300 bg-sky-50/98 text-[#0A2463] shadow-blue-900/15';

          return (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-[13px] leading-snug shadow-xl backdrop-blur-md transition-all ${cardTone}`}
            >
              {t.variant === 'success' && (
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
              )}
              {t.variant === 'error' && (
                <AlertCircle
                  className="mt-0.5 h-5 w-5 shrink-0 text-red-600"
                  aria-hidden="true"
                />
              )}
              {t.variant === 'warning' && (
                <AlertTriangle
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#D97706]"
                  aria-hidden="true"
                />
              )}
              {t.variant === 'info' && (
                <Info
                  className="mt-0.5 h-5 w-5 shrink-0 text-[#1D4ED8]"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0 flex-1">
                {t.title && <div className="text-[13px] font-bold">{t.title}</div>}
                <div className="mt-0.5 text-[12.5px] opacity-95">{t.text}</div>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Tutup notifikasi"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg opacity-70 transition-opacity hover:bg-black/5 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
