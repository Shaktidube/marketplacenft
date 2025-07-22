// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// Import the polyfill plugins correctly
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import { NodeModulesPolyfillPlugin } from "@esbuild-plugins/node-modules-polyfill";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // REMOVE NodeGlobalsPolyfillPlugin and NodeModulesPolyfillPlugin from here
    // They should only be in optimizeDeps.esbuildOptions.plugins for global polyfills
  ],
  optimizeDeps: {
    esbuildOptions: {
      // Node.js global to browser globalThis
      define: {
        global: "globalThis",
      },
      // Enable esbuild polyfill plugins
      plugins: [
        NodeGlobalsPolyfillPlugin({
          buffer: true,
          process: true,
        }),
        NodeModulesPolyfillPlugin(), // <--- Add NodeModulesPolyfillPlugin here
      ],
    },
  },
  resolve: {
    alias: {
      // These aliases might still be needed for certain imports, but NodeModulesPolyfillPlugin
      // handles many common ones. Keep them if you still face issues related to specific modules.
      stream: "stream-browserify",
      // process: "process", // NodeGlobalsPolyfillPlugin handles this global, so this alias is often redundant.
      util: "util",
    },
  },
});