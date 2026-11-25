import { CheckCircle2, Database, Mail, X } from 'lucide-react';
import {
  AccountSyncSummary,
  GoogleAccountConfig,
  TANPA_KATEGORI_LABEL,
  formatNumberId,
} from '../types/contact';

interface ChooseAccountSaveModalProps {
  isOpen: boolean;
  isEditMode: boolean;
  contactName: string;
  contactPhone: string;
  contactCategories: string[];
  accounts: GoogleAccountConfig[];
  accountSummaries?: AccountSyncSummary[];
  recommendedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  onCancel: () => void;
}

export function ChooseAccountSaveModal({
  isOpen,
  isEditMode,
  contactName,
  contactPhone,
  contactCategories,
  accounts,
  accountSummaries,
  recommendedAccountId,
  onSelectAccount,
  onCancel,
}: ChooseAccountSaveModalProps) {
  if (!isOpen) return null;

  const summaryMap = new Map((accountSummaries || []).map((s) => [s.id, s]));
  const activeAccounts = accounts.filter((a) => a.status === 'Aktif' || a.isPrimary);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091B3A]/45 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="choose-account-save-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[24px] border border-[#1D4ED8]/18 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-[#0A2463] via-[#1D4ED8] to-[#0284C7] px-5 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="choose-account-save-title"
                className="break-words text-sm font-bold sm:text-base"
              >
                {isEditMode
                  ? 'Simpan Perubahan ke Akun Email Mana?'
                  : 'Simpan Kontak ke Akun Email Mana?'}
              </h2>
              <p className="mt-0.5 text-[11.5px] text-white/85">
                Pilih akun Gmail tujuan — kontak langsung tersimpan ke Spreadsheet &amp; Google Kontak akun pilihan.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup pilihan akun"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Contact Preview Strip */}
        <div className="border-b border-[#1D4ED8]/10 bg-[#F0F9FF]/75 px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <div className="truncate font-bold text-[#0A2463]">{contactName}</div>
              <div className="tabular-mono text-[11.5px] text-[#1D4ED8]">+{contactPhone}</div>
            </div>
            <div className="max-w-[220px] truncate rounded-lg border border-[#1D4ED8]/18 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0A2463]">
              {contactCategories.length > 0
                ? contactCategories.join(', ')
                : TANPA_KATEGORI_LABEL}
            </div>
          </div>
        </div>

        {/* Account Cards */}
        <div className="max-h-[58vh] space-y-2.5 overflow-y-auto px-5 py-4">
          {activeAccounts.map((acc) => {
            const sum = summaryMap.get(acc.id);
            const used = sum?.googleContactsCount ?? 0;
            const maxCap = acc.maxCapacity || 25000;
            const remaining = Math.max(0, maxCap - used);
            const isRecommended = recommendedAccountId === acc.id;
            const isReady = acc.isPrimary || Boolean(acc.workerUrl);

            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => onSelectAccount(acc.id)}
                className={`group flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md ${
                  isRecommended
                    ? 'border-[#1D4ED8] bg-[#EFF6FF]/90 ring-2 ring-[#38BDF8]/30'
                    : 'border-[#1D4ED8]/18 bg-white hover:border-[#1D4ED8]/45 hover:bg-[#F8FAFC]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tabular-mono shrink-0 rounded-md bg-[#0A2463] px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {acc.id}
                    </span>
                    <span className="truncate text-[13px] font-bold text-[#0A2463]">
                      {acc.label}
                    </span>
                    {isRecommended && (
                      <span className="shrink-0 rounded-md bg-[#1D4ED8]/12 px-1.5 py-0.5 text-[10px] font-bold text-[#1D4ED8]">
                        Pilihan saat ini
                      </span>
                    )}
                    {!isReady && (
                      <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-[#B45309]">
                        Hanya Spreadsheet (Worker belum diatur)
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate text-[11.5px] text-[#475569]">
                    {acc.email || (acc.isPrimary ? 'Email utama pemilik Spreadsheet' : 'Akun Gmail tambahan')}
                  </div>
                  <div className="tabular-mono mt-1 text-[11px] font-medium text-[#64748B]">
                    Terpakai {formatNumberId(used)} / {formatNumberId(maxCap)} · Sisa{' '}
                    <span className="font-bold text-emerald-700">
                      {formatNumberId(remaining)} slot
                    </span>
                  </div>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-[#1D4ED8] px-3 py-2 text-xs font-bold text-white transition-colors group-hover:bg-[#0A2463]">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Pilih</span>
                </span>
              </button>
            );
          })}

          {/* Option: Save to Spreadsheet only without pushing to Google Contacts */}
          <button
            type="button"
            onClick={() => onSelectAccount('')}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-[#64748B]/35 bg-[#F8FAFC] p-3 text-left text-xs transition-colors hover:border-[#0A2463]/45 hover:bg-white"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0A2463]/8 text-[#0A2463]">
                <Database className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="font-bold text-[#0A2463]">Simpan di Spreadsheet Saja</div>
                <div className="text-[11px] text-[#64748B]">
                  Simpan ke sheet Kontak tanpa langsung mengirim ke Google Kontak sekarang
                </div>
              </div>
            </div>
            <span className="shrink-0 rounded-lg border border-[#1D4ED8]/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#475569]">
              Lewati
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#1D4ED8]/10 bg-[#F8FAFC] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[38px] rounded-xl border border-[#1D4ED8]/20 bg-white px-4 py-1.5 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
