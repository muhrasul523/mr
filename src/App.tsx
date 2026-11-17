import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Info,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Search,
  Tag,
  Trash2,
  UserPlus,
} from 'lucide-react';
import {
  CategoryItem,
  Contact,
  DEFAULT_CATEGORIES,
  DEFAULT_GAS_URL,
  GENDER_OPTIONS,
  GenderOption,
  GoogleSyncStatus,
  HistoryLog,
  TANPA_KATEGORI_LABEL,
  ToastMessage,
  buildWhatsAppUrl,
  normalizePhoneForWA,
  sanitizeLivePhoneInput,
} from './types/contact';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CodeDeployView } from './components/CodeDeployView';
import { ContactLogo } from './components/ContactLogo';
import { DuplicatePhoneModal } from './components/DuplicatePhoneModal';
import { HistoryView } from './components/HistoryView';
import { LandingPage } from './components/LandingPage';
import { RecapView } from './components/RecapView';
import { SyncSheetView } from './components/SyncSheetView';

const STORAGE_GAS_URL = 'wadah_digital_gas_url';
const STORAGE_LOCAL_CONTACTS = 'wadah_digital_local_contacts';
const STORAGE_LOCAL_SYNC = 'wadah_digital_local_sync_contacts';
const STORAGE_LOCAL_CATEGORIES = 'wadah_digital_local_categories_v2';
const STORAGE_LOCAL_HISTORY = 'wadah_digital_local_history';
const STORAGE_LOCAL_SYNC_STATUS = 'wadah_digital_local_sync_status';

const DEFAULT_DEMO_CONTACTS: Contact[] = [
  { nama: 'Ust. Muhammad Yusuf', noHp: '6281241001122', kategori: 'Internal', jenisKelamin: 'Laki-laki' },
  { nama: 'Dr. Hendra Wijaya', noHp: '6281144556677', kategori: 'VIP', jenisKelamin: 'Laki-laki' },
  { nama: 'Hj. Aminah Nur', noHp: '6285299887766', kategori: 'Keluarga', jenisKelamin: 'Perempuan' },
  { nama: 'Admin Pusat Layanan', noHp: '6281355443322', kategori: '', jenisKelamin: 'Admin' },
];

type RoutePath = 'landing' | 'kontak';
type KontakTab = 'directory' | 'recap' | 'sync' | 'history' | 'code';

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

