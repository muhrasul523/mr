import { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  FolderOpen,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  CategoryItem,
  Contact,
  GENDER_OPTIONS,
  GenderOption,
  GoogleSyncStatus,
  TANPA_KATEGORI_LABEL,
  formatNumberId,
  normalizePhoneForWA,
} from '../types/contact';

interface RecapViewProps {
  contacts: Contact[];
  syncContacts: Contact[];
  categories: CategoryItem[];
  syncStatus: GoogleSyncStatus | null;
  onFilterByCategory: (catName: string) => void;
  onFilterByGender: (gender: GenderOption) => void;
  onFilterDuplicates: () => void;
  onFilterByPhone: (phone: string) => void;
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

interface DuplicatePhoneGroup {
  phone: string;
  names: string[];
  categories: string[];
  count: number;
}

export function RecapView({
  contacts,
  syncContacts,
  categories,
  syncStatus,
  onFilterByCategory,
  onFilterByGender,
  onFilterDuplicates,
  onFilterByPhone,
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

  const duplicateInfo = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of contacts) {
      const p = normalizePhoneForWA(c.noHp);
      if (!p) continue;
      const arr = map.get(p) || [];
      arr.push(c);
      map.set(p, arr);
    }

    const groups: DuplicatePhoneGroup[] = [];
    let totalRows = 0;

    for (const [phone, list] of map.entries()) {
      if (list.length > 1) {
        totalRows += list.length;
        const uniqueNames = Array.from(new Set(list.map((x) => x.nama.trim()).filter(Boolean)));
        const uniqueCats = Array.from(
          new Set(list.map((x) => String(x.kategori || '').trim() || TANPA_KATEGORI_LABEL))
        );
        groups.push({
          phone,
          names: uniqueNames,
          categories: uniqueCats,
          count: list.length,
        });
      }
    }

    groups.sort((a, b) => b.count - a.count);
    return {
      uniquePhonesCount: groups.length,
      totalDuplicateRows: totalRows,
      groups,
    };
  }, [contacts]);

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

    return [...map.values(), uncategorizedRow].map((r) => ({
      ...r,
      percent: totalContacts > 0 ? Math.round((r.total / totalContacts) * 100) : 0,
    }));
  }, [contacts, categories, totalContacts]);

  return (
    <section className="space-y-6" aria-label="Rekapitulasi Kontak">
      {/* KPI Summary Strip (4 kartu ringkas — tidak menumpuk rekap berulang) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="glass-surface rounded-[20px] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Total Entri Kontak</span>
            <Users className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">
            {formatNumberId(totalContacts)}
          </div>
          <p className="mt-1 text-xs text-[#475569]">
            {formatNumberId(categories.length)} kategori aktif
          </p>
        </div>

        <div className="glass-surface rounded-[20px] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Tanpa Kategori</span>
            <FolderOpen className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">
            {formatNumberId(uncategorizedCount)}
          </div>
          <button
            type="button"
            onClick={() => onFilterByCategory(TANPA_KATEGORI_LABEL)}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
          >
            Filter tanpa kategori
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-surface rounded-[20px] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Duplikat / Multi-Kat</span>
            <Copy className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
          </div>
          <div className="tabular-mono mt-2 text-2xl font-bold text-[#0A2463]">
            {formatNumberId(duplicateInfo.uniquePhonesCount)}
            <span className="ml-1.5 text-xs font-semibold text-[#64748B]">
              ({formatNumberId(duplicateInfo.totalDuplicateRows)} baris)
            </span>
          </div>
          <button
            type="button"
            onClick={onFilterDuplicates}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
          >
            Filter kontak duplikat
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>

        <div className="glass-surface rounded-[20px] p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-semibold text-[#475569]">
            <span>Google Kontak</span>
            {syncStatus?.connected ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4 text-[#D97706]" aria-hidden="true" />
            )}
          </div>
          <div className="tabular-mono mt-2 text-xl font-bold text-[#0A2463]">
            {syncStatus
              ? `${formatNumberId(syncStatus.syncedCount)} / ${formatNumberId(syncStatus.totalInSyncSheet || syncContacts.length)}`
              : `0 / ${formatNumberId(syncContacts.length)}`}
          </div>
          <button
            type="button"
            onClick={onOpenSyncTab}
            className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
          >
            {syncStatus?.connected
              ? `Sisa belum sinkron: ${formatNumberId(syncStatus.unsyncedCount)}`
              : 'Buka progres sinkronisasi'}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Main Recap Grid: Gender + Category Breakdown */}
      <div className="grid gap-6 lg:grid-cols-[330px_1fr]">
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
                    {item.count.toLocaleString('id-ID')} ({item.percent}%)
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
              {formatNumberId(categoryBreakdown.length)} Kelompok
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#1D4ED8]/14">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#0A2463] text-xs font-semibold text-white">
                  <th className="w-12 px-3 py-3 text-center whitespace-nowrap">No</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Kategori</th>
                  <th className="w-20 px-3 py-3 text-center whitespace-nowrap" title="Laki-laki">
                    L
                  </th>
                  <th className="w-20 px-3 py-3 text-center whitespace-nowrap" title="Perempuan">
                    P
                  </th>
                  <th className="w-20 px-3 py-3 text-center whitespace-nowrap" title="Admin">
                    A
                  </th>
                  <th className="w-24 px-3 py-3 text-center whitespace-nowrap">Total</th>
                  <th className="w-24 px-3 py-3 text-center whitespace-nowrap">Porsi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D4ED8]/10 text-[13px]">
                {categoryBreakdown.map((row, idx) => (
                  <tr
                    key={row.nama}
                    className="odd:bg-white/60 even:bg-[#EFF6FF]/85 transition-colors hover:bg-[#38BDF8]/15"
                  >
                    <td className="tabular-mono px-3 py-3 text-center text-xs font-semibold text-[#64748B]">
                      {formatNumberId(idx + 1)}
                    </td>
                    <td className="px-3 py-3 text-left">
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
                    <td className="tabular-mono px-3 py-3 text-center text-[#475569]">
                      {formatNumberId(row.laki)}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-center text-[#475569]">
                      {formatNumberId(row.perempuan)}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-center text-[#475569]">
                      {formatNumberId(row.admin)}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-center font-bold text-[#0A2463]">
                      {formatNumberId(row.total)}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-center text-xs font-semibold text-[#1D4ED8]">
                      {row.percent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      {/* Rekap Kontak Duplikat / Multi-Kategori */}
      <article className="glass-surface rounded-[22px] p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#1D4ED8]/10 pb-3.5">
          <div>
            <h2 className="text-base font-bold text-[#0A2463]">
              Rekap Kontak Duplikat / Multi-Kategori
            </h2>
            <p className="mt-0.5 text-xs text-[#475569]">
              Nomor HP yang muncul pada lebih dari satu baris (misalnya tergabung di beberapa kategori sekaligus).
            </p>
          </div>
          {duplicateInfo.groups.length > 0 && (
            <button
              type="button"
              onClick={onFilterDuplicates}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#1D4ED8]/10 px-3.5 py-1.5 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8]/18 whitespace-nowrap"
            >
              Tampilkan Semua Duplikat ({formatNumberId(duplicateInfo.totalDuplicateRows)} baris)
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {duplicateInfo.groups.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#64748B]">
            Tidak ada nomor HP duplikat saat ini. Semua nomor terdaftar unik (1 baris per nomor).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#1D4ED8]/14">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#0A2463] text-xs font-semibold text-white">
                  <th className="w-12 px-3 py-3 text-center whitespace-nowrap">No</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">No HP (WA)</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Nama Terdaftar</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Daftar Kategori</th>
                  <th className="w-24 px-3 py-3 text-center whitespace-nowrap">Jumlah</th>
                  <th className="w-28 px-3 py-3 text-center whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D4ED8]/10 text-[13px]">
                {duplicateInfo.groups.slice(0, 50).map((g, idx) => (
                  <tr
                    key={g.phone}
                    className="odd:bg-white/60 even:bg-[#EFF6FF]/85 transition-colors hover:bg-[#38BDF8]/15"
                  >
                    <td className="tabular-mono px-3 py-3 text-center text-xs font-semibold text-[#64748B]">
                      {idx + 1}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-center text-xs font-semibold text-[#1D4ED8] whitespace-nowrap">
                      {g.phone}
                    </td>
                    <td className="px-3 py-3 text-left font-semibold text-[#061A40]">
                      <div className="line-clamp-2 break-words">{g.names.join(' / ')}</div>
                    </td>
                    <td className="px-3 py-3 text-left text-xs font-medium text-[#0284C7]">
                      <div className="line-clamp-2 break-words">{g.categories.join(', ')}</div>
                    </td>
                    <td className="tabular-mono px-3 py-3 text-center font-bold text-[#0A2463]">
                      {g.count}x
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onFilterByPhone(g.phone)}
                        className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-[#1D4ED8]/10 px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8]/20 whitespace-nowrap"
                      >
                        Lihat
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </section>
  );
}
