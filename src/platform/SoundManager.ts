import { type ItemType } from "../data/ItemConfig";

const ITEM_PITCHES: Record<ItemType, number> = {
  apple: 520,
  pear: 540,
  orange: 575,
  banana: 635,
  pineapple: 455,
  mango: 490,
  watermelon: 390,
  cantaloupe: 420,
  pomegranate: 510,
  dragonFruit: 730,
  coconut: 360,
  avocado: 445,
  strawberry: 690,
  lemon: 610,
  peach: 555,
  kiwi: 475,
  grapes: 735,
  papaya: 505,
  tomato: 530,
  cucumber: 580,
  onion: 445,
  broccoli: 500,
  radish: 570,
  garlic: 430,
  cherry: 780,
  lime: 650,
  zucchini: 405,
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
  cheese: 485,
  rollingPin: 370,
  whisk: 740,
  cup: 570,
  mug: 460,
  bottle: 620,
  tumbler: 720,
  glass: 800,
  thermos: 390,
  teacup: 690,
  canteen: 530,
  wineGlass: 840,
  masonJar: 615,
  enamelMug: 565,
  cake: 450,
  donut: 570,
  candy: 760,
  cookie: 410,
  icecream: 680,
  pudding: 520,
  macaron: 620,
  cupcake: 490,
  croissant: 430,
  fruitTart: 705,
  chocolate: 345,
};

export class SoundManager {
  private context: MiniGameWebAudioContext | undefined;

  public constructor() {
    // Defer context creation until the first tap so mobile autoplay rules do
    // not prevent the feedback sound from starting.
  }

  public playItem(type: ItemType): void {
    this.playTone(ITEM_PITCHES[type], 0.13, "sine", 0.11);
  }

  public playMatch(): void {
    this.playPattern([660, 830, 1040], 0.055, 0.12, "triangle", 0.1);
  }

  public playTool(): void {
    this.playPattern([300, 470], 0.07, 0.12, "square", 0.075);
  }

  public playError(): void {
    this.playPattern([190, 125], 0.08, 0.1, "sawtooth", 0.055);
  }

  private ensureContext(): MiniGameWebAudioContext | undefined {
    if (this.context) {
      return this.context;
    }
    try {
      this.context = wx.createWebAudioContext?.();
    } catch {
      this.context = undefined;
    }
    return this.context;
  }

  private playTone(
    frequency: number,
    duration: number,
    oscillatorType: string,
    peakGain: number,
    startOffset = 0,
  ): void {
    const context = this.ensureContext();
    if (!context) {
      return;
    }

    try {
      void context.resume?.();
      const now = context.currentTime + startOffset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = oscillatorType;
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch {
      // Audio is optional in some development-tool and device environments.
    }
  }

  private playPattern(
    frequencies: readonly number[],
    step: number,
    duration: number,
    oscillatorType: string,
    peakGain: number,
  ): void {
    frequencies.forEach((frequency, index) => {
      this.playTone(frequency, duration, oscillatorType, peakGain, index * step);
    });
  }
}
