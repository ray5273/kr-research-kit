import fs from "node:fs";
const output = new URL("../../.tmp/pages-proxy/", import.meta.url);
fs.mkdirSync(output, { recursive: true });
for (const name of ["_worker.js", "_routes.json"]) {
  fs.copyFileSync(new URL(name, import.meta.url), new URL(name, output));
}
