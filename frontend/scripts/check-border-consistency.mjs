import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.join(process.cwd(), "src");
const BORDER_DECLARATION_RE =
  /(?:^|\s)border(?:-(?:top|right|bottom|left|color))?\s*:\s*([^;]+);/;

const FORBIDDEN_BORDER_TOKENS = [
  /var\(--ui-color-rgba-15-23-42-[^)]+\)/,
  /var\(--ui-color-rgba-11-18-32-[^)]+\)/,
  /rgb\(var\(--ui-ink-rgb\)\s*\/\s*[^)]+\)/,
  /var\(--ui-surface-elevated\)/,
  /var\(--ui-surface-popover\)/,
];

function walkCssFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkCssFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".css")) {
      out.push(fullPath);
    }
  }
  return out;
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

const cssFiles = walkCssFiles(SRC_ROOT).sort((a, b) => a.localeCompare(b));
const failures = [];

for (const absolutePath of cssFiles) {
  const relativePath = toPosix(path.relative(process.cwd(), absolutePath));
  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const declarationMatch = line.match(BORDER_DECLARATION_RE);
    if (!declarationMatch) return;

    const value = declarationMatch[1]?.trim() ?? "";
    if (!value) return;

    const hasForbiddenToken = FORBIDDEN_BORDER_TOKENS.some((pattern) =>
      pattern.test(value)
    );

    if (!hasForbiddenToken) return;

    failures.push(`${relativePath}:${index + 1} -> ${value}`);
  });
}

if (failures.length > 0) {
  console.error("Border consistency check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Border consistency check passed for ${cssFiles.length} archivos CSS.`);
