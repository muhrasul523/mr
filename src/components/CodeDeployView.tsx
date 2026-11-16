import { useState } from 'react';
import { Check, Copy, Download, FileCode2, Globe } from 'lucide-react';
import codeGsRaw from '../../backend-gas/Code.gs?raw';
import standaloneHtmlRaw from '../../github-pages/index.html?raw';

interface CodeDeployViewProps {
  onNotify: (text: string, variant: 'success' | 'error' | 'info') => void;
}

export function CodeDeployView({ onNotify }: CodeDeployViewProps) {
  const [activeTab, setActiveTab] = useState<'gas' | 'frontend'>('gas');
  const [copiedKey, setCopiedKey] = useState<'gas' | 'frontend' | null>(null);

  const currentCode = activeTab === 'gas' ? codeGsRaw : standaloneHtmlRaw;
  const currentFilename = activeTab === 'gas' ? 'Code.gs' : 'index.html';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(currentCode);
      setCopiedKey(activeTab);
      onNotify(`Kode ${currentFilename} disalin ke clipboard.`, 'success');
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      onNotify('Gagal menyalin ke clipboard.', 'error');
    }
  }

  function handleDownload() {
    const blob = new Blob([currentCode], {
      type: activeTab === 'gas' ? 'text/javascript;charset=utf-8' : 'text/html;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = currentFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    onNotify(`Mengunduh ${currentFilename}...`, 'info');
  }

  return (
    <section className="space-y-6">
      <div className="glass-surface rounded-[22px] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1D4ED8]/12 pb-5">
          <div>
            <h2 className="text-lg font-bold text-[#0A2463]">
              File GitHub &amp; Panduan Deployment
            </h2>
            <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#475569]">
              File <span className="tabular-mono font-semibold text-[#1D4ED8]">backend-gas/Code.gs</span> dan <span className="tabular-mono font-semibold text-[#1D4ED8]">github-pages/index.html</span> siap di-push ke repositori GitHub Anda.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-[#0A2463]/8 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('gas')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'gas'
                  ? 'bg-white text-[#0A2463] shadow-sm'
                  : 'text-[#475569] hover:text-[#0A2463]'
              }`}
            >
              <FileCode2 className="h-4 w-4" aria-hidden="true" />
              backend-gas/Code.gs
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('frontend')}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-all whitespace-nowrap shrink-0 ${
                activeTab === 'frontend'
                  ? 'bg-white text-[#0A2463] shadow-sm'
                  : 'text-[#475569] hover:text-[#0A2463]'
              }`}
            >
              <Globe className="h-4 w-4" aria-hidden="true" />
              github-pages/index.html
            </button>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <div>
              <h3 className="text-sm font-bold text-[#0A2463]">
                01. Sinkronisasi Code.gs via GitHub
              </h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#475569]">
                <li>Push proyek ini ke repositori GitHub Anda; file backend berada di <span className="tabular-mono font-semibold text-[#0A2463]">backend-gas/Code.gs</span>.</li>
                <li>Salin isi <span className="tabular-mono font-semibold text-[#0A2463]">Code.gs</span> ke proyek Apps Script di Google Spreadsheet aktif.</li>
                <li>Jalankan fungsi <span className="tabular-mono font-semibold text-[#1D4ED8]">setupdatabase()</span> dari editor GAS (atau lewat tombol <strong>Setup Database</strong> di Konfigurasi GAS) untuk membuat sheet <em>Kontak</em> dan <em>Kategori</em>.</li>
                <li>Klik <strong>Deploy &rarr; New deployment &rarr; Web app</strong>, lalu salin URL <span className="tabular-mono">/exec</span>.</li>
              </ol>
            </div>

            <div className="border-t border-[#1D4ED8]/12 pt-4">
              <h3 className="text-sm font-bold text-[#0A2463]">
                02. Deploy Frontend ke GitHub Pages
              </h3>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-[13px] leading-relaxed text-[#475569]">
                <li>Gunakan file <span className="tabular-mono font-semibold text-[#0A2463]">github-pages/index.html</span> sebagai halaman statis GitHub Pages.</li>
                <li>Buka menu <strong>Konfigurasi GAS</strong>, tempelkan URL Web App, lalu simpan.</li>
              </ol>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <span className="tabular-mono text-xs font-semibold text-[#0A2463]">
                {activeTab === 'gas' ? 'backend-gas/Code.gs' : 'github-pages/index.html'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-[#1D4ED8]/18 bg-white px-3.5 py-1.5 text-xs font-semibold text-[#0A2463] transition-colors hover:bg-[#EFF6FF] whitespace-nowrap shrink-0"
                >
                  {copiedKey === activeTab ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      Salin Kode
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="btn-ocean-sheen inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Unduh {currentFilename}
                </button>
              </div>
            </div>

            <pre className="tabular-mono max-h-[520px] overflow-auto rounded-2xl border border-[#1D4ED8]/18 bg-[#061A40] p-4 text-[12px] leading-relaxed text-[#E0F2FE]">
              <code>{currentCode}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
