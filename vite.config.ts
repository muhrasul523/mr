import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      // Copies src/assets into dist/, generates /kontak/index.html & 404.html,
      // and forwards optional static module folders (keuangan, pekerjaan) if created later.
      {
        name: 'copy-unbundled-src-assets-and-gh-routes',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }

          const builtIndex = path.resolve(distDir, 'index.html');
          if (fs.existsSync(builtIndex)) {
            const kontakDir = path.resolve(distDir, 'kontak');
            fs.mkdirSync(kontakDir, {recursive: true});
            fs.copyFileSync(builtIndex, path.resolve(kontakDir, 'index.html'));
            fs.copyFileSync(builtIndex, path.resolve(distDir, '404.html'));
          }

          for (const extraModule of ['keuangan', 'pekerjaan']) {
            const moduleSrc = path.resolve(__dirname, extraModule);
            if (fs.existsSync(moduleSrc) && fs.statSync(moduleSrc).isDirectory()) {
              fs.cpSync(moduleSrc, path.resolve(distDir, extraModule), {
                recursive: true,
                force: true,
              });
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
