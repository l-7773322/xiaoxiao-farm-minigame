import { ITEM_VISUALS, type ItemType } from "../data/ItemConfig";

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
): void {
  const visual = ITEM_VISUALS[type];
  context.save();
  context.translate(centerX, centerY);
  context.rotate(rotation);
  context.globalAlpha = blocked ? 0.5 : 1;
  context.shadowColor = blocked ? "rgba(36, 44, 36, 0.15)" : "rgba(45, 42, 25, 0.3)";
  context.shadowBlur = blocked ? 2 : 7;
  context.shadowOffsetY = blocked ? 1 : 4;
  drawItemShadow(context, size);

  const sideColor = blendColor(visual.color, "#382719", 0.52);
  context.save();
  context.translate(size * 0.055, size * 0.085);
  context.globalAlpha = blocked ? 0.3 : 0.66;
  context.shadowBlur = 1;
  context.shadowOffsetY = 1;
  context.fillStyle = sideColor;
  drawItemShape(context, type, size, sideColor);
  context.restore();

  context.fillStyle = createItemGradient(context, visual.color, size);
  drawItemShape(context, type, size, visual.accent);
  drawItemHighlight(context, size);

  if (blocked) {
    context.shadowBlur = 0;
    context.fillStyle = "rgba(38, 48, 39, 0.22)";
    context.beginPath();
    context.arc(0, 0, size * 0.42, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
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
  }
}

function drawItemShadow(context: MiniGameCanvasContext2D, size: number): void {
  context.save();
  context.shadowColor = "transparent";
  context.globalAlpha *= 0.28;
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
  const gradient = context.createLinearGradient(-size * 0.34, -size * 0.38, size * 0.34, size * 0.4);
  gradient.addColorStop(0, blendColor(color, "#fff7db", 0.34));
  gradient.addColorStop(0.46, color);
  gradient.addColorStop(1, blendColor(color, "#452d1b", 0.3));
  return gradient;
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
