#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const ROOTS = ["src", "tests"];
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".css",
  ".md",
  ".json",
  ".yml",
  ".yaml",
]);

const suspiciousPatterns = [
  /\u00C3[\u0080-\u00BF]/g, // Ã + continuation
  /\u00C2[\u0080-\u00BF]/g, // Â + continuation
  /\u00E2[\u0080-\u00BF]{1,2}/g, // â + continuation(s)
  /\uFFFD/g, // replacement char
];

/** @type {string[]} */
const findings = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, lineIndex) => {
      if (suspiciousPatterns.some((pattern) => pattern.test(line))) {
        findings.push(`${file}:${lineIndex + 1}: ${line.trim()}`);
      }
      suspiciousPatterns.forEach((pattern) => {
        pattern.lastIndex = 0;
      });
    });
  }
}

if (findings.length > 0) {
  console.error(
    `Mojibake/l10n regression detected (${findings.length} line${findings.length === 1 ? "" : "s"}):`
  );
  findings.forEach((entry) => console.error(entry));
  process.exit(1);
}

console.log("OK: no mojibake patterns detected in src/tests.");

/**
 * @param {string} dir
 */
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
    yield fullPath;
  }
}

