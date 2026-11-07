// Builds the theme and packs dist/ into release/tinted-<version>.zip with metadata.json at the archive root,
// the layout the client's Marketplace installer and themes folder expect.
import { readdirSync } from "node:fs";
import { $ } from "bun";

const { id, version } = await Bun.file("public/metadata.json").json();
const archive = `release/${id}-${version}.zip`;

await $`bun run build`;
await $`mkdir -p release && rm -f ${archive}`;
await $`python3 -m zipfile -c ../${archive} ${readdirSync("dist")}`.cwd("dist");
await $`python3 -m zipfile -l ${archive}`;
console.log(`packed ${archive}`);
