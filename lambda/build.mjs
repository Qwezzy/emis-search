/**
 * Build script – bundles Lambda + creates a zip ready for deployment.
 * Run: node build.mjs
 * Output: dist/lambda.zip
 */

import { build } from "esbuild";
import { mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "dist");

if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true });

console.log("Bundling Lambda...");

await build({
  entryPoints: [resolve(__dirname, "index.mjs")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: resolve(DIST, "index.mjs"),
  external: [],
  minify: false,
  banner: {
    js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
    `.trim(),
  },
});

console.log("Creating zip...");

const isWindows = process.platform === "win32";
if (isWindows) {
  await execAsync(
    `Compress-Archive -Path "${DIST}\\index.mjs" -DestinationPath "${DIST}\\lambda.zip" -Force`,
    { shell: "powershell.exe" }
  );
} else {
  await execAsync(`cd "${DIST}" && zip -r lambda.zip index.mjs`);
}

console.log("Done -> dist/lambda.zip");
