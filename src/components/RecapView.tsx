import { useMemo } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, FolderOpen, RefreshCw, Users } from 'lucide-react';
import {
  CategoryItem,
  Contact,
  GENDER_OPTIONS,
  GenderOption,
  GoogleSyncStatus,
  TANPA_KATEGORI_LABEL,
} from '../types/contact';

interface RecapViewProps {
  contacts: Contact[];
  syncContacts: Contact[];
  categories: CategoryItem[];
  syncStatus: GoogleSyncStatus | null;
  onFilterByCategory: (catName: string) => void;
  onFilterByGender: (gender: string) => void;
  onOpenSyncTab: () => void;
}

interface CategoryBreakdownRow {
  nama: string;
  kode: string;
  total: number;
  laki: number;
  perempuan: number;
  admin: number;
  percent: number;
  isUncategorized?: boolean;
}

export function RecapView({
  contacts,
  syncContacts,
  categories,
  syncStatus,
  onFilterByCategory,
  onFilterByGender,
  onOpenSyncTab,
}: RecapViewProps) {
  const totalContacts = contacts.length;

  const genderSummary = useMemo(() => {
    const counts: Record<GenderOption, number> = {
      'Laki-laki': 0,
      Perempuan: 0,
      Admin: 0,
    };
    for (const c of contacts) {
      if (GENDER_OPTIONS.includes(c.jenisKelamin)) {
        counts[c.jenisKelamin] += 1;
      } else {
        counts['Laki-laki'] += 1;
      }
    }
    return GENDER_OPTIONS.map((g) => ({
      label: g,
      count: counts[g],
      percent: totalContacts > 0 ? Math.round((counts[g] / totalContacts) * 100) : 0,
    }));
  }, [contacts, totalContacts]);

  const uncategorizedCount = useMemo(
    () => contacts.filter((c) => !String(c.kategori || '').trim()).length,
    [contacts]
  );

  const categoryBreakdown = useMemo<CategoryBreakdownRow[]>(() => {
    const map = new Map<string, CategoryBreakdownRow>();

    for (const cat of categories) {
      map.set(cat.nama, {
        nama: cat.nama,
        kode: cat.kode,
        total: 0,
        laki: 0,
        perempuan: 0,
        admin: 0,
        percent: 0,
      });
    }

    const uncategorizedRow: CategoryBreakdownRow = {
      nama: TANPA_KATEGORI_LABEL,
      kode: '-',
      total: 0,
      laki: 0,
      perempuan: 0,
      admin: 0,
      percent: 0,
      isUncategorized: true,
    };

    for (const c of contacts) {
      const cleanCat = String(c.kategori || '').trim();
      let row: CategoryBreakdownRow;

      if (!cleanCat) {
        row = uncategorizedRow;
      } else {
        const existing = map.get(cleanCat);
        if (existing) {
          row = existing;
        } else {
          row = {
            nama: cleanCat,
            kode: cleanCat.slice(0, 3).toUpperCase(),
            total: 0,
            laki: 0,
            perempuan: 0,
            admin: 0,
            percent: 0,
          };
          map.set(cleanCat, row);
        }
      }

      row.total += 1;
      if (c.jenisKelamin === 'Perempuan') row.perempuan += 1;
      else if (c.jenisKelamin === 'Admin') row.admin += 1;
      else row.laki += 1;
    }

    const rows = [...map.values(), uncategorizedRow].map((r) => ({
      ...r,
      percent: totalContacts > 0 ? Math.round((r.total / totalContacts) * 100) : 0,
    }));

    return rows;
  }, [contacts, categories, totalContacts]);

  return (
    <section className="space-y-6" aria-label="Rekapitulasi Kontak">
      {/* KPI Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-surface rounded-[20px] p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Total Direktori</span>
            <Users className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">{totalContacts}</div>
          <p className="mt-1 text-xs text-[#475569]">
            Terbagi ke {categories.length} kategori aktif
          </p>
        </div>

        <div className="glass-surface rounded-[20px] p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Tanpa Kategori</span>
            <FolderOpen className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">
            {uncategorizedCount}
          </div>
          <button
            type="button"
            onClick={() => onFilterByCategory(TANPA_KATEGORI_LABEL)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
          >
            Lihat kontak tanpa kategori
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-surface rounded-[20px] p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Sheet Kontak_Sync</span>
            <BarChart3 className="h-4 w-4 text-[#0284C7]" aria-hidden="true" />
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">
            {syncContacts.length}
          </div>
          <p className="mt-1 text-xs text-[#475569]">
            Baris siap sinkron dari sheet manual/rumus
          </p>
        </div>

        <div className="glass-surface rounded-[20px] p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Google Kontak</span>
            {syncStatus?.connected ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
            )}
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">
            {syncStatus ? `${syncStatus.syncedCount}/${syncStatus.totalInSyncSheet}` : '0/0'}
          </div>
          <button
            type="button"
            onClick={onOpenSyncTab}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
          >
            {syncStatus?.connected
              ? `Belum sinkron: ${syncStatus.unsyncedCount}`
              : 'Periksa status Google Kontak'}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Recap Grid: Gender + Category Breakdown */}
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Rekap Jenis Kelamin */}
        <article className="glass-surface rounded-[22px] p-5 sm:p-6">
          <h2 className="text-base font-bold text-[#0A2463]">Rekap Jenis Kelamin</h2>
          <p className="mt-1 text-xs text-[#475569]">
            Klik baris untuk langsung memfilter daftar kontak.
          </p>

          <div className="mt-4 space-y-3">
            {genderSummary.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => onFilterByGender(item.label)}
                className="block w-full rounded-2xl border border-[#1D4ED8]/12 bg-white/75 p-3.5 text-left transition-colors hover:bg-[#EFF6FF]"
              >
                <div className="flex items-center justify-between text-[13px] font-semibold text-[#0A2463]">
                  <span>{item.label}</span>
                  <span className="tabular-mono text-[#1D4ED8]">
                    {item.count} ({item.percent}%)
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#1D4ED8]/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#0A2463] via-[#1D4ED8] to-[#0284C7] transition-all"
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </article>

        {/* Rekap Kategori + Matrix Jenis Kelamin */}
        <article className="glass-surface rounded-[22px] p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#1D4ED8]/10 pb-3.5">
            <div>
              <h2 className="text-base font-bold text-[#0A2463]">
                Rekapitulasi per Kategori &amp; Jenis Kelamin
              </h2>
              <p className="mt-0.5 text-xs text-[#475569]">
                Klik nama kategori mana pun untuk membuka daftar kontak yang difilter.
              </p>
            </div>
            <span className="tabular-mono text-xs font-semibold text-[#1D4ED8]">
              {categoryBreakdown.length} Kelompok
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-[#1D4ED8]/14 text-xs font-semibold text-[#64748B]">
                  <th className="w-11 px-3 py-2.5 whitespace-nowrap">No</th>
                  <th className="px-3 py-2.5 whitespace-nowrap">Kategori</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Laki-laki</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Perempuan</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Admin</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Total</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">Porsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D4ED8]/8 text-[13px]">
                {categoryBreakdown.map((row, idx) => (
                  <tr
                    key={row.nama}
                    className="odd:bg-white/45 even:bg-[#EFF6FF]/80 transition-colors hover:bg-[#38BDF8]/14"
                  >
                    <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onFilterByCategory(row.nama)}
                        className={`text-left font-semibold hover:underline ${
                          row.isUncategorized ? 'text-[#B45309]' : 'text-[#0A2463]'
                        }`}
                      >
                        {row.nama}
                        {row.kode && row.kode !== '-' ? (
                          <span className="tabular-mono ml-1.5 text-xs font-medium text-[#1D4ED8]">
                            ({row.kode})
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td className="tabular-mono px-3 py-3 text-right text-[#475569]">
                      {row.laki}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-right text-[#475569]">
                      {row.perempuan}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-right text-[#475569]">
                      {row.admin}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-right font-bold text-[#0A2463]">
                      {row.total}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-right text-xs font-semibold text-[#1D4ED8]">
                      {row.percent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}
