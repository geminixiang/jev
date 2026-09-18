// Keep src/version.ts in sync with package.json (run by `changeset version`).
import { readFileSync, writeFileSync } from "node:fs";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync("src/version.ts", `export const VERSION = "${version}";\n`);
console.log(`src/version.ts -> ${version}`);
