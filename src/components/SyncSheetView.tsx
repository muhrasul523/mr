import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  ExternalLink,
  FileSpreadsheet,
  Filter,
  Gauge,
  Loader2,
  Mail,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Search,
  SearchCheck,
  Settings2,
  ShieldAlert,
  Timer,
  Users,
  Zap,
} from 'lucide-react';
import {
  CategoryItem,
  Contact,
  GENDER_OPTIONS,
  GenderOption,
  GoogleAccountConfig,
  GoogleCsvExportOptions,
  GoogleCsvExportPlan,
  GoogleSyncStatus,
  TANPA_AKUN_ID,
  TANPA_KATEGORI_LABEL,
  formatDisplayDateTime,
  formatNumberId,
  getAccountLabelById,
  getGenderShort,
  normalizePhoneForWA,
  parseStoredAccountIds,
  resolveEffectiveAccountId,
} from '../types/contact';
import { PaginationBar } from './PaginationBar';

interface AutoSyncPayload {
  enabled: boolean;
  intervalMinutes: number;
  batchLimit: number;
}

export interface LastStageSummary {
  added: number;
  created: number;
  updated: number;
  at: string;
  mode: 'manual' | 'auto';
}

interface SyncSheetViewProps {
  syncContacts: Contact[];
  categories: CategoryItem[];
  accounts: GoogleAccountConfig[];
  syncStatus: GoogleSyncStatus | null;
  isLoading: boolean;
  isSyncingBatch: boolean;
  isSavingAutoSync: boolean;
  isVerifyingLive: boolean;
  isBusy: boolean;
  lastStageSummary?: LastStageSummary | null;
  serverClockOffsetMs?: number;
  onSyncAllToGoogleContacts: () => Promise<void>;
  onConfigureAutoSync: (payload: AutoSyncPayload) => Promise<void>;
  onVerifyGoogleSyncLive: () => Promise<void>;
  onFetchGoogleCsvPlan: (
    options: GoogleCsvExportOptions
  ) => Promise<GoogleCsvExportPlan | null>;
  onDownloadGoogleCsvPart: (
    part: number,
    options: GoogleCsvExportOptions
  ) => Promise<boolean>;
  onOpenAccountManager: () => void;
  onPollStatusNow?: () => void;
}

const INTERVAL_OPTIONS = [
  { value: 5, label: 'Setiap 5 Menit (Tercepat)' },
  { value: 10, label: 'Setiap 10 Menit (Seimbang)' },
  { value: 15, label: 'Setiap 15 Menit (Hemat)' },
  { value: 30, label: 'Setiap 30 Menit (Santai)' },
  { value: 60, label: 'Setiap 1 Jam' },
];

const BATCH_OPTIONS = [
  { value: 80, label: '80 kontak / tahap (Stabil · ~960/jam)' },
  { value: 150, label: '150 kontak / tahap (Cepat · Batch API · ~1.800/jam)' },
  { value: 200, label: '200 kontak / tahap (Maksimal · Batch API · ~2.400/jam)' },
  { value: 300, label: '300 kontak / tahap (Turbo · Batch API · ~3.600/jam)' },
];

function getBarColor(pct: number): string {
  if (pct >= 85) return 'bg-red-600';
  if (pct >= 60) return 'bg-[#D97706]';
  return 'bg-gradient-to-r from-[#1D4ED8] to-[#0284C7]';
}

function formatDurationMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 menit';
  if (totalMinutes < 60) return `${formatNumberId(Math.ceil(totalMinutes))} menit`;
  const totalHours = totalMinutes / 60;
  if (totalHours < 24) {
    const hrs = Math.floor(totalHours);
    const mins = Math.round((totalHours - hrs) * 60);
    return mins > 0 ? `${formatNumberId(hrs)} jam ${mins} menit` : `${formatNumberId(hrs)} jam`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = Math.round(totalHours % 24);
  return remHours > 0 ? `${formatNumberId(days)} hari ${remHours} jam` : `${formatNumberId(days)} hari`;
}

function formatCountdownClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function formatPercentLabel(synced: number, total: number): { num: number; label: string } {
  if (total <= 0) return { num: 100, label: '100%' };
  const raw = Math.min(100, Math.max(0, (synced / total) * 100));
  if (raw === 0) return { num: 0, label: '0%' };
  if (raw >= 100 || synced >= total) return { num: 100, label: '100%' };
  return {
    num: raw,
    label: `${raw.toFixed(1).replace('.', ',')}%`,
  };
}

