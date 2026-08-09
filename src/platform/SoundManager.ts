import { type ItemType } from "../data/ItemConfig";

const ITEM_PITCHES: Record<ItemType, number> = {
  apple: 520,
  corn: 610,
  pumpkin: 420,
  berry: 710,
  carrot: 660,
  eggplant: 350,
  mushroom: 470,
  milk: 560,
  bread: 390,
  egg: 760,
  pepper: 680,
  potato: 320,
};

export class SoundManager {
  private readonly context: MiniGameWebAudioContext | undefined;

  public constructor() {
    try {
      this.context = wx.createWebAudioContext?.();
    } catch {
      this.context = undefined;
    }
  }

  public playItem(type: ItemType): void {
    const context = this.context;
    if (!context) {
      return;
    }

    try {
      void context.resume?.();
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(ITEM_PITCHES[type], now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.13);
    } catch {
      // 音频能力在部分开发者工具/真机环境中可能不可用，不影响正常游玩。
    }
  }
}
