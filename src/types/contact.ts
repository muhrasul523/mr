export const DEFAULT_CATEGORIES: string[] = [
  'Klien',
  'Partner',
  'VIP',
  'Internal',
];

export interface Contact {
  nama: string;
  noHp: string;
  kategori: string;
}

export interface ToastMessage {
  id: string;
  text: string;
  variant: 'success' | 'error' | 'info';
}

/**
 * Membersihkan input langsung saat mengetik:
 * - Menolak/menghapus spasi, tanda baca, dan huruf (hanya digit 0-9).
 * - Jika awalan "08", otomatis berubah menjadi "628".
 */
export function sanitizeLivePhoneInput(rawInput: string): string {
  let digits = String(rawInput || '').replace(/\D/g, '');
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  }
  return digits;
}

/**
 * Format final untuk penyimpanan & link WhatsApp:
 * - Hapus semua spasi, tanda baca, dan huruf.
 * - Hapus awalan "00" (kode dial internasional).
 * - Jika awalan "08" -> otomatis "628...".
 * - Jika awalan "8" (minimal 9 digit) -> otomatis "628...".
 * - Nomor luar Indonesia (misal 60..., 65..., 1..., 44..., 966...) dipertahankan sebagai digit murni.
 */
export function normalizePhoneForWA(rawPhone: string): string {
  let digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('08')) {
    digits = '62' + digits.slice(1);
  } else if (digits.startsWith('8') && digits.length >= 9) {
    digits = '62' + digits;
  }
  return digits;
}

export function buildWhatsAppUrl(rawPhone: string): string {
  const cleanDigits = normalizePhoneForWA(rawPhone);
  return `https://wa.me/${encodeURIComponent(cleanDigits)}`;
}
