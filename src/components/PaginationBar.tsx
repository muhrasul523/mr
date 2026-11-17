import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100] as const;

interface PaginationBarProps {
  totalItems: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  itemLabel?: string;
}

export function PaginationBar({
  totalItems,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'kontak',
}: PaginationBarProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIdx = Math.min(totalItems, safePage * pageSize);

  // Build compact page number list with ellipsis for large datasets (tens of thousands of contacts)
  const pageNumbers: Array<number | 'ellipsis-left' | 'ellipsis-right'> = [];
  if (totalPages <= 7) {
    for (let p = 1; p <= totalPages; p += 1) pageNumbers.push(p);
  } else {
    pageNumbers.push(1);
    if (safePage > 3) pageNumbers.push('ellipsis-left');
    const winStart = Math.max(2, safePage - 1);
    const winEnd = Math.min(totalPages - 1, safePage + 1);
    for (let p = winStart; p <= winEnd; p += 1) {
      pageNumbers.push(p);
    }
    if (safePage < totalPages - 2) pageNumbers.push('ellipsis-right');
    pageNumbers.push(totalPages);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#1D4ED8]/10 pt-4 text-xs text-[#475569]">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          Menampilkan{' '}
          <strong className="tabular-mono text-[#0A2463]">
            {startIdx.toLocaleString('id-ID')}–{endIdx.toLocaleString('id-ID')}
          </strong>{' '}
          dari{' '}
          <strong className="tabular-mono text-[#0A2463]">
            {totalItems.toLocaleString('id-ID')}
          </strong>{' '}
          {itemLabel}
        </span>

        <label className="inline-flex items-center gap-1.5 font-semibold text-[#0A2463]">
          <span>Per halaman:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            aria-label="Jumlah baris per halaman"
            className="tabular-mono min-h-[34px] rounded-lg border border-[#1D4ED8]/20 bg-white/90 px-2 py-1 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
          >
            {PAGE_SIZE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totalPages > 1 && (
        <nav className="flex flex-wrap items-center gap-1" aria-label="Navigasi halaman">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            aria-label="Halaman sebelumnya"
            className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#1D4ED8]/15 bg-white px-2 text-[#0A2463] transition-colors hover:bg-[#EFF6FF] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          {pageNumbers.map((item) =>
            typeof item === 'string' ? (
              <span key={item} className="px-1.5 text-[#64748B]" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === safePage ? 'page' : undefined}
                className={`tabular-mono inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition-all ${
                  item === safePage
                    ? 'bg-gradient-to-r from-[#0A2463] to-[#1D4ED8] text-white shadow-sm'
                    : 'border border-[#1D4ED8]/15 bg-white text-[#0A2463] hover:bg-[#EFF6FF]'
                }`}
              >
                {item.toLocaleString('id-ID')}
              </button>
            )
          )}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            aria-label="Halaman berikutnya"
            className="inline-flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-[#1D4ED8]/15 bg-white px-2 text-[#0A2463] transition-colors hover:bg-[#EFF6FF] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
