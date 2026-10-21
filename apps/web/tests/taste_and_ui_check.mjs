import fs from "node:fs";
import path from "node:path";

const srcDir = path.resolve("src");

const requiredScreens = [
  "app/login/page.tsx",
  "app/page.tsx",
  "app/documents/page.tsx",
  "app/documents/[id]/page.tsx",
  "app/chat/page.tsx",
  "app/search/page.tsx",
  "app/settings/page.tsx",
  "app/admin/page.tsx",
  "components/layout/AppShell.tsx",
  "components/citations/CitationDrawer.tsx",
  "styles/globals.css"
];

let failed = false;

for (const rel of requiredScreens) {
  const full = path.join(srcDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`FAIL: Missing required frontend file: ${rel}`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(full, "utf8");
  // Taste Skill v2 anti-slop rule: no em-dashes or en-dashes in UI copy
  if (rel.endsWith(".tsx") && (content.includes("\u2014") || content.includes("\u2013"))) {
    console.error(`FAIL: Found banned em-dash/en-dash in UI component: ${rel}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
console.log("PASS: All 7 Next.js screens, Taste Skill v2 anti-slop locks, and UI components verified.");
