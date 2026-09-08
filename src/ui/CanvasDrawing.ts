import { ITEM_VISUALS, type ItemType } from "../data/ItemConfig";

type ItemGradient = ReturnType<MiniGameCanvasContext2D["createLinearGradient"]>;
type ItemRenderDetail = "full" | "dense" | "compact";

type FruitView = "front" | "three-quarter" | "side" | "top";

const realItemTypes = new Set<ItemType>([
  "apple", "pear", "orange", "banana", "pineapple", "mango",
  "watermelon", "cantaloupe", "pomegranate", "dragonFruit", "coconut", "avocado",
  "strawberry", "lemon", "peach", "kiwi", "grapes", "papaya",
  "tomato", "cucumber", "onion",
  "broccoli", "radish", "garlic", "cherry", "lime", "zucchini",
  "carrot", "bread", "berry", "corn", "mushroom", "pumpkin", "eggplant", "milk", "egg", "pepper", "potato",
  "cheese", "rollingPin", "whisk",
  "cup", "mug", "bottle", "tumbler", "glass", "thermos", "teacup", "canteen", "wineGlass", "masonJar", "enamelMug",
  "cake", "donut", "candy", "cookie", "icecream", "pudding", "macaron", "cupcake", "croissant", "fruitTart", "chocolate",
]);
const realItemImages = new Map<string, MiniGameImage>();

export function registerItemImage(type: ItemType, view: FruitView, image: MiniGameImage): void {
  realItemImages.set(`${type}:${view}`, image);
}

const itemGradientCache = new WeakMap<object, Map<string, ItemGradient>>();
const itemToneCache = new Map<string, { light: string; dark: string; side: string }>();

