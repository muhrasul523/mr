import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Gauge,
  Info,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import {
  Contact,
  GoogleSyncStatus,
  TANPA_KATEGORI_LABEL,
  formatDisplayDateTime,
  getGenderShort,
  normalizePhoneForWA,
} from '../types/contact';
import { PaginationBar } from './PaginationBar';

interface AutoSyncPayload {
  enabled: boolean;
  intervalMinutes: number;
  batchLimit: number;
}

interface SyncSheetViewProps {
  syncContacts: Contact[];
  syncStatus: GoogleSyncStatus | null;
  isLoading: boolean;
  isSyncingBatch: boolean;
  isSavingAutoSync: boolean;
  isBusy: boolean;
  onSyncAllToGoogleContacts: () => Promise<void>;
  onConfigureAutoSync: (payload: AutoSyncPayload) => Promise<void>;
}

const INTERVAL_OPTIONS = [
  { value: 5, label: 'Setiap 5 Menit (Tercepat · Direkomendasikan)' },
  { value: 10, label: 'Setiap 10 Menit (Seimbang)' },
  { value: 15, label: 'Setiap 15 Menit (Hemat Trigger)' },
  { value: 30, label: 'Setiap 30 Menit (Santai)' },
  { value: 60, label: 'Setiap 1 Jam (Sangat Hemat)' },
];

const BATCH_OPTIONS = [
  { value: 50, label: '50 kontak / jalan (Ekstra Aman)' },
  { value: 70, label: '70 kontak / jalan (Direkomendasikan)' },
  { value: 80, label: '80 kontak / jalan (Maksimal Aman)' },
];

function getBarColor(pct: number): string {
  if (pct >= 85) return 'bg-red-600';
  if (pct >= 60) return 'bg-[#D97706]';
  return 'bg-gradient-to-r from-[#1D4ED8] to-[#0284C7]';
}

function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 menit';
  if (totalMinutes < 60) return `${Math.ceil(totalMinutes)} menit`;
  const totalHours = totalMinutes / 60;
  if (totalHours < 24) {
    const hrs = Math.floor(totalHours);
    const mins = Math.round((totalHours - hrs) * 60);
    return mins > 0 ? `${hrs} jam ${mins} menit` : `${hrs} jam`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = Math.round(totalHours % 24);
  return remHours > 0 ? `${days} hari ${remHours} jam` : `${days} hari`;
}

