import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Filter, FolderOpen, RotateCcw, Search, X } from 'lucide-react';
import {
  CategoryItem,
  GENDER_OPTIONS,
  GenderOption,
  GoogleAccountConfig,
  TANPA_AKUN_ID,
  TANPA_AKUN_LABEL,
  TANPA_KATEGORI_LABEL,
  formatNumberId,
  getGenderShort,
} from '../types/contact';

export interface ActiveFilterState {
  categories: string[];
  genders: GenderOption[];
  accounts: string[];
  onlyDuplicates: boolean;
}

interface FilterModalProps {
  isOpen: boolean;
  categories: CategoryItem[];
  accounts: GoogleAccountConfig[];
  categoryCounts: Record<string, number>;
  genderCounts: Record<string, number>;
  accountCounts: Record<string, number>;
  duplicateRowsCount: number;
  duplicatePhonesCount: number;
  uncategorizedCount: number;
  activeFilters: ActiveFilterState;
  computeMatchCount: (draft: ActiveFilterState) => number;
  onApply: (next: ActiveFilterState) => void;
  onReset: () => void;
  onClose: () => void;
}

export function FilterModal({
  isOpen,
  categories,
  accounts,
  categoryCounts,
  genderCounts,
  accountCounts,
  duplicateRowsCount,
  duplicatePhonesCount,
  uncategorizedCount,
  activeFilters,
  computeMatchCount,
  onApply,
  onReset,
  onClose,
}: FilterModalProps) {
  const [draftCategories, setDraftCategories] = useState<string[]>([]);
  const [draftGenders, setDraftGenders] = useState<GenderOption[]>([]);
  const [draftAccounts, setDraftAccounts] = useState<string[]>([]);
  const [draftOnlyDuplicates, setDraftOnlyDuplicates] = useState(false);
  const [catSearch, setCatSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setDraftCategories(activeFilters.categories);
      setDraftGenders(activeFilters.genders);
      setDraftAccounts(activeFilters.accounts || []);
      setDraftOnlyDuplicates(activeFilters.onlyDuplicates);
      setCatSearch('');
    }
  }, [isOpen, activeFilters]);

  const filteredCategoryItems = useMemo(() => {
    const q = catSearch.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.nama.toLowerCase().includes(q) || c.kode.toLowerCase().includes(q)
    );
  }, [categories, catSearch]);

  const previewCount = useMemo(
    () =>
      computeMatchCount({
        categories: draftCategories,
        genders: draftGenders,
        accounts: draftAccounts,
        onlyDuplicates: draftOnlyDuplicates,
      }),
    [computeMatchCount, draftCategories, draftGenders, draftAccounts, draftOnlyDuplicates]
  );

  if (!isOpen) return null;

  const isUncategorizedChecked = draftCategories.includes(TANPA_KATEGORI_LABEL);

  function toggleCategory(catName: string) {
    setDraftCategories((prev) =>
      prev.includes(catName)
        ? prev.filter((item) => item !== catName)
        : [...prev, catName]
    );
  }

  function toggleGender(g: GenderOption) {
    setDraftGenders((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : [...prev, g]
    );
  }

  function toggleAccount(accId: string) {
    setDraftAccounts((prev) =>
      prev.includes(accId) ? prev.filter((item) => item !== accId) : [...prev, accId]
    );
  }

  function handleSelectAllCategories() {
    setDraftCategories([TANPA_KATEGORI_LABEL, ...categories.map((c) => c.nama)]);
  }

  function handleClearCategories() {
    setDraftCategories([]);
  }

  function handleResetDraft() {
    setDraftCategories([]);
    setDraftGenders([]);
    setDraftAccounts([]);
    setDraftOnlyDuplicates(false);
    onReset();
    onClose();
  }

  function handleApply() {
    onApply({
      categories: draftCategories,
      genders: draftGenders,
      accounts: draftAccounts,
      onlyDuplicates: draftOnlyDuplicates,
    });
    onClose();
  }

  const totalDraftActive =
    draftCategories.length +
    draftGenders.length +
    draftAccounts.length +
    (draftOnlyDuplicates ? 1 : 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/45 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-surface flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] bg-white/97 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[#1D4ED8]/12 bg-gradient-to-r from-[#0A2463] via-[#1D4ED8] to-[#0284C7] px-5 py-4 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Filter className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="filter-modal-title" className="text-base font-bold">
                Filter Daftar Kontak
              </h3>
              <p className="text-xs text-white/85">
                Centang kategori, jenis kelamin, atau filter khusus yang ingin ditampilkan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup jendela filter"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Filter Khusus */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0A2463]">
                Filter Khusus
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label
                className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border p-3 transition-colors ${
                  draftOnlyDuplicates
                    ? 'border-[#1D4ED8] bg-[#EFF6FF]'
                    : 'border-[#1D4ED8]/15 bg-white hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={draftOnlyDuplicates}
                    onChange={(e) => setDraftOnlyDuplicates(e.target.checked)}
                    className="h-4 w-4 rounded border-[#1D4ED8]/30 text-[#1D4ED8] focus:ring-[#38BDF8]"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#0A2463]">
                      <Copy className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                      <span>Hanya Kontak Duplikat</span>
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      {formatNumberId(duplicatePhonesCount)} nomor muncul berulang
                    </div>
                  </div>
                </div>
                <span className="tabular-mono text-xs font-bold text-[#1D4ED8]">
                  {formatNumberId(duplicateRowsCount)}
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between gap-2.5 rounded-xl border p-3 transition-colors ${
                  isUncategorizedChecked
                    ? 'border-amber-500 bg-amber-50/90'
                    : 'border-[#1D4ED8]/15 bg-white hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isUncategorizedChecked}
                    onChange={() => toggleCategory(TANPA_KATEGORI_LABEL)}
                    className="h-4 w-4 rounded border-amber-500/40 text-[#D97706] focus:ring-amber-400"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#0A2463]">
                      <FolderOpen className="h-3.5 w-3.5 text-[#D97706]" aria-hidden="true" />
                      <span>{TANPA_KATEGORI_LABEL}</span>
                    </div>
                    <div className="text-[11px] text-[#64748B]">
                      Kontak belum diberi kategori
                    </div>
                  </div>
                </div>
                <span className="tabular-mono text-xs font-bold text-[#B45309]">
                  {formatNumberId(uncategorizedCount)}
                </span>
              </label>
            </div>
          </div>

          {/* Filter Jenis Kelamin */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0A2463]">
                Jenis Kelamin
              </span>
              {draftGenders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setDraftGenders([])}
                  className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                >
                  Semua Gender
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((g) => {
                const checked = draftGenders.includes(g);
                return (
                  <label
                    key={g}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                      checked
                        ? 'border-[#1D4ED8] bg-[#EFF6FF]'
                        : 'border-[#1D4ED8]/15 bg-white hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleGender(g)}
                        className="h-4 w-4 shrink-0 rounded border-[#1D4ED8]/30 text-[#1D4ED8] focus:ring-[#38BDF8]"
                      />
                      <span className="truncate text-xs font-semibold text-[#0A2463]">
                        {g}{' '}
                        <span className="text-[11px] font-medium text-[#64748B]">
                          ({getGenderShort(g)})
                        </span>
                      </span>
                    </div>
                    <span className="tabular-mono text-xs font-bold text-[#1D4ED8]">
                      {formatNumberId(genderCounts[g] ?? 0)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Filter Akun Google */}
          {accounts.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#0A2463]">
                  Akun Google ({draftAccounts.length === 0 ? 'Semua' : `${draftAccounts.length} dipilih`})
                </span>
                {draftAccounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDraftAccounts([])}
                    className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Semua Akun
                  </button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {accounts.map((acc) => {
                  const checked = draftAccounts.includes(acc.id);
                  return (
                    <label
                      key={acc.id}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                        checked
                          ? 'border-[#1D4ED8] bg-[#EFF6FF]'
                          : 'border-[#1D4ED8]/15 bg-white hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAccount(acc.id)}
                          className="h-4 w-4 shrink-0 rounded border-[#1D4ED8]/30 text-[#1D4ED8] focus:ring-[#38BDF8]"
                        />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-[#0A2463]">
                            {acc.label}
                          </div>
                          {acc.email && (
                            <div className="truncate text-[10.5px] text-[#64748B]">
                              {acc.email}
                            </div>
                          )}
                        </div>
                      </div>
                      <span className="tabular-mono shrink-0 text-xs font-bold text-[#1D4ED8]">
                        {formatNumberId(accountCounts[acc.id] ?? 0)}
                      </span>
                    </label>
                  );
                })}

                {/* Pilihan Tidak Ada Akun / Belum Tersimpan di Akun Google Manapun */}
                <label
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                    draftAccounts.includes(TANPA_AKUN_ID)
                      ? 'border-amber-500 bg-amber-50/90'
                      : 'border-[#1D4ED8]/15 bg-white hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draftAccounts.includes(TANPA_AKUN_ID)}
                      onChange={() => toggleAccount(TANPA_AKUN_ID)}
                      className="h-4 w-4 shrink-0 rounded border-amber-500/40 text-[#D97706] focus:ring-amber-400"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-[#0A2463]">
                        Tidak Ada Akun
                      </div>
                      <div className="truncate text-[10.5px] text-[#64748B]">
                        {TANPA_AKUN_LABEL}
                      </div>
                    </div>
                  </div>
                  <span className="tabular-mono shrink-0 text-xs font-bold text-[#B45309]">
                    {formatNumberId(accountCounts[TANPA_AKUN_ID] ?? 0)}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Filter Kategori */}
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0A2463]">
                Kategori ({draftCategories.length === 0 ? 'Semua' : `${draftCategories.length} dipilih`})
              </span>
              <div className="flex items-center gap-3 text-xs font-semibold">
                <button
                  type="button"
                  onClick={handleSelectAllCategories}
                  className="text-[#1D4ED8] hover:underline"
                >
                  Pilih Semua
                </button>
                <span className="text-[#CBD5E1]" aria-hidden="true">|</span>
                <button
                  type="button"
                  onClick={handleClearCategories}
                  className="text-[#64748B] hover:text-[#0A2463] hover:underline"
                >
                  Bersihkan
                </button>
              </div>
            </div>

            {categories.length > 6 && (
              <div className="relative mb-2.5">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Cari nama atau kode kategori..."
                  className="min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/18 bg-white py-1.5 pl-9 pr-3 text-xs text-[#091B3A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
                />
              </div>
            )}

            <div className="grid max-h-[260px] gap-2 overflow-y-auto rounded-2xl border border-[#1D4ED8]/12 bg-[#F8FAFC]/80 p-2.5 sm:grid-cols-2">
              {filteredCategoryItems.map((cat) => {
                const checked = draftCategories.includes(cat.nama);
                const count = categoryCounts[cat.nama] ?? 0;
                return (
                  <label
                    key={cat.nama}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                      checked
                        ? 'border-[#1D4ED8] bg-[#EFF6FF]'
                        : 'border-[#1D4ED8]/12 bg-white hover:bg-[#F1F5F9]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(cat.nama)}
                        className="h-4 w-4 shrink-0 rounded border-[#1D4ED8]/30 text-[#1D4ED8] focus:ring-[#38BDF8]"
                      />
                      <span className="truncate text-[12.5px] font-semibold text-[#0A2463]" title={`${cat.nama} (${cat.kode})`}>
                        {cat.nama}{' '}
                        <span className="tabular-mono text-[11px] font-medium text-[#1D4ED8]">
                          ({cat.kode})
                        </span>
                      </span>
                    </div>
                    <span className="tabular-mono shrink-0 text-xs font-bold text-[#475569]">
                      {formatNumberId(count)}
                    </span>
                  </label>
                );
              })}

              {filteredCategoryItems.length === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-[#64748B]">
                  Kategori &ldquo;{catSearch}&rdquo; tidak ditemukan.
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-[#64748B]">
              Biarkan kategori kosong (tidak dicentang) untuk menampilkan semua kategori.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#1D4ED8]/12 bg-white/95 px-5 py-3.5">
          <button
            type="button"
            onClick={handleResetDraft}
            disabled={totalDraftActive === 0}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/18 bg-white px-3.5 py-2 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#EFF6FF] hover:text-[#0A2463] disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset Semua Filter
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#475569] transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="btn-ocean-sheen inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Terapkan Filter ({previewCount.toLocaleString('id-ID')} hasil)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
