interface MiniGameTouch {
  clientX: number;
  clientY: number;
}

interface MiniGameTouchEvent {
  touches: MiniGameTouch[];
  changedTouches: MiniGameTouch[];
}

interface MiniGameCanvasGradient {
  addColorStop(offset: number, color: string): void;
}

interface MiniGameCanvasContext2D {
  fillStyle: string | MiniGameCanvasGradient;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: "left" | "right" | "center" | "start" | "end";
  textBaseline: "top" | "hanging" | "middle" | "alphabetic" | "ideographic" | "bottom";
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
  ): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  scale(x: number, y: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): MiniGameCanvasGradient;
}

interface MiniGameCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): MiniGameCanvasContext2D;
}

interface MiniGameSystemInfo {
  windowWidth: number;
  windowHeight: number;
  pixelRatio: number;
}

interface WxMiniGameApi {
  createCanvas(): MiniGameCanvas;
  getSystemInfoSync(): MiniGameSystemInfo;
  onTouchStart(listener: (event: MiniGameTouchEvent) => void): void;
  vibrateShort?(options?: { type?: "light" | "medium" | "heavy" }): void;
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, value: unknown): void;
}

declare const wx: WxMiniGameApi;

declare function requestAnimationFrame(callback: (time: number) => void): number;
declare function cancelAnimationFrame(handle: number): void;
