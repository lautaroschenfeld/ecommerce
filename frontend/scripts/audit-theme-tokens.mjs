import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = process.cwd();
const SRC_ROOT = path.join(ROOT_DIR, "src");
const TOKENS_CSS_PATH = path.join(SRC_ROOT, "styles", "tokens.css");
const OUTPUT_DIR = path.join(ROOT_DIR, ".tmp", "theme-audit");

const TOKEN_DECL_RE = /--[a-zA-Z0-9-_]+\s*:/g;
const INLINE_ASSIGNED_RE =
  /["'`]--[a-zA-Z0-9-_]+["'`]\s*:|setProperty\(\s*["'`]--[a-zA-Z0-9-_]+["'`]/g;
const TOKEN_VAR_RE = /var\(\s*(--[a-zA-Z0-9-_]+)/g;
const UI_COLOR_VAR_RE = /var\(\s*(--ui-color-[a-zA-Z0-9-]+)\s*\)/g;

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function normalizeToken(raw) {
  if (!raw) return "";
  return raw.trim().replace(/:$/, "");
}

async function* walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(fullPath);
      continue;
    }
    if (!entry.isFile()) continue;
    yield fullPath;
  }
}

function ensureMapEntry(map, token) {
  if (!map.has(token)) {
    map.set(token, {
      token,
      declaredCount: 0,
      inlineAssignedCount: 0,
      varReferencedCount: 0,
    });
  }
  return map.get(token);
}

function collectUiColorUses(text) {
  const tokens = [];
  const regex = new RegExp(UI_COLOR_VAR_RE.source, UI_COLOR_VAR_RE.flags);
  let match = regex.exec(text);
  while (match) {
    tokens.push(normalizeToken(match[1]));
    match = regex.exec(text);
  }
  return tokens;
}

function parseAutoColorDeclarations(tokensCssText) {
  const lines = tokensCssText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => line.includes("AUTO_COLOR_TOKENS_START"));
  const endIndex = lines.findIndex((line) => line.includes("AUTO_COLOR_TOKENS_END"));
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return [];
  }

  const declarations = [];
  for (let i = startIndex + 1; i < endIndex; i += 1) {
    const line = lines[i];
    const match = line.match(/^\s*(--ui-color-[a-zA-Z0-9-]+)\s*:/);
    if (!match) continue;
    declarations.push({
      token: normalizeToken(match[1]),
      line: i + 1,
      value: line.trim(),
    });
  }

  return declarations;
}

function markdownTokenRows(tokenEntries) {
  return tokenEntries
    .map(
      (entry) =>
        `- ${entry.token} | decl:${entry.declaredCount} inline:${entry.inlineAssignedCount} varRef:${entry.varReferencedCount}`
    )
    .join("\n");
}

