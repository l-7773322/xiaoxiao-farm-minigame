import { type ItemType } from "../data/ItemConfig";
import { SoundManager } from "./SoundManager";

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
  private readonly sound = new SoundManager();

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

  public playItemSound(type: ItemType): void {
    this.sound.playItem(type);
  }
}
