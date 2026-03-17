import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.join(process.cwd(), "src");
const OPACITY_RE = /\bopacity\s*:/;

const ALLOWED_PATH_PATTERNS = [
  /src\/components\/home\/brands-carousel\.module\.css$/,
];

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
      continue;
    }
    if (
      entry.isFile() &&
      (fullPath.endsWith(".css") || fullPath.endsWith(".ts") || fullPath.endsWith(".tsx"))
    ) {
      out.push(fullPath);
    }
  }
  return out;
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

const files = walkFiles(SRC_ROOT).sort((a, b) => a.localeCompare(b));
const failures = [];

for (const absolutePath of files) {
  const relativePath = toPosix(path.relative(process.cwd(), absolutePath));
  if (ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))) {
    continue;
  }

  const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
  lines.forEach((line, index) => {
    if (!OPACITY_RE.test(line)) return;
    failures.push(`${relativePath}:${index + 1}`);
  });
}

if (failures.length > 0) {
  console.error("Opacity consistency check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Opacity consistency check passed for ${files.length} archivos.`);
