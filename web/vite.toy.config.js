import { defineConfig } from 'vite';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
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

const toyPublicAssetRoots = [
  ['public/song-covers', 'song-cover-'],
  ['public/character-images/singers', 'character-singer-'],
  ['public/character-images/famous-producers', 'character-producer-'],
];

function toyPublicAssetsPlugin() {
  return {
    name: 'toy-public-assets',
    async generateBundle() {
      for (const [relativeRoot, outputPrefix] of toyPublicAssetRoots) {
        const sourceRoot = fileURLToPath(new URL(relativeRoot, import.meta.url));
        const entries = await readdir(sourceRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile()) continue;
          this.emitFile({
            type: 'asset',
            fileName: outputPrefix + entry.name,
            source: await readFile(join(sourceRoot, entry.name)),
          });
        }
      }
    },
  };
}

export default defineConfig({
  ...baseConfig,
  base: './',
  publicDir: false,
  plugins: [...baseConfig.plugins, toySdkPlugin(), toyPublicAssetsPlugin()],
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
