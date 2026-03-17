import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.join(process.cwd(), "src");
const MAX_FONT_SIZES = 5;
const MAX_RADIUS_SIZES = 5;

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

function toPosix(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function isTargetFile(relativePath) {
  return (
    /src\/app\/.*\/page\.module\.css$/.test(relativePath) ||
    /src\/components\/.*-page\.module\.css$/.test(relativePath) ||
    /src\/components\/admin\/.*\.module\.css$/.test(relativePath)
  );
}

function collectUniqueValues(cssText, declaration) {
  const regex = new RegExp(`${declaration}\\s*:\\s*([^;]+);`, "g");
  return [...new Set(Array.from(cssText.matchAll(regex), (match) => match[1].trim()))];
}

const cssFiles = walkCssFiles(SRC_ROOT)
  .map((filePath) => toPosix(path.relative(process.cwd(), filePath)))
  .filter(isTargetFile)
  .sort((a, b) => a.localeCompare(b));

const failures = [];
const spacingWarnings = [];

for (const relativePath of cssFiles) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const cssText = fs.readFileSync(absolutePath, "utf8");

  const fontSizes = collectUniqueValues(cssText, "font-size");
  const radii = collectUniqueValues(cssText, "border-radius");
  const spacingValues = [
    ...new Set(
      Array.from(
        cssText.matchAll(
          /(?:^|\n)\s*(?:margin|padding)(?:-[a-z-]+)?\s*:\s*([^;]+);/g
        ),
        (match) => match[1].trim()
      )
    ),
  ];

  if (fontSizes.length > MAX_FONT_SIZES) {
    failures.push(
      `${relativePath}: font-size usa ${fontSizes.length} valores (max ${MAX_FONT_SIZES})\n  ${fontSizes.join(
        " | "
      )}`
    );
  }

  if (radii.length > MAX_RADIUS_SIZES) {
    failures.push(
      `${relativePath}: border-radius usa ${radii.length} valores (max ${MAX_RADIUS_SIZES})\n  ${radii.join(
        " | "
      )}`
    );
  }

  if (spacingValues.length > 16) {
    spacingWarnings.push(
      `${relativePath}: spacing (margin/padding) usa ${spacingValues.length} valores.`
    );
  }
}

if (spacingWarnings.length > 0) {
  console.log("UI spacing warnings:");
  for (const warning of spacingWarnings) console.log(`- ${warning}`);
  console.log("");
}

if (failures.length > 0) {
  console.error("UI consistency check failed:\n");
  for (const failure of failures) {
    console.error(`- ${failure}\n`);
  }
  process.exit(1);
}

console.log(
  `UI consistency check passed for ${cssFiles.length} archivos (font-size <= ${MAX_FONT_SIZES}, border-radius <= ${MAX_RADIUS_SIZES}).`
);
