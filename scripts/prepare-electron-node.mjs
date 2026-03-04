import { copyFileSync, existsSync, mkdirSync, chmodSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = join(__dirname, "..");
const outputPath = join(workspaceRoot, "electron", "bin", "node");

const sourceNodePath = realpathSync(process.execPath);

if (!existsSync(sourceNodePath)) {
  console.error(`[electron-node] source node binary not found: ${sourceNodePath}`);
  process.exit(1);
}

mkdirSync(dirname(outputPath), { recursive: true });
copyFileSync(sourceNodePath, outputPath);
chmodSync(outputPath, 0o755);

console.log(`[electron-node] bundled node from ${sourceNodePath}`);
console.log(`[electron-node] wrote ${outputPath}`);