function buildUiColorReport(directUsesByFile, totalUses) {
  const lines = [];
  lines.push("# Direct ui-color var() uses outside tokens.css");
  lines.push("");
  lines.push(`Total files: ${directUsesByFile.length}`);
  lines.push(`Total uses: ${totalUses}`);
  lines.push("");

  for (const entry of directUsesByFile) {
    lines.push(
      `${entry.count}\t${entry.file}\t(unique:${entry.uniqueTokens.length})`
    );
  }

  lines.push("");
  lines.push("## Details");
  lines.push("");

  for (const entry of directUsesByFile) {
    lines.push(entry.file);
    lines.push(`count=${entry.count}, unique=${entry.uniqueTokens.length}`);
    for (const token of entry.uniqueTokens) {
      lines.push(`- var(${token})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function runAudit({ writeReports = true } = {}) {
  const filePaths = [];
  for await (const absolutePath of walkFiles(SRC_ROOT)) {
    filePaths.push(absolutePath);
  }
  filePaths.sort((a, b) => a.localeCompare(b));

  const tokenStats = new Map();
  const allMentionedTokens = new Set();
  const declaredTokens = new Set();
  const inlineAssignedTokens = new Set();
  const varReferencedTokens = new Set();

  const directUsesByFileRaw = [];
  let totalDirectUiColorUses = 0;

  const uiColorTokenUsageByFile = new Map();

  for (const absolutePath of filePaths) {
    const relativePath = toPosix(path.relative(ROOT_DIR, absolutePath));
    const text = await fs.readFile(absolutePath, "utf8");

    const declMatches = text.match(TOKEN_DECL_RE) ?? [];
    for (const rawMatch of declMatches) {
      const token = normalizeToken(rawMatch.replace(/\s*:\s*$/, ""));
      if (!token.startsWith("--")) continue;
      ensureMapEntry(tokenStats, token).declaredCount += 1;
      declaredTokens.add(token);
      allMentionedTokens.add(token);
    }

    const inlineMatches = text.match(INLINE_ASSIGNED_RE) ?? [];
    for (const rawMatch of inlineMatches) {
      const tokenMatch = rawMatch.match(/--[a-zA-Z0-9-_]+/);
      if (!tokenMatch) continue;
      const token = normalizeToken(tokenMatch[0]);
      ensureMapEntry(tokenStats, token).inlineAssignedCount += 1;
      inlineAssignedTokens.add(token);
      allMentionedTokens.add(token);
    }

    const varRegex = new RegExp(TOKEN_VAR_RE.source, TOKEN_VAR_RE.flags);
    let varMatch = varRegex.exec(text);
    while (varMatch) {
      const token = normalizeToken(varMatch[1]);
      if (token) {
        ensureMapEntry(tokenStats, token).varReferencedCount += 1;
        varReferencedTokens.add(token);
        allMentionedTokens.add(token);
      }
      varMatch = varRegex.exec(text);
    }

    const uiColorTokens = collectUiColorUses(text);
    if (uiColorTokens.length > 0) {
      const usageSet = new Set(uiColorTokens);
      directUsesByFileRaw.push({
        file: relativePath,
        count: uiColorTokens.length,
        uniqueTokens: Array.from(usageSet).sort((a, b) => a.localeCompare(b)),
      });
      totalDirectUiColorUses += uiColorTokens.length;
    }

    const usageRegex = new RegExp(UI_COLOR_VAR_RE.source, UI_COLOR_VAR_RE.flags);
    let usageMatch = usageRegex.exec(text);
    while (usageMatch) {
      const token = normalizeToken(usageMatch[1]);
      if (!uiColorTokenUsageByFile.has(token)) {
        uiColorTokenUsageByFile.set(token, new Set());
      }
      uiColorTokenUsageByFile.get(token).add(relativePath);
      usageMatch = usageRegex.exec(text);
    }
  }

  const directUsesByFile = directUsesByFileRaw
    .filter((entry) => entry.file !== toPosix(path.relative(ROOT_DIR, TOKENS_CSS_PATH)))
    .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file));

  const tokenEntries = Array.from(tokenStats.values()).sort((a, b) =>
    a.token.localeCompare(b.token)
  );

  const tokensCssText = await fs.readFile(TOKENS_CSS_PATH, "utf8");
  const autoColorDeclarations = parseAutoColorDeclarations(tokensCssText);
  const autoColorSummary = {
    declaredCount: autoColorDeclarations.length,
    inUseCount: 0,
    replaceableCount: 0,
    deadCount: 0,
    inUse: [],
    replaceable: [],
    dead: [],
  };

  for (const declaration of autoColorDeclarations) {
    const files = Array.from(uiColorTokenUsageByFile.get(declaration.token) ?? []);
    const usedOutsideTokens = files.some(
      (file) => file !== toPosix(path.relative(ROOT_DIR, TOKENS_CSS_PATH))
    );
    const usedInsideTokensOnly = files.length > 0 && !usedOutsideTokens;

    if (usedOutsideTokens) {
      autoColorSummary.inUseCount += 1;
      autoColorSummary.inUse.push({ token: declaration.token, files });
      continue;
    }
    if (usedInsideTokensOnly) {
      autoColorSummary.replaceableCount += 1;
      autoColorSummary.replaceable.push({ token: declaration.token, files });
      continue;
    }

    autoColorSummary.deadCount += 1;
    autoColorSummary.dead.push({ token: declaration.token });
  }

  autoColorSummary.inUse.sort((a, b) => a.token.localeCompare(b.token));
  autoColorSummary.replaceable.sort((a, b) => a.token.localeCompare(b.token));
  autoColorSummary.dead.sort((a, b) => a.token.localeCompare(b.token));

  const result = {
    generatedAt: new Date().toISOString(),
    root: "src",
    counts: {
      declared: declaredTokens.size,
      inlineAssigned: inlineAssignedTokens.size,
      referencedByVar: varReferencedTokens.size,
      mentionedAny: allMentionedTokens.size,
      allUnique: allMentionedTokens.size,
    },
    tokens: tokenEntries,
    directUiColor: {
      totalFiles: directUsesByFile.length,
      totalUses: totalDirectUiColorUses,
      files: directUsesByFile,
    },
    autoColor: autoColorSummary,
  };

  if (writeReports) {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const tokensAuditJsonPath = path.join(OUTPUT_DIR, "tokens-audit.json");
    const tokensAuditMdPath = path.join(OUTPUT_DIR, "tokens-audit.md");
    const uiColorReportPath = path.join(OUTPUT_DIR, "ui-color-direct-uses-report.txt");

    await fs.writeFile(tokensAuditJsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

    const mdLines = [
      "# Token Audit",
      "",
      `- Generated: ${result.generatedAt}`,
      `- Scope: ${result.root}`,
      `- Unique tokens (all mentions): ${result.counts.allUnique}`,
      `- Unique declared tokens: ${result.counts.declared}`,
      `- Unique inline-assigned tokens: ${result.counts.inlineAssigned}`,
      `- Unique var() referenced tokens: ${result.counts.referencedByVar}`,
      "",
      "## AUTO_COLOR_TOKENS",
      "",
      `- Declared in block: ${autoColorSummary.declaredCount}`,
      `- In use: ${autoColorSummary.inUseCount}`,
      `- Replaceable (only tokens.css): ${autoColorSummary.replaceableCount}`,
      `- Dead: ${autoColorSummary.deadCount}`,
      "",
      "## Complete Token List",
      "",
      markdownTokenRows(tokenEntries),
      "",
    ];
    await fs.writeFile(tokensAuditMdPath, `${mdLines.join("\n")}\n`, "utf8");

    const uiColorReport = buildUiColorReport(directUsesByFile, totalDirectUiColorUses);
    await fs.writeFile(uiColorReportPath, `${uiColorReport}\n`, "utf8");
  }

  return result;
}

async function main() {
  const result = await runAudit({ writeReports: true });
  console.log(`Theme token audit generated at: ${result.generatedAt}`);
  console.log(`Direct ui-color uses outside tokens.css: ${result.directUiColor.totalUses}`);
  console.log(`AUTO_COLOR_TOKENS declared: ${result.autoColor.declaredCount}`);
  console.log(`AUTO_COLOR_TOKENS dead: ${result.autoColor.deadCount}`);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
