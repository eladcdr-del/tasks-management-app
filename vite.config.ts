import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

/** GitHub Pages project path. Override with BASE_PATH (always normalised to `/x/`). */
function resolveBase(raw: string | undefined): string {
  const value = (raw ?? '/tasks-management-app/').trim() || '/';
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const base = resolveBase(process.env.BASE_PATH);
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

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
    // ── PWA block: owned by step 5.1 from Phase 5 onward. ──────────────────────
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      // Registration is wired by UpdatePrompt (virtual:pwa-register) in step 5.1.
      // Until then the SW is built but never registered, so dev/E2E stay cache-free.
      injectRegister: false,
      injectManifest: {
        // The web manifest is added by the plugin itself.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,ico}']
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
        icons: [], // generated in step 5.1 (pwa-assets.config.ts)
        shortcuts: [{ name: 'משימה חדשה', url: `${base}#/new` }]
      },
      devOptions: { enabled: false }
    })
  ],
  build: {
    target: 'es2022',
    sourcemap: false
  },
  server: {
    port: 5173,
    fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...nodeModulesRealPath()] }
  },
  preview: {
    port: 4173
  }
});
