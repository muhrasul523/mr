import { FormEvent, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Code2,
  Loader2,
  Mail,
  Pencil,
  Plus,
  PlugZap,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  AccountSyncSummary,
  GoogleAccountConfig,
  formatNumberId,
} from '../types/contact';

export interface WorkerTestResult {
  ok: boolean;
  email?: string;
  googleContactsCount?: number;
  message: string;
}

interface AccountManagerModalProps {
  isOpen: boolean;
  accounts: GoogleAccountConfig[];
  accountSummaries?: AccountSyncSummary[];
  isMutating: boolean;
  onClose: () => void;
  onSaveAccounts: (nextList: GoogleAccountConfig[]) => Promise<boolean>;
  onTestWorkerAccount: (workerUrl: string, secretKey?: string) => Promise<WorkerTestResult>;
  onOpenWorkerCode: () => void;
}

function makeNextAccountId(accounts: GoogleAccountConfig[]): string {
  let maxNum = 1;
  for (const a of accounts) {
    const m = String(a.id || '').match(/(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `AKUN-${maxNum + 1}`;
}

export function AccountManagerModal({
  isOpen,
  accounts,
  accountSummaries = [],
  isMutating,
  onClose,
  onSaveAccounts,
  onTestWorkerAccount,
  onOpenWorkerCode,
}: AccountManagerModalProps) {
  const [newLabel, setNewLabel] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newWorkerUrl, setNewWorkerUrl] = useState('');
  const [newSecretKey, setNewSecretKey] = useState('');
  const [newMaxCapacity, setNewMaxCapacity] = useState(25000);
  const [isTestingNew, setIsTestingNew] = useState(false);
  const [newTestMsg, setNewTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editWorkerUrl, setEditWorkerUrl] = useState('');
  const [editSecretKey, setEditSecretKey] = useState('');
  const [editMaxCapacity, setEditMaxCapacity] = useState(25000);
  const [editStatus, setEditStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);
  const [rowTestResults, setRowTestResults] = useState<Record<string, { ok: boolean; text: string }>>({});

  if (!isOpen) return null;

  const summaryById = new Map<string, AccountSyncSummary>();
  for (const s of accountSummaries) {
    summaryById.set(s.id, s);
  }

  async function handleTestNewWorker() {
    const cleanUrl = newWorkerUrl.trim();
    if (!cleanUrl) return;
    setIsTestingNew(true);
    setNewTestMsg(null);
    try {
      const res = await onTestWorkerAccount(cleanUrl, newSecretKey.trim());
      setNewTestMsg({ ok: res.ok, text: res.message });
      if (res.ok && res.email && !newEmail.trim()) {
        setNewEmail(res.email);
      }
    } finally {
      setIsTestingNew(false);
    }
  }

  async function handleAddAccount(e: FormEvent) {
    e.preventDefault();
    const cleanLabel = newLabel.trim();
    if (!cleanLabel) return;

    const nextId = makeNextAccountId(accounts);
    const nextItem: GoogleAccountConfig = {
      id: nextId,
      label: cleanLabel,
      email: newEmail.trim(),
      workerUrl: newWorkerUrl.trim(),
      secretKey: newSecretKey.trim(),
      maxCapacity: Math.max(1000, Number(newMaxCapacity) || 25000),
      status: 'Aktif',
      isPrimary: false,
    };

    const ok = await onSaveAccounts([...accounts, nextItem]);
    if (ok) {
      setNewLabel('');
      setNewEmail('');
      setNewWorkerUrl('');
      setNewSecretKey('');
      setNewMaxCapacity(25000);
      setNewTestMsg(null);
    }
  }

  function startEdit(acc: GoogleAccountConfig) {
    setEditingId(acc.id);
    setEditLabel(acc.label);
    setEditEmail(acc.email);
    setEditWorkerUrl(acc.workerUrl);
    setEditSecretKey(acc.secretKey || '');
    setEditMaxCapacity(acc.maxCapacity || 25000);
    setEditStatus(acc.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif');
  }

  async function handleSaveEdit(acc: GoogleAccountConfig) {
    const cleanLabel = editLabel.trim() || acc.label;
    const nextList = accounts.map((item) =>
      item.id === acc.id
        ? {
            ...item,
            label: cleanLabel,
            email: editEmail.trim(),
            workerUrl: item.isPrimary ? '' : editWorkerUrl.trim(),
            secretKey: item.isPrimary ? '' : editSecretKey.trim(),
            maxCapacity: Math.max(1000, Number(editMaxCapacity) || 25000),
            status: item.isPrimary ? 'Aktif' : editStatus,
          }
        : item
    );
    const ok = await onSaveAccounts(nextList);
    if (ok) {
      setEditingId(null);
    }
  }

  async function handleToggleStatus(acc: GoogleAccountConfig) {
    if (acc.isPrimary) return;
    const nextStatus: 'Aktif' | 'Nonaktif' = acc.status === 'Aktif' ? 'Nonaktif' : 'Aktif';
    const nextList = accounts.map((item) =>
      item.id === acc.id ? { ...item, status: nextStatus } : item
    );
    await onSaveAccounts(nextList);
  }

  async function handleDeleteAccount(acc: GoogleAccountConfig) {
    if (acc.isPrimary) return;
    const nextList = accounts.filter((item) => item.id !== acc.id);
    await onSaveAccounts(nextList);
  }

  async function handleTestExisting(acc: GoogleAccountConfig) {
    if (!acc.workerUrl.trim()) return;
    setTestingAccountId(acc.id);
    try {
      const res = await onTestWorkerAccount(acc.workerUrl.trim(), acc.secretKey || '');
      setRowTestResults((prev) => ({
        ...prev,
        [acc.id]: { ok: res.ok, text: res.message },
      }));
      if (res.ok && res.email && !acc.email.trim()) {
        const nextList = accounts.map((item) =>
          item.id === acc.id ? { ...item, email: res.email || item.email } : item
        );
        await onSaveAccounts(nextList);
      }
    } finally {
      setTestingAccountId(null);
    }
  }

  const totalCapacity = accounts
    .filter((a) => a.status !== 'Nonaktif')
    .reduce((sum, a) => sum + (Number(a.maxCapacity) || 25000), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#061A40]/45 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      onClick={onClose}
    >
      <div
        className="glass-surface flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[22px] bg-white/97 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[#1D4ED8]/12 bg-gradient-to-r from-[#0A2463] via-[#1D4ED8] to-[#0284C7] px-5 py-4 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="account-modal-title" className="text-base font-bold">
                Kelola Multi-Akun Google Kontak
              </h3>
              <p className="mt-0.5 text-xs text-white/85 break-words">
                Hubungkan 2–3+ akun Gmail (total kapasitas aktif{' '}
                <strong className="tabular-mono">{formatNumberId(totalCapacity)}</strong> kontak).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengelola akun Google"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white transition-colors hover:bg-white/25"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Quick Worker.gs helper banner */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#0284C7]/25 bg-[#F0F9FF]/90 px-4 py-3 text-xs text-[#0A2463]">
            <div className="min-w-0 flex-1 leading-relaxed">
              <strong>Cara tambah Akun 2 / Akun 3:</strong> Login Gmail baru di{' '}
              <span className="tabular-mono font-semibold">script.google.com</span>, tempel{' '}
              <span className="tabular-mono font-semibold text-[#1D4ED8]">Worker.gs</span>, aktifkan{' '}
              <strong>People API</strong>, lalu Deploy sebagai Web App dan tempel URL-nya di bawah.
            </div>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWorkerCode();
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/25 bg-white px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap shrink-0"
            >
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Buka Kode Worker.gs</span>
            </button>
          </div>

          {/* Existing Accounts List */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0A2463]">
                Daftar Akun Terhubung ({accounts.length})
              </span>
              <span className="text-[11px] text-[#64748B]">
                Akun Utama selalu menggunakan Apps Script Spreadsheet ini
              </span>
            </div>

            {accounts.map((acc) => {
              const isEditing = editingId === acc.id;
              const sum = summaryById.get(acc.id);
              const rowTest = rowTestResults[acc.id];
              const gCount = sum?.googleContactsCount ?? 0;
              const cap = acc.maxCapacity || 25000;
              const capPct = Math.min(100, Math.round((gCount / Math.max(1, cap)) * 100));

              return (
                <div
                  key={acc.id}
                  className={`rounded-2xl border p-3.5 transition-colors ${
                    acc.status === 'Nonaktif'
                      ? 'border-slate-200 bg-slate-50/80 opacity-80'
                      : 'border-[#1D4ED8]/15 bg-[#EFF6FF]/55'
                  }`}
                >
                  {isEditing ? (
                    <div className="space-y-2.5">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[#0A2463]">
                            Label Akun ({acc.id})
                          </label>
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="min-h-[36px] w-full rounded-lg border border-[#1D4ED8]/25 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0A2463] outline-none"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-[#0A2463]">
                            Email Gmail (opsional/label)
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="akun2@gmail.com"
                            className="min-h-[36px] w-full rounded-lg border border-[#1D4ED8]/25 bg-white px-2.5 py-1.5 text-xs text-[#0A2463] outline-none"
                          />
                        </div>
                      </div>

                      {!acc.isPrimary && (
                        <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-[#0A2463]">
                              URL Web App Worker.gs
                            </label>
                            <input
                              type="url"
                              value={editWorkerUrl}
                              onChange={(e) => setEditWorkerUrl(e.target.value)}
                              placeholder="https://script.google.com/macros/s/.../exec"
                              className="tabular-mono min-h-[36px] w-full rounded-lg border border-[#1D4ED8]/25 bg-white px-2.5 py-1.5 text-xs text-[#0A2463] outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-[#0A2463]">
                              Kunci Rahasia (opsional)
                            </label>
                            <input
                              type="text"
                              value={editSecretKey}
                              onChange={(e) => setEditSecretKey(e.target.value)}
                              placeholder="Sama dgn Worker.gs"
                              className="tabular-mono min-h-[36px] w-full rounded-lg border border-[#1D4ED8]/25 bg-white px-2.5 py-1.5 text-xs text-[#0A2463] outline-none"
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#475569]">
                            <span>Kapasitas:</span>
                            <input
                              type="number"
                              min={1000}
                              max={25000}
                              step={1000}
                              value={editMaxCapacity}
                              onChange={(e) => setEditMaxCapacity(Number(e.target.value))}
                              className="tabular-mono min-h-[32px] w-24 rounded-lg border border-[#1D4ED8]/25 bg-white px-2 py-1 text-xs font-semibold text-[#0A2463]"
                            />
                          </label>
                          {!acc.isPrimary && (
                            <select
                              value={editStatus}
                              onChange={(e) =>
                                setEditStatus(e.target.value === 'Nonaktif' ? 'Nonaktif' : 'Aktif')
                              }
                              className="min-h-[32px] rounded-lg border border-[#1D4ED8]/25 bg-white px-2 py-1 text-xs font-semibold text-[#0A2463]"
                            >
                              <option value="Aktif">Status: Aktif</option>
                              <option value="Nonaktif">Status: Nonaktif</option>
                            </select>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="min-h-[34px] rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-[#475569] hover:bg-slate-50"
                          >
                            Batal
                          </button>
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => handleSaveEdit(acc)}
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Simpan
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="tabular-mono rounded-md bg-[#0A2463] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                              {acc.id}
                            </span>
                            <span className="text-sm font-bold text-[#0A2463] break-words">
                              {acc.label}
                            </span>
                            {acc.isPrimary && (
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#1D4ED8]/12 px-2 py-0.5 text-[10.5px] font-bold text-[#1D4ED8]">
                                <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                                Hub Utama
                              </span>
                            )}
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                                acc.status === 'Nonaktif'
                                  ? 'bg-slate-200 text-slate-600'
                                  : acc.isPrimary || acc.workerUrl
                                    ? 'bg-emerald-500/15 text-emerald-800'
                                    : 'bg-amber-500/15 text-[#B45309]'
                              }`}
                            >
                              {acc.status === 'Nonaktif'
                                ? 'Nonaktif'
                                : acc.isPrimary || acc.workerUrl
                                  ? 'Siap'
                                  : 'CSV Only (Belum ada URL Worker)'}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[#475569]">
                            <span className="break-all">
                              {acc.email || (acc.isPrimary ? 'Email pemilik Spreadsheet ini' : 'Email belum diisi')}
                            </span>
                            {sum && (
                              <span className="tabular-mono font-semibold text-[#0A2463]">
                                · {formatNumberId(gCount)} / {formatNumberId(cap)} ({capPct}%)
                              </span>
                            )}
                          </div>
                          {!acc.isPrimary && acc.workerUrl && (
                            <div className="tabular-mono mt-1 truncate text-[11px] text-[#64748B]" title={acc.workerUrl}>
                              Worker: {acc.workerUrl}
                            </div>
                          )}
                          {rowTest && (
                            <div
                              className={`mt-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold ${
                                rowTest.ok
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : 'bg-red-50 text-red-700'
                              }`}
                            >
                              {rowTest.text}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!acc.isPrimary && acc.workerUrl && (
                            <button
                              type="button"
                              disabled={testingAccountId === acc.id}
                              onClick={() => handleTestExisting(acc)}
                              title="Uji koneksi Worker.gs akun ini"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#1D4ED8]/20 bg-white px-2.5 text-[11.5px] font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF] disabled:opacity-50"
                            >
                              {testingAccountId === acc.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                              ) : (
                                <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                              )}
                              <span>Uji</span>
                            </button>
                          )}
                          {!acc.isPrimary && (
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => handleToggleStatus(acc)}
                              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-[#475569] hover:bg-slate-50"
                            >
                              {acc.status === 'Nonaktif' ? 'Aktifkan' : 'Nonaktif'}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isMutating}
                            onClick={() => startEdit(acc)}
                            title={`Edit ${acc.label}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#1D4ED8]/10 text-[#1D4ED8] hover:bg-[#1D4ED8]/20"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          {!acc.isPrimary && (
                            <button
                              type="button"
                              disabled={isMutating}
                              onClick={() => handleDeleteAccount(acc)}
                              title={`Hapus ${acc.label}`}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/10 text-red-700 hover:bg-red-600/20"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Add New Account Form */}
          <form
            onSubmit={handleAddAccount}
            className="space-y-3 rounded-2xl border border-[#1D4ED8]/18 bg-white p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0A2463]">
                Tambah Akun Google Baru ({makeNextAccountId(accounts)})
              </span>
              <span className="text-[11px] text-[#64748B]">
                URL Worker opsional jika hanya pakai CSV
              </span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="new-acc-label"
                  className="mb-1 block text-[11.5px] font-semibold text-[#0A2463]"
                >
                  Label Akun *
                </label>
                <input
                  id="new-acc-label"
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Contoh: Akun 2 (Donatur) atau Akun 3"
                  disabled={isMutating}
                  className="min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs text-[#091B3A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
                />
              </div>
              <div>
                <label
                  htmlFor="new-acc-email"
                  className="mb-1 block text-[11.5px] font-semibold text-[#0A2463]"
                >
                  Email Gmail
                </label>
                <input
                  id="new-acc-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="otomatis terisi saat Uji Worker"
                  disabled={isMutating}
                  className="min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs text-[#091B3A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
                />
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-[1fr_160px]">
              <div>
                <label
                  htmlFor="new-acc-worker"
                  className="mb-1 block text-[11.5px] font-semibold text-[#0A2463]"
                >
                  URL Web App Worker.gs
                </label>
                <input
                  id="new-acc-worker"
                  type="url"
                  value={newWorkerUrl}
                  onChange={(e) => {
                    setNewWorkerUrl(e.target.value);
                    setNewTestMsg(null);
                  }}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  disabled={isMutating}
                  className="tabular-mono min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs text-[#091B3A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
                />
              </div>
              <div>
                <label
                  htmlFor="new-acc-secret"
                  className="mb-1 block text-[11.5px] font-semibold text-[#0A2463]"
                >
                  Kunci Rahasia (opsional)
                </label>
                <input
                  id="new-acc-secret"
                  type="text"
                  value={newSecretKey}
                  onChange={(e) => setNewSecretKey(e.target.value)}
                  placeholder="Kosongkan jika bebas"
                  disabled={isMutating}
                  className="tabular-mono min-h-[38px] w-full rounded-xl border border-[#1D4ED8]/20 bg-white px-3 py-1.5 text-xs text-[#091B3A] outline-none focus:border-[#1D4ED8] focus:ring-2 focus:ring-[#38BDF8]/25"
                />
              </div>
            </div>

            {newTestMsg && (
              <div
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                  newTestMsg.ok
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}
              >
                {newTestMsg.ok && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span className="break-words">{newTestMsg.text}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                disabled={!newWorkerUrl.trim() || isTestingNew}
                onClick={handleTestNewWorker}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/25 bg-white px-3.5 py-2 text-xs font-semibold text-[#1D4ED8] hover:bg-[#EFF6FF] disabled:opacity-45 whitespace-nowrap"
              >
                {isTestingNew ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{isTestingNew ? 'Menguji Worker...' : 'Uji Koneksi Worker'}</span>
              </button>

              <button
                type="submit"
                disabled={isMutating || !newLabel.trim()}
                className="btn-ocean-sheen inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 whitespace-nowrap"
              >
                {isMutating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>Tambah Akun Google</span>
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-[#1D4ED8]/10 bg-white/95 px-5 py-3.5">
          <span className="text-[11.5px] text-[#64748B]">
            Atur pembagian kategori per akun di menu <strong>Kelola Kategori</strong>.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] rounded-xl border border-[#1D4ED8]/18 bg-white px-5 py-2 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
