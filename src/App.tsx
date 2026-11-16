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
  Contact,
  DEFAULT_CATEGORIES,
  ToastMessage,
  buildWhatsAppUrl,
  normalizePhoneForWA,
  sanitizeLivePhoneInput,
} from './types/contact';
import { ConfirmDeleteModal } from './components/ConfirmDeleteModal';
import { CategoryManagerModal } from './components/CategoryManagerModal';
import { CodeDeployView } from './components/CodeDeployView';

const STORAGE_GAS_URL = 'wadah_digital_gas_url';
const STORAGE_LOCAL_CONTACTS = 'wadah_digital_local_contacts';
const STORAGE_LOCAL_CATEGORIES = 'wadah_digital_local_categories';

const DEFAULT_DEMO_CONTACTS: Contact[] = [
  { nama: 'Ust. Muhammad Yusuf', noHp: '6281241001122', kategori: 'Internal' },
  { nama: 'Dr. Hendra Wijaya', noHp: '6281144556677', kategori: 'VIP' },
  { nama: 'CV Berkah Mandiri', noHp: '6285299887766', kategori: 'Partner' },
  { nama: 'Siti Rahmawati', noHp: '6281355443322', kategori: 'Klien' },
];

type ActiveView = 'directory' | 'code';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('directory');
  const [showConfig, setShowConfig] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const [gasUrl, setGasUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_GAS_URL) || '';
  });
  const [gasUrlDraft, setGasUrlDraft] = useState<string>(() => {
    return localStorage.getItem(STORAGE_GAS_URL) || '';
  });
  const [isTestingGas, setIsTestingGas] = useState(false);
  const [isSettingUpDb, setIsSettingUpDb] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMutatingCategory, setIsMutatingCategory] = useState(false);

  // Form states
  const [originalPhone, setOriginalPhone] = useState('');
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [kategori, setKategori] = useState<string>(DEFAULT_CATEGORIES[0]);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('Semua');

  // Delete modal & Toast
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const namaInputRef = useRef<HTMLInputElement>(null);

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

  const loadLocalCategories = useCallback((): string[] => {
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

  const persistLocalCategories = useCallback((cats: string[]) => {
    localStorage.setItem(STORAGE_LOCAL_CATEGORIES, JSON.stringify(cats));
  }, []);

  const loadLocalContacts = useCallback((): Contact[] => {
    try {
      const raw = localStorage.getItem(STORAGE_LOCAL_CONTACTS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(DEFAULT_DEMO_CONTACTS));
      return DEFAULT_DEMO_CONTACTS;
    } catch {
      return DEFAULT_DEMO_CONTACTS;
    }
  }, []);

  const persistLocalContacts = useCallback((list: Contact[]) => {
    localStorage.setItem(STORAGE_LOCAL_CONTACTS, JSON.stringify(list));
  }, []);

  const fetchContacts = useCallback(
    async (targetUrl?: string) => {
      const endpoint = targetUrl !== undefined ? targetUrl : gasUrl;
      setIsLoading(true);
      try {
        if (!endpoint) {
          const localCats = loadLocalCategories();
          setCategories(localCats);
          setKategori((prev) => (localCats.includes(prev) ? prev : localCats[0]));
          setContacts(loadLocalContacts());
          return;
        }
        const response = await fetch(endpoint, { method: 'GET', redirect: 'follow' });
        const result = await response.json();
        if (result.status !== 'success') {
          throw new Error(result.message || 'Respons server tidak valid.');
        }
        const remoteContacts: Contact[] = Array.isArray(result.data) ? result.data : [];
        const remoteCats: string[] =
          Array.isArray(result.categories) && result.categories.length > 0
            ? result.categories
            : loadLocalCategories();

        setContacts(remoteContacts);
        setCategories(remoteCats);
        setKategori((prev) => (remoteCats.includes(prev) ? prev : remoteCats[0]));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal memuat data.';
        notify(`Gagal mengambil data dari GAS: ${msg}`, 'error');
      } finally {
        setIsLoading(false);
      }
    },
    [gasUrl, loadLocalCategories, loadLocalContacts, notify]
  );

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  function resetForm() {
    setOriginalPhone('');
    setNama('');
    setNoHp('');
    setKategori(categories[0] || DEFAULT_CATEGORIES[0]);
  }

  function handleStartEdit(contact: Contact) {
    const cleanPhone = normalizePhoneForWA(contact.noHp);
    setOriginalPhone(cleanPhone);
    setNama(contact.nama);
    setNoHp(cleanPhone);
    setKategori(categories.includes(contact.kategori) ? contact.kategori : categories[0] || 'Klien');
    setActiveView('directory');
    namaInputRef.current?.focus();
  }

  function handlePhoneChange(rawValue: string) {
    const sanitized = sanitizeLivePhoneInput(rawValue);
    setNoHp(sanitized);
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
        const nextList = [...contacts];
        const existingIdx = nextList.findIndex(
          (c) => normalizePhoneForWA(c.noHp) === (cleanOrig || cleanPhone)
        );
        const duplicateIdx = nextList.findIndex(
          (c) => normalizePhoneForWA(c.noHp) === cleanPhone
        );
        const updatedRecord: Contact = {
          nama: cleanNama,
          noHp: cleanPhone,
          kategori,
        };

        if (existingIdx !== -1 && duplicateIdx !== -1 && existingIdx !== duplicateIdx) {
          nextList[duplicateIdx] = updatedRecord;
          nextList.splice(existingIdx, 1);
        } else if (existingIdx !== -1) {
          nextList[existingIdx] = updatedRecord;
        } else if (duplicateIdx !== -1) {
          nextList[duplicateIdx] = updatedRecord;
        } else {
          nextList.unshift(updatedRecord);
        }

        setContacts(nextList);
        persistLocalContacts(nextList);
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
        const nextList = contacts.filter((c) => normalizePhoneForWA(c.noHp) !== cleanTarget);
        setContacts(nextList);
        persistLocalContacts(nextList);
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

  async function handleAddCategory(newCatName: string): Promise<boolean> {
    const cleanName = newCatName.trim();
    if (!cleanName) return false;

    const duplicate = categories.some(
      (c) => c.toLowerCase() === cleanName.toLowerCase()
    );
    if (duplicate) {
      notify(`Kategori "${cleanName}" sudah ada di daftar.`, 'error');
      return false;
    }

    if (!gasUrl) {
      const updated = [...categories, cleanName];
      setCategories(updated);
      persistLocalCategories(updated);
      setKategori(cleanName);
      notify(`Kategori "${cleanName}" berhasil ditambahkan.`, 'success');
      return true;
    }

    setIsMutatingCategory(true);
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'addCategory',
          kategori: cleanName,
        }),
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menambahkan kategori.');
      }
      const updated: string[] = Array.isArray(result.categories)
        ? result.categories
        : [...categories, cleanName];
      setCategories(updated);
      setKategori(cleanName);
      notify(result.message || `Kategori "${cleanName}" berhasil ditambahkan.`, 'success');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menambah kategori.';
      notify(msg, 'error');
      return false;
    } finally {
      setIsMutatingCategory(false);
    }
  }

  async function handleDeleteCategory(targetCat: string): Promise<void> {
    if (categories.length <= 1) {
      notify('Minimal harus tersedia satu kategori.', 'error');
      return;
    }

    if (!gasUrl) {
      const updated = categories.filter((c) => c !== targetCat);
      setCategories(updated);
      persistLocalCategories(updated);
      if (kategori === targetCat) setKategori(updated[0]);
      if (activeCategory === targetCat) setActiveCategory('Semua');
      notify(`Kategori "${targetCat}" dihapus.`, 'success');
      return;
    }

    setIsMutatingCategory(true);
    try {
      const response = await fetch(gasUrl, {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'deleteCategory',
          kategori: targetCat,
        }),
      });
      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Gagal menghapus kategori.');
      }
      const updated: string[] = Array.isArray(result.categories)
        ? result.categories
        : categories.filter((c) => c !== targetCat);
      setCategories(updated);
      if (kategori === targetCat && updated.length > 0) setKategori(updated[0]);
      if (activeCategory === targetCat) setActiveCategory('Semua');
      notify(result.message || `Kategori "${targetCat}" dihapus.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menghapus kategori.';
      notify(msg, 'error');
    } finally {
      setIsMutatingCategory(false);
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
      notify(result.message || 'Sheet Kontak & Kategori berhasil dibuat.', 'success');
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
    if (trimmed) {
      localStorage.setItem(STORAGE_GAS_URL, trimmed);
      notify('URL Google Apps Script disimpan.', 'success');
    } else {
      localStorage.removeItem(STORAGE_GAS_URL);
      notify('URL dikosongkan. Beralih ke Mode Pratinjau Lokal.', 'info');
    }
    setShowConfig(false);
    fetchContacts(trimmed);
  }

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { Semua: contacts.length };
    for (const cat of categories) {
      counts[cat] = 0;
    }
    for (const c of contacts) {
      counts[c.kategori] = (counts[c.kategori] || 0) + 1;
    }
    return counts;
  }, [contacts, categories]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const digitsQ = q.replace(/\D/g, '');

    return contacts.filter((c) => {
      const matchCategory = activeCategory === 'Semua' || c.kategori === activeCategory;
      if (!matchCategory) return false;
      if (!q) return true;

      const nameMatch = c.nama.toLowerCase().includes(q);
      const catMatch = c.kategori.toLowerCase().includes(q);
      const phoneRawMatch = c.noHp.toLowerCase().includes(q);
      const phoneNormMatch = Boolean(digitsQ && normalizePhoneForWA(c.noHp).includes(digitsQ));

      return nameMatch || catMatch || phoneRawMatch || phoneNormMatch;
    });
  }, [contacts, activeCategory, searchQuery]);

  function getCategoryTextStyle(cat: string): string {
    const lower = cat.toLowerCase();
    if (lower === 'vip') return 'text-[#B45309]';
    if (lower === 'partner') return 'text-[#0284C7]';
    if (lower === 'internal') return 'text-[#0A2463]';
    return 'text-[#1D4ED8]';
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
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setActiveView('directory');
              }}
              className="bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-lg font-bold tracking-tight text-transparent whitespace-nowrap shrink-0"
            >
              Wadah Digital
            </a>

            <nav className="hidden md:flex items-center gap-7" aria-label="Navigasi utama">
              <button
                type="button"
                onClick={() => setActiveView('directory')}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'directory' && !showConfig
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                Daftar Kontak
              </button>
              <button
                type="button"
                onClick={() => setShowCategoryModal(true)}
                className="border-b-2 border-transparent py-1.5 text-[13px] font-semibold text-[#475569] transition-colors hover:text-[#0A2463] whitespace-nowrap shrink-0"
              >
                Kategori
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveView('directory');
                  setShowConfig((prev) => !prev);
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  showConfig && activeView === 'directory'
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                Konfigurasi GAS
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfig(false);
                  setActiveView('code');
                }}
                className={`border-b-2 py-1.5 text-[13px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeView === 'code'
                    ? 'border-[#1D4ED8] text-[#0A2463]'
                    : 'border-transparent text-[#475569] hover:text-[#0A2463]'
                }`}
              >
                GitHub &amp; Deploy
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
          <div className="flex md:hidden items-center justify-center gap-5 border-t border-[#1D4ED8]/10 px-4 py-2 text-xs font-semibold text-[#475569]">
            <button
              type="button"
              onClick={() => {
                setActiveView('directory');
                setShowConfig(false);
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeView === 'directory' && !showConfig
                  ? 'text-[#0A2463] underline underline-offset-4'
                  : ''
              }`}
            >
              Kontak
            </button>
            <button
              type="button"
              onClick={() => setShowCategoryModal(true)}
              className="py-1 whitespace-nowrap shrink-0"
            >
              Kategori
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveView('directory');
                setShowConfig((prev) => !prev);
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                showConfig ? 'text-[#0A2463] underline underline-offset-4' : ''
              }`}
            >
              Konfigurasi
            </button>
            <button
              type="button"
              onClick={() => {
                setShowConfig(false);
                setActiveView('code');
              }}
              className={`py-1 whitespace-nowrap shrink-0 ${
                activeView === 'code' ? 'text-[#0A2463] underline underline-offset-4' : ''
              }`}
            >
              GitHub
            </button>
          </div>
        </header>

        <main id="top" className="mx-auto max-w-[1240px] px-4 py-7 sm:px-6">
          <section className="mb-6 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-1.5 text-xs font-semibold text-[#1D4ED8]">
                Contact Sync &amp; Management
              </p>
              <h1 className="text-balance bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
                Direktori Kontak Terintegrasi
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-[#475569]">
                Nomor WhatsApp otomatis berawalan <span className="tabular-mono font-semibold text-[#0A2463]">628</span>, kategori dinamis sesuai kebutuhan, serta sinkronisasi langsung ke Google Sheets &amp; Google Kontak.
              </p>
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
              <span className="font-semibold text-[#0A2463]">
                {gasUrl ? 'Terhubung ke Google Apps Script' : 'Mode Pratinjau Lokal'}
              </span>
            </div>
          </section>

          {activeView === 'code' ? (
            <CodeDeployView onNotify={notify} />
          ) : (
            <>
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
                    Tempelkan URL Web App dari deployment <span className="tabular-mono font-semibold text-[#1D4ED8]">backend-gas/Code.gs</span> di GitHub Anda. URL tersimpan otomatis di LocalStorage.
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

                  <p className="mt-3 text-xs text-[#475569]">
                    Klik <strong>Setup Database</strong> untuk otomatis membuat sheet <em>Kontak</em> &amp; <em>Kategori</em> pada Spreadsheet aktif, atau jalankan fungsi <span className="tabular-mono font-semibold text-[#0A2463]">setupdatabase()</span> langsung di editor Apps Script.
                  </p>
                </section>
              )}

              {/* Main 2-Column Workspace */}
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
                      ? 'Memperbarui data akan ikut memperbarui Spreadsheet dan Google Kontak.'
                      : 'Input nomor HP otomatis menolak spasi, huruf, dan tanda baca. Awalan 08 otomatis menjadi 628.'}
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
                          Ubah Daftar Kategori
                        </button>
                      </div>
                      <select
                        id="contact-kategori"
                        value={kategori}
                        onChange={(e) => setKategori(e.target.value)}
                        className="min-h-[44px] w-full rounded-[10px] border border-[#1D4ED8]/18 bg-white/90 px-3.5 py-2.5 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/25"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
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
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3.5 border-b border-[#1D4ED8]/10 pb-4">
                    <div className="relative min-w-[220px] flex-1">
                      <Search
                        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama, nomor 628..., atau kategori..."
                        aria-label="Cari kontak"
                        className="min-h-[42px] w-full rounded-[11px] border border-[#1D4ED8]/16 bg-white/90 py-2 pl-10 pr-3.5 text-[13.5px] text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:bg-white focus:ring-3 focus:ring-[#38BDF8]/22"
                      />
                    </div>

                    {/* Interactive Segmented Category Filters */}
                    <div
                      className="flex flex-wrap items-center gap-1 rounded-xl bg-[#0A2463]/6 p-1"
                      role="tablist"
                      aria-label="Filter kategori kontak"
                    >
                      {['Semua', ...categories].map((cat) => {
                        const isActive = activeCategory === cat;
                        return (
                          <button
                            key={cat}
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            onClick={() => setActiveCategory(cat)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                              isActive
                                ? 'bg-gradient-to-r from-white to-[#EFF6FF] text-[#0A2463] shadow-sm'
                                : 'text-[#475569] hover:text-[#0A2463]'
                            }`}
                          >
                            {cat}{' '}
                            <span className="tabular-mono ml-0.5 text-[11px] opacity-70">
                              {categoryCounts[cat] ?? 0}
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
                        {searchQuery.trim() || activeCategory !== 'Semua'
                          ? 'Tidak ada kontak yang cocok dengan kata kunci atau kategori yang dipilih.'
                          : 'Tambahkan kontak pertama melalui formulir di samping atau hubungkan URL Google Apps Script Anda.'}
                      </p>
                      {(searchQuery.trim() || activeCategory !== 'Semua') && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearchQuery('');
                            setActiveCategory('Semua');
                          }}
                          className="mt-4 min-h-[40px] rounded-xl border border-[#1D4ED8]/18 bg-white px-4 py-2 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
                        >
                          Reset Pencarian
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      {/* Desktop High-Density Table */}
                      <div className="hidden overflow-x-auto md:block">
                        <table className="w-full border-collapse text-left">
                          <thead>
                            <tr className="border-b border-[#1D4ED8]/12 text-xs font-semibold text-[#64748B]">
                              <th className="px-3 py-2.5">Nama</th>
                              <th className="px-3 py-2.5">No HP (WA)</th>
                              <th className="px-3 py-2.5">Kategori</th>
                              <th className="px-3 py-2.5 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#1D4ED8]/8 text-[13.5px]">
                            {filteredContacts.map((c) => {
                              const waPhone = normalizePhoneForWA(c.noHp);
                              return (
                                <tr
                                  key={waPhone || c.noHp}
                                  className="row-enter transition-colors hover:bg-[#38BDF8]/10"
                                >
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
                                    </span>
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

                      {/* Mobile Responsive Cards */}
                      <div className="flex flex-col gap-3 md:hidden">
                        {filteredContacts.map((c) => {
                          const waPhone = normalizePhoneForWA(c.noHp);
                          return (
                            <article
                              key={waPhone || c.noHp}
                              className="row-enter rounded-[14px] border border-[#1D4ED8]/14 bg-white/80 p-4"
                            >
                              <div className="mb-3">
                                <h3 className="text-[14.5px] font-bold text-[#061A40]">
                                  {c.nama}
                                </h3>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
                                  <span className="tabular-mono font-semibold text-[#1D4ED8]">
                                    {waPhone}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span
                                    className={`font-semibold ${getCategoryTextStyle(c.kategori)}`}
                                  >
                                    {c.kategori}
                                  </span>
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
            </>
          )}
        </main>
      </div>

      <CategoryManagerModal
        isOpen={showCategoryModal}
        categories={categories}
        isMutating={isMutatingCategory}
        onClose={() => setShowCategoryModal(false)}
        onAddCategory={handleAddCategory}
        onDeleteCategory={handleDeleteCategory}
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
