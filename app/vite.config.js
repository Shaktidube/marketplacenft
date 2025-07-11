


import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'
import { NodeGlobalsPolyfillPlugin } from '@esbuild-plugins/node-globals-polyfill';

export default defineConfig({
  plugins: [react(),tailwindcss(),],
  optimizeDeps: {
    include: ['@metaplex-foundation/js'],
    esbuildOptions: {
      define: {
        global: 'globalThis', // also necessary for other polyfills
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
        }),
      ],
      
    },
  },
});

 