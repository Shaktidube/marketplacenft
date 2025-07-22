import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      buffer: 'buffer',       // ✅ Add buffer polyfill
      process: 'process/browser', // ✅ Add process polyfill
    },
  },
  optimizeDeps: {
    include: [
      '@solana/web3.js',
      '@metaplex-foundation/js',
      'buffer',
      'process',
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis', // 👈 Very important
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
          process: true,
        }),
      ],
    },
  },
});
