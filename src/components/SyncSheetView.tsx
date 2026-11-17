import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react';
import {
  Contact,
  GoogleSyncStatus,
  TANPA_KATEGORI_LABEL,
  normalizePhoneForWA,
} from '../types/contact';

interface SyncSheetViewProps {
  syncContacts: Contact[];
  syncStatus: GoogleSyncStatus | null;
  isLoading: boolean;
  isSyncingBatch: boolean;
  onSyncAllToGoogleContacts: () => Promise<void>;
}

export function SyncSheetView({
  syncContacts,
  syncStatus,
  isLoading,
  isSyncingBatch,
  onSyncAllToGoogleContacts,
}: SyncSheetViewProps) {
  const unsyncedSet = new Set(
    (syncStatus?.unsyncedPhones || []).map((p) => normalizePhoneForWA(p))
  );

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
            disabled={isSyncingBatch || isLoading}
            className="btn-ocean-sheen inline-flex min-h-[42px] items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {isSyncingBatch ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            <span>
              {isSyncingBatch ? 'Menyinkronkan...' : 'Sinkronkan Kontak_Sync ke Google Kontak'}
            </span>
          </button>
        </div>

        {/* Status Metrics */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="text-xs font-semibold text-[#475569]">Koneksi Google Kontak</div>
            <div className="mt-1.5 flex items-center gap-2 text-sm font-bold">
              {syncStatus?.connected ? (
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
              {syncStatus ? syncStatus.totalInSyncSheet : syncContacts.length}
            </div>
          </div>

          <div className="rounded-2xl border border-[#1D4ED8]/12 bg-white/80 p-3.5">
            <div className="text-xs font-semibold text-[#475569]">Tersinkron vs Belum</div>
            <div className="tabular-mono mt-1.5 flex items-baseline gap-2 text-sm font-bold">
              <span className="text-xl text-emerald-800">
                {syncStatus ? syncStatus.syncedCount : 0}
              </span>
              <span className="text-xs font-semibold text-[#475569]">tersinkron ·</span>
              <span className="text-xl text-[#B45309]">
                {syncStatus ? syncStatus.unsyncedCount : syncContacts.length}
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
              {syncStatus?.lastSyncAt || 'Belum pernah dijalankan'}
            </div>
          </div>
        </div>

        {/* Warning / Diagnostic Panel if Google Contacts is disconnected */}
        {syncStatus && !syncStatus.connected && (
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
        )}

        {syncStatus?.connected && syncStatus.unsyncedCount > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#1D4ED8]/15 bg-[#EFF6FF]/90 px-4 py-3 text-[13px] text-[#0A2463]">
            <div className="flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0 text-[#1D4ED8]" aria-hidden="true" />
              <span>
                Terdapat <strong>{syncStatus.unsyncedCount} kontak</strong> di <strong>Kontak_Sync</strong> yang belum ada di Google Kontak Anda. Klik tombol sinkronisasi untuk memprosesnya.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Table Read-Only Kontak_Sync */}
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
                  {syncContacts.map((c, idx) => {
                    const waPhone = normalizePhoneForWA(c.noHp);
                    const isSynced = Boolean(syncStatus?.connected && waPhone && !unsyncedSet.has(waPhone));
                    return (
                      <tr
                        key={`${waPhone}-${idx}`}
                        className="odd:bg-white/40 even:bg-[#EFF6FF]/75 transition-colors hover:bg-[#38BDF8]/12"
                      >
                        <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                          {idx + 1}
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
              {syncContacts.map((c, idx) => {
                const waPhone = normalizePhoneForWA(c.noHp);
                const isSynced = Boolean(syncStatus?.connected && waPhone && !unsyncedSet.has(waPhone));
                return (
                  <article
                    key={`${waPhone}-${idx}`}
                    className="rounded-[14px] border border-[#1D4ED8]/14 odd:bg-white/85 even:bg-[#EFF6FF]/85 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="tabular-mono text-xs font-bold text-[#64748B]">
                          #{idx + 1}{' '}
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
          </>
        )}
      </div>
    </section>
  );
}
