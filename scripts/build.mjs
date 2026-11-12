import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "dist");
const requiredPaths = [
  "src/app.js",
  "src/server.js",
  "src/status-adapter.js",
  "public/index.html",
  "public/app.js",
  "public/styles.css",
  "package.json",
  "package-lock.json",
];

for (const path of requiredPaths) {
  try {
    await access(join(root, path), constants.R_OK);
  } catch {
    throw new Error(`Missing required build input: ${path}`);
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "src"), join(output, "src"), { recursive: true });
await cp(join(root, "public"), join(output, "public"), { recursive: true });

for (const filename of ["package.json", "package-lock.json"]) {
  const contents = await readFile(join(root, filename));
  await writeFile(join(output, filename), contents);
}
