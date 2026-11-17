import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
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
  HistoryLog,
  ToastMessage,
  buildWhatsAppUrl,
  normalizePhoneForWA,
  sanitizeLivePhoneInput,
} from './types/contact';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CodeDeployView } from './components/CodeDeployView';
import { ContactLogo } from './components/ContactLogo';
import { LandingPage } from './components/LandingPage';
import { HistoryView } from './components/HistoryView';
import { SyncSheetView } from './components/SyncSheetView';

const STORAGE_GAS_URL = 'wadah_digital_gas_url';
const STORAGE_LOCAL_CONTACTS = 'wadah_digital_local_contacts';
const STORAGE_LOCAL_SYNC = 'wadah_digital_local_sync_contacts';
const STORAGE_LOCAL_CATEGORIES = 'wadah_digital_local_categories_v2';
const STORAGE_LOCAL_HISTORY = 'wadah_digital_local_history';

const DEFAULT_DEMO_CONTACTS: Contact[] = [
  { nama: 'Ust. Muhammad Yusuf', noHp: '6281241001122', kategori: 'Internal', jenisKelamin: 'Laki-laki' },
  { nama: 'Dr. Hendra Wijaya', noHp: '6281144556677', kategori: 'VIP', jenisKelamin: 'Laki-laki' },
  { nama: 'Hj. Aminah Nur', noHp: '6285299887766', kategori: 'Keluarga', jenisKelamin: 'Perempuan' },
  { nama: 'Admin Pusat Layanan', noHp: '6281355443322', kategori: 'Partner', jenisKelamin: 'Admin' },
];

type RoutePath = 'landing' | 'kontak';
type KontakTab = 'directory' | 'sync' | 'history' | 'code';

