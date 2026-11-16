import { FormEvent, useState } from 'react';
import { Loader2, Plus, Tag, Trash2, X } from 'lucide-react';

interface CategoryManagerModalProps {
  isOpen: boolean;
  categories: string[];
  isMutating: boolean;
  onClose: () => void;
  onAddCategory: (name: string) => Promise<boolean>;
  onDeleteCategory: (name: string) => Promise<void>;
}

export function CategoryManagerModal({
  isOpen,
  categories,
  isMutating,
  onClose,
  onAddCategory,
  onDeleteCategory,
}: CategoryManagerModalProps) {
  const [newCategory, setNewCategory] = useState('');

  if (!isOpen) return null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = newCategory.trim();
    if (!trimmed) return;
    const ok = await onAddCategory(trimmed);
    if (ok) {
      setNewCategory('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/40 p-5 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
    >
      <div className="glass-surface w-full max-w-md rounded-[22px] bg-white/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#1D4ED8]/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#1D4ED8] text-white shadow-sm">
              <Tag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="category-modal-title" className="text-base font-bold text-[#0A2463]">
                Kelola Kategori Kontak
              </h3>
              <p className="mt-0.5 text-xs text-[#475569]">
                Tambah atau hapus daftar kategori pilihan dropdown.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengelola kategori"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-[#1D4ED8]/10 hover:text-[#0A2463]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleAdd} className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Nama kategori baru..."
            aria-label="Nama kategori baru"
            disabled={isMutating}
            className="min-h-[42px] flex-1 rounded-xl border border-[#1D4ED8]/20 bg-white px-3.5 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#38BDF8]/25"
          />
          <button
            type="submit"
            disabled={isMutating || !newCategory.trim()}
            className="btn-ocean-sheen inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isMutating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Tambah
          </button>
        </form>

        <div className="mt-4 max-h-64 space-y-1.5 overflow-y-auto pr-1">
          {categories.map((cat) => (
            <div
              key={cat}
              className="flex items-center justify-between rounded-xl border border-[#1D4ED8]/10 bg-[#EFF6FF]/70 px-3.5 py-2.5"
            >
              <span className="text-[13.5px] font-semibold text-[#0A2463]">{cat}</span>
              <button
                type="button"
                disabled={isMutating || categories.length <= 1}
                onClick={() => onDeleteCategory(cat)}
                title={
                  categories.length <= 1
                    ? 'Minimal satu kategori harus tersedia'
                    : `Hapus kategori ${cat}`
                }
                aria-label={`Hapus kategori ${cat}`}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-600/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Hapus
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end border-t border-[#1D4ED8]/10 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-xl border border-[#1D4ED8]/15 bg-white px-5 py-2 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF]"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
