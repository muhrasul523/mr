import { AlertTriangle, Pencil, UserPlus, X } from 'lucide-react';
import { Contact, TANPA_KATEGORI_LABEL, normalizePhoneForWA } from '../types/contact';

interface DuplicatePhoneModalProps {
  existingContacts: Contact[];
  draftName: string;
  draftPhone: string;
  draftCategories: string[];
  onEditExisting: (contact: Contact) => void;
  onCreateNewAnyway: () => void;
  onCancel: () => void;
}

export function DuplicatePhoneModal({
  existingContacts,
  draftName,
  draftPhone,
  draftCategories,
  onEditExisting,
  onCreateNewAnyway,
  onCancel,
}: DuplicatePhoneModalProps) {
  if (!existingContacts || existingContacts.length === 0) return null;

  const cleanPhone = normalizePhoneForWA(draftPhone || existingContacts[0].noHp);
  const existingCatSet = new Set(
    existingContacts.map((c) => String(c.kategori || '').trim().toLowerCase())
  );
  const targetCatLabels =
    draftCategories.length > 0 ? draftCategories : [TANPA_KATEGORI_LABEL];

  const overlapCats = draftCategories.filter((cat) =>
    existingCatSet.has(cat.trim().toLowerCase())
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-modal-title"
    >
      <div className="glass-surface flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-[22px] bg-white/97 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-[#B45309]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3 id="duplicate-modal-title" className="text-base font-bold text-[#0A2463]">
                Nomor WhatsApp Sudah Ada ({existingContacts.length} entri)
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#475569]">
                Nomor <span className="tabular-mono font-semibold text-[#1D4ED8]">{cleanPhone}</span> sudah terdaftar sebelumnya. Anda tetap boleh menyimpannya ke kategori lain (multi-kategori) atau memilih mengedit entri yang lama.
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

        {/* Existing Entries List */}
        <div className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-[#1D4ED8]/14 bg-[#EFF6FF]/75 p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">
            Entri Terdaftar Sebelumnya
          </div>
          {existingContacts.map((item, idx) => (
            <div
              key={`${item.rowIndex ?? idx}-${item.kategori}-${item.nama}`}
              className="flex items-center justify-between gap-2 rounded-xl border border-[#1D4ED8]/12 bg-white/90 px-3 py-2 text-[12.5px]"
            >
              <div className="min-w-0">
                <div className="truncate font-bold text-[#061A40]">{item.nama}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#475569]">
                  <span className="font-semibold text-[#0284C7]">
                    {item.kategori || TANPA_KATEGORI_LABEL}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.jenisKelamin}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEditExisting(item)}
                className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg bg-[#1D4ED8]/10 px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8]/20 whitespace-nowrap"
              >
                <Pencil className="h-3 w-3" aria-hidden="true" />
                Edit Ini
              </button>
            </div>
          ))}
        </div>

        {/* Incoming Draft Summary */}
        <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-50/75 px-3.5 py-2.5 text-xs text-emerald-950">
          <div>
            Input baru: <strong>{draftName.trim() || existingContacts[0].nama}</strong>
          </div>
          <div className="mt-1">
            Kategori yang akan disimpan ({targetCatLabels.length}):{' '}
            <strong>{targetCatLabels.join(', ')}</strong>
          </div>
          {overlapCats.length > 0 && (
            <div className="mt-1 text-[#92400E]">
              Catatan: Kategori <strong>{overlapCats.join(', ')}</strong> sudah pernah ada untuk nomor ini.
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCreateNewAnyway}
            className="btn-ocean-sheen inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {targetCatLabels.length > 1
              ? `Tetap Simpan ke ${targetCatLabels.length} Kategori Terpilih`
              : `Tetap Simpan Baru (${targetCatLabels[0]})`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-[#475569] transition-colors hover:bg-slate-50"
          >
            Batal &amp; Periksa Ulang
          </button>
        </div>
      </div>
    </div>
  );
}
