import { FormEvent, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { CategoryItem, makeDefaultCategoryCode } from '../types/contact';

interface CategoryManagerModalProps {
  isOpen: boolean;
  categories: CategoryItem[];
  isMutating: boolean;
  onClose: () => void;
  onSaveCategories: (
    nextList: CategoryItem[],
    historyAction: string,
    historyDetail: string,
    renameMap?: Record<string, string>
  ) => Promise<boolean>;
}

export function CategoryManagerModal({
  isOpen,
  categories,
  isMutating,
  onClose,
  onSaveCategories,
}: CategoryManagerModalProps) {
  const [newNama, setNewNama] = useState('');
  const [newKode, setNewKode] = useState('');

  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editKode, setEditKode] = useState('');

  if (!isOpen) return null;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const cleanNama = newNama.trim();
    const cleanKode = newKode.trim() || makeDefaultCategoryCode(cleanNama);
    if (!cleanNama) return;

    const duplicate = categories.some(
      (c) => c.nama.toLowerCase() === cleanNama.toLowerCase()
    );
    if (duplicate) return;

    const nextList = [...categories, { nama: cleanNama, kode: cleanKode }];
    const ok = await onSaveCategories(
      nextList,
      'Tambah Kategori',
      `Menambahkan kategori "${cleanNama} (${cleanKode})"`
    );
    if (ok) {
      setNewNama('');
      setNewKode('');
    }
  }

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditNama(categories[index].nama);
    setEditKode(categories[index].kode);
  }

  async function handleSaveEdit(index: number) {
    const cleanNama = editNama.trim();
    const cleanKode = editKode.trim() || makeDefaultCategoryCode(cleanNama);
    if (!cleanNama) return;

    const duplicate = categories.some(
      (c, i) => i !== index && c.nama.toLowerCase() === cleanNama.toLowerCase()
    );
    if (duplicate) return;

    const oldItem = categories[index];
    const nextList = categories.map((c, i) =>
      i === index ? { nama: cleanNama, kode: cleanKode } : c
    );
    const renameMap =
      oldItem.nama !== cleanNama ? { [oldItem.nama]: cleanNama } : undefined;

    const ok = await onSaveCategories(
      nextList,
      'Edit Kategori',
      `Mengubah "${oldItem.nama} (${oldItem.kode})" menjadi "${cleanNama} (${cleanKode})"`,
      renameMap
    );
    if (ok) {
      setEditingIndex(null);
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= categories.length) return;
    const nextList = [...categories];
    const temp = nextList[index];
    nextList[index] = nextList[target];
    nextList[target] = temp;

    await onSaveCategories(
      nextList,
      'Ubah Urutan Kategori',
      `Memindahkan posisi "${temp.nama} (${temp.kode})"`
    );
  }

  async function handleDelete(index: number) {
    if (categories.length <= 1) return;
    const removed = categories[index];
    const nextList = categories.filter((_, i) => i !== index);
    await onSaveCategories(
      nextList,
      'Hapus Kategori',
      `Menghapus kategori "${removed.nama} (${removed.kode})"`
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
    >
      <div className="glass-surface w-full max-w-lg rounded-[22px] bg-white/95 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#1D4ED8]/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#1D4ED8] text-white shadow-sm">
              <Tag className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 id="category-modal-title" className="text-base font-bold text-[#0A2463]">
                Kelola Kategori &amp; Kode
              </h3>
              <p className="mt-0.5 text-xs text-[#475569]">
                Tambah, edit nama &amp; kode, hapus, atau atur urutan kategori pilihan.
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

        {/* Form Tambah Kategori + Kode */}
        <form onSubmit={handleAdd} className="mt-4 grid grid-cols-[1fr_105px_auto] gap-2">
          <input
            type="text"
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            placeholder="Nama kategori (mis. Keluarga)"
            aria-label="Nama kategori baru"
            disabled={isMutating}
            className="min-h-[42px] rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#38BDF8]/25"
          />
          <input
            type="text"
            value={newKode}
            onChange={(e) => setNewKode(e.target.value)}
            placeholder="Kode (Fam)"
            aria-label="Kode singkat kategori"
            maxLength={8}
            disabled={isMutating}
            className="tabular-mono min-h-[42px] rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-2 text-sm text-[#091B3A] outline-none transition-all focus:border-[#1D4ED8] focus:ring-3 focus:ring-[#38BDF8]/25"
          />
          <button
            type="submit"
            disabled={isMutating || !newNama.trim()}
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

        {/* List Kategori dengan Ubah Urutan, Edit, dan Hapus */}
        <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
          {categories.map((cat, idx) => {
            const isEditing = editingIndex === idx;
            return (
              <div
                key={`${cat.nama}-${idx}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1D4ED8]/12 bg-[#EFF6FF]/75 px-3 py-2.5"
              >
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-2">
                    <input
                      type="text"
                      value={editNama}
                      onChange={(e) => setEditNama(e.target.value)}
                      className="min-h-[34px] flex-1 rounded-lg border border-[#1D4ED8]/25 bg-white px-2.5 py-1 text-xs font-semibold text-[#0A2463] outline-none"
                      aria-label="Edit nama kategori"
                    />
                    <input
                      type="text"
                      value={editKode}
                      onChange={(e) => setEditKode(e.target.value)}
                      maxLength={8}
                      className="tabular-mono min-h-[34px] w-20 rounded-lg border border-[#1D4ED8]/25 bg-white px-2.5 py-1 text-xs font-semibold text-[#1D4ED8] outline-none"
                      aria-label="Edit kode kategori"
                    />
                    <button
                      type="button"
                      disabled={isMutating || !editNama.trim()}
                      onClick={() => handleSaveEdit(idx)}
                      aria-label="Simpan perubahan kategori"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingIndex(null)}
                      aria-label="Batal edit kategori"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-700 hover:bg-slate-300"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="tabular-mono text-xs font-semibold text-[#64748B]">
                        {idx + 1}.
                      </span>
                      <span className="truncate text-[13.5px] font-semibold text-[#0A2463]">
                        {cat.nama}
                      </span>
                      <span className="tabular-mono text-xs font-semibold text-[#1D4ED8]">
                        ({cat.kode})
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={isMutating || idx === 0}
                        onClick={() => handleMove(idx, -1)}
                        title="Geser ke atas"
                        aria-label={`Geser ${cat.nama} ke atas`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#0A2463] border border-[#1D4ED8]/15 hover:bg-[#DBEAFE] disabled:opacity-35"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isMutating || idx === categories.length - 1}
                        onClick={() => handleMove(idx, 1)}
                        title="Geser ke bawah"
                        aria-label={`Geser ${cat.nama} ke bawah`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#0A2463] border border-[#1D4ED8]/15 hover:bg-[#DBEAFE] disabled:opacity-35"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isMutating}
                        onClick={() => startEdit(idx)}
                        title="Edit kategori"
                        aria-label={`Edit ${cat.nama}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8] hover:bg-[#1D4ED8]/20 disabled:opacity-35"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        disabled={isMutating || categories.length <= 1}
                        onClick={() => handleDelete(idx)}
                        title={
                          categories.length <= 1
                            ? 'Minimal satu kategori harus tersedia'
                            : `Hapus ${cat.nama}`
                        }
                        aria-label={`Hapus kategori ${cat.nama}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 text-red-700 hover:bg-red-600/20 disabled:opacity-35"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
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
