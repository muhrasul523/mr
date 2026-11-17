import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { formatDisplayDateTime, type HistoryLog } from '../types/contact';

interface HistoryViewProps {
  logs: HistoryLog[];
  isLoading: boolean;
}

export function HistoryView({ logs, isLoading }: HistoryViewProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter(
      (item) =>
        item.nama.toLowerCase().includes(q) ||
        item.noHp.toLowerCase().includes(q) ||
        item.action.toLowerCase().includes(q) ||
        item.detail.toLowerCase().includes(q)
    );
  }, [logs, query]);

  return (
    <section className="glass-surface rounded-[22px] p-5 sm:p-6" aria-label="Riwayat Perubahan">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4 border-b border-[#1D4ED8]/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#1D4ED8] text-white">
            <History className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0A2463]">
              Riwayat Perubahan (Sheet History)
            </h2>
            <p className="text-xs text-[#475569]">
              Mencatat seluruh aktivitas tambah, edit, hapus, perubahan kategori, dan sinkronisasi Google Kontak.
            </p>
          </div>
        </div>

        <div className="relative min-w-[230px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari nama, no HP, atau aksi..."
            aria-label="Cari riwayat"
            className="min-h-[40px] w-full rounded-xl border border-[#1D4ED8]/16 bg-white/90 py-2 pl-10 pr-3.5 text-[13px] text-[#091B3A] outline-none focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#38BDF8]/22"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2.5 py-2">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-11 animate-pulse rounded-xl bg-[#1D4ED8]/8" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center">
          <h3 className="text-base font-bold text-[#0A2463]">Belum ada catatan riwayat</h3>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-[#475569]">
            Setiap penambahan, penyuntingan, atau penghapusan kontak dan kategori akan otomatis tercatat di sini serta di sheet <strong>History</strong>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1D4ED8]/12 text-xs font-semibold text-[#64748B]">
                <th className="w-12 px-3 py-2.5">No</th>
                <th className="px-3 py-2.5">Waktu</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Nama</th>
                <th className="px-3 py-2.5">No HP</th>
                <th className="px-3 py-2.5">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D4ED8]/8 text-[13px]">
              {filtered.map((item, idx) => (
                <tr
                  key={`${item.waktu}-${item.noHp}-${idx}`}
                  className="odd:bg-white/40 even:bg-[#EFF6FF]/75 transition-colors hover:bg-[#38BDF8]/12"
                >
                  <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                    {idx + 1}
                  </td>
                  <td className="tabular-mono whitespace-nowrap px-3 py-3 text-xs text-[#475569]">
                    {formatDisplayDateTime(item.waktu)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#1D4ED8]">
                    {item.action}
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#061A40]">
                    {item.nama}
                  </td>
                  <td className="tabular-mono whitespace-nowrap px-3 py-3 font-medium text-[#0A2463]">
                    {item.noHp}
                  </td>
                  <td className="px-3 py-3 text-[#475569]">
                    {item.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
