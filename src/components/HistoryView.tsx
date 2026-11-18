import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { formatDisplayDateTime, type HistoryLog } from '../types/contact';
import { PaginationBar } from './PaginationBar';

interface HistoryViewProps {
  logs: HistoryLog[];
  isLoading: boolean;
}

export function HistoryView({ logs, isLoading }: HistoryViewProps) {
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedLogs = useMemo(
    () => filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filtered, safePage, pageSize]
  );

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
            onChange={(e) => {
              setQuery(e.target.value);
              setCurrentPage(1);
            }}
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
        <>
          <div className="overflow-x-auto rounded-xl border border-[#1D4ED8]/14">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#0A2463] text-xs font-semibold text-white">
                  <th className="w-12 px-3 py-3 text-center whitespace-nowrap">No</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Waktu</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Action</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Nama</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">No HP</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1D4ED8]/10 text-[13px]">
                {paginatedLogs.map((item, idx) => {
                  const globalNo = (safePage - 1) * pageSize + idx + 1;
                  const lowerAction = item.action.toLowerCase();
                  const isFailed = lowerAction.includes('gagal');
                  const isPartial = lowerAction.includes('sebagian');
                  const isDelete = lowerAction.includes('hapus');
                  const hasReasonSolution =
                    item.detail.includes('Alasan:') && item.detail.includes('Solusi:');
                  const [prefixOrReason, solutionPart] = hasReasonSolution
                    ? item.detail.split('| Solusi:')
                    : [item.detail, ''];

                  return (
                    <tr
                      key={`${item.waktu}-${item.noHp}-${globalNo}`}
                      className={`transition-colors hover:bg-[#38BDF8]/12 ${
                        isFailed
                          ? 'bg-red-50/75'
                          : isPartial
                            ? 'bg-amber-50/70'
                            : 'odd:bg-white/60 even:bg-[#EFF6FF]/85'
                      }`}
                    >
                      <td className="tabular-mono px-3 py-3 text-center text-xs font-semibold text-[#64748B]">
                        {globalNo}
                      </td>
                      <td className="tabular-mono whitespace-nowrap px-3 py-3 text-center text-xs text-[#475569]">
                        {formatDisplayDateTime(item.waktu)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-center font-semibold">
                        <span
                          className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold ${
                            isFailed
                              ? 'border border-red-200 bg-red-100/90 text-red-800'
                              : isPartial
                                ? 'border border-amber-200 bg-amber-100/90 text-[#92400E]'
                                : isDelete
                                  ? 'text-red-700'
                                  : 'text-[#1D4ED8]'
                          }`}
                        >
                          {item.action}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-left font-semibold text-[#061A40]">
                        <div className="line-clamp-2 break-words">{item.nama}</div>
                      </td>
                      <td className="tabular-mono whitespace-nowrap px-3 py-3 text-center font-medium text-[#0A2463]">
                        {item.noHp}
                      </td>
                      <td className="px-3 py-3 text-left text-[#475569]">
                        {hasReasonSolution ? (
                          <div className="space-y-1 text-xs leading-relaxed">
                            <div className="font-medium text-[#091B3A]">{prefixOrReason.trim()}</div>
                            <div className="rounded-lg border border-emerald-500/20 bg-emerald-50/80 px-2.5 py-1 text-emerald-950">
                              <strong className="font-bold">Solusi:</strong> {solutionPart.trim()}
                            </div>
                          </div>
                        ) : (
                          <div className="line-clamp-2 break-words">{item.detail}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationBar
            totalItems={filtered.length}
            currentPage={safePage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            itemLabel="riwayat"
          />
        </>
      )}
    </section>
  );
}
