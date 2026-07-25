import { cp, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

const distDirectory = path.resolve("dist");
const serverDirectory = path.join(distDirectory, "server");
const entries = await readdir(distDirectory, { withFileTypes: true });
const workerDirectory = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .find((name) => name !== "client" && name !== "server");

if (!workerDirectory) {
  throw new Error("Unable to find the vinext worker output in dist/");
}

await rm(serverDirectory, { recursive: true, force: true });
await mkdir(serverDirectory, { recursive: true });
await cp(path.join(distDirectory, workerDirectory), serverDirectory, {
  recursive: true,
});

console.log(`Packaged dist/${workerDirectory} as dist/server for Sites`);
