import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  AccountSyncSummary,
  GoogleAccountConfig,
  formatNumberId,
} from '../types/contact';

export interface ClearGoogleAccountResult {
  status: 'success' | 'error';
  accountId: string;
  accountLabel: string;
  email?: string;
  deletedCount: number;
  remainingCount: number;
  hasMore: boolean;
  rateLimited?: boolean;
  message: string;
}

interface ClearGoogleContactsModalProps {
  account: GoogleAccountConfig | null;
  summary?: AccountSyncSummary;
  isClearing: boolean;
  result: ClearGoogleAccountResult | null;
  onConfirmClear: (accountId: string) => Promise<void>;
  onClose: () => void;
}

export function ClearGoogleContactsModal({
  account,
  summary,
  isClearing,
  result,
  onConfirmClear,
  onClose,
}: ClearGoogleContactsModalProps) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    setConfirmText('');
  }, [account?.id]);

  if (!account) return null;

  const isConfirmed = confirmText.trim().toUpperCase() === 'HAPUS';
  const currentCount = summary?.googleContactsCount ?? 0;
  const isSameAccountResult = Boolean(result && result.accountId === account.id);
  const hasMoreToDelete = Boolean(
    isSameAccountResult &&
      result &&
      (result.hasMore || result.remainingCount > 0)
  );
  const isCompletedClean = Boolean(
    isSameAccountResult &&
      result &&
      result.status === 'success' &&
      !result.hasMore &&
      result.remainingCount === 0
  );

  const trashUrl = 'https://contacts.google.com/trash';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/55 p-3 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-google-contacts-title"
    >
      <div className="glass-surface flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-[26px] border border-white/70 bg-white/95 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-red-500/15 bg-gradient-to-r from-red-50/90 via-white to-amber-50/60 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/12 text-red-700">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="clear-google-contacts-title"
                className="text-base font-bold text-[#0A2463] break-words"
              >
                Kosongkan Isi Google Kontak
              </h2>
              <p className="mt-0.5 text-xs text-[#475569] break-words">
                <span className="tabular-mono mr-1.5 inline-block rounded bg-[#0A2463] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {account.id}
                </span>
                <strong className="text-[#0A2463]">{account.label}</strong>
                {account.email ? ` · ${account.email}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            aria-label="Tutup modal"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-black/5 hover:text-[#0A2463] disabled:opacity-40"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-xs">
          {/* Green Reassurance Banner */}
          <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-50/90 p-3.5 text-emerald-950">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
              aria-hidden="true"
            />
            <div className="min-w-0 leading-relaxed break-words">
              <strong className="block font-bold text-emerald-900">
                Data Google Sheets 100% Aman (Tidak Dihapus)
              </strong>
              Tindakan ini <strong>hanya mengosongkan daftar kontak di akun Google Kontak</strong>{' '}
              (<strong>{account.label}</strong>). Seluruh baris, rumus, kategori, dan nomor HP di sheet{' '}
              <strong>Kontak</strong> maupun <strong>Kontak_Sync</strong> tetap utuh.
            </div>
          </div>

          {/* Account Summary Info */}
          <div className="grid grid-cols-2 gap-2.5 rounded-2xl border border-[#1D4ED8]/14 bg-[#F8FAFC] p-3">
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#64748B]">Akun Tujuan</div>
              <div className="mt-0.5 truncate font-bold text-[#0A2463]" title={account.email || account.label}>
                {account.email || account.label}
              </div>
            </div>
            <div className="min-w-0 text-right">
              <div className="text-[11px] font-medium text-[#64748B]">Tercatat di Google Kontak</div>
              <div className="tabular-mono mt-0.5 text-sm font-extrabold text-red-700">
                {formatNumberId(
                  isSameAccountResult && result ? result.remainingCount : currentCount
                )}{' '}
                kontak
              </div>
            </div>
          </div>

          {/* Honest Trash (Sampah) Note */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-50/85 p-3.5 text-[#78350F]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]"
                aria-hidden="true"
              />
              <div className="min-w-0 leading-relaxed break-words">
                <strong className="block font-bold text-[#92400E]">
                  Catatan Tentang Sampah (Trash) Google Kontak
                </strong>
                Kontak yang dihapus via API otomatis dipindahkan Google ke folder{' '}
                <strong>Sampah</strong> (terhapus permanen dalam 30 hari). Karena aturan keamanan Google People API tidak mengizinkan skrip mengosongkan folder Sampah otomatis, setelah proses ini selesai klik tombol{' '}
                <strong>Buka Sampah</strong> di bawah lalu klik{' '}
                <em>&ldquo;Kosongkan sampah sekarang&rdquo;</em> pada akun{' '}
                <strong>{account.email || account.label}</strong>.
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <a
                href={trashUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-600/30 bg-white px-3 py-1.5 text-[11.5px] font-bold text-[#92400E] shadow-xs transition-colors hover:bg-amber-100/70"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Buka Sampah Google Kontak</span>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Live Progress State */}
          {isClearing && (
            <div className="flex items-center gap-3 rounded-2xl border border-[#1D4ED8]/25 bg-[#EFF6FF] p-3.5 text-[#0A2463]">
              <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#1D4ED8]" aria-hidden="true" />
              <div className="min-w-0 leading-relaxed break-words">
                <strong className="block font-bold">
                  Sedang menghapus isi Google Kontak ({account.label})...
                </strong>
                Menghapus massal hingga 500 kontak per panggilan API. Mohon tunggu hingga selesai (jangan tutup tab ini).
              </div>
            </div>
          )}

          {/* Result Banner */}
          {isSameAccountResult && result && !isClearing && (
            <div
              className={`rounded-2xl border p-3.5 leading-relaxed break-words ${
                result.status === 'error'
                  ? 'border-red-500/35 bg-red-50/90 text-red-950'
                  : isCompletedClean
                    ? 'border-emerald-500/35 bg-emerald-50/90 text-emerald-950'
                    : 'border-sky-500/35 bg-sky-50/90 text-[#0A2463]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {result.status === 'error' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      isCompletedClean ? 'text-emerald-600' : 'text-[#0284C7]'
                    }`}
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-bold">
                    {result.status === 'error'
                      ? 'Terjadi Kendala Saat Mengosongkan'
                      : isCompletedClean
                        ? 'Google Kontak Berhasil Dikosongkan!'
                        : 'Sebagian Besar Kontak Berhasil Dihapus'}
                  </div>
                  <p className="mt-0.5 text-[11.5px] opacity-95">{result.message}</p>
                  <div className="tabular-mono mt-2 flex flex-wrap items-center gap-3 text-[11.5px] font-bold">
                    <span className="rounded-lg bg-white/80 px-2 py-0.5 text-emerald-800">
                      Terhapus: {formatNumberId(result.deletedCount)}
                    </span>
                    <span className="rounded-lg bg-white/80 px-2 py-0.5 text-[#0A2463]">
                      Sisa: {formatNumberId(result.remainingCount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Type HAPUS Guard (shown before first run or if previous run errored with 0 deleted) */}
          {!hasMoreToDelete && !isCompletedClean && (
            <div className="space-y-1.5">
              <label
                htmlFor="confirm-clear-google-input"
                className="block text-xs font-semibold text-[#0A2463]"
              >
                Ketik <span className="tabular-mono rounded bg-red-100 px-1.5 py-0.5 font-extrabold text-red-700">HAPUS</span> untuk mengonfirmasi pengosongan Google Kontak{' '}
                <strong>{account.label}</strong>:
              </label>
              <input
                id="confirm-clear-google-input"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                disabled={isClearing}
                placeholder="Ketik HAPUS di sini..."
                autoComplete="off"
                className="min-h-[42px] w-full rounded-xl border border-red-300/80 bg-white px-3.5 py-2 text-sm font-bold tracking-wider text-[#0A2463] outline-none focus:border-red-500 focus:ring-2 focus:ring-red-200 disabled:opacity-60"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#1D4ED8]/10 bg-[#F8FAFC]/90 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isClearing}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-[#1D4ED8]/20 bg-white px-4 py-2 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] disabled:opacity-50"
          >
            {isCompletedClean ? 'Selesai & Tutup' : 'Batal'}
          </button>

          {hasMoreToDelete ? (
            <button
              type="button"
              onClick={() => void onConfirmClear(account.id)}
              disabled={isClearing}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:from-red-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
            >
              {isClearing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isClearing
                  ? 'Menghapus Sisa...'
                  : `Lanjutkan Hapus Sisa (${formatNumberId(result?.remainingCount || 0)})`}
              </span>
            </button>
          ) : !isCompletedClean ? (
            <button
              type="button"
              onClick={() => void onConfirmClear(account.id)}
              disabled={!isConfirmed || isClearing}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:from-red-700 hover:to-rose-700 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0"
            >
              {isClearing ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{isClearing ? 'Mengosongkan...' : 'Kosongkan Google Kontak'}</span>
            </button>
          ) : (
            <a
              href={trashUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ocean-sheen inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white"
            >
              <span>Buka Sampah &amp; Hapus Permanen</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
