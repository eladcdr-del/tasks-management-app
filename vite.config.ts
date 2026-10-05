import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import { firebaseConfig } from './firebase-config.ts';

/** GitHub Pages project path. Override with BASE_PATH (always normalised to `/x/`). */
function resolveBase(raw: string | undefined): string {
  const value = (raw ?? '/tasks-management-app/').trim() || '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = resolveBase(process.env.BASE_PATH);
/** Build output directory. E2E builds use `dist-e2e` (playwright.config.ts) so they never clobber
 *  `dist`; scripts/postbuild.mjs reads the same variable. */
const outDir = process.env.BUILD_OUT_DIR || 'dist';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
/** firebase-config.ts is filled in (same five keys as select.ts): every visitor uses Firebase. */
const firebaseConfigured = (
  ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'] as const
).every((k) => firebaseConfig[k].trim() !== '');

/** Import aliases — keep in sync with `paths` in tsconfig.base.json and vitest.config.ts. */
export const alias = {
  $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
  $components: fileURLToPath(new URL('./src/components', import.meta.url))
};

/**
 * Real path of node_modules. Parallel git worktrees symlink this checkout's node_modules; Vite
 * resolves symlinks, so the dev server must be allowed to serve files (e.g. fonts) from there.
 */
function nodeModulesRealPath(): string[] {
  try {
    return [realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)))];
  } catch {
    return [];
  }
}

/**
 * Preloads the Hebrew Rubik subset: the first paint is Hebrew, and without a preload the font is only
 * discovered after the CSS is parsed. Injects `<link rel="preload" as="font" crossorigin>` for the
 * emitted (hashed) woff2, under the base path. Build only; dev serves the font straight from
 * node_modules.
 */
function preloadHebrewFont(): Plugin {
  return {
    name: 'homecare:preload-hebrew-font',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const font = Object.values(ctx.bundle ?? {}).find(
          (file) =>
            file.type === 'asset' &&
            /(^|\/)rubik-hebrew-wght-normal[^/]*\.woff2$/.test(file.fileName)
        );
        if (!font) {
          this.warn('Hebrew Rubik woff2 not found in the bundle; no font preload injected');
          return [];
        }
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `${base}${font.fileName}`,
              crossorigin: true
            },
            injectTo: 'head'
          }
        ];
      }
    }
  };
}

export default defineConfig({
  base,
  // Worktree-local cache: parallel git worktrees symlink one node_modules, so the default
  // node_modules/.vite cache would be shared (and clobbered) between them.
  cacheDir: '.vite',
  resolve: { alias },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Short commit SHA in CI (deterministic per commit, unlike a timestamp); 'dev' locally.
    __APP_COMMIT__: JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev')
  },
  plugins: [
    svelte(),
    preloadHebrewFont(),
    // ── PWA block: owned by step 5.1. ──────────────────────────────────────────
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      // Registration lives in UpdatePrompt (virtual:pwa-register). Production and E2E builds
      // register the SW; the dev server never does (devOptions off).
      injectRegister: false,
      // The manifest icons are matched by globPatterns already (no duplicate precache entries).
      includeManifestIcons: false,
      injectManifest: {
        // The plugin adds manifest.webmanifest to the precache itself.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}'],
        globIgnores: [
          // Without a Firebase config (demo / setup only) the SDK chunks stay out of the precache;
          // the SW caches them at runtime (CacheFirst) on first use instead (src/sw.ts). With one,
          // every visitor needs them, and the first visit is not controlled by the SW yet, so
          // runtime caching would miss them: they are precached, and the app opens offline after a
          // single visit. `index.esm-*` is the SDK core shared by the repository and messaging.
          ...(firebaseConfigured
            ? []
            : ['**/firebaseRepository-*.js', '**/messaging-*.js', '**/index.esm-*.js']),
          // Icon sources (scripts/generate-icons.mjs); the app never requests them.
          'icons/source-maskable.svg',
          'icons/badge.svg'
        ],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      },
      manifest: {
        name: 'HomeCare',
        short_name: 'HomeCare',
        description: 'משימות הבית, במקום אחד',
        lang: 'he',
        dir: 'rtl',
        id: base,
        start_url: `${base}#/`,
        scope: base,
        display: 'standalone',
        background_color: '#FBF6EF',
        theme_color: '#FBF6EF',
        categories: ['productivity', 'lifestyle'],
        // public/icons/ (scripts/generate-icons.mjs): PNGs rendered from source.svg (AppMark tile)
        // and source-maskable.svg (AppMark fullBleed); badge-96.png is the monochrome status-bar
        // badge for notifications, apple-touch-180.png and the favicons are linked in index.html.
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          { src: 'icons/source.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ],
        shortcuts: [
          {
            name: 'משימה חדשה',
            short_name: 'משימה חדשה',
            url: `${base}#/new`,
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      },
      devOptions: { enabled: false }
    })
  ],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir
  },
  server: {
    port: 5173,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...nodeModulesRealPath()] }
  },
  preview: {
    port: 4173
  }
});
