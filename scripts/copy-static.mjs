import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
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

const runtimeFruitDirectory = resolve(projectRoot, "assets", "fruit-models", "sprites", "runtime");
const runtimeFruitOutput = resolve(outputDirectory, "assets", "fruit-models", "runtime");
mkdirSync(runtimeFruitOutput, { recursive: true });
for (const filename of readdirSync(runtimeFruitDirectory)) {
  if (!/^[a-z-]+-(front|three-quarter|side|top)\.webp$/.test(filename)) continue;
  copyFileSync(resolve(runtimeFruitDirectory, filename), resolve(runtimeFruitOutput, filename));
}
copyFileSync(
  resolve(projectRoot, "assets", "fruit-models", "manifest.json"),
  resolve(outputDirectory, "assets", "fruit-models", "manifest.json"),
);

const runtimeItemDirectory = resolve(projectRoot, "assets", "item-models", "sprites", "runtime");
const runtimeItemOutput = resolve(outputDirectory, "assets", "item-models", "runtime");
mkdirSync(runtimeItemOutput, { recursive: true });
for (const filename of readdirSync(runtimeItemDirectory)) {
  if (!/^[a-z-]+-(front|three-quarter|side|top)\.webp$/.test(filename)) continue;
  copyFileSync(resolve(runtimeItemDirectory, filename), resolve(runtimeItemOutput, filename));
}

mkdirSync(resolve(outputDirectory, "assets", "ui"), { recursive: true });
copyFileSync(
  resolve(projectRoot, "assets", "ui", "home-background.png"),
  resolve(outputDirectory, "assets", "ui", "home-background.png"),
);
copyFileSync(
  resolve(projectRoot, "assets", "ui", "game-background.png"),
  resolve(outputDirectory, "assets", "ui", "game-background.png"),
);