export function SyncSheetView({
  syncContacts,
  syncStatus,
  isLoading,
  isSyncingBatch,
  isSavingAutoSync,
  isBusy,
  onSyncAllToGoogleContacts,
  onConfigureAutoSync,
}: SyncSheetViewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const remoteAutoSync = syncStatus?.autoSync;
  const [draftInterval, setDraftInterval] = useState<number>(
    remoteAutoSync?.intervalMinutes || 5
  );
  const [draftBatchLimit, setDraftBatchLimit] = useState<number>(
    remoteAutoSync?.batchLimit || 70
  );

  useEffect(() => {
    if (remoteAutoSync) {
      setDraftInterval(remoteAutoSync.intervalMinutes || 5);
      setDraftBatchLimit(remoteAutoSync.batchLimit || 70);
    }
  }, [remoteAutoSync]);

  const isAutoEnabled = Boolean(remoteAutoSync?.enabled);
  const hasScheduleChanges =
    isAutoEnabled &&
    (draftInterval !== (remoteAutoSync?.intervalMinutes || 5) ||
      draftBatchLimit !== (remoteAutoSync?.batchLimit || 70));

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

  const totalInSyncSheet = syncStatus ? syncStatus.totalInSyncSheet : syncContacts.length;
  const syncedCount = syncStatus ? syncStatus.syncedCount : 0;
  const unsyncedCount = syncStatus ? syncStatus.unsyncedCount : syncContacts.length;
  const syncedPercent =
    totalInSyncSheet > 0
      ? Math.min(100, Math.round((syncedCount / totalInSyncSheet) * 100))
      : 100;

  const contactsPerHour = Math.round((60 / Math.max(1, draftInterval)) * draftBatchLimit);
  const estRemainingStages = unsyncedCount > 0 ? Math.ceil(unsyncedCount / draftBatchLimit) : 0;
  const estTotalMinutes = estRemainingStages * draftInterval;

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
      const waitText =
        quota.windowRemainingSec > 0 ? `${quota.windowRemainingSec}–90 detik` : '60–90 detik';
      return {
        tone: 'amber' as const,
        title: `Tunggu ±${waitText} Sebelum Sinkronkan Lagi`,
        body: `Kuota permintaan per menit Google People API sedang penuh. Biarkan jeda ±${waitText} agar jendela kuota reset otomatis, atau aktifkan Auto-Sync Terjadwal tiap 5 menit agar proses berjalan bertahap tanpa menabrak limit.`,
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
        title: 'Semua Kontak Sudah Tersinkron — Belum Perlu Sinkronisasi Manual',
        body: isAutoEnabled
          ? 'Auto-Sync Terjadwal sedang dalam Mode Hemat (0 kuota API). Begitu ada kontak baru di Kontak_Sync, server Google akan langsung menyinkronkannya otomatis.'
          : 'Seluruh kontak di Kontak_Sync sudah terdaftar di Google Kontak. Anda baru perlu menyinkronkan setelah menambah atau mengubah data.',
      };
    }
    if (unsyncedCount <= 75) {
      return {
        tone: 'blue' as const,
        title: `Siap Disinkronkan Sekarang (${unsyncedCount} kontak baru/belum sinkron)`,
        body: `Jumlah ini muat dalam 1 tahap proses (±5–25 detik) dan aman di bawah batas kuota tulis 90 kontak/menit. Klik Sinkronkan Manual sekarang atau biarkan Auto-Sync memprosesnya.`,
      };
    }
    const estBatches = Math.ceil(unsyncedCount / draftBatchLimit);
    return {
      tone: isAutoEnabled ? ('blue' as const) : ('amber' as const),
      title: isAutoEnabled
        ? `Auto-Sync Terjadwal Sedang Menangani Antrean (${unsyncedCount.toLocaleString('id-ID')} kontak tersisa)`
        : `Antrean Besar: ${unsyncedCount.toLocaleString('id-ID')} Kontak (±${estBatches.toLocaleString('id-ID')} Tahap Aman)`,
      body: isAutoEnabled
        ? `Server Google otomatis menyinkronkan hingga ${draftBatchLimit} kontak setiap ${draftInterval} menit (~${contactsPerHour.toLocaleString('id-ID')} kontak/jam) walau browser ditutup. Anda tetap dapat menekan tombol Manual kapan saja untuk mempercepat 1 tahap.`
        : `Untuk ribuan/puluhan ribu kontak, aktifkan Sinkronisasi Otomatis Terjadwal tiap 5 menit (70 kontak/jalan) di panel di bawah agar server Google menyinkronkan seluruh antrean secara bertahap dan aman tanpa perlu klik manual berulang-ulang.`,
    };
  }, [
    syncStatus,
    quota.windowRemainingSec,
    quota.googleContactsCount,
    unsyncedCount,
    isAutoEnabled,
    draftBatchLimit,
    draftInterval,
    contactsPerHour,
  ]);

  const readPct = Math.min(
    100,
    Math.round((quota.minuteReadsUsed / Math.max(1, quota.minuteReadsLimit)) * 100)
  );
  const writePct = Math.min(
    100,
    Math.round((quota.minuteWritesUsed / Math.max(1, quota.minuteWritesLimit)) * 100)
  );
  const contactsPct = Math.min(
    100,
    Math.round((quota.googleContactsCount / Math.max(1, quota.googleContactsLimit)) * 100)
  );

  const lastRunStatusLabel = useMemo(() => {
    const st = remoteAutoSync?.lastRunStatus || 'never';
    if (st === 'idle') return { text: 'Mode Hemat (0 Kuota)', cls: 'bg-emerald-50 text-emerald-800 border-emerald-500/25' };
    if (st === 'completed') return { text: 'Selesai 100%', cls: 'bg-emerald-50 text-emerald-800 border-emerald-500/25' };
    if (st === 'progress') return { text: 'Berjalan Bertahap', cls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#1D4ED8]/25' };
    if (st === 'error') return { text: 'Perlu Perhatian', cls: 'bg-red-50 text-red-800 border-red-500/25' };
    return { text: 'Menunggu Jadwal', cls: 'bg-slate-100 text-[#475569] border-slate-300/60' };
  }, [remoteAutoSync?.lastRunStatus]);

  return (
    <section className="space-y-5" aria-label="Sheet Sinkronisasi Google Kontak">
      {/* Status Sinkronisasi Google Kontak + Tombol Manual */}
      <div className="glass-surface rounded-[22px] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1D4ED8]/10 pb-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#0284C7] text-white">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0A2463]">
                Sheet Kontak_Sync &amp; Sinkronisasi Google Kontak
              </h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#475569]">
                Sheet <strong>Kontak_Sync</strong> tidak diubah oleh form aplikasi sehingga Anda bebas memakai rumus Spreadsheet atau edit manual langsung di Google Sheets. Anda dapat menyinkronkan secara <strong>Manual</strong> (instan 1 tahap) maupun <strong>Otomatis Terjadwal</strong> di server Google.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSyncAllToGoogleContacts}
            disabled={isBusy || isSyncingBatch || isLoading || isSavingAutoSync}
            className="btn-ocean-sheen inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 whitespace-nowrap shrink-0"
          >
            {isSyncingBatch || isBusy || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {isSyncingBatch
                ? 'Menyinkronkan Manual...'
                : isBusy || isLoading
                  ? 'Sedang Memuat...'
                  : 'Sinkronkan Sekarang (Manual)'}
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
              {totalInSyncSheet.toLocaleString('id-ID')}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="text-xs font-semibold text-[#475569]">Tersinkron vs Belum</div>
            <div className="tabular-mono mt-1.5 flex items-baseline gap-2 text-sm font-bold">
              <span className="text-xl text-emerald-800">
                {syncedCount.toLocaleString('id-ID')}
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

        {/* Panel Sinkronisasi Otomatis Terjadwal (Background Server Google 24/7) */}
        <div className="mt-4 rounded-2xl border border-[#1D4ED8]/20 bg-gradient-to-br from-white/95 via-[#F0F9FF]/85 to-[#EFF6FF]/90 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${
                  isAutoEnabled
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-600'
                    : 'bg-gradient-to-br from-[#0A2463] to-[#1D4ED8]'
                }`}
              >
                <Timer className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-[#0A2463]">
                    Sinkronisasi Otomatis Terjadwal (Server Google 24/7)
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold ${
                      isAutoEnabled
                        ? 'border-emerald-500/30 bg-emerald-50 text-emerald-800'
                        : 'border-slate-300/70 bg-slate-100 text-[#475569]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        isAutoEnabled ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'
                      }`}
                    />
                    {isAutoEnabled
                      ? `Aktif · Tiap ${remoteAutoSync?.intervalMinutes || 5} Menit`
                      : 'Nonaktif'}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[#475569]">
                  Dirancang khusus untuk <strong>20.000+ kontak</strong>. Berjalan otomatis langsung di server Google Apps Script meskipun browser, laptop, atau HP Anda ditutup. Setiap tahap memproses kontak secara aman di bawah limit 90/menit Google.
                </p>
              </div>
            </div>
          </div>

          {/* Progres Antrean Kontak & Estimasi Selesai */}
          <div className="mt-4 rounded-xl border border-[#1D4ED8]/14 bg-white/90 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#0A2463]">
                Progres Sinkronisasi Keseluruhan
              </span>
              <span className="tabular-mono font-bold text-[#0A2463]">
                {syncedCount.toLocaleString('id-ID')} / {totalInSyncSheet.toLocaleString('id-ID')} kontak ({syncedPercent}%)
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  syncedPercent >= 100
                    ? 'bg-emerald-600'
                    : 'bg-gradient-to-r from-[#0A2463] via-[#1D4ED8] to-[#0284C7]'
                }`}
                style={{ width: `${Math.max(syncedPercent, syncedCount > 0 ? 3 : 0)}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#475569]">
              <span>
                Kecepatan jadwal terpilih:{' '}
                <strong className="tabular-mono text-[#0A2463]">
                  ~{contactsPerHour.toLocaleString('id-ID')} kontak/jam
                </strong>{' '}
                ({draftBatchLimit} kontak tiap {draftInterval} menit)
              </span>
              <span className="tabular-mono">
                {unsyncedCount === 0 ? (
                  <strong className="text-emerald-800">Antrean tuntas (Mode Hemat siap)</strong>
                ) : (
                  <>
                    Sisa <strong className="text-[#B45309]">{unsyncedCount.toLocaleString('id-ID')}</strong> kontak · Estimasi{' '}
                    <strong className="text-[#0A2463]">
                      ±{estRemainingStages.toLocaleString('id-ID')} tahap ({formatDurationMinutes(estTotalMinutes)})
                    </strong>
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Form Pengaturan Interval, Batas Aman & Tombol Aktif/Matikan */}
          <div className="mt-3.5 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label
                htmlFor="auto-sync-interval"
                className="mb-1 block text-xs font-semibold text-[#0A2463]"
              >
                Interval Jadwal Otomatis
              </label>
              <select
                id="auto-sync-interval"
                value={draftInterval}
                onChange={(e) => setDraftInterval(Number(e.target.value))}
                disabled={isSavingAutoSync}
                className="min-h-[42px] w-full rounded-[10px] border border-[#1D4ED8]/20 bg-white px-3 py-2 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25 disabled:opacity-60"
              >
                {INTERVAL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="auto-sync-batch"
                className="mb-1 block text-xs font-semibold text-[#0A2463]"
              >
                Batas Aman per Jalan (Anti-Limit 90/mnt)
              </label>
              <select
                id="auto-sync-batch"
                value={draftBatchLimit}
                onChange={(e) => setDraftBatchLimit(Number(e.target.value))}
                disabled={isSavingAutoSync}
                className="min-h-[42px] w-full rounded-[10px] border border-[#1D4ED8]/20 bg-white px-3 py-2 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25 disabled:opacity-60"
              >
                {BATCH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isAutoEnabled ? (
                <button
                  type="button"
                  onClick={() =>
                    onConfigureAutoSync({
                      enabled: true,
                      intervalMinutes: draftInterval,
                      batchLimit: draftBatchLimit,
                    })
                  }
                  disabled={isSavingAutoSync || isSyncingBatch}
                  className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 md:flex-none whitespace-nowrap shrink-0"
                >
                  {isSavingAutoSync ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <PlayCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span>{isSavingAutoSync ? 'Mengaktifkan...' : 'Aktifkan Auto-Sync'}</span>
                </button>
              ) : (
                <>
                  {hasScheduleChanges && (
                    <button
                      type="button"
                      onClick={() =>
                        onConfigureAutoSync({
                          enabled: true,
                          intervalMinutes: draftInterval,
                          batchLimit: draftBatchLimit,
                        })
                      }
                      disabled={isSavingAutoSync || isSyncingBatch}
                      className="btn-ocean-sheen inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap shrink-0"
                    >
                      {isSavingAutoSync ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>Simpan Jadwal Baru</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onConfigureAutoSync({
                        enabled: false,
                        intervalMinutes: draftInterval,
                        batchLimit: draftBatchLimit,
                      })
                    }
                    disabled={isSavingAutoSync || isSyncingBatch}
                    className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-600/30 bg-red-50/90 px-4 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-55 md:flex-none whitespace-nowrap shrink-0"
                  >
                    {isSavingAutoSync ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <PauseCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{isSavingAutoSync ? 'Menyimpan...' : 'Matikan Auto-Sync'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Info Eksekusi Terakhir Auto-Sync */}
          {remoteAutoSync && (remoteAutoSync.lastRunAt || remoteAutoSync.lastRunDetail) && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1D4ED8]/12 bg-white/80 px-3.5 py-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-[#334155]">
                <span className="font-semibold text-[#0A2463]">Jalan Otomatis Terakhir:</span>
                <span className="tabular-mono font-semibold text-[#1D4ED8]">
                  {formatDisplayDateTime(remoteAutoSync.lastRunAt) || 'Menunggu siklus pertama'}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${lastRunStatusLabel.cls}`}
                >
                  {lastRunStatusLabel.text}
                </span>
              </div>
              {remoteAutoSync.lastRunDetail && (
                <span className="text-[11.5px] text-[#475569]">{remoteAutoSync.lastRunDetail}</span>
              )}
            </div>
          )}

          {/* Mode Hemat & Info Kuota Harian Apps Script */}
          <div className="mt-3 flex items-start gap-2 text-[11.5px] leading-relaxed text-[#475569]">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
            <p>
              <strong>Mode Hemat Otomatis:</strong> Setelah 100% kontak tersinkron, jadwal tetap siaga dengan <strong>0 kuota API</strong> (&lt; 1 detik) hingga Anda menambah/mengubah data baru. Untuk akun Gmail gratis (batas runtime trigger 90 menit/hari ≈ <strong>7.000–9.000 kontak baru/hari</strong>), antrean 20.000 kontak akan tuntas otomatis dalam ±2–3 hari tanpa perlu klik manual. Saat halaman ini terbuka, tampilan otomatis memuat ulang progres setiap 60 detik.
            </p>
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
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(readPct)}`}
                  style={{ width: `${Math.max(readPct, quota.minuteReadsUsed > 0 ? 5 : 0)}%` }}
                />
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
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(writePct)}`}
                  style={{ width: `${Math.max(writePct, quota.minuteWritesUsed > 0 ? 5 : 0)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                Sisa ~{Math.max(0, quota.minuteWritesLimit - quota.minuteWritesUsed)} kontak baru/ubah menit ini
              </p>
            </div>

            <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#475569]">Total di Google Kontak</span>
                <span className="tabular-mono font-bold text-[#0A2463]">
                  {quota.googleContactsCount.toLocaleString('id-ID')}/
                  {quota.googleContactsLimit.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                <div
                  className={`h-full rounded-full transition-all ${getBarColor(contactsPct)}`}
                  style={{ width: `${Math.max(contactsPct, quota.googleContactsCount > 0 ? 3 : 0)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-[#64748B]">
                Sisa kapasitas{' '}
                {Math.max(0, quota.googleContactsLimit - quota.googleContactsCount).toLocaleString(
                  'id-ID'
                )}{' '}
                kontak di akun Google
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
              <CheckCircle2
                className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
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
                    Tunggu sekitar <strong>60–90 detik</strong>, lalu klik tombol <strong>Sinkronkan Sekarang (Manual)</strong> atau aktifkan <strong>Auto-Sync Terjadwal tiap 5 menit</strong>.
                  </li>
                  <li>
                    Pastikan skrip <span className="tabular-mono font-semibold">Code.gs</span> di Apps Script sudah diperbarui dari tab <strong>GitHub &amp; Deploy</strong> dan di-deploy sebagai <strong>New version</strong>.
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
                <div className="font-bold">
                  Google Kontak Belum Aktif di Project Apps Script Anda
                </div>
                <p className="mt-1 leading-relaxed">
                  {syncStatus.error ||
                    'Layanan People API belum diaktifkan atau versi deployment Google Apps Script masih versi lama.'}
                </p>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed">
                  <li>
                    Salin kode terbaru dari tab <strong>GitHub &amp; Deploy</strong> (
                    <span className="tabular-mono font-semibold">backend-gas/Code.gs</span>) ke editor Apps Script Anda.
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
              Isi sheet <strong>Kontak_Sync</strong> secara manual atau pakai rumus di Google Spreadsheet (misalnya{' '}
              <span className="tabular-mono font-semibold">
                =FILTER(Kontak!A2:D, Kontak!A2:A&lt;&gt;&quot;&quot;)
              </span>
              ), lalu klik <strong>Sinkronkan Sekarang (Manual)</strong> atau aktifkan <strong>Auto-Sync Terjadwal</strong>.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-[#1D4ED8]/14 md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#0A2463] text-xs font-semibold text-white">
                    <th className="w-12 px-3 py-3 text-center whitespace-nowrap">No</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Nama di Google Kontak</th>
                    <th className="w-40 px-3 py-3 text-center whitespace-nowrap">No HP</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Kategori</th>
                    <th
                      className="w-14 px-2 py-3 text-center whitespace-nowrap"
                      title="Jenis Kelamin (L=Laki-laki, P=Perempuan, A=Admin)"
                    >
                      JK
                    </th>
                    <th className="w-40 px-3 py-3 text-center whitespace-nowrap">
                      Status Google Kontak
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D4ED8]/10 text-[13px]">
                  {paginatedRows.map((c, idx) => {
                    const globalNo = (safePage - 1) * pageSize + idx + 1;
                    const waPhone = normalizePhoneForWA(c.noHp);
                    const isQuotaPaused = Boolean(
                      syncStatus?.rateLimited && syncStatus.unsyncedPhones.length === 0
                    );
                    const isSynced = Boolean(
                      syncStatus?.connected &&
                        !isQuotaPaused &&
                        waPhone &&
                        !unsyncedSet.has(waPhone)
                    );
                    const genderShort = getGenderShort(c.jenisKelamin);
                    return (
                      <tr
                        key={`${waPhone}-${globalNo}`}
                        className="odd:bg-white/60 even:bg-[#EFF6FF]/85 transition-colors hover:bg-[#38BDF8]/15"
                      >
                        <td className="tabular-mono px-3 py-3 text-center text-xs font-semibold text-[#64748B]">
                          {globalNo}
                        </td>
                        <td className="px-3 py-3 text-left font-semibold text-[#061A40]">
                          <div className="line-clamp-2 break-words">{c.nama}</div>
                        </td>
                        <td className="tabular-mono px-3 py-3 text-center text-[13px] font-semibold text-[#1D4ED8] whitespace-nowrap">
                          {waPhone}
                        </td>
                        <td className="px-3 py-3 text-left text-[13px] font-semibold text-[#0284C7]">
                          <div className="line-clamp-2 break-words">
                            {c.kategori || (
                              <span className="font-normal text-[#64748B]">
                                {TANPA_KATEGORI_LABEL}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-2 py-3 text-center text-xs font-bold"
                          title={c.jenisKelamin}
                        >
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold ${
                              genderShort === 'P'
                                ? 'bg-pink-500/12 text-pink-700'
                                : genderShort === 'A'
                                  ? 'bg-amber-500/15 text-[#B45309]'
                                  : 'bg-[#1D4ED8]/10 text-[#1D4ED8]'
                            }`}
                          >
                            {genderShort}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center whitespace-nowrap">
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
