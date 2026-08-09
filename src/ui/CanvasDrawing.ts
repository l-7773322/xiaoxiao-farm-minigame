import type { ItemType } from "../data/ItemConfig";
import { ITEM_VISUALS } from "../data/ItemConfig";

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
): void {
  const visual = ITEM_VISUALS[type];
  context.save();
  context.translate(centerX, centerY);
  context.fillStyle = visual.color;

  if (type === "apple") {
    context.beginPath();
    context.arc(-size * 0.13, size * 0.04, size * 0.25, 0, Math.PI * 2);
    context.arc(size * 0.13, size * 0.04, size * 0.25, 0, Math.PI * 2);
    context.fill();
  } else if (type === "corn") {
    context.beginPath();
    context.ellipse(0, 0, size * 0.2, size * 0.36, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#d79d24";
    context.lineWidth = Math.max(1, size * 0.025);
    for (let offset = -1; offset <= 1; offset += 1) {
      context.beginPath();
      context.moveTo(offset * size * 0.09, -size * 0.27);
      context.lineTo(offset * size * 0.09, size * 0.27);
      context.stroke();
    }
  } else if (type === "pumpkin") {
    for (let offset = -1; offset <= 1; offset += 1) {
      context.beginPath();
      context.ellipse(offset * size * 0.13, size * 0.04, size * 0.2, size * 0.29, 0, 0, Math.PI * 2);
      context.fill();
    }
  } else {
    context.beginPath();
    context.moveTo(0, size * 0.32);
    context.quadraticCurveTo(-size * 0.36, -size * 0.05, 0, -size * 0.28);
    context.quadraticCurveTo(size * 0.36, -size * 0.05, 0, size * 0.32);
    context.fill();
  }

  context.fillStyle = visual.accent;
  context.beginPath();
  context.ellipse(size * 0.09, -size * 0.3, size * 0.13, size * 0.065, -0.45, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
