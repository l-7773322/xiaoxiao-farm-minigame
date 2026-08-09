import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const outputDirectory = resolve(projectRoot, "minigame");

mkdirSync(outputDirectory, { recursive: true });
copyFileSync(resolve(projectRoot, "config", "game.json"), resolve(outputDirectory, "game.json"));
copyFileSync(
  resolve(projectRoot, "config", "project.config.json"),
  resolve(outputDirectory, "project.config.json"),
);
