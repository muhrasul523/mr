import { ArrowRight, Briefcase, Wallet } from 'lucide-react';
import { formatNumberId } from '../types/contact';
import { ContactLogo } from './ContactLogo';

interface LandingPageProps {
  onOpenKontak: () => void;
  totalContacts: number;
  totalSyncContacts?: number;
  totalCategories: number;
}

export function LandingPage({
  onOpenKontak,
  totalContacts,
  totalSyncContacts = 0,
  totalCategories,
}: LandingPageProps) {
  const latestTotalContacts = Math.max(totalContacts, totalSyncContacts);
  return (
    <div className="relative min-h-screen text-[#091B3A]">
      {/* Animated Multi-Blue Aurora Background */}
      <div className="aurora-canvas" aria-hidden="true">
        <div className="aurora-orb aurora-orb-navy" />
        <div className="aurora-orb aurora-orb-sky" />
        <div className="aurora-orb aurora-orb-indigo" />
        <div className="aurora-orb aurora-orb-gold" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* 3-Zone Top Bar Contract */}
        <header className="glass-header sticky top-0 z-40">
          <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-8 px-4 py-3.5 sm:w-[95%] sm:px-0">
            <a
              href="/"
              onClick={(e) => e.preventDefault()}
              className="bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-lg font-bold tracking-tight text-transparent whitespace-nowrap shrink-0"
            >
              MR Wadah Digital
            </a>

            <nav className="hidden md:flex items-center gap-7" aria-label="Navigasi Portal">
              <a
                href="#beranda"
                className="border-b-2 border-[#1D4ED8] py-1.5 text-[13px] font-semibold text-[#0A2463] whitespace-nowrap shrink-0"
              >
                Beranda
              </a>
              <a
                href="/kontak"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenKontak();
                }}
                className="border-b-2 border-transparent py-1.5 text-[13px] font-semibold text-[#475569] transition-colors hover:text-[#0A2463] whitespace-nowrap shrink-0"
              >
                Kontak
              </a>
              <a
                href="#modul"
                className="border-b-2 border-transparent py-1.5 text-[13px] font-semibold text-[#475569] transition-colors hover:text-[#0A2463] whitespace-nowrap shrink-0"
              >
                Keuangan
              </a>
              <a
                href="#modul"
                className="border-b-2 border-transparent py-1.5 text-[13px] font-semibold text-[#475569] transition-colors hover:text-[#0A2463] whitespace-nowrap shrink-0"
              >
                Pekerjaan
              </a>
            </nav>

            <button
              type="button"
              onClick={onOpenKontak}
              className="btn-ocean-sheen inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap shrink-0"
            >
              <span>Buka Kontak</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <div className="header-energy-line" aria-hidden="true" />
        </header>

        <main id="beranda" className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-10 sm:w-[95%] sm:px-0 sm:py-14">
          {/* Hero Section */}
          <section className="glass-surface rounded-[28px] p-8 sm:p-12">
            <div className="grid items-center gap-10 lg:grid-cols-[1.25fr_0.75fr]">
              <div>
                <p className="mb-3 text-xs font-semibold text-[#1D4ED8]">
                  mr.wadahdigital.my.id · Portal Ruang Kerja Pribadi
                </p>
                <h1 className="text-balance bg-gradient-to-r from-[#061A40] via-[#1D4ED8] to-[#0284C7] bg-clip-text text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[1.12] tracking-tight text-transparent">
                  Satu Portal Terpadu untuk Data Kontak, Keuangan, dan Pekerjaan
                </h1>
                <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#475569]">
                  Dirancang sebagai pusat kendali operasional pribadi MR berbasis Google Workspace dan Web Modern. Akses setiap modul kerja dari satu domain terstruktur dengan sinkronisasi cloud yang rapi.
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={onOpenKontak}
                    className="btn-ocean-sheen inline-flex min-h-[46px] items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap shrink-0"
                  >
                    <span>Masuk ke Aplikasi Kontak</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <a
                    href="#modul"
                    className="inline-flex min-h-[46px] items-center rounded-xl border border-[#1D4ED8]/20 bg-white/85 px-5 py-3 text-sm font-semibold text-[#0A2463] transition-colors hover:bg-white whitespace-nowrap shrink-0"
                  >
                    Lihat Daftar Modul
                  </a>
                </div>
              </div>

              <div className="flex flex-col justify-between gap-6 rounded-[22px] border border-[#1D4ED8]/15 bg-gradient-to-br from-[#061A40] via-[#0A2463] to-[#1D4ED8] p-7 text-white shadow-xl">
                <div className="flex items-center justify-between gap-4">
                  <ContactLogo className="h-12 w-12 shrink-0" />
                  <span className="tabular-mono text-xs font-semibold text-[#93C5FD]">
                    /kontak
                  </span>
                </div>

                <div>
                  <p className="text-xs font-medium text-[#BFDBFE]">
                    Modul Aktif Saat Ini
                  </p>
                  <h2 className="mt-1 text-xl font-bold text-white">
                    Contact Sync &amp; Management
                  </h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-[#DBEAFE]">
                    Terhubung ke Google Sheets (Kontak, Kontak_Sync, Kategori, History) serta sinkronisasi langsung ke Google Kontak dan WhatsApp.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-white/15 pt-4 text-xs">
                  <div>
                    <div className="text-[#93C5FD]">Total Kontak</div>
                    <div className="tabular-mono mt-0.5 text-lg font-bold text-white">
                      {formatNumberId(latestTotalContacts)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[#93C5FD]">Kategori Aktif</div>
                    <div className="tabular-mono mt-0.5 text-lg font-bold text-white">
                      {formatNumberId(totalCategories)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Asymmetric Bento Grid Modules */}
          <section id="modul" className="mt-12">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#1D4ED8]">Arsitektur Modul</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#0A2463]">
                  Direktori Layanan mr.wadahdigital.my.id
                </h2>
              </div>
              <p className="text-[13px] text-[#475569]">
                Setiap layanan menempati sub-folder terpisah dalam satu repositori terpadu.
              </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Featured Active Module */}
              <article className="glass-surface flex flex-col justify-between rounded-[22px] p-7 lg:col-span-2">
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                      <ContactLogo className="h-11 w-11 shrink-0" />
                      <div>
                        <span className="tabular-mono text-xs font-semibold text-[#1D4ED8]">
                          01 · /kontak · Aktif
                        </span>
                        <h3 className="text-lg font-bold text-[#0A2463]">
                          Manajemen &amp; Sinkronisasi Kontak
                        </h3>
                      </div>
                    </div>
                  </div>

                  <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#475569]">
                    Kelola daftar kontak lengkap dengan klasifikasi jenis kelamin (Laki-laki, Perempuan, Admin), kategori berkode khusus, format WhatsApp otomatis berawalan 628, sheet edit manual khusus Google Kontak, serta catatan riwayat perubahan (History).
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#1D4ED8]/10 pt-5">
                  <span className="tabular-mono text-xs font-medium text-[#475569]">
                    mr.wadahdigital.my.id/kontak
                  </span>
                  <button
                    type="button"
                    onClick={onOpenKontak}
                    className="btn-ocean-sheen inline-flex min-h-[42px] items-center gap-2 rounded-xl px-5 py-2 text-[13px] font-semibold text-white transition-transform hover:-translate-y-0.5 whitespace-nowrap shrink-0"
                  >
                    <span>Buka Halaman Kontak</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>

              {/* Upcoming Modules Stack */}
              <div className="flex flex-col gap-6">
                <article className="glass-surface flex flex-1 flex-col justify-between rounded-[22px] p-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1D4ED8]/10 text-[#1D4ED8]">
                        <Wallet className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="tabular-mono text-xs font-semibold text-[#64748B]">
                          02 · /keuangan · Terjadwal
                        </span>
                        <h3 className="text-base font-bold text-[#0A2463]">
                          Manajemen Keuangan
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">
                      Ruang pencatatan arus kas, anggaran operasional, dan rekap transaksi terhubung ke Google Sheets.
                    </p>
                  </div>
                </article>

                <article className="glass-surface flex flex-1 flex-col justify-between rounded-[22px] p-6">
                  <div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0284C7]/12 text-[#0284C7]">
                        <Briefcase className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <span className="tabular-mono text-xs font-semibold text-[#64748B]">
                          03 · /pekerjaan · Terjadwal
                        </span>
                        <h3 className="text-base font-bold text-[#0A2463]">
                          Pelacak Pekerjaan &amp; Tugas
                        </h3>
                      </div>
                    </div>
                    <p className="mt-3 text-[13px] leading-relaxed text-[#475569]">
                      Pengelolaan daftar tugas harian, prioritas agenda, dan status progres proyek dalam satu tampilan.
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t border-[#1D4ED8]/10 bg-white/50 backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-[1920px] flex-wrap items-center justify-between gap-4 px-4 py-5 text-xs text-[#475569] sm:w-[95%] sm:px-0">
            <span>MR · mr.wadahdigital.my.id</span>
            <div className="flex items-center gap-5">
              <a
                href="/kontak"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenKontak();
                }}
                className="font-semibold text-[#0A2463] hover:underline"
              >
                Kontak
              </a>
              <span>Keuangan</span>
              <span>Pekerjaan</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
