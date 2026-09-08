import { type ItemType } from "../data/ItemConfig";
import { SoundManager } from "./SoundManager";

export interface TapPoint {
  x: number;
  y: number;
}

export type TapGesture = "tap" | "longPressRelease";

export interface GameSurface {
  canvas: MiniGameCanvas;
  context: MiniGameCanvasContext2D;
  width: number;
  height: number;
  pixelRatio: number;
}

export interface RewardResult {
  shown: boolean;
  completed: boolean;
}

export interface ItemImage {
  src: string;
  onload?: () => void;
  onerror?: () => void;
}

const REWARDED_AD_UNIT_ID = "";
const LONG_PRESS_DELAY_MS = 420;
const GESTURE_MOVE_SLOP = 16;

export class WechatRuntime {
  public readonly surface: GameSurface;
  private readonly sound = new SoundManager();

  public constructor() {
    const systemInfo = wx.getSystemInfoSync();
    // DPR 3/4 multiplies every Canvas pixel several times and is costly for a
    // dense pile. DPR 2 remains crisp on normal screens while cutting the
    // worst-case raster workload by more than half on budget phones.
    const pixelRatio = Math.min(2, Math.max(1, systemInfo.pixelRatio || 1));
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

  public onTap(listener: (point: TapPoint, gesture: TapGesture) => void): void {
    let activePress: {
      point: TapPoint;
      startedAt: number;
      moved: boolean;
    } | undefined;

    const readPoint = (event: MiniGameTouchEvent): TapPoint | undefined => {
      const touch = event.touches[0] ?? event.changedTouches[0];
      return touch ? { x: touch.clientX, y: touch.clientY } : undefined;
    };

    wx.onTouchStart((event) => {
      const point = readPoint(event);
      if (!point) {
        return;
      }
      activePress = {
        point,
        startedAt: Date.now(),
        moved: false,
      };
    });

    wx.onTouchMove?.((event) => {
      const point = readPoint(event);
      if (!activePress || !point) {
        return;
      }
      if (Math.hypot(point.x - activePress.point.x, point.y - activePress.point.y) > GESTURE_MOVE_SLOP) {
        activePress.moved = true;
      }
    });

    wx.onTouchEnd?.((event) => {
      const press = activePress;
      activePress = undefined;
      if (!press) {
        return;
      }
      const point = readPoint(event) ?? press.point;
      if (press.moved || Math.hypot(point.x - press.point.x, point.y - press.point.y) > GESTURE_MOVE_SLOP) {
        return;
      }
      if (Date.now() - press.startedAt >= LONG_PRESS_DELAY_MS) {
        listener(point, "longPressRelease");
        return;
      }
      listener(point, "tap");
    });

    wx.onTouchCancel?.(() => {
      activePress = undefined;
    });
  }

  public onHide(listener: () => void): void {
    wx.onHide?.(listener);
  }

  public onShow(listener: () => void): void {
    wx.onShow?.(listener);
  }

  public playItemSound(type: ItemType): void {
    this.sound.playItem(type);
  }

  public playMatchSound(): void {
    this.sound.playMatch();
  }

  public playToolSound(): void {
    this.sound.playTool();
  }

  public playErrorSound(): void {
    this.sound.playError();
  }

  public vibrateShort(): void {
    wx.vibrateShort?.({ type: "light" });
  }

  public loadImage(path: string, onReady: (image: ItemImage) => void): ItemImage | undefined {
    const image = wx.createImage?.();
    if (!image) {
      return undefined;
    }
    image.onload = () => onReady(image);
    image.onerror = () => undefined;
    image.src = path;
    return image;
  }

  /**
   * Shows a rewarded ad when an ad unit has been configured. The empty ID is
   * intentional for local development: the game falls back to a test reward
   * instead of throwing when opened in the developer tool.
   */
  public async showRewardedAd(): Promise<RewardResult> {
    const createRewardedVideoAd = (wx as WxMiniGameApi & {
      createRewardedVideoAd?: (options: { adUnitId: string }) => {
        show(): Promise<void>;
        onClose(listener: (result?: { isEnded?: boolean }) => void): void;
        onError?(listener: (error: unknown) => void): void;
      };
    }).createRewardedVideoAd;
    if (!REWARDED_AD_UNIT_ID || !createRewardedVideoAd) {
      return { shown: false, completed: true };
    }

    try {
      const ad = createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
      return await new Promise<RewardResult>((resolve) => {
        let settled = false;
        const finish = (completed: boolean) => {
          if (settled) return;
          settled = true;
          resolve({ shown: true, completed });
        };
        ad.onClose((result) => finish(result?.isEnded === true));
        ad.onError?.(() => finish(false));
        ad.show().catch(() => finish(false));
      });
    } catch {
      return { shown: false, completed: false };
    }
  }
}