export function roundedRect(
  context: MiniGameCanvasContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

export function drawItemIcon(
  context: MiniGameCanvasContext2D,
  type: ItemType,
  centerX: number,
  centerY: number,
  size: number,
  rotation = 0,
  blocked = false,
  detail: ItemRenderDetail = "full",
): void {
  const visual = ITEM_VISUALS[type];
  const dense = detail === "dense";
  const compact = detail === "compact";
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.globalAlpha = blocked ? 0.5 : 1;
  // Keep the same lightweight painted shadow at every detail level. Canvas
  // shadowBlur is surprisingly expensive on low-end phones, especially when
  // a late level has 200+ items, so the shadow is deliberately one flat oval
  // instead of a per-item blur. This also keeps produce, cups, and pantry
  // items visually consistent while the renderer switches detail modes.
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  drawItemShadow(context, size);

  const realFruit = drawRealFruit(context, type, size, rotation);
  if (realFruit) {
    if (blocked) {
      context.globalAlpha = 0.18;
      context.fillStyle = "#263027";
      context.beginPath();
      context.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    return;
  }

  if (compact) {
    context.fillStyle = visual.color;
    drawItemShape(context, type, size, visual.accent);
    if (blocked) {
      context.globalAlpha = 0.22;
      context.fillStyle = "#263027";
      context.beginPath();
      context.arc(0, 0, size * 0.42, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    return;
  }

  const tones = getItemTones(visual.color);
  context.save();
  context.translate(size * 0.055, size * 0.085);
  context.globalAlpha = blocked ? 0.3 : dense ? 0.46 : 0.66;
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.fillStyle = tones.side;
  drawItemShape(context, type, size, tones.side);
  context.restore();

  context.fillStyle = createItemGradient(context, visual.color, size);
  drawItemShape(context, type, size, visual.accent);
  if (!dense) {
    drawItemHighlight(context, size);
  }

  if (blocked) {
    context.shadowBlur = 0;
    context.fillStyle = "rgba(38, 48, 39, 0.22)";
    context.beginPath();
    context.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawRealFruit(
  context: MiniGameCanvasContext2D,
  type: ItemType,
  size: number,
  rotation: number,
): boolean {
  if (!realItemTypes.has(type)) {
    return false;
  }
  const view = getFruitView(rotation);
  const image = realItemImages.get(`${type}:${view}`)
    ?? realItemImages.get(`${type}:three-quarter`)
    ?? realItemImages.get(`${type}:front`);
  if (!image) {
    return false;
  }
  // The sprite itself already has tightly normalized transparent padding.
  // Keep the subject within its tile so the opening's rounded clip does not
  // cut the outer row or the lower edge of a front-facing model.
  const imageSize = size * 1.06;
  context.drawImage(image, -imageSize / 2, -imageSize / 2, imageSize, imageSize);
  return true;
}

function getFruitView(rotation: number): FruitView {
  if (rotation > 0.42) {
    return "top";
  }
  if (rotation < -0.42) {
    return "side";
  }
  if (Math.abs(rotation) > 0.2) {
    return "three-quarter";
  }
  return "front";
}

function drawItemShape(
  context: MiniGameCanvasContext2D,
  type: ItemType,
  size: number,
  accent: string,
): void {
  switch (type) {
    case "apple":
      drawApple(context, size, accent);
      break;
    case "pear":
    case "orange":
    case "banana":
    case "pineapple":
    case "mango":
    case "watermelon":
    case "cantaloupe":
    case "pomegranate":
    case "dragonFruit":
    case "coconut":
    case "avocado":
      drawFallbackFruit(context, type, size, accent);
      break;
    case "corn":
      drawCorn(context, size, accent);
      break;
    case "pumpkin":
      drawPumpkin(context, size, accent);
      break;
    case "berry":
      drawBerry(context, size, accent);
      break;
    case "carrot":
      drawCarrot(context, size, accent);
      break;
    case "eggplant":
      drawEggplant(context, size, accent);
      break;
    case "mushroom":
      drawMushroom(context, size, accent);
      break;
    case "milk":
      drawMilk(context, size, accent);
      break;
    case "bread":
      drawBread(context, size, accent);
      break;
    case "egg":
      drawEgg(context, size, accent);
      break;
    case "pepper":
      drawPepper(context, size, accent);
      break;
    case "potato":
      drawPotato(context, size, accent);
      break;
    case "cup":
      drawCup(context, size, accent);
      break;
    case "mug":
      drawMug(context, size, accent);
      break;
    case "bottle":
      drawBottle(context, size, accent);
      break;
    case "tumbler":
      drawTumbler(context, size, accent);
      break;
    case "glass":
      drawGlass(context, size, accent);
      break;
    case "thermos":
      drawThermos(context, size, accent);
      break;
    case "teacup":
      drawTeacup(context, size, accent);
      break;
    case "canteen":
      drawCanteen(context, size, accent);
      break;
    case "cake":
      drawCake(context, size, accent);
      break;
    case "donut":
      drawDonut(context, size, accent);
      break;
    case "candy":
      drawCandy(context, size, accent);
      break;
    case "cookie":
      drawCookie(context, size, accent);
      break;
    case "icecream":
      drawIcecream(context, size, accent);
      break;
    case "pudding":
      drawPudding(context, size, accent);
      break;
    case "macaron":
      drawMacaron(context, size, accent);
      break;
    case "cupcake":
      drawCupcake(context, size, accent);
      break;
  }
}

function drawFallbackFruit(context: MiniGameCanvasContext2D, type: ItemType, size: number, accent: string): void {
  if (type === "banana") {
    context.beginPath();
    context.arc(0, 0, size * 0.3, 0.12, Math.PI - 0.12);
    context.lineWidth = Math.max(5, size * 0.2);
    context.stroke();
    return;
  }
  if (type === "pineapple" || type === "dragonFruit") {
    context.beginPath();
    context.ellipse(0, size * 0.05, size * 0.25, size * 0.34, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = accent;
    for (let index = -1; index <= 1; index += 1) {
      context.beginPath();
      context.ellipse(index * size * 0.12, -size * 0.3, size * 0.12, size * 0.2, index * 0.3, 0, Math.PI * 2);
      context.fill();
    }
    return;
  }
  context.beginPath();
  context.ellipse(0, size * 0.02, size * 0.29, size * 0.3, type === "avocado" ? 0.2 : 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(-size * 0.11, -size * 0.16, size * 0.1, size * 0.05, -0.5, 0, Math.PI * 2);
  context.fill();
}

function drawItemShadow(context: MiniGameCanvasContext2D, size: number): void {
  context.save();
  context.shadowColor = "transparent";
  // Use an absolute opacity rather than multiplying the caller's alpha. Every
  // render path (scene, slot, temporary area, and flying animation) therefore
  // receives exactly the same shadow weight.
  context.globalAlpha = 0.24;
  context.fillStyle = "#432d20";
  context.beginPath();
  context.ellipse(size * 0.035, size * 0.31, size * 0.31, size * 0.085, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawItemHighlight(context: MiniGameCanvasContext2D, size: number): void {
  context.save();
  context.shadowColor = "transparent";
  context.globalAlpha *= 0.36;
  context.fillStyle = "#fff8df";
  context.beginPath();
  context.ellipse(-size * 0.13, -size * 0.18, size * 0.105, size * 0.048, -0.52, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function createItemGradient(
  context: MiniGameCanvasContext2D,
  color: string,
  size: number,
) {
  const key = `${color}:${Math.round(size * 10)}`;
  const cacheKey = context as unknown as object;
  let gradients = itemGradientCache.get(cacheKey);
  if (!gradients) {
    gradients = new Map<string, ItemGradient>();
    itemGradientCache.set(cacheKey, gradients);
  }
  const cached = gradients.get(key);
  if (cached) {
    return cached;
  }
  const gradient = context.createLinearGradient(-size * 0.34, -size * 0.38, size * 0.34, size * 0.4);
  const tones = getItemTones(color);
  gradient.addColorStop(0, tones.light);
  gradient.addColorStop(0.46, color);
  gradient.addColorStop(1, tones.dark);
  gradients.set(key, gradient);
  return gradient;
}

function getItemTones(color: string): { light: string; dark: string; side: string } {
  const cached = itemToneCache.get(color);
  if (cached) {
    return cached;
  }
  const tones = {
    light: blendColor(color, "#fff7db", 0.34),
    dark: blendColor(color, "#452d1b", 0.3),
    side: blendColor(color, "#382719", 0.52),
  };
  itemToneCache.set(color, tones);
  return tones;
}

function blendColor(source: string, target: string, amount: number): string {
  const sourceRed = Number.parseInt(source.slice(1, 3), 16);
  const sourceGreen = Number.parseInt(source.slice(3, 5), 16);
  const sourceBlue = Number.parseInt(source.slice(5, 7), 16);
  const targetRed = Number.parseInt(target.slice(1, 3), 16);
  const targetGreen = Number.parseInt(target.slice(3, 5), 16);
  const targetBlue = Number.parseInt(target.slice(5, 7), 16);
  const mix = (start: number, end: number): string => Math.round(start + (end - start) * amount)
    .toString(16)
    .padStart(2, "0");
  return `#${mix(sourceRed, targetRed)}${mix(sourceGreen, targetGreen)}${mix(sourceBlue, targetBlue)}`;
}

export function drawMascot(
  context: MiniGameCanvasContext2D,
  centerX: number,
  centerY: number,
  size: number,
): void {
  context.save();
  context.translate(centerX, centerY);
  context.fillStyle = "#fff3b6";
  context.shadowColor = "rgba(66, 54, 20, 0.2)";
  context.shadowBlur = 10;
  context.beginPath();
  context.arc(0, 0, size * 0.34, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = "#f3a53b";
  context.beginPath();
  context.moveTo(size * 0.26, -size * 0.03);
  context.lineTo(size * 0.48, size * 0.06);
  context.lineTo(size * 0.25, size * 0.13);
  context.closePath();
  context.fill();
  context.fillStyle = "#3f4b3d";
  context.beginPath();
  context.arc(size * 0.12, -size * 0.09, size * 0.035, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f0c64b";
  context.beginPath();
  context.moveTo(-size * 0.14, -size * 0.3);
  context.lineTo(-size * 0.03, -size * 0.48);
  context.lineTo(size * 0.04, -size * 0.3);
  context.closePath();
  context.fill();
  context.restore();
}

function drawApple(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.arc(-size * 0.12, size * 0.04, size * 0.25, 0, Math.PI * 2);
  context.arc(size * 0.12, size * 0.04, size * 0.25, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(size * 0.1, -size * 0.27, size * 0.15, size * 0.075, -0.45, 0, Math.PI * 2);
  context.fill();
}

function drawCorn(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.ellipse(0, 0, size * 0.2, size * 0.38, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#cf961f";
  context.lineWidth = Math.max(1, size * 0.025);
  for (let offset = -1; offset <= 1; offset += 1) {
    context.beginPath();
    context.moveTo(offset * size * 0.09, -size * 0.28);
    context.lineTo(offset * size * 0.09, size * 0.28);
    context.stroke();
  }
  context.fillStyle = accent;
  context.beginPath();
  context.moveTo(-size * 0.18, size * 0.34);
  context.quadraticCurveTo(-size * 0.43, size * 0.05, -size * 0.22, -size * 0.18);
  context.lineTo(-size * 0.04, size * 0.28);
  context.closePath();
  context.fill();
}

function drawPumpkin(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  for (let offset = -1; offset <= 1; offset += 1) {
    context.beginPath();
    context.ellipse(offset * size * 0.13, size * 0.04, size * 0.2, size * 0.3, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = accent;
  context.fillRect(-size * 0.04, -size * 0.35, size * 0.08, size * 0.17);
}

function drawBerry(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.moveTo(0, size * 0.35);
  context.quadraticCurveTo(-size * 0.36, -size * 0.02, 0, -size * 0.3);
  context.quadraticCurveTo(size * 0.36, -size * 0.02, 0, size * 0.35);
  context.fill();
  context.fillStyle = accent;
  for (let offset = -1; offset <= 1; offset += 1) {
    context.beginPath();
    context.ellipse(offset * size * 0.13, -size * 0.3, size * 0.16, size * 0.07, offset * 0.35, 0, Math.PI * 2);
    context.fill();
  }
}

function drawCarrot(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.moveTo(-size * 0.23, -size * 0.2);
  context.quadraticCurveTo(0, size * 0.48, size * 0.22, -size * 0.2);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  for (let offset = -1; offset <= 1; offset += 1) {
    context.beginPath();
    context.ellipse(offset * size * 0.11, -size * 0.33, size * 0.07, size * 0.2, offset * 0.4, 0, Math.PI * 2);
    context.fill();
  }
}

function drawEggplant(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.ellipse(0, size * 0.05, size * 0.23, size * 0.38, 0.55, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.moveTo(-size * 0.16, -size * 0.25);
  context.lineTo(size * 0.13, -size * 0.35);
  context.lineTo(size * 0.08, -size * 0.12);
  context.closePath();
  context.fill();
}

function drawMushroom(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.arc(0, -size * 0.08, size * 0.34, Math.PI, 0);
  context.lineTo(size * 0.32, 0);
  context.lineTo(-size * 0.32, 0);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.12, -size * 0.02, size * 0.24, size * 0.38, size * 0.08);
  context.fill();
}

function drawMilk(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.22, -size * 0.29, size * 0.44, size * 0.65, size * 0.08);
  context.fill();
  context.fillStyle = accent;
  context.fillRect(-size * 0.22, -size * 0.05, size * 0.44, size * 0.18);
  context.fillRect(-size * 0.12, -size * 0.39, size * 0.24, size * 0.12);
}

function drawBread(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.33, -size * 0.25, size * 0.66, size * 0.55, size * 0.2);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, size * 0.05);
  for (let offset = -1; offset <= 1; offset += 1) {
    context.beginPath();
    context.moveTo(offset * size * 0.14 - size * 0.04, -size * 0.14);
    context.lineTo(offset * size * 0.14 + size * 0.04, size * 0.02);
    context.stroke();
  }
}

function drawEgg(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.ellipse(0, 0, size * 0.27, size * 0.38, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(size * 0.03, size * 0.05, size * 0.13, 0, Math.PI * 2);
  context.fill();
}

function drawPepper(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  for (let offset = -1; offset <= 1; offset += 1) {
    context.beginPath();
    context.ellipse(offset * size * 0.13, size * 0.05, size * 0.17, size * 0.28, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, -size * 0.27, size * 0.16, size * 0.08, 0, 0, Math.PI * 2);
  context.fill();
}

function drawPotato(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.ellipse(0, 0, size * 0.35, size * 0.27, 0.25, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  for (const [x, y] of [[-0.16, -0.06], [0.13, -0.12], [0.08, 0.13]]) {
    context.beginPath();
    context.arc(x * size, y * size, size * 0.035, 0, Math.PI * 2);
    context.fill();
  }
}

function drawCup(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.28, -size * 0.24, size * 0.56, size * 0.52, size * 0.08);
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.3, -size * 0.3, size * 0.6, size * 0.11, size * 0.05);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, size * 0.045);
  context.beginPath();
  context.arc(size * 0.27, -size * 0.02, size * 0.15, -Math.PI * 0.55, Math.PI * 0.55);
  context.stroke();
}

function drawMug(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.3, -size * 0.24, size * 0.56, size * 0.5, size * 0.1);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = Math.max(3, size * 0.075);
  context.beginPath();
  context.arc(size * 0.28, -size * 0.01, size * 0.16, -Math.PI * 0.52, Math.PI * 0.52);
  context.stroke();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.26, -size * 0.28, size * 0.48, size * 0.08, size * 0.03);
  context.fill();
}

function drawBottle(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.23, -size * 0.13, size * 0.46, size * 0.52, size * 0.11);
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.13, -size * 0.32, size * 0.26, size * 0.2, size * 0.04);
  context.fill();
  roundedRect(context, -size * 0.16, -size * 0.4, size * 0.32, size * 0.09, size * 0.03);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, size * 0.035);
  context.beginPath();
  context.moveTo(-size * 0.17, size * 0.12);
  context.lineTo(size * 0.17, size * 0.12);
  context.stroke();
}

function drawTumbler(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.moveTo(-size * 0.25, -size * 0.24);
  context.lineTo(size * 0.25, -size * 0.24);
  context.lineTo(size * 0.19, size * 0.3);
  context.quadraticCurveTo(0, size * 0.4, -size * 0.19, size * 0.3);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.28, -size * 0.31, size * 0.56, size * 0.1, size * 0.04);
  context.fill();
  context.fillRect(-size * 0.035, -size * 0.5, size * 0.07, size * 0.2);
}

function drawGlass(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.moveTo(-size * 0.27, -size * 0.27);
  context.lineTo(size * 0.27, -size * 0.27);
  context.lineTo(size * 0.17, size * 0.29);
  context.quadraticCurveTo(0, size * 0.38, -size * 0.17, size * 0.29);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  context.globalAlpha *= 0.82;
  context.beginPath();
  context.ellipse(0, -size * 0.27, size * 0.28, size * 0.075, 0, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha /= 0.82;
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, size * 0.035);
  context.beginPath();
  context.moveTo(-size * 0.17, size * 0.05);
  context.lineTo(size * 0.17, size * 0.05);
  context.stroke();
}

function drawThermos(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.24, -size * 0.27, size * 0.48, size * 0.59, size * 0.12);
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.14, -size * 0.39, size * 0.28, size * 0.14, size * 0.04);
  context.fill();
  roundedRect(context, -size * 0.28, -size * 0.06, size * 0.56, size * 0.09, size * 0.03);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, size * 0.03);
  context.beginPath();
  context.moveTo(-size * 0.15, size * 0.17);
  context.lineTo(size * 0.15, size * 0.17);
  context.stroke();
}

function drawTeacup(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  const bodyFill = context.fillStyle;
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, size * 0.28, size * 0.35, size * 0.1, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(size * 0.25, -size * 0.02, size * 0.16, -Math.PI * 0.52, Math.PI * 0.52);
  context.strokeStyle = accent;
  context.lineWidth = Math.max(3, size * 0.06);
  context.stroke();
  context.fillStyle = bodyFill;
  context.beginPath();
  context.ellipse(0, 0, size * 0.29, size * 0.25, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, -size * 0.08, size * 0.2, size * 0.07, 0, 0, Math.PI * 2);
  context.fill();
}

function drawCanteen(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.28, -size * 0.25, size * 0.56, size * 0.5, size * 0.12);
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.18, -size * 0.39, size * 0.36, size * 0.15, size * 0.05);
  context.fill();
  context.strokeStyle = accent;
  context.lineWidth = Math.max(2, size * 0.04);
  context.beginPath();
  context.arc(0, 0, size * 0.18, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(-size * 0.28, -size * 0.08);
  context.lineTo(size * 0.28, -size * 0.08);
  context.stroke();
}

function drawCake(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  roundedRect(context, -size * 0.31, -size * 0.05, size * 0.62, size * 0.34, size * 0.06);
  context.fill();
  context.fillStyle = accent;
  roundedRect(context, -size * 0.31, -size * 0.17, size * 0.62, size * 0.14, size * 0.06);
  context.fill();
  context.fillStyle = "#fff7df";
  context.beginPath();
  context.arc(-size * 0.18, -size * 0.06, size * 0.065, 0, Math.PI * 2);
  context.arc(0, -size * 0.09, size * 0.07, 0, Math.PI * 2);
  context.arc(size * 0.18, -size * 0.06, size * 0.065, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ef6d7d";
  context.beginPath();
  context.arc(0, -size * 0.33, size * 0.055, 0, Math.PI * 2);
  context.fill();
}

function drawDonut(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.ellipse(0, 0, size * 0.32, size * 0.25, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, -size * 0.03, size * 0.23, size * 0.13, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#8a5038";
  context.beginPath();
  context.ellipse(0, -size * 0.03, size * 0.075, size * 0.045, 0, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff0c8";
  context.lineWidth = Math.max(1.5, size * 0.025);
  context.beginPath();
  context.moveTo(-size * 0.16, -size * 0.13);
  context.lineTo(-size * 0.08, -size * 0.17);
  context.moveTo(size * 0.08, size * 0.1);
  context.lineTo(size * 0.16, size * 0.05);
  context.stroke();
}

function drawCandy(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.strokeStyle = "#fff0c6";
  context.lineWidth = Math.max(2, size * 0.045);
  context.beginPath();
  context.moveTo(0, size * 0.08);
  context.lineTo(0, size * 0.39);
  context.stroke();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(0, -size * 0.13, size * 0.22, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#fff0c6";
  context.lineWidth = Math.max(2, size * 0.035);
  context.beginPath();
  context.arc(0, -size * 0.13, size * 0.14, -0.9, 1.8);
  context.stroke();
}

function drawCookie(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.arc(0, 0, size * 0.29, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  for (const [x, y] of [[-0.12, -0.12], [0.13, -0.08], [-0.08, 0.12], [0.14, 0.14]]) {
    context.beginPath();
    context.arc(size * x, size * y, size * 0.04, 0, Math.PI * 2);
    context.fill();
  }
}

function drawIcecream(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.fillStyle = "#d69b5c";
  context.beginPath();
  context.moveTo(-size * 0.18, size * 0.02);
  context.lineTo(size * 0.18, size * 0.02);
  context.lineTo(0, size * 0.39);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(-size * 0.1, -size * 0.12, size * 0.17, 0, Math.PI * 2);
  context.arc(size * 0.1, -size * 0.12, size * 0.17, 0, Math.PI * 2);
  context.arc(0, -size * 0.26, size * 0.17, 0, Math.PI * 2);
  context.fill();
}

function drawPudding(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.moveTo(-size * 0.25, -size * 0.11);
  context.quadraticCurveTo(0, size * 0.37, size * 0.25, -size * 0.11);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, -size * 0.13, size * 0.25, size * 0.1, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#d8873c";
  context.beginPath();
  context.arc(0, -size * 0.17, size * 0.045, 0, Math.PI * 2);
  context.fill();
}

function drawMacaron(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.beginPath();
  context.ellipse(0, size * 0.11, size * 0.28, size * 0.13, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.ellipse(0, -size * 0.1, size * 0.28, size * 0.13, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#fff0d4";
  context.beginPath();
  context.ellipse(0, 0, size * 0.22, size * 0.055, 0, 0, Math.PI * 2);
  context.fill();
}

function drawCupcake(context: MiniGameCanvasContext2D, size: number, accent: string): void {
  context.fillStyle = "#c97754";
  context.beginPath();
  context.moveTo(-size * 0.25, -size * 0.02);
  context.lineTo(size * 0.25, -size * 0.02);
  context.lineTo(size * 0.18, size * 0.3);
  context.lineTo(-size * 0.18, size * 0.3);
  context.closePath();
  context.fill();
  context.fillStyle = accent;
  context.beginPath();
  context.arc(-size * 0.12, -size * 0.14, size * 0.15, 0, Math.PI * 2);
  context.arc(size * 0.12, -size * 0.14, size * 0.15, 0, Math.PI * 2);
  context.arc(0, -size * 0.28, size * 0.17, 0, Math.PI * 2);
  context.fill();
}
