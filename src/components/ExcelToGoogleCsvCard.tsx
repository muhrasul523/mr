import { useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileUp,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { formatNumberId } from '../types/contact';
import {
  ExcelConversionResult,
  downloadConvertedGoogleCsvBatch,
  downloadManualContactExcelTemplate,
  parseExcelToGoogleContacts,
} from '../utils/exportContacts';

interface ExcelToGoogleCsvCardProps {
  onNotify?: (
    text: string,
    variant?: 'success' | 'info' | 'warning' | 'error',
    title?: string
  ) => void;
}

const CHUNK_OPTIONS = [
  { value: 2500, label: '2.500 kontak / file (Disarankan)' },
  { value: 1000, label: '1.000 kontak / file' },
  { value: 2000, label: '2.000 kontak / file' },
  { value: 3000, label: '3.000 kontak / file (Batas Maks Google)' },
  { value: 0, label: 'Semua dalam 1 File CSV Utuh' },
];

export function ExcelToGoogleCsvCard({ onNotify }: ExcelToGoogleCsvCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<ExcelConversionResult | null>(null);
  const [chunkSize, setChunkSize] = useState<number>(2500);
  const [downloadedParts, setDownloadedParts] = useState<number[]>([]);

  const handleDownloadTemplate = () => {
    const filename = downloadManualContactExcelTemplate();
    onNotify?.(
      `Template "${filename}" berhasil diunduh. Isi kolom Nama Kontak, Kategori / Label, dan No HP, lalu unggah kembali di bawah untuk dikonversi ke CSV Google Kontak.`,
      'success',
      'Template Excel Siap Diisi'
    );
  };

  const processFile = async (file: File) => {
    setParseError('');
    setIsParsing(true);
    setDownloadedParts([]);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!['xlsx', 'xls', 'csv'].includes(ext)) {
        throw new Error('Format file harus Excel (.xlsx / .xls) atau .csv.');
      }
      const buffer = await file.arrayBuffer();
      const parsed = parseExcelToGoogleContacts(buffer, file.name);
      setResult(parsed);
      onNotify?.(
        `${formatNumberId(parsed.uniqueContacts.length)} kontak unik siap diunduh sebagai CSV Google Kontak (diproses 100% lokal, tanpa disimpan ke Drive).`,
        'success',
        'File Excel Berhasil Dikonversi'
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Gagal membaca file Excel. Pastikan format kolom benar.';
      setParseError(msg);
      setResult(null);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleReset = () => {
    setResult(null);
    setParseError('');
    setDownloadedParts([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const totalUnique = result?.uniqueContacts.length || 0;
  const isSingleFile = chunkSize === 0;
  const effectiveChunk = isSingleFile ? Math.max(1, totalUnique) : Math.max(100, chunkSize);
  const totalParts = totalUnique > 0 ? (isSingleFile ? 1 : Math.ceil(totalUnique / effectiveChunk)) : 0;

  const handleDownloadCsvPart = (partNum: number) => {
    if (!result || result.uniqueContacts.length === 0) return;
    const startIdx = isSingleFile ? 0 : (partNum - 1) * effectiveChunk;
    const endIdx = isSingleFile
      ? result.uniqueContacts.length
      : Math.min(startIdx + effectiveChunk, result.uniqueContacts.length);
    const slice = result.uniqueContacts.slice(startIdx, endIdx);
    if (slice.length === 0) return;

    const filename = downloadConvertedGoogleCsvBatch(
      slice,
      partNum,
      totalParts,
      isSingleFile,
      result.fileName
    );
    setDownloadedParts((prev) => (prev.includes(partNum) ? prev : [...prev, partNum]));
    onNotify?.(
      `${formatNumberId(slice.length)} kontak berhasil diunduh ke "${filename}". Siap diimpor ke Google Kontak.`,
      'success',
      isSingleFile ? 'CSV Google Kontak Diunduh' : `CSV Batch ${partNum} Diunduh`
    );
  };

  return (
    <div className="glass-surface rounded-[22px] p-4 sm:p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1D4ED8]/10 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 via-teal-600 to-[#0284C7] text-white shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="break-words text-sm font-bold text-[#0A2463] sm:text-[15px]">
                Template Excel Manual &amp; Konverter Excel → CSV Google Kontak
              </h3>
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/25 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800 whitespace-nowrap shrink-0">
                <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Instan · Tanpa Drive</span>
              </span>
            </div>
            <p className="mt-0.5 break-words text-xs leading-relaxed text-[#475569]">
              Isi manual <strong>Nama Kontak</strong>, <strong>Kategori / Label</strong>, dan{' '}
              <strong>No HP</strong> di Excel, lalu unggah di sini untuk langsung diubah menjadi{' '}
              <strong>CSV siap impor ke Google Kontak</strong> tanpa menunggu loading server.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5 hover:from-emerald-700 hover:to-teal-700 whitespace-nowrap shrink-0"
        >
          <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Unduh Template Excel (.xlsx)</span>
        </button>
      </div>

      {/* Upload Dropzone */}
      <div className="mt-4 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void processFile(file);
          }}
        />

        {!result ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void processFile(file);
            }}
            className={`cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition-colors sm:p-6 ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/70'
                : 'border-[#0284C7]/30 bg-gradient-to-br from-[#F0F9FF]/70 via-white/90 to-emerald-50/40 hover:border-[#1D4ED8]/50 hover:bg-[#EFF6FF]/60'
            }`}
          >
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1D4ED8]/10 text-[#1D4ED8]">
              <FileUp className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="mt-2.5 text-xs font-bold text-[#0A2463] sm:text-[13px]">
              {isParsing
                ? 'Sedang membaca & mengonversi file Excel...'
                : 'Klik atau seret file Excel (.xlsx / .xls / .csv) ke sini untuk dikonversi ke CSV Google Kontak'}
            </div>
            <p className="mx-auto mt-1 max-w-xl break-words text-[11.5px] leading-relaxed text-[#475569]">
              Otomatis mengenali kolom <strong>Nama Kontak</strong>, <strong>Kategori / Label</strong>{' '}
              (pisah banyak label dengan koma), dan <strong>No HP</strong> (08… / 628…). File{' '}
              <strong>tidak disimpan ke Google Drive</strong> — 100% diproses lokal di browser.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Loaded File Header */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-50/75 px-4 py-3 text-xs">
              <div className="flex min-w-0 items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                <div className="min-w-0">
                  <div className="break-all font-bold text-emerald-950">
                    {result.fileName}{' '}
                    <span className="font-medium text-emerald-800">(Sheet: {result.sheetName})</span>
                  </div>
                  <div className="mt-0.5 break-words text-[11px] text-emerald-900/90">
                    Kolom terdeteksi: <strong>Nama</strong> ({result.detectedColumns.nama}) ·{' '}
                    <strong>Kategori/Label</strong> ({result.detectedColumns.kategori}) ·{' '}
                    <strong>No HP</strong> ({result.detectedColumns.noHp})
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-emerald-600/30 bg-white px-3 py-1 text-[11.5px] font-bold text-emerald-900 transition-colors hover:bg-emerald-50 whitespace-nowrap"
                >
                  <FileUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Ganti File</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[#475569] transition-colors hover:bg-slate-50 whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            {/* Conversion Stats + Split Selector */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#1D4ED8]/15 bg-white/95 p-3">
                <div className="text-[11px] font-semibold text-[#64748B]">
                  Kontak Unik Siap Impor
                </div>
                <div className="tabular-mono mt-0.5 text-xl font-extrabold text-[#0A2463]">
                  {formatNumberId(totalUnique)} kontak
                </div>
                <div className="mt-0.5 text-[11px] text-[#475569]">
                  Dari {formatNumberId(result.totalRawRows)} baris
                  {result.duplicatePhonesMerged > 0
                    ? ` · ${formatNumberId(result.duplicatePhonesMerged)} duplikat digabung`
                    : ''}
                  {result.skippedRows > 0
                    ? ` · ${formatNumberId(result.skippedRows)} tanpa no HP dilewati`
                    : ''}
                </div>
              </div>

              <div className="rounded-xl border border-[#1D4ED8]/15 bg-white/95 p-3">
                <div className="text-[11px] font-semibold text-[#64748B]">
                  Label Google Kontak Terdeteksi
                </div>
                <div className="tabular-mono mt-0.5 text-xl font-extrabold text-emerald-800">
                  {formatNumberId(result.detectedLabels.length)} label
                </div>
                <div className="mt-0.5 truncate text-[11px] text-[#475569]" title={result.detectedLabels.join(', ')}>
                  {result.detectedLabels.length > 0
                    ? result.detectedLabels.slice(0, 4).join(', ') +
                      (result.detectedLabels.length > 4
                        ? ` +${result.detectedLabels.length - 4} lainnya`
                        : '')
                    : 'Tanpa label khusus (masuk My Contacts)'}
                </div>
              </div>

              <div className="rounded-xl border border-[#1D4ED8]/15 bg-white/95 p-3">
                <label
                  htmlFor="excel-converter-chunk-size"
                  className="block text-[11px] font-semibold text-[#64748B]"
                >
                  Pecah File CSV Google Kontak
                </label>
                <select
                  id="excel-converter-chunk-size"
                  value={chunkSize}
                  onChange={(e) => {
                    setChunkSize(Number(e.target.value));
                    setDownloadedParts([]);
                  }}
                  className="mt-1 min-h-[36px] w-full rounded-lg border border-[#1D4ED8]/22 bg-[#F8FAFC] px-2.5 py-1 text-xs font-bold text-[#0A2463] outline-none focus:border-[#1D4ED8]"
                >
                  {CHUNK_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <div className="tabular-mono mt-1 text-[11px] font-semibold text-[#1D4ED8]">
                  Menghasilkan {formatNumberId(totalParts)} file CSV siap impor
                </div>
              </div>
            </div>

            {/* Mini Preview of First 5 Converted Rows */}
            <div className="overflow-hidden rounded-xl border border-[#1D4ED8]/14 bg-white/95">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1D4ED8]/10 bg-[#F8FAFC] px-3.5 py-2 text-[11.5px]">
                <span className="font-bold text-[#0A2463]">
                  Pratinjau Hasil Konversi (5 kontak pertama)
                </span>
                <span className="text-[#64748B]">
                  Format resmi Google Kontak (+62 &amp; Group Membership otomatis)
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1D4ED8]/10 text-[11px] font-bold text-[#475569]">
                      <th className="px-3 py-2">Nama di Google Kontak</th>
                      <th className="px-3 py-2">No HP (Format +62)</th>
                      <th className="px-3 py-2">Label / Kategori</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1D4ED8]/8">
                    {result.uniqueContacts.slice(0, 5).map((item) => (
                      <tr key={item.cleanPhone} className="hover:bg-[#F0F9FF]/60">
                        <td className="px-3 py-2 font-semibold text-[#0A2463]">{item.nama}</td>
                        <td className="tabular-mono px-3 py-2 font-medium text-[#1D4ED8]">
                          +{item.cleanPhone}
                        </td>
                        <td className="px-3 py-2 text-[#475569]">
                          {item.labels.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {item.labels.map((lbl) => (
                                <span
                                  key={lbl}
                                  className="rounded-md bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-bold text-emerald-800"
                                >
                                  {lbl}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#94A3B8]">My Contacts</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Download CSV Buttons */}
            <div className="rounded-2xl border border-[#1D4ED8]/18 bg-gradient-to-br from-[#F0F9FF]/80 via-white to-emerald-50/50 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-[#0A2463]">
                  Unduh File CSV Siap Impor ke Google Kontak ({formatNumberId(totalParts)} file):
                </div>
                <a
                  href="https://contacts.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/25 bg-white px-3 py-1 text-[11.5px] font-bold text-[#1D4ED8] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap shrink-0"
                >
                  <span>Buka Google Kontak (Impor)</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from({ length: totalParts }, (_, idx) => {
                  const partNum = idx + 1;
                  const startIdx = isSingleFile ? 0 : idx * effectiveChunk;
                  const countInPart = isSingleFile
                    ? totalUnique
                    : Math.min(effectiveChunk, totalUnique - startIdx);
                  const isDone = downloadedParts.includes(partNum);
                  return (
                    <button
                      key={partNum}
                      type="button"
                      onClick={() => handleDownloadCsvPart(partNum)}
                      className={`inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition-all whitespace-nowrap ${
                        isDone
                          ? 'border border-emerald-500/40 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          : 'btn-ocean-sheen text-white hover:-translate-y-0.5'
                      }`}
                    >
                      {isDone ? (
                        <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      ) : (
                        <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
                      )}
                      <span>
                        {isSingleFile
                          ? `Unduh CSV Utuh (${formatNumberId(countInPart)} kontak)`
                          : `Unduh CSV Batch ${partNum} (${formatNumberId(countInPart)})`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Parse Error Banner */}
        {parseError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-red-500/35 bg-red-50/90 p-3.5 text-xs text-red-950">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
            <div className="min-w-0 break-words">
              <strong className="block font-bold">Gagal Mengonversi File</strong>
              <span>{parseError}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
