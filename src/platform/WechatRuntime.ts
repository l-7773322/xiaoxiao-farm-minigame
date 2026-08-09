export interface TapPoint {
  x: number;
  y: number;
}

export interface GameSurface {
  canvas: MiniGameCanvas;
  context: MiniGameCanvasContext2D;
  width: number;
  height: number;
  pixelRatio: number;
}

export class WechatRuntime {
  public readonly surface: GameSurface;

  public constructor() {
    const systemInfo = wx.getSystemInfoSync();
    const pixelRatio = Math.max(1, systemInfo.pixelRatio || 1);
    const canvas = wx.createCanvas();
    canvas.width = Math.round(systemInfo.windowWidth * pixelRatio);
    canvas.height = Math.round(systemInfo.windowHeight * pixelRatio);

    const context = canvas.getContext("2d");
    context.scale(pixelRatio, pixelRatio);

    this.surface = {
      canvas,
      context,
      width: systemInfo.windowWidth,
      height: systemInfo.windowHeight,
      pixelRatio,
    };
  }

  public onTap(listener: (point: TapPoint) => void): void {
    wx.onTouchStart((event) => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      if (touch) {
        listener({ x: touch.clientX, y: touch.clientY });
      }
    });
  }

  public vibrate(type: "light" | "medium" | "heavy" = "light"): void {
    wx.vibrateShort?.({ type });
  }
}
