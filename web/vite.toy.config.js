import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import baseConfig from './vite.config.js';

const toyMultiplayerApiUrl = process.env.VITE_TOY_MULTIPLAYER_API_URL ?? 'https://8.217.219.36';

function toySdkPlugin() {
  return {
    name: 'toy-sdk',
    transformIndexHtml(html) {
      return html.replace('</head>', '    <script src="//s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js"></script>\n  </head>');
    },
  };
}

export default defineConfig({
  ...baseConfig,
  base: './',
  publicDir: false,
  plugins: [...baseConfig.plugins, toySdkPlugin()],
  resolve: {
    ...baseConfig.resolve,
    alias: {
      ...baseConfig.resolve?.alias,
      '#bgm-catalog': fileURLToPath(new URL('src/services/bgmCatalog.toy.js', import.meta.url)),
    },
  },
  define: {
    ...baseConfig.define,
    'import.meta.env.VITE_BUILD_TARGET': JSON.stringify('toy'),
    // Keep the Toy deployment independent from Pages/local production overrides.
    'import.meta.env.VITE_MULTIPLAYER_API_URL': JSON.stringify(toyMultiplayerApiUrl),
  },
  build: {
    ...baseConfig.build,
    outDir: '../toy-dist',
    emptyOutDir: true,
    // Keep every published file at the package root. Some Toy update paths can
    // publish index.html while dropping nested asset directories.
    assetsDir: '',
    rollupOptions: {
      ...baseConfig.build?.rollupOptions,
      output: {
        entryFileNames: 'app-[hash].js',
        chunkFileNames: 'chunk-[hash].js',
        assetFileNames: 'asset-[hash][extname]',
      },
    },
  },
});
