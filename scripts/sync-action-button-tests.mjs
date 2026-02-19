#!/usr/bin/env node
/**
 * Sync action button tests: when action constants or components change,
 * update test files to use constants and run e2e tests.
 *
 * Flow: capture changes → update tests to use ACTION_BUTTONS → run e2e
 *
 * Run by: node scripts/sync-action-button-tests.mjs
 * Or via Cursor hook when action files are edited.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONSTANTS_PATH = join(ROOT, "lib/constants/action-buttons.ts");
// Only sync tests that assert on action buttons (getByRole/getAllByRole with button)
const ACTION_BUTTON_TEST_FILES = [
  "__tests__/components/workflow-block.test.tsx",
  "__tests__/components/header.test.tsx",
  "__tests__/components/implementation-card.test.tsx",
].map((p) => join(ROOT, p));

// Flatten ACTION_BUTTONS to value -> constantPath (e.g. "Build All" -> "ACTION_BUTTONS.BUILD_ALL")
function extractConstants() {
  const src = readFileSync(CONSTANTS_PATH, "utf8");
  const valueToPath = new Map();

  // Match: KEY: "value" or key: "value"
  const stringRe = /(\w+):\s*["']([^"']+)["']/g;
  let m;
  const seen = new Set();

  // Handle nested (CARD_ACTION, VIEW_MODE)
  const nestedRe = /(CARD_ACTION|VIEW_MODE):\s*\{([^}]+)\}/gs;
  for (const nest of src.matchAll(nestedRe)) {
    const parent = nest[1];
    const inner = nest[2];
    for (const innerMatch of inner.matchAll(stringRe)) {
      const key = innerMatch[1];
      const val = innerMatch[2];
      valueToPath.set(val, `ACTION_BUTTONS.${parent}.${key}`);
    }
  }

  // Top-level strings
  const topRe = /^\s*(BUILD_ALL|POPULATE|POPULATING|VIEW_DETAILS_EDIT):\s*["']([^"']+)["']/gm;
  for (const top of src.matchAll(topRe)) {
    valueToPath.set(top[2], `ACTION_BUTTONS.${top[1]}`);
  }

  return valueToPath;
}

// Update test file: replace hardcoded button labels with constant refs
function syncTestFile(filePath, valueToPath) {
  let content = readFileSync(filePath, "utf8");
  let changed = false;

  // Ensure ACTION_BUTTONS import
  const hasImport = /from\s+["']@\/lib\/constants\/action-buttons["']/.test(content);
  const needsImport = !hasImport;

  for (const [value, constantPath] of valueToPath) {
    if (value.length < 3) continue; // skip short strings

    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "gi");

    // Skip if already uses this constant
    if (content.includes(constantPath)) continue;

    // getByRole("button", { name: /Build All/i }) -> getByRole("button", { name: new RegExp(ACTION_BUTTONS.BUILD_ALL, "i") })
    const rolePattern = new RegExp(
      `getByRole\\(\\s*["']button["']\\s*,\\s*\\{\\s*name:\\s*/(${escaped})/i\\s*\\}\\)`,
      "gi"
    );
    if (rolePattern.test(content)) {
      content = content.replace(
        new RegExp(
          `getByRole\\(\\s*["']button["']\\s*,\\s*\\{\\s*name:\\s*/(${escaped})/i\\s*\\}\\)`,
          "gi"
        ),
        `getByRole("button", { name: new RegExp(${constantPath}, "i") })`
      );
      changed = true;
    }

    // getAllByRole same pattern
    const allRolePattern = new RegExp(
      `getAllByRole\\(\\s*["']button["']\\s*,\\s*\\{\\s*name:\\s*/(${escaped})/i\\s*\\}\\)`,
      "gi"
    );
    if (allRolePattern.test(content)) {
      content = content.replace(
        new RegExp(
          `getAllByRole\\(\\s*["']button["']\\s*,\\s*\\{\\s*name:\\s*/(${escaped})/i\\s*\\}\\)`,
          "gi"
        ),
        `getAllByRole("button", { name: new RegExp(${constantPath}, "i") })`
      );
      changed = true;
    }
  }

  if (needsImport && changed) {
    // Add import after first import
    const firstImport = content.indexOf('import ');
    const endOfFirstImport = content.indexOf("\n", firstImport) + 1;
    content =
      content.slice(0, endOfFirstImport) +
      'import { ACTION_BUTTONS } from "@/lib/constants/action-buttons";\n' +
      content.slice(endOfFirstImport);
  }

  if (changed || needsImport) {
    writeFileSync(filePath, content);
    console.log(`[sync] Updated ${filePath.replace(ROOT, "")}`);
  }
}

function main() {
  const valueToPath = extractConstants();
  // Process longer values first to avoid "Build" matching "Build All"
  const sorted = [...valueToPath].sort((a, b) => b[0].length - a[0].length);
  const sortedMap = new Map(sorted);
  for (const filePath of ACTION_BUTTON_TEST_FILES) {
    try {
      syncTestFile(filePath, sortedMap);
    } catch (e) {
      console.warn(`[sync] Skip ${filePath}:`, e.message);
    }
  }
  console.log("[sync] Done. Run e2e tests next.");
}

main();
