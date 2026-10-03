/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** '1' in E2E builds (Playwright webServer): enables dev-only routes and test hooks. */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** package.json version, injected at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string;
/** Short git commit SHA of the build (GITHUB_SHA in CI), or 'dev' locally. */
declare const __APP_COMMIT__: string;
