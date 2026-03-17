import fs from "node:fs/promises";
import path from "node:path";

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, "src");

const CSS_FILE_EXTENSIONS = new Set([".css"]);

const ALLOWED_LITERAL_ZERO = new Set([
  // Segmented control: internal dividers stay square by design.
  path.normalize("src/components/ui/segmented-control.module.css:19"),
]);

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (CSS_FILE_EXTENSIONS.has(ext)) {
      yield fullPath;
    }
  }
}

function isTokenizedRadius(value) {
  const normalized = value.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("var(--")) return true;
  if (normalized === "inherit") return true;
  if (normalized === "unset") return true;
  return false;
}

function isAllowedZeroLiteral(value, key) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  if (normalized !== "0" && normalized !== "0px") return false;
  return ALLOWED_LITERAL_ZERO.has(key);
}

function toRelative(fullPath) {
  return path.relative(ROOT_DIR, fullPath).replaceAll("/", path.sep);
}

async function main() {
  const offenders = [];

  for await (const filePath of walk(SRC_DIR)) {
    const text = await fs.readFile(filePath, "utf8");
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const match = line.match(/\bborder-radius\s*:\s*([^;]+);/i);
      if (!match) continue;

      const value = match[1]?.trim() ?? "";
      const key = path.normalize(`${toRelative(filePath)}:${i + 1}`);

      if (isTokenizedRadius(value)) continue;
      if (isAllowedZeroLiteral(value, key)) continue;

      offenders.push({
        file: toRelative(filePath),
        line: i + 1,
        value,
      });
    }
  }

  if (offenders.length === 0) {
    console.log("Radius consistency check passed.");
    return;
  }

  console.error("Radius consistency check failed. Non-token border-radius values found:");
  for (const offender of offenders) {
    console.error(
      `- ${offender.file}:${offender.line} -> border-radius: ${offender.value};`
    );
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

