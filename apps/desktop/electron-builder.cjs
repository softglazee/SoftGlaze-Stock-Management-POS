/**
 * electron-builder configuration (CommonJS).
 *
 * This lives in a JS config file (not package.json "build") because we need the
 * `beforeBuild` FUNCTION hook — package.json can only hold JSON.
 *
 * Why beforeBuild returns false + npmRebuild:false:
 *   The server's runtime node_modules are bundled MANUALLY via `extraResources`
 *   (they're hoisted to the repo-root node_modules by npm workspaces). If we let
 *   electron-builder run its default "install/prune production dependencies" step,
 *   it prunes the SHARED root node_modules down to production-only — deleting every
 *   devDependency (typescript, vite, electron-builder, its own app-builder-bin…),
 *   which breaks the build mid-run and the rest of the monorepo. Returning false
 *   from beforeBuild tells electron-builder "deps are managed externally — don't
 *   touch them"; npmRebuild:false skips native rebuilds (sharp & the Prisma engine
 *   are N-API / prebuilt and ABI-stable across the Node that Electron runs).
 */
module.exports = {
  appId: "com.softglaze.stockmanager",
  productName: "SoftGlaze Stock Manager",
  artifactName: "SoftGlaze-Stock-Manager-Setup-${version}.${ext}",
  electronVersion: "33.4.11",
  npmRebuild: false,
  beforeBuild: async () => false,
  directories: { output: "release", buildResources: "build" },
  files: ["main.cjs", "preload.cjs"],
  extraResources: [
    {
      from: "../../node_modules",
      to: "node_modules",
      filter: [
        "**/*",
        "!**/*.map",
        "!**/*.md",
        "!**/*.ts",
        "!**/.cache/**",
        "!.bin/**",
        "!.vite*/**",
        // electron-builder's own toolchain (build-time only)
        "!electron/**",
        "!electron-builder/**",
        "!app-builder-lib/**",
        "!app-builder-bin/**",
        "!dmg-builder/**",
        "!@electron/**",
        "!@develar/**",
        "!electron-publish/**",
        "!electron-to-chromium/**",
        // web/TS build tooling — never required by the running server (dist is plain JS)
        "!typescript/**",
        "!tsx/**",
        "!vite/**",
        "!@vitejs/**",
        "!rollup/**",
        "!@rollup/**",
        "!esbuild/**",
        "!@esbuild/**",
        "!tailwindcss/**",
        "!@tailwindcss/**",
        "!@types/**",
        "!concurrently/**",
        "!terser/**",
        "!lightningcss*/**",
        "!.lightningcss*/**",
        // web-only UI libraries — compiled into web/dist; the Express server never imports them
        "!react/**",
        "!react-dom/**",
        "!react-router/**",
        "!react-router-dom/**",
        "!recharts/**",
        "!lucide-react/**",
        "!zustand/**",
        "!@tanstack/**",
        "!browser-image-compression/**",
        // electron-builder's bundled 7-zip (build-time only)
        "!7zip-bin/**",
      ],
    },
    { from: "../server/dist", to: "server/dist" },
    { from: "../server/prisma", to: "server/prisma" },
    { from: "../web/dist", to: "web/dist" },
  ],
  win: { target: "nsis" },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "SoftGlaze Stock Manager",
  },
};
