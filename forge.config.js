// const path = require("path");

// Signing/notarization (commented out until ready; uncomment and set env vars in CI):
// const hasAppleCreds =
//   process.env.APPLE_ID && (process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_API_KEY_ID);
// const hasAppleApiKey =
//   process.env.APPLE_API_KEY_ID &&
//   process.env.APPLE_API_ISSUER &&
//   process.env.APPLE_API_KEY_PATH;
// const hasWindowsCert = process.env.WINDOWS_CERTIFICATE_PFX_BASE64 && process.env.WINDOWS_CERTIFICATE_PASSWORD;

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
      // Explicitly exclude marketing/download site (deployed separately, not in DMG)
      if (filePath.startsWith("/website")) return true;
      // Exclude everything else (node_modules, .next, app/, lib/, docs/, etc.)
      return true;
    },
    // macOS: code sign (commented out until ready)
    // ...(process.platform === "darwin" && { osxSign: {} }),
    // macOS: notarize (commented out until ready)
    // ...(process.platform === "darwin" &&
    //   hasAppleCreds && {
    //     osxNotarize: hasAppleApiKey
    //       ? {
    //           appleApiKey: process.env.APPLE_API_KEY_PATH,
    //           appleApiKeyId: process.env.APPLE_API_KEY_ID,
    //           appleApiIssuer: process.env.APPLE_API_ISSUER,
    //         }
    //       : {
    //           appleId: process.env.APPLE_ID,
    //           appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    //           teamId: process.env.APPLE_TEAM_ID,
    //         },
    //   }),
  },
  rebuildConfig: {
    // Skip rebuild: Next.js server runs in separate Node process, not in Electron.
    // The standalone's better-sqlite3 is built for system Node during pnpm install.
    onlyModules: [],
  },
  makers: [
    { name: "@electron-forge/maker-dmg", config: {} },
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "Dossier",
      },
    },
    {
      name: "@electron-forge/maker-deb",
      config: {
        options: {
          bin: "Dossier",
          maintainer: "Dossier",
          homepage: "https://github.com/rwliebs/Dossier",
        },
      },
    },
  ],
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
  ],
  publishers: [
    {
      name: "@electron-forge/publisher-github",
      config: {
        repository: { owner: "rwliebs", name: "Dossier" },
        prerelease: false,
        draft: false,
      },
    },
  ],
};
