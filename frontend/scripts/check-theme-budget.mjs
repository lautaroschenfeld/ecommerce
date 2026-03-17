import fs from "node:fs/promises";
import path from "node:path";

import { runAudit } from "./audit-theme-tokens.mjs";

const ROOT_DIR = process.cwd();
const BUDGET_PATH = path.join(ROOT_DIR, "scripts", "theme-budget.json");

async function readBudget() {
  const text = await fs.readFile(BUDGET_PATH, "utf8");
  const parsed = JSON.parse(text);
  const uiColorDirectUsesMax = Number(parsed.uiColorDirectUsesMax);
  const autoColorDeclarationsMax = Number(parsed.autoColorDeclarationsMax);

  if (!Number.isFinite(uiColorDirectUsesMax) || uiColorDirectUsesMax < 0) {
    throw new Error("theme-budget.json: uiColorDirectUsesMax must be a non-negative number.");
  }
  if (!Number.isFinite(autoColorDeclarationsMax) || autoColorDeclarationsMax < 0) {
    throw new Error(
      "theme-budget.json: autoColorDeclarationsMax must be a non-negative number."
    );
  }

  return { uiColorDirectUsesMax, autoColorDeclarationsMax };
}

async function main() {
  const budget = await readBudget();
  const audit = await runAudit({ writeReports: true });

  const failures = [];
  const directUses = audit.directUiColor.totalUses;
  const autoDeclared = audit.autoColor.declaredCount;

  if (directUses > budget.uiColorDirectUsesMax) {
    failures.push(
      `Direct ui-color uses ${directUses} > budget ${budget.uiColorDirectUsesMax}`
    );
  }

  if (autoDeclared > budget.autoColorDeclarationsMax) {
    failures.push(
      `AUTO_COLOR_TOKENS declared ${autoDeclared} > budget ${budget.autoColorDeclarationsMax}`
    );
  }

  if (failures.length > 0) {
    console.error("Theme budget check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Theme budget check passed.");
  console.log(`- Direct ui-color uses: ${directUses}/${budget.uiColorDirectUsesMax}`);
  console.log(
    `- AUTO_COLOR_TOKENS declared: ${autoDeclared}/${budget.autoColorDeclarationsMax}`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