export default function App() {
  const [route, setRoute] = useState<RoutePath>(() => detectRouteFromPath());
  const [activeTab, setActiveTab] = useState<KontakTab>('directory');
  const [showConfig, setShowConfig] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

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

  // Instant hydration from localStorage so UI renders immediately without waiting
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
  const [bgSyncCount, setBgSyncCount] = useState(0);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saving' | 'done'>('idle');
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMutatingCategory, setIsMutatingCategory] = useState(false);
  const [isSyncingBatch, setIsSyncingBatch] = useState(false);

  // Form states (kategori is optional, defaults to '')
  const [originalPhone, setOriginalPhone] = useState('');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [kategori, setKategori] = useState<string>('');
  const [jenisKelamin, setJenisKelamin] = useState<GenderOption>('Laki-laki');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [activeGender, setActiveGender] = useState<string>('Semua');

  // Modals & Toast
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<Contact | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const namaInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

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

  const notify = useCallback(
    (text: string, variant: ToastMessage['variant'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, text, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4200);
    },
    []
  );

  const persistLocalCategories = useCallback((cats: CategoryItem[]) => {
    localStorage.setItem(STORAGE_LOCAL_CATEGORIES, JSON.stringify(cats));
  }, []);

  const pushLocalHistory = useCallback(
    (action: string, contactName: string, phone: string, detail: string) => {
      const now = new Date();
      const waktu = now.toISOString().replace('T', ' ').slice(0, 19);
      const entry: HistoryLog = {
        waktu,
        action,
        nama: contactName,
        noHp: phone,
        detail,
      };
      setHistoryLogs((prev) => {
        const next = [entry, ...prev].slice(0, 200);
        localStorage.setItem(STORAGE_LOCAL_HISTORY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const fetchContacts = useCallback(
    async (targetUrl?: string, options?: { silent?: boolean }) => {
      const endpoint = targetUrl !== undefined ? targetUrl : gasUrl;
      const isSilent = Boolean(options?.silent);
      if (!isSilent) {
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
          return;
        }

        const response = await fetch(endpoint, { method: 'GET', redirect: 'follow' });
        const result = await response.json();
        if (result.status !== 'success') {
          throw new Error(result.message || 'Respons server tidak valid.');
        }

        const remoteContacts: Contact[] = Array.isArray(result.data)
          ? result.data.map((c: Partial<Contact>) => ({
              nama: String(c.nama || ''),
              noHp: String(c.noHp || ''),
              kategori: String(c.kategori || '').trim(),
              jenisKelamin: (c.jenisKelamin as GenderOption) || 'Laki-laki',
            }))
          : [];

        const remoteSync: Contact[] = Array.isArray(result.syncContacts)
          ? result.syncContacts.map((c: Partial<Contact>) => ({
              nama: String(c.nama || ''),
              noHp: String(c.noHp || ''),
              kategori: String(c.kategori || '').trim(),
              jenisKelamin: (c.jenisKelamin as GenderOption) || 'Laki-laki',
            }))
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

        const remoteSyncStatus: GoogleSyncStatus | null = result.syncStatus
          ? {
              engine: String(result.syncStatus.engine || 'Unavailable'),
              connected: Boolean(result.syncStatus.connected),
              error: String(result.syncStatus.error || ''),
              totalInSyncSheet: Number(result.syncStatus.totalInSyncSheet ?? remoteSync.length),
              syncedCount: Number(result.syncStatus.syncedCount ?? 0),
              unsyncedCount: Number(result.syncStatus.unsyncedCount ?? remoteSync.length),
              unsyncedPhones: Array.isArray(result.syncStatus.unsyncedPhones)
                ? result.syncStatus.unsyncedPhones
                : [],
              lastSyncAt: String(result.syncStatus.lastSyncAt || ''),
            }
          : null;

        setContacts(remoteContacts);
        setSyncContacts(remoteSync);
        setCategories(remoteCats);
        setHistoryLogs(remoteHistory);
        setSyncStatus(remoteSyncStatus);

        localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(remoteContacts));
        localStorage.setItem(STORAGE_LOCAL_SYNC, JSON.stringify(remoteSync));
        localStorage.setItem(STORAGE_LOCAL_CATEGORIES, JSON.stringify(remoteCats));
        localStorage.setItem(STORAGE_LOCAL_HISTORY, JSON.stringify(remoteHistory));
        if (remoteSyncStatus) {
          localStorage.setItem(STORAGE_LOCAL_SYNC_STATUS, JSON.stringify(remoteSyncStatus));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat data.';
        if (!isSilent) {
          notify(`Gagal mengambil data dari GAS: ${msg}`, 'error');
        }
      } finally {
        if (!isSilent) {
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

  function resetForm() {
    setOriginalPhone('');
    setNama('');
    setNoHp('');
    setKategori('');
    setJenisKelamin('Laki-laki');
  }

  function handleStartEdit(contact: Contact) {
    const cleanPhone = normalizePhoneForWA(contact.noHp);
    setOriginalPhone(cleanPhone);
    setNama(contact.nama);
    setNoHp(cleanPhone);
    setKategori(contact.kategori ? contact.kategori.trim() : '');
    setJenisKelamin(
      GENDER_OPTIONS.includes(contact.jenisKelamin) ? contact.jenisKelamin : 'Laki-laki'
    );
    setActiveTab('directory');
    namaInputRef.current?.focus();
  }

  function handlePhoneChange(rawValue: string) {
    setNoHp(sanitizeLivePhoneInput(rawValue));
  }

  const duplicateMatch = useMemo(() => {
    const normCurrent = normalizePhoneForWA(noHp);
    const normOrig = normalizePhoneForWA(originalPhone);
    if (!normCurrent || normCurrent.length < 8) return null;
    return (
      contacts.find((c) => {
        const n = normalizePhoneForWA(c.noHp);
        return n === normCurrent && n !== normOrig;
      }) || null
    );
  }, [contacts, noHp, originalPhone]);

  function executeSaveContact(allowDuplicate: boolean) {
    const cleanNama = nama.trim();
    const cleanPhone = normalizePhoneForWA(noHp);
    const cleanOrig = normalizePhoneForWA(originalPhone);
    const selectedCategory = kategori.trim();
    const selectedGender = jenisKelamin;

    const newRecord: Contact = {
      nama: cleanNama,
      noHp: cleanPhone,
      kategori: selectedCategory,
      jenisKelamin: selectedGender,
    };

    // Optimistic update on local Kontak state ONLY (never overwrite Kontak_Sync!)
    setContacts((prev) => {
      const next = [...prev];
      if (!allowDuplicate) {
        const existingIdx = next.findIndex(
          (c) => normalizePhoneForWA(c.noHp) === (cleanOrig || cleanPhone)
        );
        const dupIdx = next.findIndex(
          (c) => normalizePhoneForWA(c.noHp) === cleanPhone
        );
        if (existingIdx !== -1 && dupIdx !== -1 && existingIdx !== dupIdx) {
          next[dupIdx] = newRecord;
          next.splice(existingIdx, 1);
        } else if (existingIdx !== -1) {
          next[existingIdx] = newRecord;
        } else if (dupIdx !== -1) {
          next[dupIdx] = newRecord;
        } else {
          next.unshift(newRecord);
        }
      } else {
        next.unshift(newRecord);
      }
      localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(next));
      return next;
    });

    const catObj = categories.find((c) => c.nama === selectedCategory);
    const catDetail = selectedCategory
      ? `${selectedCategory}${catObj ? ` (${catObj.kode})` : ''}`
      : TANPA_KATEGORI_LABEL;

    pushLocalHistory(
      cleanOrig ? 'Edit Kontak' : 'Tambah Kontak',
      cleanNama,
      cleanPhone,
      `Kategori: ${catDetail} · Gender: ${selectedGender}`
    );

    // Brief ~1s feedback so user can immediately continue editing/adding next contact
    setSaveFeedback('saving');
    setTimeout(() => {
      setSaveFeedback('done');
      resetForm();
      setTimeout(() => {
        setSaveFeedback('idle');
      }, 650);
    }, 650);

    if (!gasUrl) {
      notify(
        cleanOrig
          ? 'Kontak diperbarui di Mode Pratinjau Lokal.'
          : 'Kontak baru disimpan di Mode Pratinjau Lokal.',
        'success'
      );
      return;
    }

    notify(
      cleanOrig
        ? `Memperbarui "${cleanNama}" di latar belakang...`
        : `Menyimpan "${cleanNama}" di latar belakang...`,
      'info'
    );

    setBgSyncCount((c) => c + 1);
    fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'save',
        nama: cleanNama,
        noHp: cleanPhone,
        originalNoHp: cleanOrig,
        kategori: selectedCategory,
        jenisKelamin: selectedGender,
        allowDuplicate,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.status !== 'success') {
          throw new Error(result.message || 'Gagal menyimpan kontak ke server.');
        }
        if (result.syncSummary?.syncStatus) {
          setSyncStatus(result.syncSummary.syncStatus);
          localStorage.setItem(
            STORAGE_LOCAL_SYNC_STATUS,
            JSON.stringify(result.syncSummary.syncStatus)
          );
        }
        return fetchContacts(undefined, { silent: true });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan jaringan.';
        notify(`Gagal sinkron penyimpanan ke GAS: ${msg}`, 'error');
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
      notify('Nama lengkap wajib diisi.', 'error');
      namaInputRef.current?.focus();
      return;
    }
    if (cleanPhone.length < 8) {
      notify('Masukkan nomor HP yang valid (minimal 8 digit angka).', 'error');
      phoneInputRef.current?.focus();
      return;
    }

    // If phone matches an existing contact (and we are not already editing that same number), ask confirmation
    if (duplicateMatch) {
      setPendingDuplicate(duplicateMatch);
      return;
    }

    executeSaveContact(false);
  }

  function handleConfirmDelete() {
    if (!pendingDelete) return;
    const targetContact = pendingDelete;
    const cleanTarget = normalizePhoneForWA(targetContact.noHp);

    setIsDeleting(true);
    setContacts((prev) => {
      const next = prev.filter((c) => normalizePhoneForWA(c.noHp) !== cleanTarget);
      localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(next));
      return next;
    });

    pushLocalHistory(
      'Hapus Kontak',
      targetContact.nama,
      cleanTarget,
      'Dihapus dari sheet Kontak'
    );

    // Quick ~500ms confirmation & release UI
    setTimeout(() => {
      setIsDeleting(false);
      setPendingDelete(null);
    }, 450);

    if (!gasUrl) {
      notify('Kontak dihapus dari Mode Pratinjau Lokal.', 'success');
      return;
    }

    notify(`Menghapus "${targetContact.nama}" di latar belakang...`, 'info');
    setBgSyncCount((c) => c + 1);
    fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete',
        noHp: cleanTarget,
        nama: targetContact.nama,
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        if (result.status !== 'success') {
          throw new Error(result.message || 'Gagal menghapus kontak.');
        }
        return fetchContacts(undefined, { silent: true });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.';
        notify(`Gagal menghapus di GAS: ${msg}`, 'error');
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

    // Optimistically update categories right away (~instant)
    setCategories(nextList);
    persistLocalCategories(nextList);

    if (renameMap) {
      setContacts((prev) => {
        const updated = prev.map((c) =>
          renameMap[c.kategori] ? { ...c, kategori: renameMap[c.kategori] } : c
        );
        localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(updated));
        return updated;
      });
    }

    if (kategori && !nextList.some((c) => c.nama === kategori)) {
      setKategori('');
    }
    if (
      activeCategory !== 'Semua' &&
      activeCategory !== TANPA_KATEGORI_LABEL &&
      !nextList.some((c) => c.nama === activeCategory)
    ) {
      setActiveCategory('Semua');
    }

    pushLocalHistory(historyAction, '-', '-', historyDetail);

    if (!gasUrl) {
      notify('Daftar kategori berhasil diperbarui.', 'success');
      return true;
    }

    setIsMutatingCategory(true);
    setTimeout(() => setIsMutatingCategory(false), 350);

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
        return fetchContacts(undefined, { silent: true });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Gagal memperbarui kategori.';
        notify(`Gagal sinkron kategori ke GAS: ${msg}`, 'error');
      })
      .finally(() => {
        setBgSyncCount((c) => Math.max(0, c - 1));
      });

    notify('Kategori diperbarui.', 'success');
    return true;
  }

  async function handleSyncManualSheet() {
    if (!gasUrl) {
      pushLocalHistory(
        'Sinkron Kontak_Sync',
        `Batch (${syncContacts.length} kontak)`,
        '-',
        'Simulasi sinkronisasi Kontak_Sync ke Google Kontak'
      );
      notify('Mode Lokal: Kontak_Sync siap disinkronkan saat URL GAS terhubung.', 'info');
      return;
    }

    setIsSyncingBatch(true);
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'syncManual' }),
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Sinkronisasi Kontak_Sync gagal.');
      }
      if (result.syncStatus) {
        setSyncStatus(result.syncStatus);
        localStorage.setItem(STORAGE_LOCAL_SYNC_STATUS, JSON.stringify(result.syncStatus));
      }
      notify(result.message || 'Sinkronisasi Kontak_Sync ke Google Kontak selesai.', 'success');
      await fetchContacts(undefined, { silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan.';
      notify(msg, 'error');
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
      const response = await fetch(`${trimmed}${sep}action=ping`, {
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
      notify(`Koneksi Sheet aktif (${result.sheetName || 'Kontak'}). ${gNote}`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Koneksi gagal.';
      notify(`Uji koneksi gagal: ${msg}`, 'error');
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
      const response = await fetch(`${targetUrl}${sep}action=setup`, {
        method: 'GET',
        redirect: 'follow',
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Setup database gagal.');
      }
      notify(result.message || '4 Sheet (Kontak, Kontak_Sync, Kategori, History) siap.', 'success');
      await fetchContacts(targetUrl, { silent: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menjalankan setupdatabase.';
      notify(`Setup database gagal: ${msg}`, 'error');
    } finally {
      setIsSettingUpDb(false);
    }
  }

  function handleSaveGasUrl() {
    const trimmed = gasUrlDraft.trim();
    setGasUrl(trimmed);
    localStorage.setItem(STORAGE_GAS_URL, trimmed);
    if (trimmed) {
      notify('URL Google Apps Script disimpan.', 'success');
    } else {
      notify('URL dikosongkan. Beralih ke Mode Pratinjau Lokal.', 'info');
    }
    setShowConfig(false);
    fetchContacts(trimmed);
  }

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

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const digitsQ = q.replace(/\D/g, '');

    return contacts.filter((c) => {
      const catClean = String(c.kategori || '').trim();
      const matchCategory =
        activeCategory === 'Semua'
          ? true
          : activeCategory === TANPA_KATEGORI_LABEL
            ? !catClean
            : catClean === activeCategory;
      if (!matchCategory) return false;

      const matchGender = activeGender === 'Semua' || c.jenisKelamin === activeGender;
      if (!matchGender) return false;

      if (!q) return true;

      const nameMatch = c.nama.toLowerCase().includes(q);
      const catMatch = (catClean || TANPA_KATEGORI_LABEL).toLowerCase().includes(q);
      const genderMatch = c.jenisKelamin.toLowerCase().includes(q);
      const phoneRawMatch = c.noHp.toLowerCase().includes(q);
      const phoneNormMatch = Boolean(digitsQ && normalizePhoneForWA(c.noHp).includes(digitsQ));

      return nameMatch || catMatch || genderMatch || phoneRawMatch || phoneNormMatch;
    });
  }, [contacts, activeCategory, activeGender, searchQuery]);

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

  if (route === 'landing') {
    return (
      <LandingPage
        onOpenKontak={() => navigateTo('kontak')}
        totalContacts={contacts.length}
        totalCategories={categories.length}
      />
    );
  }

  const showInitialSkeleton = isLoading && contacts.length === 0;

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
        {/* 3-Zone Top Bar Contract */}
        <header className="glass-header sticky top-0 z-40">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-3.5">
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
              onClick={() => fetchContacts(undefined, { silent: contacts.length > 0 })}
              disabled={isLoading}
              className="btn-ocean-sheen inline-flex min-h-[40px] items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 sm:px-4 sm:text-[13px] whitespace-nowrap shrink-0"
            >
              {isLoading || bgSyncCount > 0 ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{bgSyncCount > 0 ? 'Sinkron Latar...' : 'Muat Ulang'}</span>
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

        <main id="top" className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
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
                  Kelola daftar relasi, rekapitulasi kategori &amp; jenis kelamin, serta pantau status sinkronisasi Google Kontak secara real-time.
                </p>
              </div>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#475569]"
              aria-live="polite"
            >
              <span>
                <strong className="tabular-mono font-bold text-[#0A2463]">{contacts.length}</strong> Kontak
              </span>
              <span aria-hidden="true">·</span>
              <span>
                <strong className="tabular-mono font-bold text-[#1D4ED8]">{categories.length}</strong> Kategori
              </span>
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
                {syncStatus?.connected ? (
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
                      {syncStatus ? 'Google Kontak Belum Aktif — Klik untuk Panduan' : 'Menunggu status Google Kontak...'}
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
                  {syncStatus ? syncStatus.unsyncedCount : syncContacts.length}
                </strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[#475569]">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                <span>Sinkron Terakhir:</span>
                <strong className="tabular-mono text-[#0A2463]">
                  {syncStatus?.lastSyncAt || 'Belum pernah'}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleSyncManualSheet}
                disabled={isSyncingBatch}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-[#1D4ED8]/10 px-3 py-1 font-semibold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8]/18 disabled:opacity-50 whitespace-nowrap"
              >
                {isSyncingBatch ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isSyncingBatch ? 'Menyinkronkan...' : 'Sinkronkan Google Kontak'}</span>
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
                URL Web App Anda sudah terpasang secara default. Setelah memperbarui kode <span className="tabular-mono font-semibold">Code.gs</span> dan mengaktifkan <strong>People API</strong> di Apps Script, klik <strong>Uji Koneksi</strong>.
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
            <CodeDeployView onNotify={notify} />
          ) : activeTab === 'recap' ? (
            <RecapView
              contacts={contacts}
              syncContacts={syncContacts}
              categories={categories}
              syncStatus={syncStatus}
              onFilterByCategory={(catName) => {
                setActiveCategory(catName);
                setActiveGender('Semua');
                setActiveTab('directory');
              }}
              onFilterByGender={(g) => {
                setActiveGender(g);
                setActiveCategory('Semua');
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
              onSyncAllToGoogleContacts={handleSyncManualSheet}
            />
          ) : (
            /* Balanced 2-Column Workspace */
            <div className="grid items-start gap-5 lg:grid-cols-[345px_1fr]">
              {/* Left: Form Tambah / Edit Kontak */}
              <aside className="glass-surface rounded-[22px] p-5 lg:sticky lg:top-[82px]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0A2463] to-[#1D4ED8] text-white">
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-bold text-[#0A2463]">
                    {originalPhone ? 'Edit Kontak' : 'Tambah Kontak Baru'}
                  </h2>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[#475569]">
                  {originalPhone
                    ? 'Perubahan akan langsung disimpan ke sheet Kontak dan History.'
                    : 'Simpan cepat ~1 detik dengan sinkronisasi latar belakang ke Google Sheets.'}
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
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Contoh: Ahmad Fauzi"
                      className="min-h-[42px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                      required
                    />
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
                    {duplicateMatch ? (
                      <div className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-50/90 px-2.5 py-1.5 text-[11.5px] font-semibold text-[#92400E]">
                        Nomor ini sudah terdaftar atas nama &ldquo;{duplicateMatch.nama}&rdquo;. Klik Simpan untuk memilih Edit Kontak Lama atau Kontak Baru.
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

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label
                        htmlFor="contact-kategori"
                        className="block text-xs font-semibold text-[#0A2463]"
                      >
                        Kategori <span className="font-normal text-[#64748B]">(Opsional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowCategoryModal(true)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] underline underline-offset-3 hover:text-[#0A2463]"
                      >
                        <Tag className="h-3 w-3" aria-hidden="true" />
                        Kelola Kategori
                      </button>
                    </div>
                    <select
                      id="contact-kategori"
                      value={kategori}
                      onChange={(e) => setKategori(e.target.value)}
                      className="min-h-[42px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                    >
                      <option value="">-- Tanpa Kategori (Opsional) --</option>
                      {categories.map((cat) => (
                        <option key={cat.nama} value={cat.nama}>
                          {cat.nama} ({cat.kode})
                        </option>
                      ))}
                    </select>
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
                            ? 'Tersimpan!'
                            : originalPhone
                              ? 'Perbarui Kontak'
                              : 'Simpan Kontak'}
                      </span>
                    </button>

                    {originalPhone && (
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
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama, nomor 628..., kategori, atau gender..."
                        aria-label="Cari kontak"
                        className="min-h-[40px] w-full rounded-[11px] border border-[#1D4ED8]/16 bg-white/90 py-2 pl-10 pr-3.5 text-[13px] text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/22"
                      />
                    </div>

                    {/* Filter Jenis Kelamin */}
                    <div
                      className="flex flex-wrap items-center gap-1 rounded-xl bg-[#0A2463]/6 p-1"
                      role="tablist"
                      aria-label="Filter jenis kelamin"
                    >
                      {['Semua', ...GENDER_OPTIONS].map((g) => {
                        const isActive = activeGender === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveGender(g)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                              isActive
                                ? 'bg-white text-[#0A2463] shadow-sm'
                                : 'text-[#475569] hover:text-[#0A2463]'
                            }`}
                          >
                            {g}{' '}
                            <span className="tabular-mono ml-0.5 text-[11px] opacity-70">
                              {genderCounts[g] ?? 0}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Compact Filter Kategori (Termasuk Tanpa Kategori) */}
                  <div
                    className="flex flex-wrap items-center gap-1 rounded-xl bg-[#0A2463]/5 p-1"
                    role="tablist"
                    aria-label="Filter kategori kontak"
                  >
                    {['Semua', TANPA_KATEGORI_LABEL, ...categories.map((c) => c.nama)].map(
                      (catName) => {
                        const isActive = activeCategory === catName;
                        const code =
                          catName === 'Semua' || catName === TANPA_KATEGORI_LABEL
                            ? ''
                            : getCategoryCode(catName);
                        return (
                          <button
                            key={catName}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveCategory(catName)}
                            className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-all whitespace-nowrap shrink-0 ${
                              isActive
                                ? 'bg-white text-[#0A2463] shadow-sm'
                                : 'text-[#475569] hover:text-[#0A2463]'
                            }`}
                          >
                            {catName}
                            {code ? ` (${code})` : ''}{' '}
                            <span className="tabular-mono ml-0.5 text-[11px] opacity-70">
                              {categoryCounts[catName] ?? 0}
                            </span>
                          </button>
                        );
                      }
                    )}
                  </div>
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
                ) : filteredContacts.length === 0 ? (
                  <div className="py-12 text-center">
                    <h3 className="text-base font-bold text-[#0A2463]">
                      Belum ada kontak yang ditampilkan
                    </h3>
                    <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[#475569]">
                      {searchQuery.trim() || activeCategory !== 'Semua' || activeGender !== 'Semua'
                        ? 'Tidak ada kontak yang cocok dengan kata kunci, kategori, atau jenis kelamin yang dipilih.'
                        : 'Tambahkan kontak pertama melalui formulir di samping.'}
                    </p>
                    {(searchQuery.trim() || activeCategory !== 'Semua' || activeGender !== 'Semua') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setActiveCategory('Semua');
                          setActiveGender('Semua');
                        }}
                        className="mt-4 min-h-[40px] rounded-xl border border-[#1D4ED8]/18 bg-white px-4 py-2 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Desktop High-Density Table with Non-Wrapping Headers & Zebra Striping */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[#1D4ED8]/14 text-xs font-semibold text-[#64748B]">
                            <th className="w-11 px-3 py-2.5 whitespace-nowrap">No</th>
                            <th className="px-3 py-2.5 whitespace-nowrap">Nama</th>
                            <th className="px-3 py-2.5 whitespace-nowrap">No HP (WA)</th>
                            <th className="px-3 py-2.5 whitespace-nowrap">Kategori</th>
                            <th className="px-3 py-2.5 whitespace-nowrap">Jenis Kelamin</th>
                            <th className="px-3 py-2.5 text-right whitespace-nowrap">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1D4ED8]/8 text-[13.5px]">
                          {filteredContacts.map((c, idx) => {
                            const waPhone = normalizePhoneForWA(c.noHp);
                            const catClean = String(c.kategori || '').trim();
                            const catCode = catClean ? getCategoryCode(catClean) : '';
                            return (
                              <tr
                                key={`${waPhone}-${c.nama}-${idx}`}
                                className="row-enter odd:bg-white/45 even:bg-[#EFF6FF]/80 transition-colors hover:bg-[#38BDF8]/14"
                              >
                                <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                                  {idx + 1}
                                </td>
                                <td className="px-3 py-3 font-semibold text-[#061A40]">
                                  {c.nama}
                                </td>
                                <td className="tabular-mono px-3 py-3 text-[13px] font-semibold text-[#1D4ED8] whitespace-nowrap">
                                  {waPhone}
                                </td>
                                <td className="px-3 py-3 whitespace-nowrap">
                                  <span
                                    className={`text-[13px] font-semibold ${getCategoryTextStyle(
                                      catClean
                                    )}`}
                                  >
                                    {catClean || TANPA_KATEGORI_LABEL}
                                    {catCode ? ` (${catCode})` : ''}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-[13px] font-medium text-[#475569] whitespace-nowrap">
                                  {c.jenisKelamin}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  <div className="inline-flex items-center justify-end gap-1.5">
                                    <a
                                      href={buildWhatsAppUrl(waPhone)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-emerald-700/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 transition-transform hover:-translate-y-0.5 hover:bg-emerald-700/18 whitespace-nowrap shrink-0"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                      WhatsApp
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEdit(c)}
                                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#1D4ED8]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1D4ED8] transition-transform hover:-translate-y-0.5 hover:bg-[#1D4ED8]/18 whitespace-nowrap shrink-0"
                                    >
                                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setPendingDelete(c)}
                                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-700/10 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-transform hover:-translate-y-0.5 hover:bg-red-700/18 whitespace-nowrap shrink-0"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                      Hapus
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Responsive Cards with Zebra Shading */}
                    <div className="flex flex-col gap-3 md:hidden">
                      {filteredContacts.map((c, idx) => {
                        const waPhone = normalizePhoneForWA(c.noHp);
                        const catClean = String(c.kategori || '').trim();
                        const catCode = catClean ? getCategoryCode(catClean) : '';
                        return (
                          <article
                            key={`${waPhone}-${c.nama}-${idx}`}
                            className="row-enter rounded-[14px] border border-[#1D4ED8]/14 odd:bg-white/85 even:bg-[#EFF6FF]/85 p-4"
                          >
                            <div className="mb-3">
                              <div className="flex items-baseline gap-2">
                                <span className="tabular-mono text-xs font-bold text-[#64748B]">
                                  #{idx + 1}
                                </span>
                                <h3 className="text-[14.5px] font-bold text-[#061A40]">
                                  {c.nama}
                                </h3>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
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
                                <span aria-hidden="true">·</span>
                                <span>{c.jenisKelamin}</span>
                              </div>
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
                  </>
                )}
              </section>
            </div>
          )}
        </main>
      </div>

      <CategoryManagerModal
        isOpen={showCategoryModal}
        categories={categories}
        isMutating={isMutatingCategory}
        onClose={() => setShowCategoryModal(false)}
        onSaveCategories={handleSaveCategories}
      />

      <DuplicatePhoneModal
        existingContact={pendingDuplicate}
        draftName={nama}
        draftPhone={noHp}
        onEditExisting={() => {
          if (pendingDuplicate) {
            handleStartEdit(pendingDuplicate);
            notify(`Kontak lama "${pendingDuplicate.nama}" dimuat ke mode edit.`, 'info');
          }
          setPendingDuplicate(null);
        }}
        onCreateNewAnyway={() => {
          setPendingDuplicate(null);
          executeSaveContact(true);
        }}
        onCancel={() => {
          setPendingDuplicate(null);
          phoneInputRef.current?.focus();
        }}
      />

      <ConfirmDeleteModal
        contact={pendingDelete}
        isDeleting={isDeleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />

      {/* Toast Notifications */}
      <div
        className="fixed bottom-5 right-5 z-50 flex max-w-sm flex-col gap-2.5"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`glass-surface flex items-start gap-2.5 rounded-2xl bg-white/95 px-4 py-3 text-[13px] leading-snug shadow-lg ${
              t.variant === 'error'
                ? 'border-red-700/25 text-red-900'
                : t.variant === 'success'
                  ? 'border-emerald-700/25 text-[#091B3A]'
                  : 'border-[#1D4ED8]/20 text-[#091B3A]'
            }`}
          >
            {t.variant === 'success' && (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            )}
            {t.variant === 'error' && (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
            )}
            {t.variant === 'info' && (
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
