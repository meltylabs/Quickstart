import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const metadataDirectory = path.join(projectRoot, "dist", ".openai");

await mkdir(metadataDirectory, { recursive: true });
await copyFile(
  path.join(projectRoot, ".openai", "hosting.json"),
  path.join(metadataDirectory, "hosting.json")
);
