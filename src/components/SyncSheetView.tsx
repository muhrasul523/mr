import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  Contact,
  GoogleSyncStatus,
  TANPA_KATEGORI_LABEL,
  formatDisplayDateTime,
  normalizePhoneForWA,
} from '../types/contact';
import { PaginationBar } from './PaginationBar';

interface SyncSheetViewProps {
  syncContacts: Contact[];
  syncStatus: GoogleSyncStatus | null;
  isLoading: boolean;
  isSyncingBatch: boolean;
  isBusy: boolean;
  onSyncAllToGoogleContacts: () => Promise<void>;
}

function getBarColor(pct: number): string {
  if (pct >= 85) return 'bg-red-600';
  if (pct >= 60) return 'bg-[#D97706]';
  return 'bg-gradient-to-r from-[#1D4ED8] to-[#0284C7]';
}

export function SyncSheetView({
  syncContacts,
  syncStatus,
  isLoading,
  isSyncingBatch,
  isBusy,
  onSyncAllToGoogleContacts,
}: SyncSheetViewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const unsyncedSet = useMemo(
    () =>
      new Set(
        (syncStatus?.unsyncedPhones || []).map((p) => normalizePhoneForWA(p))
      ),
    [syncStatus]
  );

  const quota = syncStatus?.quota || {
    minuteReadsUsed: 0,
    minuteReadsLimit: 90,
    minuteWritesUsed: 0,
    minuteWritesLimit: 90,
    dailyRequestsUsed: 0,
    dailyRequestsLimit: 20000,
    googleContactsCount: 0,
    googleContactsLimit: 25000,
    windowRemainingSec: 0,
  };

  const unsyncedCount = syncStatus ? syncStatus.unsyncedCount : syncContacts.length;
  const totalPages = Math.max(1, Math.ceil(syncContacts.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRows = useMemo(
    () => syncContacts.slice((safePage - 1) * pageSize, safePage * pageSize),
    [syncContacts, safePage, pageSize]
  );

  const recommendation = useMemo(() => {
    if (syncStatus && !syncStatus.connected && !syncStatus.rateLimited) {
      return {
        tone: 'amber' as const,
        title: 'Hubungkan People API Terlebih Dahulu',
        body: 'Aktifkan layanan People API di Apps Script dan lakukan Deploy New version sebelum menyinkronkan kontak.',
      };
    }
    if (syncStatus?.rateLimited) {
      const waitText = quota.windowRemainingSec > 0 ? `${quota.windowRemainingSec}–90 detik` : '60–90 detik';
      return {
        tone: 'amber' as const,
        title: `Tunggu ±${waitText} Sebelum Sinkronkan Lagi`,
        body: `Kuota permintaan per menit Google People API sedang penuh. Biarkan jeda ±${waitText} agar jendela kuota reset otomatis, lalu klik Sinkronkan lagi.`,
      };
    }
    if (quota.googleContactsCount >= 23000) {
      return {
        tone: 'red' as const,
        title: 'Peringatan Kapasitas Akun Google Kontak (Maks 25.000)',
        body: `Google Kontak Anda sudah menampung ${quota.googleContactsCount.toLocaleString('id-ID')} dari batas 25.000 kontak. Pertimbangkan membersihkan kontak lama sebelum menambah ribuan data baru.`,
      };
    }
    if (unsyncedCount === 0) {
      return {
        tone: 'emerald' as const,
        title: 'Semua Kontak Sudah Tersinkron — Belum Perlu Sinkronisasi',
        body: 'Seluruh kontak di Kontak_Sync sudah terdaftar di Google Kontak. Anda baru perlu menekan tombol Sinkronkan setelah menambah atau mengubah data.',
      };
    }
    if (unsyncedCount <= 60) {
      return {
        tone: 'blue' as const,
        title: `Siap Disinkronkan Sekarang (${unsyncedCount} kontak baru/belum sinkron)`,
        body: `Jumlah ini muat dalam 1 tahap proses (±5–20 detik) dan aman di bawah batas kuota tulis 90 kontak/menit. Jika masih ada kontak lain yang ingin Anda input, selesaikan dulu lalu klik Sinkronkan sekali di akhir.`,
      };
    }
    const estBatches = Math.ceil(unsyncedCount / 65);
    if (unsyncedCount <= 300) {
      return {
        tone: 'blue' as const,
        title: `Disarankan Sinkronisasi Batch Setelah Selesai Input (${unsyncedCount} kontak)`,
        body: `Perkiraan proses ±${estBatches} tahap (dengan jeda ±1 menit bila kuota menit penuh). Pastikan seluruh pengisian/rumus sudah selesai agar tidak mengulang pemakaian kuota.`,
      };
    }
    return {
      tone: 'amber' as const,
      title: `Antrean Besar: ${unsyncedCount.toLocaleString('id-ID')} Kontak (Estimasi ±${estBatches} Tahap Bertahap)`,
      body: `Google membatasi penulisan ±60–90 kontak/menit dan Apps Script maksimal 6 menit per run. Anda dapat menyinkronkan bertahap tiap 1–2 menit (kontak yang sudah masuk otomatis dilewati), atau untuk pengisian awal ribuan kontak lebih cepat pakai Unduh CSV/vCard lalu Impor langsung di contacts.google.com.`,
    };
  }, [syncStatus, quota.windowRemainingSec, quota.googleContactsCount, unsyncedCount]);

  const readPct = Math.min(100, Math.round((quota.minuteReadsUsed / Math.max(1, quota.minuteReadsLimit)) * 100));
  const writePct = Math.min(100, Math.round((quota.minuteWritesUsed / Math.max(1, quota.minuteWritesLimit)) * 100));
  const contactsPct = Math.min(100, Math.round((quota.googleContactsCount / Math.max(1, quota.googleContactsLimit)) * 100));

  return (
    <section className="space-y-5" aria-label="Sheet Sinkronisasi Google Kontak">
      {/* Status Sinkronisasi Google Kontak */}
      <div className="glass-surface rounded-[22px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1D4ED8]/10 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#0284C7] text-white">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0A2463]">
                Sheet Kontak_Sync &amp; Status Google Kontak
              </h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#475569]">
                Sheet <strong>Kontak_Sync</strong> tidak diubah oleh form aplikasi sehingga Anda bebas memakai rumus Spreadsheet atau edit manual langsung di Google Sheets. Aplikasi hanya <strong>membaca</strong> sheet ini lalu menyinkronkannya ke Google Kontak.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSyncAllToGoogleContacts}
            disabled={isBusy || isSyncingBatch || isLoading}
            className="btn-ocean-sheen inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 whitespace-nowrap shrink-0"
          >
            {isSyncingBatch || isBusy || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {isSyncingBatch
                ? 'Menyinkronkan...'
                : isBusy || isLoading
                  ? 'Sedang Memuat...'
                  : 'Sinkronkan Kontak_Sync ke Google Kontak'}
            </span>
          </button>
        </div>

        {/* Status Metrics */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="text-xs font-semibold text-[#475569]">Koneksi Google Kontak</div>
            <div className="mt-1.5 flex items-center gap-2 text-sm font-bold">
              {syncStatus?.rateLimited ? (
                <>
                  <Clock className="h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
                  <span className="text-[#B45309]">
                    Jeda Kuota API ({syncStatus.engine})
                  </span>
                </>
              ) : syncStatus?.connected ? (
                <>
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                  <span className="text-emerald-800">
                    Terhubung ({syncStatus.engine})
                  </span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
                  <span className="text-[#B45309]">
                    {syncStatus ? 'Belum Terhubung' : 'Memeriksa...'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="text-xs font-semibold text-[#475569]">Total di Kontak_Sync</div>
            <div className="tabular-mono mt-1.5 text-xl font-bold text-[#0A2463]">
              {(syncStatus ? syncStatus.totalInSyncSheet : syncContacts.length).toLocaleString('id-ID')}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="text-xs font-semibold text-[#475569]">Tersinkron vs Belum</div>
            <div className="tabular-mono mt-1.5 flex items-baseline gap-2 text-sm font-bold">
              <span className="text-xl text-emerald-800">
                {(syncStatus ? syncStatus.syncedCount : 0).toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-semibold text-[#475569]">tersinkron ·</span>
              <span className="text-xl text-[#B45309]">
                {unsyncedCount.toLocaleString('id-ID')}
              </span>
              <span className="text-xs font-semibold text-[#475569]">belum</span>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#475569]">
              <Clock className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
              <span>Sinkron Terakhir</span>
            </div>
            <div className="tabular-mono mt-1.5 text-[13px] font-bold text-[#0A2463]">
              {formatDisplayDateTime(syncStatus?.lastSyncAt) || 'Belum pernah dijalankan'}
            </div>
          </div>
        </div>

        {/* Monitor Kuota API & Saran Sinkronisasi */}
        <div className="mt-4 rounded-2xl border border-[#1D4ED8]/14 bg-white/75 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#0A2463]">
              <Gauge className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
              <span>Monitor Kuota Google People API &amp; Kapasitas Kontak</span>
            </div>
            <span className="tabular-mono text-[11px] font-medium text-[#64748B]">
              {quota.windowRemainingSec > 0
                ? `Reset jendela menit dalam ~${quota.windowRemainingSec} dtk · Harian: ${quota.dailyRequestsUsed.toLocaleString('id-ID')}/${quota.dailyRequestsLimit.toLocaleString('id-ID')} req`
                : `Jendela kuota menit siap · Harian tercatat: ${quota.dailyRequestsUsed.toLocaleString('id-ID')}/${quota.dailyRequestsLimit.toLocaleString('id-ID')} req`}
            </span>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#475569]">Kuota Baca / Menit</span>
                <span className="tabular-mono font-bold text-[#0A2463]">
                  {quota.minuteReadsUsed}/{quota.minuteReadsLimit}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                <div className={`h-full rounded-full transition-all ${getBarColor(readPct)}`} style={{ width: `${Math.max(readPct, quota.minuteReadsUsed > 0 ? 5 : 0)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                Sisa ~{Math.max(0, quota.minuteReadsLimit - quota.minuteReadsUsed)} req · 1 req ≈ 1.000 kontak
              </p>
            </div>

            <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#475569]">Kuota Tulis / Menit</span>
                <span className="tabular-mono font-bold text-[#0A2463]">
                  {quota.minuteWritesUsed}/{quota.minuteWritesLimit}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                <div className={`h-full rounded-full transition-all ${getBarColor(writePct)}`} style={{ width: `${Math.max(writePct, quota.minuteWritesUsed > 0 ? 5 : 0)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                Sisa ~{Math.max(0, quota.minuteWritesLimit - quota.minuteWritesUsed)} kontak baru/ubah menit ini
              </p>
            </div>

            <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#475569]">Total di Google Kontak</span>
                <span className="tabular-mono font-bold text-[#0A2463]">
                  {quota.googleContactsCount.toLocaleString('id-ID')}/{quota.googleContactsLimit.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                <div className={`h-full rounded-full transition-all ${getBarColor(contactsPct)}`} style={{ width: `${Math.max(contactsPct, quota.googleContactsCount > 0 ? 3 : 0)}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                Sisa kapasitas {(Math.max(0, quota.googleContactsLimit - quota.googleContactsCount)).toLocaleString('id-ID')} kontak di akun Google
              </p>
            </div>
          </div>

          {/* Smart Sync Recommendation */}
          <div
            className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${
              recommendation.tone === 'emerald'
                ? 'border-emerald-500/25 bg-emerald-50/85 text-emerald-950'
                : recommendation.tone === 'red'
                  ? 'border-red-500/30 bg-red-50/90 text-red-950'
                  : recommendation.tone === 'amber'
                    ? 'border-amber-500/30 bg-amber-50/90 text-[#78350F]'
                    : 'border-[#1D4ED8]/18 bg-[#EFF6FF]/90 text-[#0A2463]'
            }`}
          >
            {recommendation.tone === 'red' ? (
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
            ) : recommendation.tone === 'amber' ? (
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
            ) : recommendation.tone === 'emerald' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
            ) : (
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            )}
            <div>
              <div className="font-bold">{recommendation.title}</div>
              <p className="mt-0.5 text-xs opacity-90">{recommendation.body}</p>
            </div>
          </div>
        </div>

        {/* Rate Limit Notice vs Disconnected Setup Guide */}
        {syncStatus?.rateLimited ? (
          <div className="mt-4 rounded-2xl border border-amber-500/35 bg-amber-50/90 p-4 text-[13px] text-[#78350F]">
            <div className="flex items-start gap-2.5">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
              <div>
                <div className="font-bold">
                  Batas Permintaan Per Menit Google People API Tercapai
                </div>
                <p className="mt-1 leading-relaxed">
                  Google membatasi jumlah permintaan baca/tulis Google Kontak per menit per akun. Ini normal jika Anda baru menyinkronkan atau membuka ulang data berkali-kali dalam waktu singkat.
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed">
                  <li>
                    Tunggu sekitar <strong>60–90 detik</strong>, lalu klik tombol <strong>Sinkronkan Kontak_Sync ke Google Kontak</strong> di atas.
                  </li>
                  <li>
                    Pastikan Anda sudah memperbarui skrip <span className="tabular-mono font-semibold">Code.gs</span> di Apps Script dari tab <strong>GitHub &amp; Deploy</strong> (versi terbaru sudah memakai <em>cache 5 menit</em>, <em>cooldown auto-sync</em>, dan melewati kontak yang datanya sama agar hemat kuota untuk puluhan ribu kontak).
                  </li>
                </ul>
                {syncStatus.error && (
                  <p className="tabular-mono mt-2 rounded-lg bg-white/70 px-2.5 py-1.5 text-[11px] text-[#92400E]">
                    Detail: {syncStatus.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : syncStatus && !syncStatus.connected ? (
          <div className="mt-4 rounded-2xl border border-amber-500/35 bg-amber-50/90 p-4 text-[13px] text-[#78350F]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
              <div>
                <div className="font-bold">Google Kontak Belum Aktif di Project Apps Script Anda</div>
                <p className="mt-1 leading-relaxed">
                  {syncStatus.error ||
                    'Layanan People API belum diaktifkan atau versi deployment Google Apps Script masih versi lama.'}
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed">
                  <li>
                    Salin kode terbaru dari tab <strong>GitHub &amp; Deploy</strong> (<span className="tabular-mono font-semibold">backend-gas/Code.gs</span>) ke editor Apps Script Anda.
                  </li>
                  <li>
                    Di menu kiri editor Apps Script, klik <strong>Services (+) &rarr; People API &rarr; Add</strong>.
                  </li>
                  <li>
                    Jalankan fungsi <span className="tabular-mono font-semibold">setupdatabase()</span> dan berikan izin akses Google Kontak.
                  </li>
                  <li>
                    Klik <strong>Deploy &rarr; Manage deployments &rarr; Edit &rarr; New version &rarr; Deploy</strong>.
                  </li>
                </ol>
              </div>
            </div>
          </div>
        ) : null}

        {syncStatus?.connected && !syncStatus.rateLimited && unsyncedCount > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#1D4ED8]/15 bg-[#EFF6FF]/90 px-4 py-3 text-[13px] text-[#0A2463]">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
              <span>
                Terdapat <strong>{unsyncedCount.toLocaleString('id-ID')} kontak</strong> di <strong>Kontak_Sync</strong> yang belum ada di Google Kontak Anda.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Table Read-Only Kontak_Sync with Pagination */}
      <div className="glass-surface rounded-[22px] p-5 sm:p-6">
        {isLoading && syncContacts.length === 0 ? (
          <div className="space-y-2.5 py-2">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-11 animate-pulse rounded-xl bg-[#1D4ED8]/8" />
            ))}
          </div>
        ) : syncContacts.length === 0 ? (
          <div className="py-12 text-center">
            <h3 className="text-base font-bold text-[#0A2463]">Sheet Kontak_Sync masih kosong</h3>
            <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[#475569]">
              Isi sheet <strong>Kontak_Sync</strong> secara manual atau pakai rumus di Google Spreadsheet (misalnya <span className="tabular-mono font-semibold">=FILTER(Kontak!A2:D, Kontak!A2:A&lt;&gt;&quot;&quot;)</span>), lalu klik tombol <strong>Sinkronkan Kontak_Sync ke Google Kontak</strong> di atas.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[#1D4ED8]/12 text-xs font-semibold text-[#64748B]">
                    <th className="w-12 px-3 py-2.5 whitespace-nowrap">No</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Nama di Google Kontak</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">No HP</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Kategori</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Jenis Kelamin</th>
                    <th className="px-3 py-2.5 text-right whitespace-nowrap">Status Google Kontak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D4ED8]/8 text-[13.5px]">
                  {paginatedRows.map((c, idx) => {
                    const globalNo = (safePage - 1) * pageSize + idx + 1;
                    const waPhone = normalizePhoneForWA(c.noHp);
                    const isQuotaPaused = Boolean(
                      syncStatus?.rateLimited && syncStatus.unsyncedPhones.length === 0
                    );
                    const isSynced = Boolean(
                      syncStatus?.connected && !isQuotaPaused && waPhone && !unsyncedSet.has(waPhone)
                    );
                    return (
                      <tr
                        key={`${waPhone}-${globalNo}`}
                        className="odd:bg-white/40 even:bg-[#EFF6FF]/75 transition-colors hover:bg-[#38BDF8]/12"
                      >
                        <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                          {globalNo}
                        </td>
                        <td className="px-3 py-3 font-semibold text-[#061A40]">{c.nama}</td>
                        <td className="tabular-mono px-3 py-3 text-[13px] font-semibold text-[#1D4ED8]">
                          {waPhone}
                        </td>
                        <td className="px-3 py-3 text-[13px] font-semibold text-[#0284C7]">
                          {c.kategori || (
                            <span className="font-normal text-[#64748B]">{TANPA_KATEGORI_LABEL}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-[13px] text-[#475569]">{c.jenisKelamin}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {!syncStatus?.connected ? (
                            <span className="text-xs font-semibold text-[#B45309]">
                              Menunggu Koneksi GAS
                            </span>
                          ) : isQuotaPaused ? (
                            <span className="text-xs font-semibold text-[#B45309]">
                              Menunggu Jeda Kuota
                            </span>
                          ) : isSynced ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Tersinkron
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-[#B45309]">
                              Belum Tersinkron
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards for Kontak_Sync */}
            <div className="flex flex-col gap-3 md:hidden">
              {paginatedRows.map((c, idx) => {
                const globalNo = (safePage - 1) * pageSize + idx + 1;
                const waPhone = normalizePhoneForWA(c.noHp);
                const isQuotaPaused = Boolean(
                  syncStatus?.rateLimited && syncStatus.unsyncedPhones.length === 0
                );
                const isSynced = Boolean(
                  syncStatus?.connected && !isQuotaPaused && waPhone && !unsyncedSet.has(waPhone)
                );
                return (
                  <article
                    key={`${waPhone}-${globalNo}`}
                    className="rounded-[14px] border border-[#1D4ED8]/14 odd:bg-white/85 even:bg-[#EFF6FF]/85 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="tabular-mono text-xs font-bold text-[#64748B]">
                          #{globalNo}{' '}
                        </span>
                        <span className="text-[14px] font-bold text-[#061A40]">{c.nama}</span>
                      </div>
                      <span
                        className={`text-xs font-semibold whitespace-nowrap ${
                          isSynced ? 'text-emerald-800' : 'text-[#B45309]'
                        }`}
                      >
                        {!syncStatus?.connected
                          ? 'Belum Aktif'
                          : isQuotaPaused
                            ? 'Jeda Kuota'
                            : isSynced
                              ? 'Tersinkron'
                              : 'Belum Sinkron'}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
                      <span className="tabular-mono font-semibold text-[#1D4ED8]">{waPhone}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.kategori || TANPA_KATEGORI_LABEL}</span>
                      <span aria-hidden="true">·</span>
                      <span>{c.jenisKelamin}</span>
                    </div>
                  </article>
                );
              })}
            </div>

            <PaginationBar
              totalItems={syncContacts.length}
              currentPage={safePage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              itemLabel="kontak sinkron"
            />
          </>
        )}
      </div>
    </section>
  );
}
