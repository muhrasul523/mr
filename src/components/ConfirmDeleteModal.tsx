import { Trash2, X } from 'lucide-react';
import type { Contact } from '../types/contact';

interface ConfirmDeleteModalProps {
  contact: Contact | null;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDeleteModal({
  contact,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!contact) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/40 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="glass-surface w-full max-w-md rounded-[22px] bg-white/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-700">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h3
                id="delete-dialog-title"
                className="text-base font-bold text-[#0A2463]"
              >
                Hapus Kontak?
              </h3>
              <p className="mt-0.5 text-xs text-[#475569]">
                Tindakan ini menghapus data dari Sheet &amp; Google Kontak.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            aria-label="Tutup dialog"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-[#1D4ED8]/10 hover:text-[#0A2463]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-[#1E293B]">
          Anda yakin ingin menghapus <strong className="font-semibold text-[#0A2463]">{contact.nama}</strong>{' '}
          (<span className="tabular-mono text-[13px]">{contact.noHp}</span>)?
        </p>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            className="min-h-[40px] rounded-xl border border-[#1D4ED8]/18 bg-white px-4 py-2 text-[13px] font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="min-h-[40px] rounded-xl bg-red-700 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-800 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            {isDeleting ? 'Menghapus...' : 'Hapus Permanen'}
          </button>
        </div>
      </div>
    </div>
  );
}
