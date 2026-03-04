const path = require("path");

/** @type {import('@electron-forge/shared-types').ForgeConfig} */
module.exports = {
  packagerConfig: {
    name: "Dossier",
    executableName: "Dossier",
    asar: true,
    extraResource: [".next/standalone", ".next/static", "public", "electron/bin/node"],
    appCategoryType: "public.app-category.developer-tools",
    ignore: (filePath) => {
      if (!filePath) return false;
      // Always include package.json and electron compiled output
      if (filePath === "/package.json") return false;
      if (filePath.startsWith("/electron")) return false;
      // Exclude everything else (node_modules, .next, app/, lib/, docs/, etc.)
      return true;
    },
  },
  rebuildConfig: {
    // Skip rebuild: Next.js server runs in separate Node process, not in Electron.
    // The standalone's better-sqlite3 is built for system Node during pnpm install.
    onlyModules: [],
  },
  makers: [
    { name: "@electron-forge/maker-dmg", config: {} },
    { name: "@electron-forge/maker-squirrel", config: {} },
    { name: "@electron-forge/maker-deb", config: {} },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
  ],
};
