import { useState } from 'react';
import { Check, Loader2, Pencil, RefreshCw, Trash2, Users, X } from 'lucide-react';
import {
  CategoryItem,
  Contact,
  GENDER_OPTIONS,
  GenderOption,
  normalizePhoneForWA,
} from '../types/contact';

interface SyncSheetViewProps {
  syncContacts: Contact[];
  categories: CategoryItem[];
  isLoading: boolean;
  isSyncingBatch: boolean;
  onSyncAllToGoogleContacts: () => Promise<void>;
  onSaveManualRow: (row: Contact, originalNoHp: string) => Promise<boolean>;
  onDeleteManualRow: (row: Contact) => Promise<void>;
}

export function SyncSheetView({
  syncContacts,
  categories,
  isLoading,
  isSyncingBatch,
  onSyncAllToGoogleContacts,
  onSaveManualRow,
  onDeleteManualRow,
}: SyncSheetViewProps) {
  const [editingPhone, setEditingPhone] = useState<string | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editKategori, setEditKategori] = useState('');
  const [editGender, setEditGender] = useState<GenderOption>('Laki-laki');
  const [isSavingRow, setIsSavingRow] = useState(false);

  function startEdit(c: Contact) {
    setEditingPhone(c.noHp);
    setEditNama(c.nama);
    setEditKategori(c.kategori);
    setEditGender(c.jenisKelamin || 'Laki-laki');
  }

  async function saveEdit(originalNoHp: string) {
    if (!editNama.trim()) return;
    setIsSavingRow(true);
    const ok = await onSaveManualRow(
      {
        nama: editNama.trim(),
        noHp: normalizePhoneForWA(originalNoHp),
        kategori: editKategori,
        jenisKelamin: editGender,
      },
      originalNoHp
    );
    setIsSavingRow(false);
    if (ok) {
      setEditingPhone(null);
    }
  }

  return (
    <section
      className="glass-surface rounded-[22px] p-5 sm:p-6"
      aria-label="Sheet Sinkronisasi Google Kontak"
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4 border-b border-[#1D4ED8]/10 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0A2463] to-[#0284C7] text-white">
            <Users className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#0A2463]">
              Sheet Khusus Sinkronisasi Google Kontak (Kontak_Sync)
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#475569]">
              Terpisah dari sheet utama <strong>Kontak</strong>. Ubah nama kontak khusus yang tampil di Google Kontak/HP Anda di sheet ini atau melalui tabel di bawah. Jika kontak dihapus dari <strong>Kontak_Sync</strong>, kontak terkait di Google Kontak otomatis terhapus.
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

      {isLoading ? (
        <div className="space-y-2.5 py-2">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="h-11 animate-pulse rounded-xl bg-[#1D4ED8]/8" />
          ))}
        </div>
      ) : syncContacts.length === 0 ? (
        <div className="py-12 text-center">
          <h3 className="text-base font-bold text-[#0A2463]">Sheet Kontak_Sync masih kosong</h3>
          <p className="mx-auto mt-1.5 max-w-md text-[13.5px] text-[#475569]">
            Kontak yang disimpan dari aplikasi otomatis masuk ke <strong>Kontak</strong> dan <strong>Kontak_Sync</strong>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#1D4ED8]/12 text-xs font-semibold text-[#64748B]">
                <th className="w-12 px-3 py-2.5">No</th>
                <th className="px-3 py-2.5">Nama Tersimpan di Google Kontak</th>
                <th className="px-3 py-2.5">No HP</th>
                <th className="px-3 py-2.5">Kategori</th>
                <th className="px-3 py-2.5">Jenis Kelamin</th>
                <th className="px-3 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1D4ED8]/8 text-[13.5px]">
              {syncContacts.map((c, idx) => {
                const isEditing = editingPhone === c.noHp;
                return (
                  <tr
                    key={c.noHp}
                    className="odd:bg-white/40 even:bg-[#EFF6FF]/75 transition-colors hover:bg-[#38BDF8]/12"
                  >
                    <td className="tabular-mono px-3 py-3 text-xs font-semibold text-[#64748B]">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#061A40]">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editNama}
                          onChange={(e) => setEditNama(e.target.value)}
                          className="min-h-[34px] w-full rounded-lg border border-[#1D4ED8]/30 bg-white px-2.5 py-1 text-xs font-semibold text-[#0A2463] outline-none"
                          aria-label="Edit nama Google Kontak"
                        />
                      ) : (
                        c.nama
                      )}
                    </td>
                    <td className="tabular-mono px-3 py-3 text-[13px] font-semibold text-[#1D4ED8]">
                      {normalizePhoneForWA(c.noHp)}
                    </td>
                    <td className="px-3 py-3 text-[13px] font-semibold text-[#0284C7]">
                      {isEditing ? (
                        <select
                          value={editKategori}
                          onChange={(e) => setEditKategori(e.target.value)}
                          className="min-h-[34px] rounded-lg border border-[#1D4ED8]/30 bg-white px-2 py-1 text-xs font-semibold text-[#0A2463] outline-none"
                          aria-label="Edit kategori"
                        >
                          {categories.map((cat) => (
                            <option key={cat.nama} value={cat.nama}>
                              {cat.nama} ({cat.kode})
                            </option>
                          ))}
                        </select>
                      ) : (
                        c.kategori
                      )}
                    </td>
                    <td className="px-3 py-3 text-[13px] text-[#475569]">
                      {isEditing ? (
                        <select
                          value={editGender}
                          onChange={(e) => setEditGender(e.target.value as GenderOption)}
                          className="min-h-[34px] rounded-lg border border-[#1D4ED8]/30 bg-white px-2 py-1 text-xs font-semibold text-[#0A2463] outline-none"
                          aria-label="Edit jenis kelamin"
                        >
                          {GENDER_OPTIONS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      ) : (
                        c.jenisKelamin
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isSavingRow}
                            onClick={() => saveEdit(c.noHp)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Simpan
                          </button>
                          <button
                            type="button"
                            disabled={isSavingRow}
                            onClick={() => setEditingPhone(null)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-300"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-[#1D4ED8]/10 px-2.5 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:bg-[#1D4ED8]/18 whitespace-nowrap"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit Nama
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteManualRow(c)}
                            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-700/10 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-700/18 whitespace-nowrap"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Hapus
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
