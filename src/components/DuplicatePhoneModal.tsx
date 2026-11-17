import { AlertTriangle, Pencil, UserPlus, X } from 'lucide-react';
import { Contact, TANPA_KATEGORI_LABEL, normalizePhoneForWA } from '../types/contact';

interface DuplicatePhoneModalProps {
  existingContact: Contact | null;
  draftName: string;
  draftPhone: string;
  onEditExisting: () => void;
  onCreateNewAnyway: () => void;
  onCancel: () => void;
}

export function DuplicatePhoneModal({
  existingContact,
  draftName,
  draftPhone,
  onEditExisting,
  onCreateNewAnyway,
  onCancel,
}: DuplicatePhoneModalProps) {
  if (!existingContact) return null;

  const cleanPhone = normalizePhoneForWA(draftPhone || existingContact.noHp);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      <div className="glass-surface w-full max-w-md rounded-[22px] bg-white/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-[#B45309]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id="duplicate-modal-title" className="text-base font-bold text-[#0A2463]">
                Nomor WhatsApp Sudah Terdaftar
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#475569]">
                Nomor <span className="tabular-mono font-semibold text-[#1D4ED8]">{cleanPhone}</span> sudah ada di daftar kontak Anda.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Tutup dialog konfirmasi"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#64748B] transition-colors hover:bg-[#1D4ED8]/10 hover:text-[#0A2463]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#1D4ED8]/14 bg-[#EFF6FF]/80 p-3.5 text-[13px]">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[#64748B]">
            Kontak Terdaftar Sebelumnya
          </div>
          <div className="mt-1 font-bold text-[#061A40]">{existingContact.nama}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[#475569]">
            <span className="tabular-mono font-semibold text-[#1D4ED8]">
              {normalizePhoneForWA(existingContact.noHp)}
            </span>
            <span aria-hidden="true">·</span>
            <span>{existingContact.kategori || TANPA_KATEGORI_LABEL}</span>
            <span aria-hidden="true">·</span>
            <span>{existingContact.jenisKelamin}</span>
          </div>
          {draftName.trim() && draftName.trim() !== existingContact.nama && (
            <div className="mt-2 border-t border-[#1D4ED8]/12 pt-2 text-xs text-[#475569]">
              Input baru Anda: <strong className="text-[#0A2463]">{draftName.trim()}</strong>
            </div>
          )}
        </div>

        <p className="mt-3.5 text-xs leading-relaxed text-[#475569]">
          Pilih apakah Anda ingin mengubah data kontak lama tersebut atau tetap menyimpannya sebagai entri kontak baru yang terpisah.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onEditExisting}
            className="btn-ocean-sheen inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit Kontak Lama ({existingContact.nama})
          </button>
          <button
            type="button"
            onClick={onCreateNewAnyway}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#1D4ED8]/20 bg-[#EFF6FF] px-4 py-2.5 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#DBEAFE]"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Tetap Simpan Sebagai Kontak Baru
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-[#475569] transition-colors hover:bg-slate-50"
          >
            Batal &amp; Ubah Nomor
          </button>
        </div>
      </div>
    </div>
  );
}