export function SyncSheetView({
  syncContacts,
  categories,
  accounts,
  syncStatus,
  isLoading,
  isSyncingBatch,
  isSavingAutoSync,
  isVerifyingLive,
  isBusy,
  lastStageSummary,
  serverClockOffsetMs = 0,
  onSyncAllToGoogleContacts,
  onConfigureAutoSync,
  onVerifyGoogleSyncLive,
  onFetchGoogleCsvPlan,
  onDownloadGoogleCsvPart,
  onOpenAccountManager,
  onPollStatusNow,
}: SyncSheetViewProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [showQuotaDetails, setShowQuotaDetails] = useState(false);
  const [showMassCsvPanel, setShowMassCsvPanel] = useState(false);
  const [csvOnlyUnsynced, setCsvOnlyUnsynced] = useState(true);
  const [selectedCsvAccountId, setSelectedCsvAccountId] = useState<string>('ALL');
  const [selectedCsvCategories, setSelectedCsvCategories] = useState<string[]>([]);
  const [csvCatSearch, setCsvCatSearch] = useState('');
  const [showCsvCatPicker, setShowCsvCatPicker] = useState(false);
  const [selectedCsvGender, setSelectedCsvGender] = useState<'ALL' | GenderOption>('ALL');
  const [selectedCsvChunkSize, setSelectedCsvChunkSize] = useState<number>(2500);
  const [csvPlan, setCsvPlan] = useState<GoogleCsvExportPlan | null>(null);
  const [isLoadingCsvPlan, setIsLoadingCsvPlan] = useState(false);
  const [downloadingCsvPart, setDownloadingCsvPart] = useState<number | null>(null);
  const [downloadedParts, setDownloadedParts] = useState<number[]>([]);
  const [nowTickMs, setNowTickMs] = useState(() => Date.now());
  const manualStartedAtRef = useRef<number>(0);
  const zeroTriggeredRef = useRef<number>(0);

  useEffect(() => {
    if (
      selectedCsvAccountId !== 'ALL' &&
      selectedCsvAccountId !== TANPA_AKUN_ID &&
      !accounts.some((a) => a.id === selectedCsvAccountId)
    ) {
      setSelectedCsvAccountId('ALL');
    }
  }, [accounts, selectedCsvAccountId]);

  const remoteAutoSync = syncStatus?.autoSync;
  const liveProgress = syncStatus?.liveProgress;
  const isServerSyncActive = Boolean(liveProgress?.active);
  const isActivelySyncing = isSyncingBatch || isServerSyncActive;
  const isAutoEnabled = Boolean(remoteAutoSync?.enabled);

  const [draftInterval, setDraftInterval] = useState<number>(
    remoteAutoSync?.intervalMinutes || 5
  );
  const [draftBatchLimit, setDraftBatchLimit] = useState<number>(
    remoteAutoSync?.batchLimit && BATCH_OPTIONS.some((o) => o.value === remoteAutoSync.batchLimit)
      ? remoteAutoSync.batchLimit
      : 150
  );

  useEffect(() => {
    if (remoteAutoSync) {
      setDraftInterval(remoteAutoSync.intervalMinutes || 5);
      if (
        remoteAutoSync.batchLimit &&
        BATCH_OPTIONS.some((o) => o.value === remoteAutoSync.batchLimit)
      ) {
        setDraftBatchLimit(remoteAutoSync.batchLimit);
      }
    }
  }, [remoteAutoSync]);

  const buildCsvOptions = (overrides?: Partial<GoogleCsvExportOptions>): GoogleCsvExportOptions => ({
    onlyUnsynced: overrides?.onlyUnsynced ?? csvOnlyUnsynced,
    accountId: overrides?.accountId ?? selectedCsvAccountId,
    categories: overrides?.categories ?? selectedCsvCategories,
    gender: overrides?.gender ?? selectedCsvGender,
    chunkSize: overrides?.chunkSize ?? selectedCsvChunkSize,
  });

  const handlePrepareCsvPlan = async (overrides?: Partial<GoogleCsvExportOptions>) => {
    const opts = buildCsvOptions(overrides);
    setIsLoadingCsvPlan(true);
    setDownloadedParts([]);
    try {
      const plan = await onFetchGoogleCsvPlan(opts);
      if (plan) {
        setCsvPlan(plan);
      }
    } finally {
      setIsLoadingCsvPlan(false);
    }
  };

  const handleDownloadCsvBatch = async (part: number) => {
    if (!csvPlan || downloadingCsvPart !== null) return;
    setDownloadingCsvPart(part);
    try {
      const opts = buildCsvOptions({
        onlyUnsynced: csvPlan.onlyUnsynced,
        accountId: csvPlan.accountId || selectedCsvAccountId,
        chunkSize: csvPlan.isSingleFile ? 0 : csvPlan.chunkSize,
      });
      const ok = await onDownloadGoogleCsvPart(part, opts);
      if (ok) {
        setDownloadedParts((prev) => (prev.includes(part) ? prev : [...prev, part]));
      }
    } finally {
      setDownloadingCsvPart(null);
    }
  };

  const toggleCsvCategory = (catName: string) => {
    setSelectedCsvCategories((prev) =>
      prev.includes(catName) ? prev.filter((item) => item !== catName) : [...prev, catName]
    );
  };

  const syncCategoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    let uncat = 0;
    for (const c of syncContacts) {
      const clean = String(c.kategori || '').trim();
      if (!clean) uncat += 1;
      else counts.set(clean, (counts.get(clean) || 0) + 1);
    }
    const mergedNames: string[] = [];
    const seen = new Set<string>();
    for (const cat of categories) {
      const key = cat.nama.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        mergedNames.push(cat.nama);
      }
    }
    for (const name of counts.keys()) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        mergedNames.push(name);
      }
    }
    return {
      items: mergedNames.map((name) => ({ name, count: counts.get(name) || 0 })),
      uncategorizedCount: uncat,
    };
  }, [categories, syncContacts]);

  const filteredCsvCategories = useMemo(() => {
    const q = csvCatSearch.trim().toLowerCase();
    if (!q) return syncCategoryOptions.items;
    return syncCategoryOptions.items.filter((item) => item.name.toLowerCase().includes(q));
  }, [syncCategoryOptions.items, csvCatSearch]);

  useEffect(() => {
    if (isSyncingBatch) {
      if (!manualStartedAtRef.current) manualStartedAtRef.current = Date.now();
    } else {
      manualStartedAtRef.current = 0;
    }
  }, [isSyncingBatch]);

  // 1-second ticker for live countdown and elapsed timer
  useEffect(() => {
    if (!isAutoEnabled && !isActivelySyncing) return;
    setNowTickMs(Date.now());
    const id = setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [isAutoEnabled, isActivelySyncing]);

  const syncedServerNowMs = nowTickMs + serverClockOffsetMs;
  const nextRunAtMs = remoteAutoSync?.nextRunAtMs || 0;
  const countdownSec =
    isAutoEnabled && nextRunAtMs > 0
      ? Math.max(0, Math.ceil((nextRunAtMs - syncedServerNowMs) / 1000))
      : null;

  // Trigger an immediate lightweight poll right when countdown hits 00:00
  useEffect(() => {
    if (countdownSec === 0 && isAutoEnabled && !isActivelySyncing && onPollStatusNow) {
      const now = Date.now();
      if (now - zeroTriggeredRef.current > 8000) {
        zeroTriggeredRef.current = now;
        onPollStatusNow();
      }
    }
  }, [countdownSec, isAutoEnabled, isActivelySyncing, onPollStatusNow]);

  const hasScheduleChanges =
    isAutoEnabled &&
    (draftInterval !== (remoteAutoSync?.intervalMinutes || 5) ||
      draftBatchLimit !== (remoteAutoSync?.batchLimit || 80));

  const unsyncedSet = useMemo(
    () =>
      new Set(
        (syncStatus?.unsyncedPhones || []).map((p) => normalizePhoneForWA(p))
      ),
    [syncStatus?.unsyncedPhones]
  );

  // Map normalized phone -> list of account IDs where it is ACTUALLY saved in Google Contacts
  const phoneSavedAccountsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    const byAcc = syncStatus?.syncedPhonesByAccount || {};
    for (const [accId, phones] of Object.entries(byAcc)) {
      if (!Array.isArray(phones)) continue;
      for (const rawPhone of phones) {
        const norm = normalizePhoneForWA(rawPhone);
        if (!norm) continue;
        const arr = map.get(norm);
        if (arr) {
          if (!arr.includes(accId)) arr.push(accId);
        } else {
          map.set(norm, [accId]);
        }
      }
    }
    return map;
  }, [syncStatus?.syncedPhonesByAccount]);

  const hasLiveAccountMap = useMemo(
    () => Object.keys(syncStatus?.syncedPhonesByAccount || {}).length > 0,
    [syncStatus?.syncedPhonesByAccount]
  );

  const getActualSavedAccounts = (c: Contact, waPhone: string): string[] => {
    if (hasLiveAccountMap) {
      return waPhone ? phoneSavedAccountsMap.get(waPhone) || [] : [];
    }
    return parseStoredAccountIds(c.akun, accounts);
  };

  const filteredSyncContacts = useMemo(() => {
    if (accountFilter === 'ALL') return syncContacts;
    return syncContacts.filter((c) => {
      const waPhone = normalizePhoneForWA(c.noHp);
      const actualIds = hasLiveAccountMap
        ? waPhone
          ? phoneSavedAccountsMap.get(waPhone) || []
          : []
        : parseStoredAccountIds(c.akun, accounts);
      if (accountFilter === TANPA_AKUN_ID) {
        return actualIds.length === 0;
      }
      return actualIds.includes(accountFilter);
    });
  }, [syncContacts, accountFilter, hasLiveAccountMap, phoneSavedAccountsMap, accounts]);

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

  const totalInSyncSheet =
    syncStatus && syncStatus.totalInSyncSheet > 0
      ? syncStatus.totalInSyncSheet
      : syncContacts.length;
  const syncedCount = syncStatus ? syncStatus.syncedCount : 0;
  const unsyncedCount = syncStatus
    ? Math.max(0, syncStatus.unsyncedCount)
    : syncContacts.length;

  const pctInfo = formatPercentLabel(syncedCount, totalInSyncSheet);
  const contactsPerHour = Math.round((60 / Math.max(1, draftInterval)) * draftBatchLimit);
  const estRemainingStages = unsyncedCount > 0 ? Math.ceil(unsyncedCount / draftBatchLimit) : 0;
  const estTotalMinutes = estRemainingStages * draftInterval;

  // Stage progress metrics (realtime while running)
  const stageTarget =
    liveProgress?.active && liveProgress.stageTarget > 0
      ? liveProgress.stageTarget
      : Math.min(draftBatchLimit, Math.max(1, unsyncedCount || draftBatchLimit));
  const stageDone = liveProgress?.active ? liveProgress.stageDone : 0;
  const stagePct =
    stageTarget > 0 ? Math.min(100, Math.round((stageDone / stageTarget) * 100)) : 0;
  const activeStartMs =
    (liveProgress?.active && liveProgress.startedAtMs) || manualStartedAtRef.current || nowTickMs;
  const elapsedSec = isActivelySyncing
    ? Math.max(0, Math.floor((syncedServerNowMs - activeStartMs) / 1000))
    : 0;

  const totalPages = Math.max(1, Math.ceil(filteredSyncContacts.length / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedRows = useMemo(
    () => filteredSyncContacts.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredSyncContacts, safePage, pageSize]
  );

  const accountSummaryCards = useMemo(() => {
    const sumMap = new Map((syncStatus?.accountSummaries || []).map((s) => [s.id, s]));
    const targetCounts = new Map<string, number>();
    for (const c of syncContacts) {
      const id = resolveEffectiveAccountId(c.akun, c.kategori, categories, accounts);
      targetCounts.set(id, (targetCounts.get(id) || 0) + 1);
    }
    return accounts.map((acc) => {
      const s = sumMap.get(acc.id);
      const maxCap = acc.maxCapacity || 25000;
      const gCount = s ? s.googleContactsCount : acc.isPrimary ? quota.googleContactsCount : 0;
      const tRows = s ? s.totalTargetRows : targetCounts.get(acc.id) || 0;
      const sRows = s ? s.syncedRows : 0;
      const capPct = Math.min(100, Math.round((gCount / Math.max(1, maxCap)) * 100));
      return {
        ...acc,
        connected: s ? s.connected : Boolean(acc.isPrimary || acc.workerUrl),
        error: s?.error || '',
        totalTargetRows: tRows,
        syncedRows: sRows,
        unsyncedRows: Math.max(0, tRows - sRows),
        googleContactsCount: gCount,
        maxCap,
        capPct,
      };
    });
  }, [accounts, categories, quota.googleContactsCount, syncContacts, syncStatus?.accountSummaries]);

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

  const latestAddedCount =
    lastStageSummary?.added ??
    (remoteAutoSync?.lastStageAdded && remoteAutoSync.lastStageAdded > 0
      ? remoteAutoSync.lastStageAdded
      : 0);

  return (
    <section className="space-y-5" aria-label="Sinkronisasi Google Kontak">
      {/* Unified Realtime Sync Center (Streamlined & Easy to Read) */}
      <div className="glass-surface rounded-[22px] p-5 sm:p-6">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1D4ED8]/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#0284C7] text-white">
              <Users className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-[#0A2463]">
                  Sinkronisasi Google Kontak
                </h2>
                {syncStatus?.rateLimited ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-[#B45309]">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Jeda Kuota
                  </span>
                ) : syncStatus?.connected ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Terhubung ({syncStatus.engine})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-[#B45309]">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {syncStatus ? 'Belum Terhubung' : 'Memeriksa...'}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-[#475569]">
                Membaca sheet <strong>Kontak_Sync</strong> (rumus/manual aman) &amp; menyinkronkan ke Google Kontak secara realtime.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenAccountManager}
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#0284C7]/25 bg-[#F0F9FF] px-3.5 py-2 text-xs font-semibold text-[#0369A1] transition-colors hover:bg-[#E0F2FE] whitespace-nowrap shrink-0"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              <span>Kelola Akun ({accounts.length})</span>
            </button>

            <button
              type="button"
              onClick={onVerifyGoogleSyncLive}
              disabled={isVerifyingLive || isActivelySyncing || isLoading}
              title="Hitung ulang jumlah kontak terbaru langsung dari semua akun Google Kontak (cocok setelah Import CSV)"
              className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/25 bg-white px-3.5 py-2 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap shrink-0"
            >
              {isVerifyingLive ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#1D4ED8]" aria-hidden="true" />
              ) : (
                <SearchCheck className="h-4 w-4 text-[#1D4ED8]" aria-hidden="true" />
              )}
              <span>{isVerifyingLive ? 'Memverifikasi...' : 'Verifikasi Live'}</span>
            </button>

            <button
              type="button"
              onClick={onSyncAllToGoogleContacts}
              disabled={isBusy || isActivelySyncing || isLoading || isVerifyingLive}
              className="btn-ocean-sheen inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 whitespace-nowrap shrink-0"
            >
              {isActivelySyncing || isBusy || isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              <span>
                {isSyncingBatch
                  ? 'Menyinkronkan Manual...'
                  : isServerSyncActive
                    ? 'Auto-Sync Berjalan...'
                    : 'Sinkronkan Manual'}
              </span>
            </button>
          </div>
        </div>

        {/* Centerpiece: Realtime Overall Sync Progress */}
        <div className="mt-4 rounded-2xl border border-[#1D4ED8]/16 bg-gradient-to-br from-white/95 via-[#F0F9FF]/80 to-[#EFF6FF]/90 p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#475569]">
                <span>Progres Sinkronisasi Realtime</span>
                {(isActivelySyncing || isAutoEnabled) && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/12 px-1.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <div className="tabular-mono mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="text-3xl font-extrabold tracking-tight text-emerald-800 sm:text-[34px]">
                  {formatNumberId(syncedCount)}
                </span>
                <span className="text-sm font-semibold text-[#475569]">
                  / {formatNumberId(totalInSyncSheet)} tersinkron
                </span>
                {unsyncedCount > 0 && (
                  <span className="rounded-lg bg-amber-500/12 px-2 py-0.5 text-xs font-bold text-[#B45309]">
                    Sisa {formatNumberId(unsyncedCount)}
                  </span>
                )}
                {latestAddedCount > 0 && !isActivelySyncing && (
                  <span className="rounded-lg bg-emerald-500/12 px-2 py-0.5 text-xs font-bold text-emerald-800">
                    +{formatNumberId(latestAddedCount)} tahap terakhir
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="tabular-mono text-2xl font-extrabold text-[#0A2463] sm:text-3xl">
                {pctInfo.label}
              </div>
              <div className="tabular-mono mt-0.5 text-[11px] font-medium text-[#64748B]">
                Sinkron terakhir:{' '}
                <strong className="text-[#0A2463]">
                  {formatDisplayDateTime(syncStatus?.lastSyncAt) || 'Belum pernah'}
                </strong>
              </div>
            </div>
          </div>

          {/* Main Overall Progress Bar */}
          <div className="mt-3.5 h-3 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pctInfo.num >= 100
                  ? 'bg-emerald-600'
                  : 'bg-gradient-to-r from-[#0A2463] via-[#1D4ED8] to-[#0284C7]'
              }`}
              style={{ width: `${Math.max(pctInfo.num, syncedCount > 0 ? 2 : 0)}%` }}
            />
          </div>

          {/* Live Stage Progress Banner OR Countdown Strip */}
          {isActivelySyncing ? (
            <div className="mt-3.5 rounded-xl border border-[#1D4ED8]/25 bg-white/95 p-3.5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-[#0A2463]">
                  <Activity className="h-4 w-4 text-[#1D4ED8] animate-pulse" aria-hidden="true" />
                  <span>
                    {liveProgress?.phaseLabel ||
                      (isSyncingBatch
                        ? 'Menghubungkan & membaca Google Kontak...'
                        : 'Auto-Sync sedang berjalan di server Google...')}
                  </span>
                </div>
                <div className="tabular-mono flex items-center gap-2.5 text-xs font-bold">
                  <span className="text-emerald-800">
                    {formatNumberId(stageDone)} / {formatNumberId(stageTarget)} kontak
                  </span>
                  <span className="rounded bg-[#EFF6FF] px-2 py-0.5 text-[#1D4ED8]">
                    {formatCountdownClock(elapsedSec)}
                  </span>
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                <div
                  className={`h-full rounded-full bg-gradient-to-r from-emerald-500 to-[#0284C7] transition-all duration-500 ${
                    stageDone === 0 ? 'animate-pulse' : ''
                  }`}
                  style={{ width: `${Math.max(stagePct, 6)}%` }}
                />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#475569]">
                <span>
                  Mode:{' '}
                  <strong className="text-[#0A2463]">
                    {liveProgress?.mode === 'auto' && !isSyncingBatch ? 'Auto-Sync Server' : 'Sinkron Manual'}
                  </strong>
                  {liveProgress?.stageCreated ? ` · +${formatNumberId(liveProgress.stageCreated)} baru` : ''}
                  {liveProgress?.stageUpdated ? ` · ${formatNumberId(liveProgress.stageUpdated)} diubah` : ''}
                </span>
                <span>Angka diperbarui otomatis setiap beberapa detik</span>
              </div>
            </div>
          ) : (
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#1D4ED8]/12 bg-white/85 px-3.5 py-2.5 text-xs">
              {isAutoEnabled ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/12 px-2.5 py-1 font-bold text-emerald-800">
                      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
                      {countdownSec === null
                        ? `Aktif · Tiap ${remoteAutoSync?.intervalMinutes || 5} mnt`
                        : countdownSec === 0
                          ? 'Siklus berjalan...'
                          : `Siklus berikutnya: ${formatCountdownClock(countdownSec)}`}
                    </span>
                    {unsyncedCount === 0 ? (
                      <span className="font-semibold text-emerald-800">
                        Semua tuntas (Mode Hemat · 0 kuota)
                      </span>
                    ) : (
                      <span className="tabular-mono text-[#475569]">
                        ~<strong className="text-[#0A2463]">{formatNumberId(contactsPerHour)}</strong>/jam · Est.{' '}
                        <strong className="text-[#0A2463]">
                          {formatNumberId(estRemainingStages)} tahap ({formatDurationMinutes(estTotalMinutes)})
                        </strong>
                      </span>
                    )}
                  </div>
                  {remoteAutoSync?.lastRunDetail && (
                    <span className="truncate text-[11.5px] text-[#475569]" title={remoteAutoSync.lastRunDetail}>
                      {remoteAutoSync.lastRunDetail}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-[#475569]">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-0.5 font-semibold text-[#475569]">
                      Auto-Sync Nonaktif
                    </span>
                    {unsyncedCount === 0 ? (
                      <span className="font-semibold text-emerald-800">
                        Semua kontak sudah tersinkron 100%
                      </span>
                    ) : (
                      <span className="tabular-mono">
                        Estimasi jika Auto-Sync aktif:{' '}
                        <strong className="text-[#0A2463]">
                          {formatNumberId(estRemainingStages)} tahap ({formatDurationMinutes(estTotalMinutes)})
                        </strong>
                      </span>
                    )}
                  </div>
                  {lastStageSummary ? (
                    <span className="tabular-mono text-[11.5px] font-semibold text-emerald-800">
                      Tahap terakhir ({lastStageSummary.at}): +{formatNumberId(lastStageSummary.added)} kontak
                    </span>
                  ) : remoteAutoSync?.lastRunDetail ? (
                    <span className="truncate text-[11.5px] text-[#64748B]">
                      {remoteAutoSync.lastRunDetail}
                    </span>
                  ) : null}
                </>
              )}
            </div>
          )}

          {/* Inline Auto-Sync Controls (Compact & Instant) */}
          <div className="mt-4 grid gap-2.5 border-t border-[#1D4ED8]/10 pt-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <div>
              <label
                htmlFor="auto-sync-interval"
                className="mb-1 block text-[11.5px] font-semibold text-[#0A2463]"
              >
                Jadwal Auto-Sync (Server Google 24/7)
              </label>
              <select
                id="auto-sync-interval"
                value={draftInterval}
                onChange={(e) => setDraftInterval(Number(e.target.value))}
                disabled={isSavingAutoSync}
                className="min-h-[40px] w-full rounded-[10px] border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25 disabled:opacity-60"
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
                className="mb-1 block text-[11.5px] font-semibold text-[#0A2463]"
              >
                Jumlah Kontak per Tahap
              </label>
              <select
                id="auto-sync-batch"
                value={draftBatchLimit}
                onChange={(e) => setDraftBatchLimit(Number(e.target.value))}
                disabled={isSavingAutoSync}
                className="min-h-[40px] w-full rounded-[10px] border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25 disabled:opacity-60"
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
                  disabled={isSavingAutoSync}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 md:flex-none whitespace-nowrap shrink-0"
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
                      disabled={isSavingAutoSync}
                      className="btn-ocean-sheen inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55 whitespace-nowrap shrink-0"
                    >
                      {isSavingAutoSync ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>{isSavingAutoSync ? 'Menyimpan...' : 'Simpan Jadwal'}</span>
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
                    disabled={isSavingAutoSync}
                    className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-600/30 bg-red-50/90 px-4 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-55 md:flex-none whitespace-nowrap shrink-0"
                  >
                    {isSavingAutoSync ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <PauseCircle className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>{isSavingAutoSync ? 'Menghentikan...' : 'Matikan Auto-Sync'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Compact Footer Info + Collapsible Quota Toggle */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#475569]">
            <span className="tabular-mono">
              Kapasitas Akun Google Kontak:{' '}
              <strong
                className={
                  quota.googleContactsCount >= 23000 ? 'text-red-700' : 'text-[#0A2463]'
                }
              >
                {formatNumberId(quota.googleContactsCount)} / {formatNumberId(quota.googleContactsLimit)}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setShowQuotaDetails((prev) => !prev)}
              className="inline-flex items-center gap-1 font-semibold text-[#1D4ED8] hover:underline"
            >
              <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showQuotaDetails ? 'Sembunyikan Detail Kuota' : 'Lihat Detail Kuota API'}</span>
              {showQuotaDetails ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* Collapsible Quota Detail Drawer */}
          {showQuotaDetails && (
            <div className="mt-3 grid gap-2.5 border-t border-[#1D4ED8]/10 pt-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#475569]">Baca / Menit</span>
                  <span className="tabular-mono font-bold text-[#0A2463]">
                    {formatNumberId(quota.minuteReadsUsed)}/{formatNumberId(quota.minuteReadsLimit)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                  <div
                    className={`h-full rounded-full ${getBarColor(readPct)}`}
                    style={{ width: `${Math.max(readPct, quota.minuteReadsUsed > 0 ? 5 : 0)}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#475569]">Tulis / Menit</span>
                  <span className="tabular-mono font-bold text-[#0A2463]">
                    {formatNumberId(quota.minuteWritesUsed)}/{formatNumberId(quota.minuteWritesLimit)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                  <div
                    className={`h-full rounded-full ${getBarColor(writePct)}`}
                    style={{ width: `${Math.max(writePct, quota.minuteWritesUsed > 0 ? 5 : 0)}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#1D4ED8]/10 bg-white/90 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#475569]">Permintaan Harian</span>
                  <span className="tabular-mono font-bold text-[#0A2463]">
                    {formatNumberId(quota.dailyRequestsUsed)}/{formatNumberId(quota.dailyRequestsLimit)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                  <div
                    className={`h-full rounded-full ${getBarColor(contactsPct)}`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          Math.round((quota.dailyRequestsUsed / Math.max(1, quota.dailyRequestsLimit)) * 100),
                          quota.dailyRequestsUsed > 0 ? 4 : 0
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        {/* Multi-Account Overview Grid */}
        <div className="mt-4 border-t border-[#1D4ED8]/10 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#0A2463]">
              <Mail className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
              <span>Akun Google Terhubung ({accountSummaryCards.length})</span>
            </span>
            <span className="text-[11px] text-[#64748B]">
              Total kapasitas aktif:{' '}
              <strong className="tabular-mono text-[#0A2463]">
                {formatNumberId(
                  accountSummaryCards
                    .filter((a) => a.status !== 'Nonaktif')
                    .reduce((s, a) => s + a.maxCap, 0)
                )}
              </strong>{' '}
              kontak
            </span>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {accountSummaryCards.map((acc) => {
              const targetPct = formatPercentLabel(acc.syncedRows, acc.totalTargetRows);
              return (
                <div
                  key={acc.id}
                  className="rounded-xl border border-[#1D4ED8]/14 bg-white/90 p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-mono rounded bg-[#0A2463] px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {acc.id}
                        </span>
                        <span className="truncate font-bold text-[#0A2463]">{acc.label}</span>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-[#64748B]">
                        {acc.email || (acc.isPrimary ? 'Akun Google Utama' : 'Belum diisi email')}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        acc.status === 'Nonaktif'
                          ? 'bg-slate-200 text-slate-600'
                          : acc.connected
                            ? 'bg-emerald-500/15 text-emerald-800'
                            : 'bg-amber-500/15 text-[#B45309]'
                      }`}
                    >
                      {acc.status === 'Nonaktif'
                        ? 'Nonaktif'
                        : acc.connected
                          ? 'Aktif'
                          : 'CSV Only'}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#475569]">
                    <span>Target sinkron:</span>
                    <span className="tabular-mono font-bold text-emerald-800">
                      {formatNumberId(acc.syncedRows)} / {formatNumberId(acc.totalTargetRows)} ({targetPct.label})
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-[#475569]">
                    <span>Kapasitas Gmail:</span>
                    <span
                      className={`tabular-mono font-bold ${
                        acc.googleContactsCount >= 23000 ? 'text-red-700' : 'text-[#0A2463]'
                      }`}
                    >
                      {formatNumberId(acc.googleContactsCount)} / {formatNumberId(acc.maxCap)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1D4ED8]/12">
                    <div
                      className={`h-full rounded-full ${getBarColor(acc.capPct)}`}
                      style={{
                        width: `${Math.max(acc.capPct, acc.googleContactsCount > 0 ? 3 : 0)}%`,
                      }}
                    />
                  </div>
                  {acc.error && (
                    <div className="mt-1.5 truncate text-[10.5px] font-medium text-red-700" title={acc.error}>
                      {acc.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        </div>

        {/* Conditional Alerts ONLY when actually needed */}
        {quota.googleContactsCount >= 23000 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-950">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden="true" />
            <div>
              <strong>Mendekati Batas Google Kontak (Maks 25.000):</strong> Akun Anda sudah menyimpan{' '}
              <span className="tabular-mono font-bold">{formatNumberId(quota.googleContactsCount)}</span> kontak.
            </div>
          </div>
        )}

        {syncStatus?.rateLimited ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-50/90 px-3.5 py-3 text-xs text-[#78350F]">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
            <div>
              <strong>Batas Kuota Per Menit Google API Tercapai.</strong> Tunggu ±60 detik, lalu klik{' '}
              <strong>Sinkronkan Manual</strong> atau biarkan <strong>Auto-Sync</strong> melanjutkannya otomatis.
            </div>
          </div>
        ) : syncStatus && !syncStatus.connected ? (
          <div className="mt-3 rounded-xl border border-amber-500/35 bg-amber-50/90 p-4 text-xs text-[#78350F]">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
              <div>
                <div className="font-bold">Google Kontak Belum Aktif di Apps Script</div>
                <p className="mt-1">
                  {syncStatus.error ||
                    'Aktifkan Services (+) → People API → Add di Apps Script, jalankan setupdatabase(), lalu Deploy → New version.'}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Collapsible Mass Sync Accelerator via Official Google Contacts CSV Import */}
      <div className="glass-surface rounded-[22px] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0284C7] to-emerald-600 text-white">
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#0A2463]">
                Sinkronisasi Massal Kilat via Import CSV Google Kontak
              </h3>
              <p className="text-xs text-[#475569]">
                Unggah hingga <strong>2.500 kontak/file</strong> dalam ±15 detik (0 kuota API) — otomatis berlabel kategori &amp; tetap <strong>100% terhubung</strong> dengan Sheet <strong>Kontak</strong> &amp; <strong>Kontak_Sync</strong>.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const nextOpen = !showMassCsvPanel;
              setShowMassCsvPanel(nextOpen);
              if (nextOpen && !csvPlan && !isLoadingCsvPlan) {
                void handlePrepareCsvPlan();
              }
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/22 bg-white px-3.5 py-2 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap shrink-0"
          >
            <span>{showMassCsvPanel ? 'Tutup Panel CSV Massal' : 'Siapkan CSV Massal'}</span>
            {showMassCsvPanel ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {showMassCsvPanel && (
          <div className="mt-4 space-y-4 border-t border-[#1D4ED8]/10 pt-4">
            {/* Filter Fleksibel CSV Massal: Kategori, Gender, Akun, Pecah Jumlah per File */}
            <div className="space-y-3 rounded-xl border border-[#0284C7]/20 bg-[#F0F9FF]/75 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 font-bold text-[#0A2463]">
                  <Filter className="h-3.5 w-3.5 text-[#0284C7]" aria-hidden="true" />
                  <span>Filter &amp; Pembagian File CSV dari Kontak_Sync</span>
                </span>
                <span className="text-[11px] text-[#475569]">
                  Bebas unduh per kategori, per gender, atau semua — lalu impor ke Akun 1 / 2 / 3
                </span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {/* 1. Filter Kategori (Multi-Pilih) */}
                <div>
                  <label className="mb-1 block text-[11px] font-bold text-[#0A2463]">
                    Filter Kategori
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowCsvCatPicker((prev) => !prev)}
                    className="flex min-h-[38px] w-full items-center justify-between gap-2 rounded-xl border border-[#1D4ED8]/22 bg-white px-3 py-1.5 text-left text-xs font-semibold text-[#0A2463] hover:bg-[#EFF6FF]"
                  >
                    <span className="truncate">
                      {selectedCsvCategories.length === 0
                        ? 'Semua Kategori'
                        : selectedCsvCategories.length === 1
                          ? selectedCsvCategories[0]
                          : `${selectedCsvCategories.length} Kategori dipilih`}
                    </span>
                    {showCsvCatPicker ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
                    )}
                  </button>
                </div>

                {/* 2. Filter Jenis Kelamin */}
                <div>
                  <label
                    htmlFor="csv-gender-filter"
                    className="mb-1 block text-[11px] font-bold text-[#0A2463]"
                  >
                    Jenis Kelamin
                  </label>
                  <select
                    id="csv-gender-filter"
                    value={selectedCsvGender}
                    onChange={(e) => {
                      const nextGender = e.target.value as 'ALL' | GenderOption;
                      setSelectedCsvGender(nextGender);
                      void handlePrepareCsvPlan({ gender: nextGender });
                    }}
                    disabled={isLoadingCsvPlan}
                    className="min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/22 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="ALL">Semua Jenis Kelamin</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g} ({getGenderShort(g)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3. Filter Sumber Akun */}
                <div>
                  <label
                    htmlFor="csv-account-filter"
                    className="mb-1 block text-[11px] font-bold text-[#0A2463]"
                  >
                    Filter Akun Google
                  </label>
                  <select
                    id="csv-account-filter"
                    value={selectedCsvAccountId}
                    onChange={(e) => {
                      const nextAcc = e.target.value;
                      setSelectedCsvAccountId(nextAcc);
                      void handlePrepareCsvPlan({ accountId: nextAcc });
                    }}
                    disabled={isLoadingCsvPlan}
                    className="min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/22 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8]"
                  >
                    <option value="ALL">Semua Data Kontak_Sync</option>
                    <option value={TANPA_AKUN_ID}>Hanya Belum Ada di Akun Google</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.label} ({acc.id})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Ukuran Pecahan per File CSV */}
                <div>
                  <label
                    htmlFor="csv-chunk-size"
                    className="mb-1 block text-[11px] font-bold text-[#0A2463]"
                  >
                    Jumlah Kontak / File CSV
                  </label>
                  <select
                    id="csv-chunk-size"
                    value={selectedCsvChunkSize}
                    onChange={(e) => {
                      const nextSize = Number(e.target.value);
                      setSelectedCsvChunkSize(nextSize);
                      void handlePrepareCsvPlan({ chunkSize: nextSize });
                    }}
                    disabled={isLoadingCsvPlan}
                    className="min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/22 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8]"
                  >
                    <option value={1000}>1.000 kontak / file (Ringan)</option>
                    <option value={2000}>2.000 kontak / file</option>
                    <option value={2500}>2.500 kontak / file (Disarankan)</option>
                    <option value={3000}>3.000 kontak / file (Maks Google)</option>
                    <option value={500}>500 kontak / file (Kecil)</option>
                    <option value={0}>Semua dalam 1 File Utuh</option>
                  </select>
                </div>
              </div>

              {/* Drawer Multi-Centang Kategori */}
              {showCsvCatPicker && (
                <div className="rounded-xl border border-[#1D4ED8]/18 bg-white p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]"
                        aria-hidden="true"
                      />
                      <input
                        type="search"
                        value={csvCatSearch}
                        onChange={(e) => setCsvCatSearch(e.target.value)}
                        placeholder="Cari kategori untuk diekspor..."
                        className="min-h-[34px] w-full rounded-lg border border-[#1D4ED8]/18 bg-[#F8FAFC] py-1 pl-8 pr-2.5 text-xs text-[#0A2463] outline-none focus:border-[#1D4ED8]"
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCsvCategories([]);
                          void handlePrepareCsvPlan({ categories: [] });
                        }}
                        className="rounded-lg border border-[#1D4ED8]/20 px-2.5 py-1 text-[#475569] hover:bg-[#F8FAFC]"
                      >
                        Semua Kategori
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCsvCatPicker(false);
                          void handlePrepareCsvPlan();
                        }}
                        className="btn-ocean-sheen rounded-lg px-3 py-1 text-white"
                      >
                        Terapkan ({selectedCsvCategories.length === 0 ? 'Semua' : selectedCsvCategories.length})
                      </button>
                    </div>
                  </div>
                  <div className="grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
                    <label
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                        selectedCsvCategories.includes(TANPA_KATEGORI_LABEL)
                          ? 'border-amber-500 bg-amber-50/90 font-bold text-[#0A2463]'
                          : 'border-[#1D4ED8]/12 bg-[#F8FAFC] text-[#334155] hover:bg-white'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={selectedCsvCategories.includes(TANPA_KATEGORI_LABEL)}
                          onChange={() => toggleCsvCategory(TANPA_KATEGORI_LABEL)}
                          className="h-3.5 w-3.5 shrink-0 rounded"
                        />
                        <span className="truncate">{TANPA_KATEGORI_LABEL}</span>
                      </span>
                      <span className="tabular-mono shrink-0 text-[11px] font-bold text-[#B45309]">
                        {formatNumberId(syncCategoryOptions.uncategorizedCount)}
                      </span>
                    </label>
                    {filteredCsvCategories.map((cat) => {
                      const checked = selectedCsvCategories.includes(cat.name);
                      return (
                        <label
                          key={cat.name}
                          className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                            checked
                              ? 'border-[#1D4ED8] bg-[#EFF6FF] font-bold text-[#0A2463]'
                              : 'border-[#1D4ED8]/12 bg-[#F8FAFC] text-[#334155] hover:bg-white'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCsvCategory(cat.name)}
                              className="h-3.5 w-3.5 shrink-0 rounded"
                            />
                            <span className="truncate">{cat.name}</span>
                          </span>
                          {cat.count > 0 && (
                            <span className="tabular-mono shrink-0 text-[11px] font-bold text-[#1D4ED8]">
                              {formatNumberId(cat.count)}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Mode + Refresh Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="inline-flex flex-wrap rounded-xl border border-[#1D4ED8]/15 bg-[#F8FAFC] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setCsvOnlyUnsynced(true);
                    void handlePrepareCsvPlan({ onlyUnsynced: true });
                  }}
                  disabled={isLoadingCsvPlan}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                    csvOnlyUnsynced
                      ? 'bg-[#0A2463] text-white'
                      : 'text-[#475569] hover:text-[#0A2463]'
                  }`}
                >
                  Hanya Belum Tersimpan (Disarankan)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCsvOnlyUnsynced(false);
                    void handlePrepareCsvPlan({ onlyUnsynced: false });
                  }}
                  disabled={isLoadingCsvPlan}
                  className={`rounded-lg px-3 py-1.5 font-semibold transition-colors ${
                    !csvOnlyUnsynced
                      ? 'bg-[#0A2463] text-white'
                      : 'text-[#475569] hover:text-[#0A2463]'
                  }`}
                >
                  Semua Cocok Filter
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handlePrepareCsvPlan()}
                disabled={isLoadingCsvPlan}
                className="btn-ocean-sheen inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-55"
              >
                {isLoadingCsvPlan ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Hitung &amp; Siapkan Batch CSV</span>
              </button>
            </div>

            {isLoadingCsvPlan ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-[#1D4ED8]/15 bg-[#EFF6FF]/60 px-4 py-3 text-xs font-semibold text-[#0A2463]">
                <Loader2 className="h-4 w-4 animate-spin text-[#1D4ED8]" aria-hidden="true" />
                <span>Membaca seluruh sheet Kontak_Sync &amp; menerapkan filter kategori / gender / akun...</span>
              </div>
            ) : csvPlan ? (
              <>
                {csvPlan.filterSummary && (
                  <div className="rounded-lg border border-[#1D4ED8]/12 bg-[#F8FAFC] px-3 py-1.5 text-[11.5px] font-medium text-[#334155]">
                    Filter aktif: <strong className="text-[#0A2463]">{csvPlan.filterSummary}</strong>
                  </div>
                )}

                <div className="grid gap-2.5 sm:grid-cols-3">
                  <div className="rounded-xl border border-[#1D4ED8]/12 bg-white/90 px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#64748B]">
                      Siap Diunduh (Nomor Unik)
                    </div>
                    <div className="tabular-mono mt-0.5 text-lg font-extrabold text-[#0A2463]">
                      {formatNumberId(csvPlan.exportTargetCount)}
                    </div>
                    <div className="tabular-mono text-[11px] text-[#64748B]">
                      Dari {formatNumberId(csvPlan.totalUniquePhones)} unik ({formatNumberId(csvPlan.totalSyncRows)} baris)
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#1D4ED8]/12 bg-white/90 px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#64748B]">
                      Jumlah File CSV ({csvPlan.isSingleFile ? '1 File Utuh' : `${formatNumberId(csvPlan.chunkSize)}/file`})
                    </div>
                    <div className="tabular-mono mt-0.5 text-lg font-extrabold text-[#1D4ED8]">
                      {formatNumberId(csvPlan.totalParts)} file
                    </div>
                    <div className="truncate text-[11px] text-[#64748B]">
                      {csvPlan.isSingleFile
                        ? 'Semua kontak digabung dalam 1 file'
                        : 'Siap impor langsung ke Google Kontak'}
                    </div>
                  </div>
                  <div className="rounded-xl border border-[#1D4ED8]/12 bg-white/90 px-3.5 py-2.5">
                    <div className="text-[11px] font-semibold text-[#64748B]">Sisa Kapasitas Google</div>
                    <div
                      className={`tabular-mono mt-0.5 text-lg font-extrabold ${
                        csvPlan.exportTargetCount > csvPlan.remainingGoogleCapacity
                          ? 'text-[#B45309]'
                          : 'text-emerald-800'
                      }`}
                    >
                      {formatNumberId(csvPlan.remainingGoogleCapacity)} slot
                    </div>
                    <div className="tabular-mono text-[11px] text-[#64748B]">
                      Terpakai {formatNumberId(csvPlan.googleContactsCount)} / {formatNumberId(csvPlan.googleContactsLimit)}
                    </div>
                  </div>
                </div>

                {csvPlan.isSingleFile && csvPlan.exportTargetCount > 3000 && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/35 bg-amber-50/90 px-3.5 py-2.5 text-xs text-[#78350F]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#B45309]" aria-hidden="true" />
                    <div>
                      <strong>Catatan Batas Impor Web Google Kontak (3.000/unggah):</strong> File utuh ini berisi{' '}
                      <span className="tabular-mono font-bold">{formatNumberId(csvPlan.exportTargetCount)}</span> kontak. Jika Google menolak unggahan &gt;3.000 sekaligus, cukup ubah pemecah di atas ke <strong>2.500</strong> atau <strong>1.000 kontak/file</strong>.
                    </div>
                  </div>
                )}

                {csvPlan.totalParts === 0 ? (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-50/80 px-4 py-3 text-xs font-semibold text-emerald-900">
                    Tidak ada kontak yang tersisa untuk filter ini (semua sudah tersimpan di Google Kontak, atau filter kosong). Ubah ke &ldquo;Semua Cocok Filter&rdquo; jika tetap ingin mengunduh ulang.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="text-xs font-bold text-[#0A2463]">
                      1. Unduh File CSV (format resmi Google Kontak dengan label kategori otomatis):
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: csvPlan.totalParts }, (_, idx) => {
                        const partNum = idx + 1;
                        const remainingAfterPrev = csvPlan.exportTargetCount - idx * csvPlan.chunkSize;
                        const partCount = csvPlan.isSingleFile
                          ? csvPlan.exportTargetCount
                          : Math.min(csvPlan.chunkSize, Math.max(0, remainingAfterPrev));
                        const isDownloading = downloadingCsvPart === partNum;
                        const isDone = downloadedParts.includes(partNum);
                        return (
                          <button
                            key={partNum}
                            type="button"
                            onClick={() => void handleDownloadCsvBatch(partNum)}
                            disabled={downloadingCsvPart !== null}
                            className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-55 ${
                              isDone
                                ? 'border-emerald-500/35 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                                : 'border-[#1D4ED8]/25 bg-white text-[#0A2463] hover:bg-[#EFF6FF]'
                            }`}
                          >
                            {isDownloading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1D4ED8]" aria-hidden="true" />
                            ) : isDone ? (
                              <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                            ) : (
                              <Download className="h-3.5 w-3.5 text-[#1D4ED8]" aria-hidden="true" />
                            )}
                            <span className="tabular-mono">
                              {csvPlan.isSingleFile
                                ? `Unduh 1 File Utuh (${formatNumberId(partCount)})`
                                : `Batch ${partNum} (${formatNumberId(partCount)})`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[#1D4ED8]/14 bg-[#F8FAFC] px-3.5 py-3 text-xs text-[#334155]">
                      <div>
                        <strong>2. Impor ke Google Kontak:</strong> Login ke akun Gmail tujuan (Akun 1 / 2 / 3), buka <strong>Impor</strong> di Google Kontak lalu unggah file CSV.{' '}
                        <strong>3. Verifikasi Live:</strong> Klik <strong>Verifikasi Hasil Impor</strong> agar kolom <strong>Akun Google</strong> di sheet Kontak &amp; Kontak_Sync terisi otomatis.
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href="https://contacts.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF] whitespace-nowrap"
                        >
                          <span>Buka Google Kontak</span>
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                        <button
                          type="button"
                          onClick={onVerifyGoogleSyncLive}
                          disabled={isVerifyingLive || isActivelySyncing}
                          className="btn-ocean-sheen inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-55 whitespace-nowrap"
                        >
                          {isVerifyingLive ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          ) : (
                            <SearchCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          )}
                          <span>Verifikasi Hasil Impor</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-amber-500/30 bg-amber-50/80 px-4 py-3 text-xs text-[#78350F]">
                Pastikan <strong>Code.gs versi terbaru</strong> sudah di-Deploy (<strong>New version</strong>) di Apps Script agar fitur penyiapan CSV massal dapat membaca seluruh 25.000+ baris sheet <strong>Kontak_Sync</strong>.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table Read-Only Kontak_Sync with Account Filter & Tracking */}
      <div className="glass-surface rounded-[22px] p-5 sm:p-6">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="text-sm font-bold text-[#0A2463]">
              Daftar Sheet Kontak_Sync ({formatNumberId(filteredSyncContacts.length)} baris)
            </h3>
            <span className="text-xs text-[#64748B]">
              Menampilkan status akun Google tempat nomor tersimpan (kosong jika belum ada di akun manapun)
            </span>
          </div>
          <select
            value={accountFilter}
            onChange={(e) => {
              setAccountFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter Kontak_Sync berdasarkan akun Google"
            className="min-h-[36px] rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs font-semibold text-[#0A2463] outline-none focus:border-[#1D4ED8]"
          >
            <option value="ALL">Semua Akun ({formatNumberId(syncContacts.length)})</option>
            <option value={TANPA_AKUN_ID}>Tidak Ada Akun (Belum Tersimpan)</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                Tersimpan di {acc.label} ({acc.id})
              </option>
            ))}
          </select>
        </div>

        {isLoading && syncContacts.length === 0 ? (
          <div className="space-y-2.5 py-2">
            {[1, 2, 3, 4].map((idx) => (
              <div key={idx} className="h-11 animate-pulse rounded-xl bg-[#1D4ED8]/8" />
            ))}
          </div>
        ) : filteredSyncContacts.length === 0 ? (
          <div className="py-12 text-center">
            <h3 className="text-base font-bold text-[#0A2463]">
              {syncContacts.length === 0
                ? 'Sheet Kontak_Sync masih kosong'
                : 'Belum ada kontak untuk akun ini'}
            </h3>
            <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-[#475569]">
              {syncContacts.length === 0
                ? 'Isi sheet Kontak_Sync secara manual atau pakai rumus di Google Spreadsheet, lalu klik Sinkronkan Manual atau aktifkan Auto-Sync.'
                : 'Atur Akun Default di menu Kelola Kategori atau isi kolom Akun pada kontak yang ingin diarahkan ke akun ini.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto rounded-xl border border-[#1D4ED8]/14 md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#0A2463] text-xs font-semibold text-white">
                    <th className="w-14 px-3 py-3 text-center whitespace-nowrap">No</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Nama di Google Kontak</th>
                    <th className="w-36 px-3 py-3 text-center whitespace-nowrap">No HP</th>
                    <th className="px-3 py-3 text-center whitespace-nowrap">Kategori</th>
                    <th
                      className="w-12 px-2 py-3 text-center whitespace-nowrap"
                      title="Jenis Kelamin (L=Laki-laki, P=Perempuan, A=Admin)"
                    >
                      JK
                    </th>
                    <th className="w-36 px-3 py-3 text-center whitespace-nowrap">
                      Target Akun
                    </th>
                    <th className="w-44 px-3 py-3 text-center whitespace-nowrap">
                      Tersimpan di Google
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1D4ED8]/10 text-[13px]">
                  {paginatedRows.map((c, idx) => {
                    const globalNo = (safePage - 1) * pageSize + idx + 1;
                    const waPhone = normalizePhoneForWA(c.noHp);
                    const targetAccId = resolveEffectiveAccountId(
                      c.akun,
                      c.kategori,
                      categories,
                      accounts
                    );
                    const targetAccLabel = getAccountLabelById(targetAccId, accounts);
                    const savedAccIds = getActualSavedAccounts(c, waPhone);
                    const isQuotaPaused = Boolean(
                      syncStatus?.rateLimited && syncStatus.unsyncedPhones.length === 0
                    );
                    const isSyncedInTarget =
                      savedAccIds.length > 0 ||
                      Boolean(
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
                          {formatNumberId(globalNo)}
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
                        <td className="px-3 py-3 text-center">
                          <span className="inline-block max-w-[130px] truncate rounded-md border border-[#1D4ED8]/18 bg-white px-2 py-0.5 text-[11px] font-bold text-[#0A2463]" title={`${targetAccLabel} (${targetAccId})`}>
                            {targetAccLabel}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {!syncStatus?.connected ? (
                            <span className="text-xs font-semibold text-[#B45309]">
                              Belum Aktif
                            </span>
                          ) : isQuotaPaused ? (
                            <span className="text-xs font-semibold text-[#B45309]">
                              Jeda Kuota
                            </span>
                          ) : savedAccIds.length > 0 ? (
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {savedAccIds.map((accId) => (
                                <span
                                  key={accId}
                                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                    accId === targetAccId
                                      ? 'bg-emerald-500/15 text-emerald-800'
                                      : 'bg-sky-500/15 text-[#0369A1]'
                                  }`}
                                >
                                  <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  <span>{getAccountLabelById(accId, accounts)}</span>
                                </span>
                              ))}
                            </div>
                          ) : isSyncedInTarget ? (
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
                const targetAccId = resolveEffectiveAccountId(
                  c.akun,
                  c.kategori,
                  categories,
                  accounts
                );
                const targetAccLabel = getAccountLabelById(targetAccId, accounts);
                const savedAccIds = getActualSavedAccounts(c, waPhone);
                const isQuotaPaused = Boolean(
                  syncStatus?.rateLimited && syncStatus.unsyncedPhones.length === 0
                );
                const isSynced =
                  savedAccIds.length > 0 ||
                  Boolean(
                    syncStatus?.connected &&
                      !isQuotaPaused &&
                      waPhone &&
                      !unsyncedSet.has(waPhone)
                  );
                return (
                  <article
                    key={`${waPhone}-${globalNo}`}
                    className="rounded-[14px] border border-[#1D4ED8]/14 odd:bg-white/85 even:bg-[#EFF6FF]/85 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="tabular-mono text-xs font-bold text-[#64748B]">
                          #{formatNumberId(globalNo)}{' '}
                        </span>
                        <span className="text-[14px] font-bold text-[#061A40] break-words">
                          {c.nama}
                        </span>
                      </div>
                      <span
                        className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                          isSynced ? 'text-emerald-800' : 'text-[#B45309]'
                        }`}
                      >
                        {!syncStatus?.connected
                          ? 'Belum Aktif'
                          : isQuotaPaused
                            ? 'Jeda Kuota'
                            : savedAccIds.length > 0
                              ? savedAccIds
                                  .map((id) => getAccountLabelById(id, accounts))
                                  .join(', ')
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
                      <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#0A2463] border border-[#1D4ED8]/15">
                        Target: {targetAccLabel}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>

            <PaginationBar
              totalItems={filteredSyncContacts.length}
              currentPage={safePage}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              itemLabel="kontak sync"
            />
          </>
        )}
      </div>
    </section>
  );
}