function detectRouteFromPath(): RoutePath {
  const path = window.location.pathname.toLowerCase();
  if (path === '/kontak' || path.startsWith('/kontak/')) {
    return 'kontak';
  }
  return 'landing';
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

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [syncContacts, setSyncContacts] = useState<Contact[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>(DEFAULT_CATEGORIES);
  const [historyLogs, setHistoryLogs] = useState<HistoryLog[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMutatingCategory, setIsMutatingCategory] = useState(false);
  const [isSyncingBatch, setIsSyncingBatch] = useState(false);

  // Form states
  const [originalPhone, setOriginalPhone] = useState('');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [kategori, setKategori] = useState<string>(DEFAULT_CATEGORIES[0].nama);
  const [jenisKelamin, setJenisKelamin] = useState<GenderOption>('Laki-laki');

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Semua');
  const [activeGender, setActiveGender] = useState<string>('Semua');

  // Delete modal & Toast
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const namaInputRef = useRef<HTMLInputElement>(null);

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

  const loadLocalCategories = useCallback((): CategoryItem[] => {
    try {
      const raw = localStorage.getItem(STORAGE_LOCAL_CATEGORIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      localStorage.setItem(STORAGE_LOCAL_CATEGORIES, JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    } catch {
      return DEFAULT_CATEGORIES;
    }
  }, []);

  const persistLocalCategories = useCallback((cats: CategoryItem[]) => {
    localStorage.setItem(STORAGE_LOCAL_CATEGORIES, JSON.stringify(cats));
  }, []);

  const loadLocalContacts = useCallback((storageKey: string): Contact[] => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      localStorage.setItem(storageKey, JSON.stringify(DEFAULT_DEMO_CONTACTS));
      return DEFAULT_DEMO_CONTACTS;
    } catch {
      return DEFAULT_DEMO_CONTACTS;
    }
  }, []);

  const loadLocalHistory = useCallback((): HistoryLog[] => {
    try {
      const raw = localStorage.getItem(STORAGE_LOCAL_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch {
      return [];
    }
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
    async (targetUrl?: string) => {
      const endpoint = targetUrl !== undefined ? targetUrl : gasUrl;
      setIsLoading(true);
      try {
        if (!endpoint) {
          const localCats = loadLocalCategories();
          setCategories(localCats);
          setKategori((prev) =>
            localCats.some((c) => c.nama === prev) ? prev : localCats[0].nama
          );
          setContacts(loadLocalContacts(STORAGE_LOCAL_CONTACTS));
          setSyncContacts(loadLocalContacts(STORAGE_LOCAL_SYNC));
          setHistoryLogs(loadLocalHistory());
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
              kategori: String(c.kategori || 'Klien'),
              jenisKelamin: (c.jenisKelamin as GenderOption) || 'Laki-laki',
            }))
          : [];

        const remoteSync: Contact[] = Array.isArray(result.syncContacts)
          ? result.syncContacts.map((c: Partial<Contact>) => ({
              nama: String(c.nama || ''),
              noHp: String(c.noHp || ''),
              kategori: String(c.kategori || 'Klien'),
              jenisKelamin: (c.jenisKelamin as GenderOption) || 'Laki-laki',
            }))
          : remoteContacts;

        const remoteCats: CategoryItem[] =
          Array.isArray(result.categories) && result.categories.length > 0
            ? result.categories.map((item: string | CategoryItem) =>
                typeof item === 'string'
                  ? { nama: item, kode: item.slice(0, 3).toUpperCase() }
                  : item
              )
            : loadLocalCategories();

        const remoteHistory: HistoryLog[] = Array.isArray(result.history)
          ? result.history
          : [];

        setContacts(remoteContacts);
        setSyncContacts(remoteSync);
        setCategories(remoteCats);
        setHistoryLogs(remoteHistory);
        setKategori((prev) =>
          remoteCats.some((c) => c.nama === prev) ? prev : remoteCats[0].nama
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat data.';
        notify(`Gagal mengambil data dari GAS: ${msg}`, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [gasUrl, loadLocalCategories, loadLocalContacts, loadLocalHistory, notify]
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  function resetForm() {
    setOriginalPhone('');
    setNama('');
    setNoHp('');
    setKategori(categories[0]?.nama || DEFAULT_CATEGORIES[0].nama);
    setJenisKelamin('Laki-laki');
  }

  function handleStartEdit(contact: Contact) {
    const cleanPhone = normalizePhoneForWA(contact.noHp);
    setOriginalPhone(cleanPhone);
    setNama(contact.nama);
    setNoHp(cleanPhone);
    setKategori(
      categories.some((c) => c.nama === contact.kategori)
        ? contact.kategori
        : categories[0]?.nama || 'Klien'
    );
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

  async function handleSubmitContact(e: FormEvent) {
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
      return;
    }

    setIsSubmitting(true);
    try {
      const cleanOrig = normalizePhoneForWA(originalPhone);

      if (!gasUrl) {
        const upsertLocal = (prev: Contact[]): Contact[] => {
          const next = [...prev];
          const existingIdx = next.findIndex(
            (c) => normalizePhoneForWA(c.noHp) === (cleanOrig || cleanPhone)
          );
          const duplicateIdx = next.findIndex(
            (c) => normalizePhoneForWA(c.noHp) === cleanPhone
          );
          const rec: Contact = {
            nama: cleanNama,
            noHp: cleanPhone,
            kategori,
            jenisKelamin,
          };
          if (existingIdx !== -1 && duplicateIdx !== -1 && existingIdx !== duplicateIdx) {
            next[duplicateIdx] = rec;
            next.splice(existingIdx, 1);
          } else if (existingIdx !== -1) {
            next[existingIdx] = rec;
          } else if (duplicateIdx !== -1) {
            next[duplicateIdx] = rec;
          } else {
            next.unshift(rec);
          }
          return next;
        };

        const nextMain = upsertLocal(contacts);
        const nextSync = upsertLocal(syncContacts);
        setContacts(nextMain);
        setSyncContacts(nextSync);
        localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(nextMain));
        localStorage.setItem(STORAGE_LOCAL_SYNC, JSON.stringify(nextSync));

        const catObj = categories.find((c) => c.nama === kategori);
        pushLocalHistory(
          originalPhone ? 'Edit Kontak' : 'Tambah Kontak',
          cleanNama,
          cleanPhone,
          `Kategori: ${kategori}${catObj ? ` (${catObj.kode})` : ''} · Gender: ${jenisKelamin}`
        );

        notify(
          originalPhone
            ? 'Kontak diperbarui di Mode Pratinjau Lokal.'
            : 'Kontak baru disimpan di Mode Pratinjau Lokal.',
          'success'
        );
        resetForm();
        return;
      }

      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'save',
          nama: cleanNama,
          noHp: cleanPhone,
          originalNoHp: cleanOrig,
          kategori,
          jenisKelamin,
        }),
      });

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menyimpan kontak.');
      }

      notify(result.message || 'Kontak berhasil disimpan dan disinkronkan.', 'success');
      resetForm();
      await fetchContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.';
      notify(`Gagal menyimpan kontak: ${msg}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const cleanTarget = normalizePhoneForWA(pendingDelete.noHp);
    setIsDeleting(true);

    try {
      if (!gasUrl) {
        const nextMain = contacts.filter((c) => normalizePhoneForWA(c.noHp) !== cleanTarget);
        const nextSync = syncContacts.filter((c) => normalizePhoneForWA(c.noHp) !== cleanTarget);
        setContacts(nextMain);
        setSyncContacts(nextSync);
        localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(nextMain));
        localStorage.setItem(STORAGE_LOCAL_SYNC, JSON.stringify(nextSync));
        pushLocalHistory(
          'Hapus Kontak',
          pendingDelete.nama,
          cleanTarget,
          'Dihapus dari Kontak, Kontak_Sync, dan Google Kontak'
        );
        notify('Kontak dihapus dari Mode Pratinjau Lokal.', 'success');
        setPendingDelete(null);
        return;
      }

      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'delete',
          noHp: cleanTarget,
          nama: pendingDelete.nama,
        }),
      });

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menghapus kontak.');
      }

      notify(result.message || 'Kontak berhasil dihapus.', 'success');
      setPendingDelete(null);
      await fetchContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan.';
      notify(`Gagal menghapus kontak: ${msg}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleSaveCategories(
    nextList: CategoryItem[],
    historyAction: string,
    historyDetail: string,
    renameMap?: Record<string, string>
  ): Promise<boolean> {
    if (nextList.length === 0) return false;

    if (!gasUrl) {
      setCategories(nextList);
      persistLocalCategories(nextList);

      if (renameMap) {
        const remap = (list: Contact[]) =>
          list.map((c) =>
            renameMap[c.kategori] ? { ...c, kategori: renameMap[c.kategori] } : c
          );
        const updatedMain = remap(contacts);
        const updatedSync = remap(syncContacts);
        setContacts(updatedMain);
        setSyncContacts(updatedSync);
        localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(updatedMain));
        localStorage.setItem(STORAGE_LOCAL_SYNC, JSON.stringify(updatedSync));
      }

      if (!nextList.some((c) => c.nama === kategori)) {
        setKategori(nextList[0].nama);
      }
      if (activeCategory !== 'Semua' && !nextList.some((c) => c.nama === activeCategory)) {
        setActiveCategory('Semua');
      }
      pushLocalHistory(historyAction, '-', '-', historyDetail);
      notify('Daftar kategori berhasil diperbarui.', 'success');
      return true;
    }

    setIsMutatingCategory(true);
    try {
      const response = await fetch(gasUrl, {
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
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal memperbarui kategori.');
      }
      notify(result.message || 'Daftar kategori berhasil diperbarui.', 'success');
      await fetchContacts();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal memperbarui kategori.';
      notify(msg, 'error');
      return false;
    } finally {
      setIsMutatingCategory(false);
    }
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
      notify(result.message || 'Sinkronisasi Kontak_Sync ke Google Kontak selesai.', 'success');
      await fetchContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan.';
      notify(msg, 'error');
    } finally {
      setIsSyncingBatch(false);
    }
  }

  async function handleSaveManualRow(row: Contact, originalNoHp: string): Promise<boolean> {
    if (!gasUrl) {
      const nextSync = syncContacts.map((c) =>
        normalizePhoneForWA(c.noHp) === normalizePhoneForWA(originalNoHp) ? row : c
      );
      setSyncContacts(nextSync);
      localStorage.setItem(STORAGE_LOCAL_SYNC, JSON.stringify(nextSync));
      pushLocalHistory(
        'Edit Kontak_Sync',
        row.nama,
        row.noHp,
        'Diperbarui khusus di sheet Kontak_Sync'
      );
      notify('Baris Kontak_Sync diperbarui (Mode Lokal).', 'success');
      return true;
    }

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'saveManualRow',
          nama: row.nama,
          noHp: row.noHp,
          originalNoHp,
          kategori: row.kategori,
          jenisKelamin: row.jenisKelamin,
        }),
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal memperbarui Kontak_Sync.');
      }
      notify(result.message || 'Kontak_Sync diperbarui & disinkronkan ke Google Kontak.', 'success');
      await fetchContacts();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan.';
      notify(msg, 'error');
      return false;
    }
  }

  async function handleDeleteManualRow(row: Contact) {
    const cleanTarget = normalizePhoneForWA(row.noHp);
    if (!gasUrl) {
      const nextSync = syncContacts.filter((c) => normalizePhoneForWA(c.noHp) !== cleanTarget);
      setSyncContacts(nextSync);
      localStorage.setItem(STORAGE_LOCAL_SYNC, JSON.stringify(nextSync));
      pushLocalHistory(
        'Hapus Kontak_Sync',
        row.nama,
        cleanTarget,
        'Dihapus dari Kontak_Sync (simulasi hapus Google Kontak)'
      );
      notify('Baris dihapus dari Kontak_Sync.', 'success');
      return;
    }

    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteManualRow',
          noHp: cleanTarget,
          nama: row.nama,
        }),
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menghapus baris Kontak_Sync.');
      }
      notify(result.message || 'Dihapus dari Kontak_Sync dan Google Kontak.', 'success');
      await fetchContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus.';
      notify(msg, 'error');
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
      notify(`Koneksi berhasil! Sheet aktif: ${result.sheetName || 'Kontak'}`, 'success');
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
      await fetchContacts(targetUrl);
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
    const counts: Record<string, number> = { Semua: contacts.length };
    for (const cat of categories) {
      counts[cat.nama] = 0;
    }
    for (const c of contacts) {
      counts[c.kategori] = (counts[c.kategori] || 0) + 1;
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
      const matchCategory = activeCategory === 'Semua' || c.kategori === activeCategory;
      if (!matchCategory) return false;
      const matchGender = activeGender === 'Semua' || c.jenisKelamin === activeGender;
      if (!matchGender) return false;
      if (!q) return true;

      const nameMatch = c.nama.toLowerCase().includes(q);
      const catMatch = c.kategori.toLowerCase().includes(q);
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
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-8 px-6 py-3.5">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo('landing');
              }}
              className="flex items-center gap-2.5 bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-lg font-bold tracking-tight text-transparent whitespace-nowrap shrink-0"
            >
              <ContactLogo className="h-7 w-7 shrink-0" />
              <span>Wadah Digital</span>
            </a>

            <nav className="hidden md:flex items-center gap-6" aria-label="Navigasi utama">
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
                  setActiveTab('directory');
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
              onClick={() => fetchContacts()}
              disabled={isLoading}
              className="btn-ocean-sheen inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{isLoading ? 'Memuat...' : 'Sinkronkan'}</span>
            </button>
          </div>

          <div className="header-energy-line" aria-hidden="true" />

          {/* Mobile Quick Nav */}
          <div className="flex md:hidden items-center justify-center gap-4 overflow-x-auto border-t border-[#1D4ED8]/10 px-3 py-2 text-xs font-semibold text-[#475569]">
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

        <main id="top" className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6">
          <section className="mb-6 flex flex-wrap items-end justify-between gap-5">
            <div className="flex items-start gap-4">
              <ContactLogo className="hidden h-12 w-12 shrink-0 sm:block" />
              <div>
                <p className="mb-1 text-xs font-semibold text-[#1D4ED8]">
                  mr.wadahdigital.my.id/kontak
                </p>
                <h1 className="text-balance bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                  Direktori Kontak Terintegrasi
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#475569]">
                  Kelola relasi, pengelompokan kategori berkode, dan riwayat perubahan data dalam satu direktori terpusat.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-[13px] text-[#475569]" aria-live="polite">
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
                URL Web App Anda sudah terpasang secara default. Anda juga dapat mengganti atau menjalankan setup 4 sheet database langsung dari sini.
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
          ) : activeTab === 'history' ? (
            <HistoryView logs={historyLogs} isLoading={isLoading} />
          ) : activeTab === 'sync' ? (
            <SyncSheetView
              syncContacts={syncContacts}
              categories={categories}
              isLoading={isLoading}
              isSyncingBatch={isSyncingBatch}
              onSyncAllToGoogleContacts={handleSyncManualSheet}
              onSaveManualRow={handleSaveManualRow}
              onDeleteManualRow={handleDeleteManualRow}
            />
          ) : (
            /* Main 2-Column Workspace */
            <div className="grid items-start gap-6 lg:grid-cols-[365px_1fr]">
              {/* Left: Form Tambah / Edit Kontak */}
              <aside className="glass-surface rounded-[22px] p-6 lg:sticky lg:top-[86px]">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#0A2463] to-[#1D4ED8] text-white">
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <h2 className="text-base font-bold text-[#0A2463]">
                    {originalPhone ? 'Edit Kontak' : 'Tambah Kontak Baru'}
                  </h2>
                </div>
                <p className="mt-2 text-[12.5px] leading-relaxed text-[#475569]">
                  {originalPhone
                    ? 'Perubahan akan disinkronkan ke sheet Kontak, Kontak_Sync, History, dan Google Kontak.'
                    : 'Input nomor HP menolak spasi, huruf, dan tanda baca. Awalan 08 otomatis menjadi 628.'}
                </p>

                <form onSubmit={handleSubmitContact} className="mt-5 space-y-4" noValidate>
                  <div>
                    <label
                      htmlFor="contact-nama"
                      className="mb-1.5 block text-xs font-semibold text-[#0A2463]"
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
                      className="min-h-[44px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2.5 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                      required
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-hp"
                      className="mb-1.5 block text-xs font-semibold text-[#0A2463]"
                    >
                      Nomor HP / WhatsApp
                    </label>
                    <input
                      id="contact-hp"
                      type="tel"
                      inputMode="numeric"
                      value={noHp}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      placeholder="Contoh: 081234567890 atau 60123456789"
                      className="tabular-mono min-h-[44px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2.5 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                      required
                    />
                    {duplicateMatch ? (
                      <p className="mt-1.5 text-xs font-semibold text-[#B45309]">
                        Nomor sudah terdaftar atas nama &ldquo;{duplicateMatch.nama}&rdquo;. Menyimpan akan memperbarui data tersebut.
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs leading-relaxed text-[#475569]">
                        {normalizePhoneForWA(noHp).length >= 8
                          ? `Format WA aktif: wa.me/${normalizePhoneForWA(noHp)}`
                          : 'Hanya angka. Awalan 08 otomatis menjadi 628 (kecuali nomor luar Indonesia).'}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-[#0A2463]">
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
                            className={`min-h-[38px] rounded-lg px-2 py-1.5 text-xs font-semibold transition-all whitespace-nowrap ${
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
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <label
                        htmlFor="contact-kategori"
                        className="block text-xs font-semibold text-[#0A2463]"
                      >
                        Kategori
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
                      className="min-h-[44px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2.5 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                    >
                      {categories.map((cat) => (
                        <option key={cat.nama} value={cat.nama}>
                          {cat.nama} ({cat.kode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2">
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="btn-ocean-sheen inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 whitespace-nowrap"
                    >
                      {isSubmitting && (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      )}
                      <span>
                        {isSubmitting
                          ? 'Menyimpan...'
                          : originalPhone
                            ? 'Perbarui Kontak'
                            : 'Simpan Kontak'}
                      </span>
                    </button>

                    {originalPhone && (
                      <button
                        type="button"
                        onClick={resetForm}
                        disabled={isSubmitting}
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
                className="glass-surface min-h-[460px] rounded-[22px] p-5 sm:p-6"
                aria-label="Daftar Kontak"
              >
                <div className="mb-4 space-y-3 border-b border-[#1D4ED8]/10 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative min-w-[220px] flex-1">
                      <Search
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama, nomor 628..., kategori, atau jenis kelamin..."
                        aria-label="Cari kontak"
                        className="min-h-[42px] w-full rounded-[11px] border border-[#1D4ED8]/16 bg-white/90 py-2 pl-10 pr-3.5 text-[13.5px] text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/22"
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

                  {/* Filter Kategori */}
                  <div
                    className="flex flex-wrap items-center gap-1 rounded-xl bg-[#0A2463]/6 p-1"
                    role="tablist"
                    aria-label="Filter kategori kontak"
                  >
                    {['Semua', ...categories.map((c) => c.nama)].map((catName) => {
                      const isActive = activeCategory === catName;
                      const code = catName === 'Semua' ? '' : getCategoryCode(catName);
                      return (
                        <button
                          key={catName}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          onClick={() => setActiveCategory(catName)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                            isActive
                              ? 'bg-gradient-to-r from-white to-[#EFF6FF] text-[#0A2463] shadow-sm'
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
                    })}
                  </div>
                </div>

                {isLoading ? (
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
                    {/* Desktop High-Density Table with Row Numbers & Zebra Striping */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="border-b border-[#1D4ED8]/14 text-xs font-semibold text-[#64748B]">
                            <th className="w-12 px-3 py-2.5">No</th>
                            <th className="px-3 py-2.5">Nama</th>
                            <th className="px-3 py-2.5">No HP (WA)</th>
                            <th className="px-3 py-2.5">Kategori</th>
                            <th className="px-3 py-2.5">Jenis Kelamin</th>
                            <th className="px-3 py-2.5 text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1D4ED8]/8 text-[13.5px]">
                          {filteredContacts.map((c, idx) => {
                            const waPhone = normalizePhoneForWA(c.noHp);
                            const catCode = getCategoryCode(c.kategori);
                            return (
                              <tr
                                key={waPhone || `${c.nama}-${idx}`}
                                className="row-enter odd:bg-white/45 even:bg-[#EFF6FF]/80 transition-colors hover:bg-[#38BDF8]/14"
                              >
                                <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                                  {idx + 1}
                                </td>
                                <td className="px-3 py-3 font-semibold text-[#061A40]">
                                  {c.nama}
                                </td>
                                <td className="tabular-mono px-3 py-3 text-[13px] font-semibold text-[#1D4ED8]">
                                  {waPhone}
                                </td>
                                <td className="px-3 py-3">
                                  <span
                                    className={`text-[13px] font-semibold ${getCategoryTextStyle(
                                      c.kategori
                                    )}`}
                                  >
                                    {c.kategori}
                                    {catCode ? ` (${catCode})` : ''}
                                  </span>
                                </td>
                                <td className="px-3 py-3 text-[13px] font-medium text-[#475569]">
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
                        const catCode = getCategoryCode(c.kategori);
                        return (
                          <article
                            key={waPhone || `${c.nama}-${idx}`}
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
                                  className={`font-semibold ${getCategoryTextStyle(c.kategori)}`}
                                >
                                  {c.kategori}
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
