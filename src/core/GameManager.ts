import {
  ITEM_SET_LABELS,
  ITEM_SET_ORDER,
  ITEM_TYPES,
  ITEM_VISUALS,
  type ItemSetName,
  type ItemType,
} from "../data/ItemConfig";
import { DropSystem } from "../game/DropSystem";
import { CHAPTER_NAMES, getPileBounds, getSceneLayout, LEVEL_SPECS, LevelGenerator } from "../game/LevelGenerator";
import { SlotManager } from "../game/SlotManager";
import { pickVisibleSurface } from "../game/SurfacePicker";
import { Tile } from "../game/Tile";
import { WechatRuntime, type TapGesture, type TapPoint } from "../platform/WechatRuntime";
import { drawItemIcon, drawMascot, registerItemImage, roundedRect } from "../ui/CanvasDrawing";
import { StorageManager, type ProgressData } from "./StorageManager";

type GameStatus = "home" | "levels" | "catalog" | "playing" | "stageClear" | "won" | "lost";
type ToolName = "moveOut" | "gather" | "shuffle";
type PauseReason = "manual" | "background";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
const TIMER_REFRESH_DELAY_MS = 250;
// Keep the rendered subject just inside the opening.  The source sprites have
// their own transparent safety margin, so scaling them above the tile size
// makes the outer row look cropped by the basket walls.
const SCENE_ITEM_SCALE = 0.96;
// Moving items stay almost full-size so their complete 3D silhouette remains
// readable, while retaining a tiny safety margin against the crate aperture.
const MOVING_ITEM_SCALE = 0.94;
const STAGE_ITEM_DETAIL = "dense" as const;
const ANIMATION_RENDER_INTERVAL_MS = 40;
const COLLECT_MOTION_DURATION_MS = 280;
const DROP_START_DELAY_MS = 220;
const MIN_DROP_DURATION_MS = 280;
const MAX_DROP_DURATION_MS = 420;

export class GameManager {
  private readonly slots = new SlotManager(7);
  private readonly dropSystem: DropSystem;
  private readonly generator = new LevelGenerator();
  private readonly storage = new StorageManager();
  private readonly context: MiniGameCanvasContext2D;
  private readonly width: number;
  private readonly height: number;
  private sceneTiles: Tile[] = [];
  private status: GameStatus = "home";
  private progress: ProgressData = {
    highestUnlocked: 1,
    completedLevels: [],
    levelStars: {},
    discoveredItems: [],
    daily: { stamp: "", completed: false, stars: 0 },
    reward: { coins: 0, streak: 0, lastRewardStamp: "" },
  };
  // The selected set is a whole-game setting.  Level difficulty still comes
  // from LEVEL_SPECS, but every level is generated with this one active set.
  private activeItemSet: ItemSetName = "produce";
  private levelIndex = 0;
  private lastPlayedLevel: number | undefined;
  private initialTileCount = 0;
  private totalMatched = 0;
  private bestCombo = 0;
  private currentCombo = 0;
  private lastMatchAt = 0;
  private maxSlotSize = 0;
  private stageStars = 0;
  private stageCoinReward = 0;
  private isDailyChallenge = false;
  private reviveUsed = false;
  private stageStartedAt = 0;
  private elapsedBeforePauseMs = 0;
  private timerPaused = false;
  private pauseReason: PauseReason = "manual";
  private toolRemaining: Record<ToolName, number> = {
    moveOut: 1,
    gather: 1,
    shuffle: 1,
  };
  // "Move out" items leave the visible interface permanently.  Their type
  // credits stay hidden so the remaining 1-2 matching items can still finish
  // a triplet later; this keeps the level solvable without drawing a second
  // tray behind the seven collection slots.
  private readonly moveOutCredits = new Map<ItemType, number>();
  private backButton: Rect = { ...EMPTY_RECT };
  private primaryButton: Rect = { ...EMPTY_RECT };
  private pauseExitButton: Rect = { ...EMPTY_RECT };
  private levelSelectButton: Rect = { ...EMPTY_RECT };
  private dailyButton: Rect = { ...EMPTY_RECT };
  private catalogButton: Rect = { ...EMPTY_RECT };
  private reviveButton: Rect = { ...EMPTY_RECT };
  private itemSetButtons: Record<ItemSetName, Rect> = {
    produce: { ...EMPTY_RECT },
    cups: { ...EMPTY_RECT },
    kitchen: { ...EMPTY_RECT },
    desserts: { ...EMPTY_RECT },
  };
  private levelButtons: Rect[] = [];
  private toolButtons: Record<ToolName, Rect> = {
    moveOut: { ...EMPTY_RECT },
    gather: { ...EMPTY_RECT },
    shuffle: { ...EMPTY_RECT },
  };
  private toast = "";
  private readonly dropMotions = new Map<number, {
    tile: Tile;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    fromRotation: number;
    rollRadians: number;
    duration: number;
    verticalDrop: boolean;
    squash: number;
    startedAt: number;
  }>();
  private readonly collectMotions: Array<{
    tile: Tile;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startedAt: number;
  }> = [];
  private readonly moveOutMotions: Array<{
    tile: Tile;
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    startedAt: number;
  }> = [];
  private readonly matchBursts: Array<{
    type: ItemType;
    x: number;
    y: number;
    combo: number;
    startedAt: number;
  }> = [];
  private readonly tapBursts: Array<{
    x: number;
    y: number;
    startedAt: number;
  }> = [];
  private dropFrame: number | undefined;
  private collectFrame: number | undefined;
  private timerFrame: number | undefined;
  private lastAnimationRenderAt = 0;
  private lastTimerRenderAt = 0;
  private fruitAssetRenderQueued = false;
  private homeBackground: MiniGameImage | undefined;
  private gameBackground: MiniGameImage | undefined;

  public constructor(private readonly runtime: WechatRuntime) {
    this.context = runtime.surface.context;
    this.width = runtime.surface.width;
    this.height = runtime.surface.height;
    this.dropSystem = new DropSystem(getPileBounds(this.width, this.height));
    this.loadRealFruitAssets();
    this.runtime.loadImage?.(
      "assets/ui/home-background.png?v=1",
      (image) => {
        this.homeBackground = image;
        this.render();
      },
    );
    this.runtime.loadImage?.(
      "assets/ui/game-background.png?v=1",
      (image) => {
        this.gameBackground = image;
        this.render();
      },
    );
  }

  private loadRealFruitAssets(): void {
    const fruitFiles: Record<string, string> = {
      apple: "apple",
      pear: "pear",
      orange: "orange",
      banana: "banana",
      pineapple: "pineapple",
      mango: "mango",
      watermelon: "watermelon",
      cantaloupe: "cantaloupe",
      pomegranate: "pomegranate",
      dragonFruit: "dragon-fruit",
      coconut: "coconut",
      avocado: "avocado",
      strawberry: "strawberry",
      lemon: "lemon",
      peach: "peach",
      kiwi: "kiwi",
      grapes: "grapes",
      papaya: "papaya",
    };
    const views = ["front", "three-quarter", "side", "top"] as const;
    // Increment this tag whenever the sprite atlas is rebuilt. WeChat's
    // image cache may otherwise keep showing an older fruit even after the
    // WebP on disk has been replaced.
    const fruitAssetVersion = "photoreal-v5";
    for (const [type, fileName] of Object.entries(fruitFiles)) {
      for (const view of views) {
        this.runtime.loadImage?.(
          `assets/fruit-models/runtime/${fileName}-${view}.webp?v=${fruitAssetVersion}`,
          (image) => {
            registerItemImage(type as ItemType, view, image);
            this.scheduleFruitAssetRender();
          },
        );
      }
    }
    const realItemFiles: Partial<Record<ItemType, string>> = {
      carrot: "carrot", bread: "bread", berry: "berry", corn: "corn", mushroom: "mushroom", pumpkin: "pumpkin",
      eggplant: "eggplant", milk: "milk", egg: "egg", pepper: "pepper", potato: "potato",
      cup: "cup", mug: "mug", bottle: "bottle", tumbler: "tumbler", glass: "glass", thermos: "thermos", teacup: "teacup", canteen: "canteen",
      cake: "cake", donut: "donut", candy: "candy", cookie: "cookie", icecream: "icecream", pudding: "pudding", macaron: "macaron", cupcake: "cupcake",
      tomato: "tomato", cucumber: "cucumber", onion: "onion",
      broccoli: "broccoli", radish: "radish", garlic: "garlic",
      cherry: "cherry", lime: "lime", zucchini: "zucchini",
      wineGlass: "wine-glass", masonJar: "mason-jar", enamelMug: "enamel-mug",
      cheese: "cheese", rollingPin: "rolling-pin", whisk: "whisk",
      croissant: "croissant", fruitTart: "fruit-tart", chocolate: "chocolate",
    };
    for (const [type, fileName] of Object.entries(realItemFiles)) {
      for (const view of views) {
        this.runtime.loadImage?.(
          `assets/item-models/runtime/${fileName}-${view}.webp?v=${fruitAssetVersion}`,
          (image) => {
            registerItemImage(type as ItemType, view, image);
            this.scheduleFruitAssetRender();
          },
        );
      }
    }
  }

  private scheduleFruitAssetRender(): void {
    if (this.fruitAssetRenderQueued) {
      return;
    }
    this.fruitAssetRenderQueued = true;
    const flush = () => {
      this.fruitAssetRenderQueued = false;
      this.render();
    };
    if (typeof requestAnimationFrame === "undefined") {
      flush();
      return;
    }
    requestAnimationFrame(flush);
  }

  public start(): void {
    this.progress = this.storage.load();
    this.showHome();
    this.runtime.onTap((point, gesture) => this.handleTap(point, gesture));
    this.runtime.onHide?.(() => this.pauseForBackground());
    this.runtime.onShow?.(() => this.refreshAfterBackground());
  }

  private showHome(): void {
    this.cancelDropAnimation();
    this.cancelCollectAnimation();
    this.cancelTimerLoop();
    this.status = "home";
    this.levelIndex = this.progress.highestUnlocked - 1;
    this.totalMatched = 0;
    this.bestCombo = 0;
    this.currentCombo = 0;
    this.lastMatchAt = 0;
    this.maxSlotSize = 0;
    this.stageStars = 0;
    this.stageCoinReward = 0;
    this.isDailyChallenge = false;
    this.reviveUsed = false;
    this.sceneTiles = [];
    this.stageStartedAt = 0;
    this.elapsedBeforePauseMs = 0;
    this.timerPaused = false;
    this.pauseReason = "manual";
    this.pauseExitButton = { ...EMPTY_RECT };
    this.primaryButton = { ...EMPTY_RECT };
    this.dailyButton = { ...EMPTY_RECT };
    this.levelSelectButton = { ...EMPTY_RECT };
    this.catalogButton = { ...EMPTY_RECT };
    this.slots.reset();
    this.moveOutCredits.clear();
    this.render();
  }

  private beginStage(index: number, daily = false): void {
    this.cancelDropAnimation();
    this.cancelCollectAnimation();
    this.cancelTimerLoop();
    this.lastPlayedLevel = index;
    this.levelIndex = index;
    this.status = "playing";
    this.totalMatched = 0;
    this.bestCombo = 0;
    this.currentCombo = 0;
    this.lastMatchAt = 0;
    this.maxSlotSize = 0;
    this.stageStars = 0;
    this.stageCoinReward = 0;
    this.isDailyChallenge = daily;
    this.reviveUsed = false;
    this.slots.reset();
    this.moveOutCredits.clear();
    this.toolRemaining = { moveOut: 1, gather: 1, shuffle: 1 };
    this.stageStartedAt = Date.now();
    this.elapsedBeforePauseMs = 0;
    this.timerPaused = false;
    this.pauseReason = "manual";
    this.pauseExitButton = { ...EMPTY_RECT };
    this.lastTimerRenderAt = this.stageStartedAt;
    this.toast = index === 0 ? "点准露出的图案，三个相同就消除" : "只能点露在最上面的物品表面";
    this.sceneTiles = this.generator.generate(LEVEL_SPECS[index], this.width, this.height, this.activeItemSet);
    this.initialTileCount = this.sceneTiles.length;
    this.progress = this.storage.discoverItems(this.progress, [...new Set(this.sceneTiles.map((tile) => tile.type))]);
    this.render();
    this.ensureTimerLoop();
  }

  private beginDailyChallenge(): void {
    const dayIndex = Math.floor(Date.now() / 86400000) % 10;
    this.beginStage(dayIndex, true);
  }

  private requestRevive(): void {
    if (this.status !== "lost" || this.reviveUsed) {
      return;
    }
    this.reviveUsed = true;
    const rewardPromise = this.runtime.showRewardedAd?.();
    if (!rewardPromise) {
      this.reviveUsed = false;
      this.render();
      return;
    }
    void rewardPromise.then((result) => {
      if (!result?.completed || this.status !== "lost") {
        this.render();
        return;
      }
      const last = this.slots.items[this.slots.items.length - 1];
      if (last) {
        this.slots.remove(last.id);
      }
      this.status = "playing";
      this.timerPaused = false;
      this.stageStartedAt = Date.now();
      this.lastTimerRenderAt = this.stageStartedAt;
      this.render();
      this.ensureTimerLoop();
    });
  }

  private getElapsedStageMs(now = Date.now()): number {
    if (this.stageStartedAt <= 0) {
      return this.elapsedBeforePauseMs;
    }
    const runningMs = this.timerPaused ? 0 : Math.max(0, now - this.stageStartedAt);
    return this.elapsedBeforePauseMs + runningMs;
  }

  private getRemainingSeconds(): number {
    return Math.max(0, 600 - Math.floor(this.getElapsedStageMs() / 1000));
  }

  private ensureTimerLoop(): void {
    if (typeof requestAnimationFrame === "undefined"
      || typeof setTimeout === "undefined"
      || this.timerFrame !== undefined
      || this.status !== "playing"
      || this.timerPaused) {
      return;
    }
    // The clock only changes once per second. A short timeout keeps the timer
    // accurate without scheduling a callback on every display frame forever.
    this.timerFrame = setTimeout(() => this.stepTimerLoop(), TIMER_REFRESH_DELAY_MS);
  }

  private stepTimerLoop(): void {
    this.timerFrame = undefined;
    if (this.status !== "playing" || this.timerPaused) {
      return;
    }
    const now = Date.now();
    if (now - this.lastTimerRenderAt >= 1000) {
      this.lastTimerRenderAt = now;
      this.render();
    }
    this.ensureTimerLoop();
  }

  private cancelTimerLoop(): void {
    if (this.timerFrame !== undefined && typeof clearTimeout !== "undefined") {
      clearTimeout(this.timerFrame);
    }
    this.timerFrame = undefined;
  }

  private freezeTimer(): void {
    if (!this.timerPaused && this.stageStartedAt > 0) {
      this.elapsedBeforePauseMs += Math.max(0, Date.now() - this.stageStartedAt);
      this.timerPaused = true;
    }
    this.cancelTimerLoop();
  }

  private pauseStage(reason: PauseReason): void {
    if (this.status !== "playing") {
      return;
    }
    this.freezeTimer();
    this.pauseReason = reason;
    this.toast = "";
    this.settleDropAnimation();
    this.cancelCollectAnimation();
    this.render();
  }

  private resumeStage(): void {
    if (this.status !== "playing" || !this.timerPaused) {
      return;
    }
    this.timerPaused = false;
    this.stageStartedAt = Date.now();
    this.lastTimerRenderAt = this.stageStartedAt;
    this.toast = "继续游戏";
    this.render();
    this.ensureTimerLoop();
  }

  private pauseForBackground(): void {
    if (this.status === "playing" && !this.timerPaused) {
      this.pauseStage("background");
    }
  }

  private refreshAfterBackground(): void {
    if (this.status === "playing" && this.timerPaused) {
      this.render();
    }
  }

  private handleTap(point: TapPoint, gesture: TapGesture = "tap"): void {
    // Long press is intentionally an item-selection gesture only. Interface
    // controls continue to require a short tap so holding a pause/tool button
    // cannot fire an unexpected action.
    if (gesture !== "tap" && this.status !== "playing") {
      return;
    }
    if (this.status === "home") {
      const selectedSet = ITEM_SET_ORDER.find((itemSet) => this.isPointInRect(point, this.itemSetButtons[itemSet]));
      if (selectedSet) {
        this.activeItemSet = selectedSet;
        this.render();
      } else if (this.isPointInRect(point, this.primaryButton)) {
        this.beginStage(0);
      } else if (this.isPointInRect(point, this.dailyButton)) {
        this.beginDailyChallenge();
      } else if (this.isPointInRect(point, this.catalogButton)) {
        this.status = "catalog";
        this.render();
      } else if (this.isPointInRect(point, this.levelSelectButton)) {
        this.status = "levels";
        this.render();
      }
      return;
    }

    if (this.status === "levels") {
      if (this.isPointInRect(point, this.backButton)) {
        this.showHome();
        return;
      }
      const levelIndex = this.levelButtons.findIndex((rect) => this.isPointInRect(point, rect));
      if (levelIndex !== -1 && levelIndex < this.progress.highestUnlocked) {
        this.beginStage(levelIndex);
      }
      return;
    }

    if (this.status === "catalog") {
      if (this.isPointInRect(point, this.backButton)) {
        this.showHome();
      }
      return;
    }

    if (this.status === "playing" && this.timerPaused) {
      if (this.isPointInRect(point, this.primaryButton)) {
        this.resumeStage();
      } else if (this.isPointInRect(point, this.pauseExitButton)) {
        this.showHome();
      }
      return;
    }

    if (this.status !== "playing") {
      if (this.isPointInRect(point, this.primaryButton)) {
        if (this.status === "lost") {
          this.beginStage(0);
        } else if (this.status === "stageClear") {
          if (this.isDailyChallenge) {
            this.beginDailyChallenge();
          } else {
            this.beginStage(this.levelIndex + 1);
          }
        } else {
          this.beginStage(this.levelIndex);
        }
      } else if (this.status === "lost" && this.isPointInRect(point, this.reviveButton) && !this.reviveUsed) {
        this.requestRevive();
      }
      return;
    }

    if (this.isPointInRect(point, this.backButton)) {
      if (gesture !== "tap") {
        return;
      }
      this.pauseStage("manual");
      return;
    }

    for (const name of ["moveOut", "gather", "shuffle"] as const) {
      const toolIndex = (["moveOut", "gather", "shuffle"] as const).indexOf(name);
      const legacyButtonWidth = (this.width - 36 - 9 * 2) / 3;
      const legacyRect = {
        x: 18 + toolIndex * (legacyButtonWidth + 9),
      y: this.height - 74,
        width: legacyButtonWidth,
        height: 47,
      };
      if (this.isPointInRect(point, this.toolButtons[name]) || this.isPointInRect(point, legacyRect)) {
        if (gesture !== "tap") {
          return;
        }
        this.useTool(name);
        return;
      }
    }

    if (!this.isPointInBasketOpening(point)) {
      this.toast = "请从盒子顶部的开孔取出物品";
      this.runtime.playErrorSound?.();
      this.render();
      return;
    }

    const tile = this.findClosestTile(point);

    if (!tile) {
      this.toast = "这里被上层物品挡住了，换一块露出的表面";
      this.runtime.playErrorSound?.();
      this.render();
      return;
    }

    this.collectTile(tile);
    this.finishMove();
  }

  private findClosestTile(point: TapPoint): Tile | undefined {
    return pickVisibleSurface(this.sceneTiles, point);
  }

  private collectTile(tile: Tile): boolean {
    const isSceneTile = this.sceneTiles.includes(tile) && !tile.removed;
    tile.removed = true;
    const update = this.slots.add(tile);
    if (!update.accepted) {
      tile.removed = false;
      this.runtime.playErrorSound?.();
      return false;
    }

    const creditMatch = update.matched.length === 0
      ? this.consumeMoveOutCredit(tile.type)
      : { visible: [] as Tile[], hiddenCount: 0 };
    const completedTriplet = update.matched.length + creditMatch.visible.length + creditMatch.hiddenCount === 3;
    if (completedTriplet) {
      this.totalMatched += 3;
      const now = Date.now();
      this.currentCombo = now - this.lastMatchAt <= 1800 ? this.currentCombo + 1 : 1;
      this.lastMatchAt = now;
      this.bestCombo = Math.max(this.bestCombo, this.currentCombo);
      this.toast = `${ITEM_VISUALS[tile.type].label} × 3，消除！`;
      this.runtime.playMatchSound?.();
      this.runtime.vibrateShort?.();
      this.queueMatchBurst(tile.type, this.currentCombo);
    } else {
      this.toast = `已收集 ${ITEM_VISUALS[tile.type].label}`;
    }
    this.runtime.playItemSound(tile.type);
    this.queueTapBurst(tile.x + tile.width / 2, tile.y + tile.height / 2);
    this.maxSlotSize = Math.max(this.maxSlotSize, this.slots.size);
    if (isSceneTile) {
      this.queueCollectMotion(tile);
      this.queueDrop(tile);
    }
    return true;
  }

  private queueTapBurst(x: number, y: number): void {
    this.tapBursts.push({ x, y, startedAt: Date.now() });
    this.ensureCollectAnimation();
  }

  private queueCollectMotion(tile: Tile): void {
    const slotIndex = this.slots.items.indexOf(tile);
    const targetRect = this.getSlotRect(slotIndex === -1 ? 0 : slotIndex);
    this.collectMotions.push({
      tile,
      fromX: tile.x + tile.width / 2,
      fromY: tile.y + tile.height / 2,
      toX: targetRect.x + targetRect.width / 2,
      toY: targetRect.y + targetRect.height / 2,
      startedAt: Date.now(),
    });
    this.ensureCollectAnimation();
  }

  private queueMatchBurst(type: ItemType, combo: number): void {
    this.matchBursts.push({
      type,
      x: this.width / 2,
      y: this.height - 145,
      combo,
      startedAt: Date.now(),
    });
    this.ensureCollectAnimation();
  }

  private ensureCollectAnimation(): void {
    if (typeof requestAnimationFrame === "undefined") {
      this.collectMotions.length = 0;
      this.moveOutMotions.length = 0;
      this.matchBursts.length = 0;
      this.tapBursts.length = 0;
      return;
    }
    if (this.collectFrame === undefined) {
      this.collectFrame = requestAnimationFrame(() => this.stepCollectAnimation());
    }
  }

  private stepCollectAnimation(): void {
    if (
      this.collectMotions.length === 0
      && this.moveOutMotions.length === 0
      && this.matchBursts.length === 0
      && this.tapBursts.length === 0
    ) {
      this.collectFrame = undefined;
      return;
    }
    const now = Date.now();
    const duration = COLLECT_MOTION_DURATION_MS;
    let pending = false;
    for (let index = this.collectMotions.length - 1; index >= 0; index -= 1) {
      if (now - this.collectMotions[index].startedAt >= duration) {
        this.collectMotions.splice(index, 1);
      } else {
        pending = true;
      }
    }
    for (let index = this.moveOutMotions.length - 1; index >= 0; index -= 1) {
      if (now - this.moveOutMotions[index].startedAt >= 320) {
        this.moveOutMotions.splice(index, 1);
      } else {
        pending = true;
      }
    }
    for (let index = this.matchBursts.length - 1; index >= 0; index -= 1) {
      if (now - this.matchBursts[index].startedAt >= 420) {
        this.matchBursts.splice(index, 1);
      } else {
        pending = true;
      }
    }
    for (let index = this.tapBursts.length - 1; index >= 0; index -= 1) {
      if (now - this.tapBursts[index].startedAt >= 240) {
        this.tapBursts.splice(index, 1);
      } else {
        pending = true;
      }
    }
    const shouldRender = !pending || now - this.lastAnimationRenderAt >= this.getAnimationRenderInterval();
    if (shouldRender) {
      this.render();
      this.lastAnimationRenderAt = now;
    }
    if (pending) {
      this.collectFrame = requestAnimationFrame(() => this.stepCollectAnimation());
    } else {
      this.collectFrame = undefined;
    }
  }

  private cancelCollectAnimation(): void {
    if (this.collectFrame !== undefined && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.collectFrame);
    }
    this.collectFrame = undefined;
    this.collectMotions.length = 0;
    this.moveOutMotions.length = 0;
    this.matchBursts.length = 0;
    this.tapBursts.length = 0;
    if (this.dropMotions.size === 0) {
      this.lastAnimationRenderAt = 0;
    }
  }

  private queueDrop(removedTile: Tile): void {
    this.settleDropAnimation();
    const moves = this.dropSystem.release(this.sceneTiles, removedTile);
    if (moves.length === 0) {
      return;
    }

    const startedAt = Date.now() + DROP_START_DELAY_MS;
    for (const move of moves) {
      const travelX = move.toX - move.fromX;
      const travelY = move.toY - move.fromY;
      const distance = Math.hypot(travelX, travelY);
      const verticalDrop = travelY > 1 && Math.abs(travelY) >= Math.abs(travelX) * 0.45;
      const duration = this.clamp(
        MIN_DROP_DURATION_MS + Math.sqrt(Math.max(1, distance)) * 11 + (verticalDrop ? 36 : 0),
        MIN_DROP_DURATION_MS,
        MAX_DROP_DURATION_MS,
      );
      this.dropMotions.set(move.tile.id, {
        tile: move.tile,
        fromX: move.fromX,
        fromY: move.fromY,
        toX: move.toX,
        toY: move.toY,
        fromRotation: move.tile.rotation,
        // A vacancy moves items to a stable target.  Random rolling made the
        // pile appear to shake as a whole, so only the position is animated.
        rollRadians: 0,
        duration,
        verticalDrop,
        // Only a real downward impact gets one small, consistent compression.
        // Same-row shifts never stretch or bounce.
        squash: verticalDrop ? 0.04 : 0,
        startedAt: startedAt + move.delay,
      });
    }
    this.toast = this.toast.includes("× 3")
      ? `${this.toast} · 空位沿排列传递补位`
      : "空位沿排列传递，邻近物品正在补位";

    if (typeof requestAnimationFrame === "undefined") {
      for (const move of moves) {
        move.tile.x = move.toX;
        move.tile.y = move.toY;
      }
      this.dropMotions.clear();
      return;
    }
    if (this.dropFrame === undefined) {
      this.dropFrame = requestAnimationFrame(() => this.stepDropAnimation());
    }
  }

  private stepDropAnimation(): void {
    const now = Date.now();
    const opening = this.getBasketOpeningRect();
    let pending = false;
    for (const [id, motion] of this.dropMotions) {
      const progress = Math.max(0, Math.min(1, (now - motion.startedAt) / motion.duration));
      const settled = progress * progress * (3 - 2 * progress);
      const travelX = motion.toX - motion.fromX;
      const travelY = motion.toY - motion.fromY;
      const inset = Math.max(4, motion.tile.width * 0.045);
      motion.tile.x = this.clamp(
        motion.fromX + travelX * settled,
        opening.x + inset,
        opening.x + opening.width - motion.tile.width - inset,
      );

      let nextY: number;
      if (motion.verticalDrop) {
        // Accelerate under gravity until impact, then rebound once with a
        // quickly damped arc.  There is no repeated bobbing or random lift.
        const impactProgress = 0.82;
        if (progress < impactProgress) {
          const fallProgress = progress / impactProgress;
          nextY = motion.fromY + travelY * fallProgress * fallProgress;
        } else {
          const reboundProgress = (progress - impactProgress) / (1 - impactProgress);
          const reboundHeight = Math.min(5, Math.max(1.5, Math.abs(travelY) * 0.16));
          nextY = motion.toY
            - Math.sin(reboundProgress * Math.PI) * reboundHeight * (1 - reboundProgress);
        }
      } else {
        // Sideways filling follows one continuous path to its assigned slot;
        // it deliberately has no sag, overshoot, or secondary wobble.
        nextY = motion.fromY + travelY * settled;
      }
      motion.tile.y = this.clamp(
        nextY,
        opening.y + inset,
        opening.y + opening.height - motion.tile.height - inset,
      );
      motion.tile.rotation = motion.fromRotation
        + motion.rollRadians * settled;
      if (progress >= 1) {
        motion.tile.x = motion.toX;
        motion.tile.y = motion.toY;
        motion.tile.rotation = motion.fromRotation + motion.rollRadians;
        this.dropMotions.delete(id);
      } else {
        pending = true;
      }
    }
    if (!pending || now - this.lastAnimationRenderAt >= this.getAnimationRenderInterval()) {
      this.render();
      this.lastAnimationRenderAt = now;
    }
    if (pending) {
      this.dropFrame = requestAnimationFrame(() => this.stepDropAnimation());
    } else {
      this.dropFrame = undefined;
    }
  }

  private settleDropAnimation(): void {
    if (this.dropMotions.size === 0) {
      return;
    }
    for (const motion of this.dropMotions.values()) {
      motion.tile.x = motion.toX;
      motion.tile.y = motion.toY;
      motion.tile.rotation = motion.fromRotation + motion.rollRadians;
    }
    this.cancelDropAnimation();
  }

  private cancelDropAnimation(): void {
    if (this.dropFrame !== undefined && typeof cancelAnimationFrame !== "undefined") {
      cancelAnimationFrame(this.dropFrame);
    }
    this.dropFrame = undefined;
    this.dropMotions.clear();
    if (this.collectMotions.length === 0 && this.moveOutMotions.length === 0) {
      this.lastAnimationRenderAt = 0;
    }
  }

  private getAnimationRenderInterval(): number {
    // Keep one cadence for every pile size. Changing cadence at item-count
    // thresholds made the scene visibly change in the middle of a stage.
    return ANIMATION_RENDER_INTERVAL_MS;
  }

  private clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
  }

  private finishMove(): void {
    const remaining = this.sceneTiles.filter((tile) => !tile.removed).length;
    if (remaining === 0 && this.slots.size === 0) {
      this.freezeTimer();
      this.status = this.isDailyChallenge
        ? "stageClear"
        : this.levelIndex === LEVEL_SPECS.length - 1
          ? "won"
          : "stageClear";
      this.stageStars = this.calculateStageStars();
      if (this.isDailyChallenge) {
        this.progress = this.storage.completeDaily(this.progress, this.stageStars);
        this.stageCoinReward = Math.max(10, this.stageStars * 10);
      } else {
        this.progress = this.storage.completeLevel(this.progress, this.levelIndex + 1, this.stageStars);
        const beforeCoins = this.progress.reward.coins;
        this.progress = this.storage.completeStageReward(this.progress, this.levelIndex + 1, this.stageStars);
        this.stageCoinReward = this.progress.reward.coins - beforeCoins;
      }
    } else if (this.slots.size >= this.slots.capacity) {
      this.freezeTimer();
      this.status = "lost";
      this.lastPlayedLevel = 0;
    }
    this.render();
  }

  private calculateStageStars(): number {
    const elapsed = this.getElapsedStageMs();
    let stars = 1;
    if (elapsed <= 180000) stars += 1;
    if (this.maxSlotSize <= 4 && this.bestCombo >= 2) stars += 1;
    return Math.max(1, Math.min(3, stars));
  }

  private getStageGoalLabel(): string {
    if (this.isDailyChallenge) {
      return `连消 ${this.bestCombo}/2`;
    }
    if (this.levelIndex % 3 === 0) {
      return `连消 ${Math.min(this.bestCombo, 2)}/2`;
    }
    if (this.levelIndex % 3 === 1) {
      return `消除 ${Math.min(this.totalMatched, 15)}/15`;
    }
    return `槽位 ${Math.min(this.maxSlotSize, 4)}/4`;
  }

  private useTool(name: ToolName): void {
    if (this.toolRemaining[name] <= 0) {
      this.toast = `${this.getToolLabel(name)}次数已用完`;
      this.runtime.playErrorSound?.();
      this.render();
      return;
    }

    let successful = false;
    if (name === "moveOut") {
      successful = this.moveOutTiles();
    } else if (name === "gather") {
      successful = this.gatherTriplet();
    } else {
      successful = this.shuffleTiles();
    }

    if (successful) {
      this.toolRemaining[name] -= 1;
      this.runtime.playToolSound?.();
      this.finishMove();
    } else {
      this.runtime.playErrorSound?.();
      this.render();
    }
  }

  private moveOutTiles(): boolean {
    const count = Math.min(3, this.slots.size);
    if (count === 0) {
      this.toast = "收集槽还是空的，暂时不需要移出";
      return false;
    }
    const selected = this.slots.items.slice(0, count).map((tile, index) => {
      const rect = this.getSlotRect(index);
      return {
        tile,
        fromX: rect.x + rect.width / 2,
        fromY: rect.y + rect.height / 2,
      };
    });
    const selectedIds = new Set(selected.map((selection) => selection.tile.id));
    // A fast player can press the tool while the latest fruit is still flying
    // into its slot.  Remove that incoming motion first so the same fruit is
    // never drawn twice during the exit animation.
    for (let index = this.collectMotions.length - 1; index >= 0; index -= 1) {
      if (selectedIds.has(this.collectMotions[index].tile.id)) {
        this.collectMotions.splice(index, 1);
      }
    }
    const startedAt = Date.now();
    let removedCount = 0;
    for (const [index, selection] of selected.entries()) {
      const removed = this.slots.remove(selection.tile.id);
      if (!removed) {
        continue;
      }
      removedCount += 1;
      this.moveOutCredits.set(removed.type, (this.moveOutCredits.get(removed.type) ?? 0) + 1);
      this.moveOutMotions.push({
        tile: removed,
        fromX: selection.fromX,
        fromY: selection.fromY,
        toX: -28 - index * 9,
        toY: this.height - 52 + index * 3,
        startedAt: startedAt + index * 28,
      });
    }
    this.toast = `已从槽位移出 ${removedCount} 个物品`;
    this.ensureCollectAnimation();
    return true;
  }

  private consumeMoveOutCredit(type: ItemType): { visible: Tile[]; hiddenCount: number } {
    const hiddenCount = this.moveOutCredits.get(type) ?? 0;
    if (hiddenCount === 0) {
      return { visible: [], hiddenCount: 0 };
    }
    const visibleNeeded = 3 - hiddenCount;
    const candidates = this.slots.items.filter((tile) => tile.type === type).slice(0, visibleNeeded);
    if (candidates.length < visibleNeeded) {
      return { visible: [], hiddenCount: 0 };
    }
    const visible = candidates
      .map((candidate) => this.slots.remove(candidate.id))
      .filter((candidate): candidate is Tile => candidate !== undefined);
    if (visible.length !== visibleNeeded) {
      return { visible: [], hiddenCount: 0 };
    }
    this.moveOutCredits.delete(type);
    return { visible, hiddenCount };
  }

  private gatherTriplet(): boolean {
    const availableTiles = this.sceneTiles.filter((tile) => !tile.removed);
    const capacityLeft = this.slots.capacity - this.slots.size;
    const candidates = ITEM_TYPES.map((type) => {
      const inSlot = this.slots.countType(type);
      const hidden = this.moveOutCredits.get(type) ?? 0;
      const need = 3 - inSlot - hidden;
      const available = availableTiles.filter((tile) => tile.type === type);
      return { type, inSlot, hidden, need, available };
    })
      .filter((candidate) => candidate.need > 0
        && candidate.need <= capacityLeft
        && candidate.available.length >= candidate.need)
      .sort((left, right) => (right.inSlot + right.hidden) - (left.inSlot + left.hidden)
        || right.available.length - left.available.length);

    const target = candidates[0];
    if (!target) {
      this.toast = "露出的物品还凑不成一组";
      return false;
    }

    for (const tile of target.available.slice(0, target.need)) {
      this.collectTile(tile);
    }
    this.toast = `已帮你凑齐 ${ITEM_VISUALS[target.type].label}`;
    return true;
  }

  private shuffleTiles(): boolean {
    const active = this.sceneTiles.filter((tile) => !tile.removed);
    if (active.length < 2) {
      this.toast = "剩余物品太少，不需要打乱";
      return false;
    }

    const layers = new Set(active.map((tile) => tile.layer));
    for (const layer of layers) {
      const layerTiles = active.filter((tile) => tile.layer === layer);
      const placements = layerTiles.map((tile) => ({
        x: tile.x,
        y: tile.y,
        rotation: tile.rotation,
      }));
      layerTiles.forEach((tile, index) => {
        const placement = placements[(index + 2) % placements.length];
        tile.x = placement.x;
        tile.y = placement.y;
        tile.rotation = placement.rotation + 0.4;
      });
    }
    this.toast = "场上的物品已经重新打乱";
    return true;
  }

  private getToolLabel(name: ToolName): string {
    const labels: Record<ToolName, string> = {
      moveOut: "移出",
      gather: "凑齐",
      shuffle: "打乱",
    };
    return labels[name];
  }

  private render(): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    if (this.status === "home") {
      this.drawHome();
      return;
    }
    if (this.status === "levels") {
      this.drawLevelSelect();
      return;
    }
    if (this.status === "catalog") {
      this.drawCatalog();
      return;
    }

    this.drawGameHeader();
    this.drawBasket();
    this.drawScene();
    this.drawBasketFrontRim();
    this.drawTools();
    this.drawSlots();
    // Effects are drawn after the tray so the flying item and the +3 burst
    // remain visible when they arrive at the collection slots.
    this.drawCollectMotions();
    this.drawMoveOutMotions();
    this.drawMatchBursts();
    this.drawTapBursts();

    if (this.status !== "playing") {
      this.drawResultOverlay();
    } else if (this.timerPaused) {
      this.drawPauseOverlay();
    }
  }

  private drawBackground(): void {
    if (this.status === "home" && this.homeBackground) {
      this.context.drawImage(this.homeBackground, 0, 0, this.width, this.height);
      return;
    }
    if (this.status !== "home" && this.gameBackground) {
      this.context.drawImage(this.gameBackground, 0, 0, this.width, this.height);
      return;
    }
    const background = this.context.createLinearGradient(0, 0, 0, this.height);
    background.addColorStop(0, "#f6a0a3");
    background.addColorStop(0.48, "#e9858b");
    background.addColorStop(1, "#cf5d6b");
    this.context.fillStyle = background;
    this.context.fillRect(0, 0, this.width, this.height);

    // Lightweight fallback used only before the generated scene background
    // finishes loading or on runtimes that do not support image assets.
    this.context.fillStyle = "rgba(255,226,222,0.18)";
    this.context.fillRect(0, 126, this.width, 3);
    this.context.fillStyle = "rgba(119,39,56,0.2)";
    this.context.fillRect(0, this.height - 224, this.width, 8);
  }

  private drawHome(): void {
    this.context.fillStyle = "#355b43";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.font = "bold 34px sans-serif";
    this.context.fillText("消消农场", this.width / 2, 74);
    this.context.fillStyle = "rgba(53,91,67,0.72)";
    this.context.font = "14px sans-serif";
    this.context.fillText("三个相同就消除", this.width / 2, 108);

    const cardX = 28;
    const cardY = 154;
    const cardWidth = this.width - 56;
    roundedRect(this.context, cardX, cardY, cardWidth, 142, 22);
    this.context.fillStyle = "rgba(255,250,236,0.92)";
    this.context.fill();
    this.context.strokeStyle = "rgba(85,118,65,0.18)";
    this.context.lineWidth = 1;
    this.context.stroke();
    this.context.fillStyle = "#496845";
    this.context.font = "bold 17px sans-serif";
    this.context.fillText("农场进度", this.width / 2, cardY + 25);
    this.context.fillStyle = "#ed7b40";
    this.context.font = "bold 28px sans-serif";
    this.context.fillText(`${this.progress.highestUnlocked} / 30`, this.width / 2, cardY + 64);
    this.context.fillStyle = "#72806b";
    this.context.font = "13px sans-serif";
    const chapterIndex = Math.floor((this.progress.highestUnlocked - 1) / 10);
    this.context.fillText(`${CHAPTER_NAMES[chapterIndex]} · 已完成 ${this.progress.completedLevels.length} 关`, this.width / 2, cardY + 95);
    this.context.fillStyle = "#bd7a27";
    this.context.font = "bold 13px sans-serif";
    this.context.fillText(`金币 ${this.progress.reward.coins} · 连续 ${this.progress.reward.streak} 天`, this.width / 2, cardY + 118);

    this.drawItemSetSelector(cardY);

    this.primaryButton = {
      x: 43,
      y: this.height - 275,
      width: this.width - 86,
      height: 58,
    };
    const primaryLabel = "开始第 1 关";
    this.drawRaisedButton(this.primaryButton, primaryLabel, "#e67f4e", "#bd5c37");

    this.dailyButton = {
      x: 43,
      y: this.height - 213,
      width: this.width - 86,
      height: 42,
    };
    roundedRect(this.context, this.dailyButton.x, this.dailyButton.y, this.dailyButton.width, this.dailyButton.height, 16);
    this.context.fillStyle = this.progress.daily.completed ? "#c7b67a" : "#e7bd55";
    this.context.fill();
    this.context.strokeStyle = "rgba(107,76,39,0.55)";
    this.context.lineWidth = 2;
    this.context.stroke();
    this.context.fillStyle = "#5b3c24";
    this.context.font = "bold 15px sans-serif";
    this.context.fillText(
      this.progress.daily.completed ? "今日挑战已完成" : "每日挑战",
      this.width / 2,
      this.dailyButton.y + 21,
    );

    this.levelSelectButton = {
      x: 72,
      y: this.height - 160,
      width: this.width - 144,
      height: 42,
    };
    roundedRect(
      this.context,
      this.levelSelectButton.x,
      this.levelSelectButton.y,
      this.levelSelectButton.width,
      this.levelSelectButton.height,
      16,
    );
    this.context.fillStyle = "rgba(255,250,222,0.94)";
    this.context.fill();
    this.context.strokeStyle = "#a66b35";
    this.context.lineWidth = 2;
    this.context.stroke();
    this.context.fillStyle = "#64472f";
    this.context.font = "bold 15px sans-serif";
    this.context.fillText("关卡地图", this.width / 2, this.levelSelectButton.y + 21);

    this.catalogButton = {
      x: 90,
      y: this.height - 114,
      width: this.width - 180,
      height: 34,
    };
    roundedRect(this.context, this.catalogButton.x, this.catalogButton.y, this.catalogButton.width, this.catalogButton.height, 14);
    this.context.fillStyle = "rgba(255,250,222,0.82)";
    this.context.fill();
    this.context.strokeStyle = "rgba(111,87,48,0.35)";
    this.context.lineWidth = 1;
    this.context.stroke();
    this.context.fillStyle = "#65472d";
    this.context.font = "bold 13px sans-serif";
    this.context.fillText(`图鉴 ${this.progress.discoveredItems.length}/${ITEM_TYPES.length}`, this.width / 2, this.catalogButton.y + 17);

    this.context.fillStyle = "rgba(255,255,255,0.82)";
    this.context.font = "12px sans-serif";
  }

  private drawItemSetSelector(cardY: number): void {
    const buttonGap = ITEM_SET_ORDER.length > 3 ? 5 : 7;
    const buttonWidth = (this.width - 72 - buttonGap * (ITEM_SET_ORDER.length - 1)) / ITEM_SET_ORDER.length;
    const buttonHeight = 34;
    const selectorY = Math.min(cardY + 166, this.height - 270 - buttonHeight - 14);

    this.context.fillStyle = "#6c8067";
    this.context.font = "bold 12px sans-serif";
    this.context.fillText("选择主题", this.width / 2, selectorY - 16);

    ITEM_SET_ORDER.forEach((itemSet, index) => {
      const rect = {
        x: 36 + index * (buttonWidth + buttonGap),
        y: selectorY,
        width: buttonWidth,
        height: buttonHeight,
      };
      this.itemSetButtons[itemSet] = rect;
      roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 13);
      const active = itemSet === this.activeItemSet;
      this.context.fillStyle = active ? "#f08a43" : "rgba(255,250,222,0.96)";
      this.context.fill();
      this.context.strokeStyle = active ? "#c95f29" : "rgba(113,93,58,0.35)";
      this.context.lineWidth = active ? 2 : 1;
      this.context.stroke();
      this.context.fillStyle = active ? "#ffffff" : "#64472f";
      this.context.font = `bold ${ITEM_SET_ORDER.length > 3 ? 10 : 12}px sans-serif`;
      this.context.fillText(ITEM_SET_LABELS[itemSet], rect.x + rect.width / 2, rect.y + rect.height / 2);
    });
  }

  private drawLevelSelect(): void {
    this.levelButtons = [];
    this.context.fillStyle = "#294f36";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.font = "bold 30px sans-serif";
    this.context.fillText("30 关挑战地图", this.width / 2, 76);
    this.context.fillStyle = "#5b765d";
    this.context.font = "13px sans-serif";
    this.context.fillText("三大章节 · 难度逐关提升", this.width / 2, 105);

    const buttonWidth = 56;
    const buttonHeight = 42;
    const gap = 8;
    const startX = (this.width - (buttonWidth * 5 + gap * 4)) / 2;
    const sectionTops = [124, 296, 468];

    CHAPTER_NAMES.forEach((chapter, chapterIndex) => {
      const sectionTop = sectionTops[chapterIndex];
      roundedRect(this.context, 20, sectionTop, this.width - 40, 152, 20);
      this.context.fillStyle = "rgba(255,252,229,0.9)";
      this.context.fill();
      this.context.strokeStyle = "rgba(96,111,67,0.24)";
      this.context.lineWidth = 2;
      this.context.stroke();
      this.context.fillStyle = chapterIndex === 0 ? "#4d7e48" : chapterIndex === 1 ? "#bb7636" : "#9b5645";
      this.context.font = "bold 17px sans-serif";
      this.context.fillText(`第 ${chapterIndex + 1} 章 · ${chapter}`, this.width / 2, sectionTop + 24);

      for (let localIndex = 0; localIndex < 10; localIndex += 1) {
        const levelIndex = chapterIndex * 10 + localIndex;
        const row = Math.floor(localIndex / 5);
        const column = localIndex % 5;
        const rect = {
          x: startX + column * (buttonWidth + gap),
          y: sectionTop + 44 + row * 48,
          width: buttonWidth,
          height: buttonHeight,
        };
        this.levelButtons[levelIndex] = rect;
        const level = levelIndex + 1;
        const unlocked = level <= this.progress.highestUnlocked;
        const completed = this.progress.completedLevels.includes(level);
        roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 13);
        this.context.fillStyle = completed
          ? "#67a85d"
          : unlocked
            ? "#f2a553"
            : "rgba(116,121,105,0.28)";
        this.context.fill();
        this.context.strokeStyle = unlocked ? "rgba(105,68,35,0.35)" : "rgba(88,92,81,0.15)";
        this.context.lineWidth = 1;
        this.context.stroke();
        this.context.fillStyle = unlocked ? "#ffffff" : "rgba(73,78,69,0.48)";
        this.context.font = "bold 15px sans-serif";
        this.context.fillText(unlocked ? String(level) : "—", rect.x + rect.width / 2, rect.y + rect.height / 2);
      }
    });

    this.backButton = {
      x: 86,
      y: 644,
      width: this.width - 172,
      height: 46,
    };
    roundedRect(this.context, this.backButton.x, this.backButton.y, this.backButton.width, this.backButton.height, 17);
    this.context.fillStyle = "#3f7149";
    this.context.fill();
    this.context.fillStyle = "#ffffff";
    this.context.font = "bold 16px sans-serif";
    this.context.fillText("返回首页", this.width / 2, this.backButton.y + 23);
  }

  private drawCatalog(): void {
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillStyle = "#294f36";
    this.context.font = "bold 30px sans-serif";
    this.context.fillText("农场图鉴", this.width / 2, 68);
    this.context.fillStyle = "#65735f";
    this.context.font = "13px sans-serif";
    this.context.fillText(`已发现 ${this.progress.discoveredItems.length}/${ITEM_TYPES.length} 种物品`, this.width / 2, 98);
    const columns = 4;
    const cellWidth = (this.width - 56) / columns;
    const cellHeight = 86;
    const visibleTypes = ITEM_TYPES.slice(0, Math.max(0, Math.floor((this.height - 190) / cellHeight) * columns));
    visibleTypes.forEach((type, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 16 + column * cellWidth;
      const y = 124 + row * cellHeight;
      roundedRect(this.context, x, y, cellWidth - 5, cellHeight - 7, 13);
      const discovered = this.progress.discoveredItems.includes(type);
      this.context.fillStyle = discovered ? "rgba(255,252,229,0.96)" : "rgba(91,101,88,0.16)";
      this.context.fill();
      this.context.strokeStyle = discovered ? "rgba(113,93,58,0.3)" : "rgba(75,79,70,0.18)";
      this.context.lineWidth = 1;
      this.context.stroke();
      if (discovered) {
        drawItemIcon(this.context, type, x + cellWidth / 2 - 3, y + 29, 39, 0, false, "compact");
      }
      this.context.fillStyle = discovered ? "#65472d" : "rgba(70,75,66,0.5)";
      this.context.font = "bold 11px sans-serif";
      this.context.fillText(discovered ? ITEM_VISUALS[type].label : "待发现", x + (cellWidth - 5) / 2, y + 65);
    });
    this.backButton = { x: 90, y: this.height - 62, width: this.width - 180, height: 40 };
    this.drawRaisedButton(this.backButton, "返回首页", "#6f9b58", "#4d753f");
  }

  private drawGameHeader(): void {
    const spec = LEVEL_SPECS[this.levelIndex];
    const remaining = this.sceneTiles.filter((tile) => !tile.removed).length;
    const progress = Math.round(((this.initialTileCount - remaining) / this.initialTileCount) * 100);

    // Reset text state at the start of every frame.  Other panels draw text
    // with different alignment/baselines, and relying on the previous canvas
    // state is what made the header drift on some devices.
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    roundedRect(this.context, 12, 14, this.width - 24, 111, 20);
    const header = this.context.createLinearGradient(0, 14, 0, 125);
    header.addColorStop(0, "rgba(29,31,31,0.96)");
    header.addColorStop(0.56, "rgba(61,64,64,0.92)");
    header.addColorStop(1, "rgba(15,17,17,0.96)");
    this.context.fillStyle = header;
    this.context.fill();
    this.context.strokeStyle = "rgba(224,218,191,0.68)";
    this.context.lineWidth = 3;
    this.context.stroke();

    this.backButton = { x: 19, y: 50, width: 51, height: 30 };
    roundedRect(this.context, this.backButton.x, this.backButton.y, this.backButton.width, this.backButton.height, 13);
    this.context.fillStyle = "#b97846";
    this.context.fill();
    this.context.strokeStyle = "rgba(255,224,162,0.72)";
    this.context.lineWidth = 2;
    this.context.stroke();
    this.drawPauseIcon(this.backButton.x + this.backButton.width / 2, this.backButton.y + this.backButton.height / 2, "#fff4d5");

    roundedRect(this.context, this.width / 2 - 70, 24, 140, 48, 23);
    const timer = this.context.createLinearGradient(0, 24, 0, 72);
    timer.addColorStop(0, "#111212");
    timer.addColorStop(1, "#343536");
    this.context.fillStyle = timer;
    this.context.fill();
    this.context.strokeStyle = "rgba(238,236,226,0.62)";
    this.context.lineWidth = 2;
    this.context.stroke();
    const timeLeft = this.getRemainingSeconds();
    const timerLabel = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`;
    this.context.fillStyle = "#ffffff";
    this.context.font = "bold 24px sans-serif";
    this.context.fillText(timerLabel, this.width / 2 + 8, 49);
    this.context.fillStyle = "#f5bd38";
    this.context.font = "bold 17px sans-serif";
    this.context.fillText("T", this.width / 2 - 44, 49);

    this.context.textAlign = "left";
    this.context.textBaseline = "middle";
    this.context.fillStyle = "#f4d89b";
    this.context.font = "bold 11px sans-serif";
    this.context.fillText(`${ITEM_SET_LABELS[this.activeItemSet]} · ${spec.id}/30`, 28, 35);
    this.context.textAlign = "center";
    this.context.fillStyle = "#fff4d4";
    this.context.font = "bold 16px sans-serif";
    // Keep the header focused on the level title.  The former helper line
    // duplicated the level/set information and collided with the progress bar
    // on short screens.
    this.context.fillText(
      this.isDailyChallenge ? `每日挑战 · ${spec.name}` : `第 ${this.levelIndex + 1} 关 · ${spec.name}`,
      this.width / 2,
      96,
    );
    roundedRect(this.context, 28, 118, this.width - 56, 6, 3);
    this.context.fillStyle = "rgba(255,255,255,0.2)";
    this.context.fill();
    const progressWidth = (this.width - 56) * (progress / 100);
    if (progressWidth > 0) {
      roundedRect(this.context, 28, 118, progressWidth, 6, 3);
      this.context.fillStyle = "#e6a936";
      this.context.fill();
    }

  }

  private drawPauseIcon(centerX: number, centerY: number, color: string): void {
    this.context.fillStyle = color;
    this.context.fillRect(centerX - 6, centerY - 8, 4, 16);
    this.context.fillRect(centerX + 2, centerY - 8, 4, 16);
  }

  private drawBasket(): void {
    const basket = this.getBasketRect();
    const { left, top, width, height } = basket;
    const opening = this.getBasketOpeningRect();
    const right = left + width;

    this.context.save();
    // Keep the container shadow fixed for the entire stage. Turning a blurred
    // shadow off during drop/collect animations made a new shadow appear
    // mid-game, and blur is needlessly expensive on low-end phones. The
    // offset underlay gives the same depth at a stable cost.
    this.context.shadowColor = "transparent";
    this.context.shadowBlur = 0;
    this.context.shadowOffsetX = 0;
    this.context.shadowOffsetY = 0;
    roundedRect(this.context, left, top + 16, width, height, 20);
    this.context.fillStyle = "#6b3e3b";
    this.context.fill();
    this.context.restore();

    // A warm harvest crate replaces the generic silver bucket: walnut sides,
    // a sun-baked orange rim, and brass-colored trim fit the farm theme.
    roundedRect(this.context, left, top, width, height, 20);
    const rim = this.context.createLinearGradient(0, top, 0, top + height);
    rim.addColorStop(0, "#e8ae71");
    rim.addColorStop(0.22, "#c77a52");
    rim.addColorStop(0.68, "#a95c45");
    rim.addColorStop(1, "#784337");
    this.context.fillStyle = rim;
    this.context.fill();
    this.context.strokeStyle = "#f4cf8a";
    this.context.lineWidth = 4;
    this.context.stroke();

    // Subtle plank seams keep the frame tactile without competing with the
    // realistic produce in the opening.
    this.context.strokeStyle = "rgba(104,55,42,0.35)";
    this.context.lineWidth = 2;
    for (const seamY of [top + 21, top + height - 28]) {
      this.context.beginPath();
      this.context.moveTo(left + 16, seamY);
      this.context.lineTo(right - 16, seamY);
      this.context.stroke();
    }
    this.context.fillStyle = "#f3c978";
    for (const boltX of [left + 18, right - 18]) {
      this.context.beginPath();
      this.context.arc(boltX, top + 18, 3, 0, Math.PI * 2);
      this.context.fill();
    }

    // The opening is a recessed cavity. A dark undercut makes it read as a
    // real hole in the lid instead of another flat painted rectangle.
    const apertureShadow = 8;
    roundedRect(
      this.context,
      opening.x - apertureShadow,
      opening.y - apertureShadow,
      opening.width + apertureShadow * 2,
      opening.height + apertureShadow * 2,
      18,
    );
    this.context.fillStyle = "#59443d";
    this.context.fill();
    // Back wall and sloped side walls create the visible 3D depth around the
    // single opening without changing the fruit scale inside it.
    this.context.beginPath();
    this.context.moveTo(left + 8, top + 16);
    this.context.lineTo(right - 8, top + 16);
    this.context.lineTo(opening.x + opening.width, opening.y + 5);
    this.context.lineTo(opening.x, opening.y + 5);
    this.context.closePath();
    this.context.fillStyle = "rgba(118,69,48,0.62)";
    this.context.fill();

    this.context.beginPath();
    this.context.moveTo(left + 8, top + 18);
    this.context.lineTo(opening.x, opening.y + 5);
    this.context.lineTo(opening.x, opening.y + opening.height - 2);
    this.context.lineTo(left + 9, basket.bottom - 15);
    this.context.closePath();
    const leftWall = this.context.createLinearGradient(left, 0, opening.x, 0);
    leftWall.addColorStop(0, "#844839");
    leftWall.addColorStop(0.7, "#b86f4d");
    leftWall.addColorStop(1, "#e0a06a");
    this.context.fillStyle = leftWall;
    this.context.fill();

    this.context.beginPath();
    this.context.moveTo(right - 8, top + 18);
    this.context.lineTo(opening.x + opening.width, opening.y + 5);
    this.context.lineTo(opening.x + opening.width, opening.y + opening.height - 2);
    this.context.lineTo(right - 9, basket.bottom - 15);
    this.context.closePath();
    const rightWall = this.context.createLinearGradient(opening.x + opening.width, 0, right, 0);
    rightWall.addColorStop(0, "#e0a06a");
    rightWall.addColorStop(0.3, "#b86d4c");
    rightWall.addColorStop(1, "#804536");
    this.context.fillStyle = rightWall;
    this.context.fill();

    // Re-seat the inner panel after the side bevels. This keeps the cream
    // cavity on one exact rectangle instead of letting the bevel polygons
    // overlap its corners and create a doubled, broken-looking frame.
    roundedRect(this.context, opening.x, opening.y, opening.width, opening.height, 12);
    const innerBowl = this.context.createLinearGradient(0, opening.y, 0, opening.y + opening.height);
    innerBowl.addColorStop(0, "#d7c5a6");
    innerBowl.addColorStop(0.36, "#eee2c6");
    innerBowl.addColorStop(0.72, "#f8efd9");
    innerBowl.addColorStop(1, "#e7d7b7");
    this.context.fillStyle = innerBowl;
    this.context.fill();
    this.context.strokeStyle = "rgba(255,222,155,0.9)";
    this.context.lineWidth = 4;
    this.context.stroke();
    this.context.save();
    roundedRect(this.context, opening.x + 3, opening.y + 3, opening.width - 6, opening.height - 6, 9);
    this.context.clip();
    this.context.strokeStyle = "rgba(120,83,57,0.16)";
    this.context.lineWidth = 1;
    for (let y = opening.y + 38; y < opening.y + opening.height - 24; y += 28) {
      this.context.beginPath();
      this.context.moveTo(opening.x + 18, y);
      this.context.lineTo(opening.x + opening.width - 18, y);
      this.context.stroke();
    }
    this.context.restore();

    roundedRect(this.context, opening.x + 7, opening.y + opening.height - 31, opening.width - 14, 27, 9);
    this.context.fillStyle = "rgba(123,75,48,0.2)";
    this.context.fill();

    roundedRect(this.context, opening.x + 10, opening.y + 7, opening.width - 20, 14, 7);
    this.context.fillStyle = "rgba(248,206,128,0.72)";
    this.context.fill();

    this.context.strokeStyle = "rgba(249,207,133,0.94)";
    this.context.lineWidth = 3;
    roundedRect(this.context, opening.x, opening.y, opening.width, opening.height, 12);
    this.context.stroke();
  }

  private drawBasketFrontRim(): void {
    const basket = this.getBasketRect();
    const { left, bottom, width } = basket;
    const opening = this.getBasketOpeningRect();

    // Keep a visible front lip for depth, but leave the bottom row readable.
    // The old lip reached up to the opening edge and covered a noticeable
    // slice of every item that happened to land in the front row.
    const frontDepth = Math.max(30, Math.min(46, basket.height * 0.15));
    // Start the lip just below the aperture instead of painting over its
    // bottom row. The lip still has enough depth to read as the near wall.
    const frontTop = Math.max(bottom - frontDepth, opening.y + opening.height + 2);
    const frontHeight = bottom - frontTop + 4;
    roundedRect(this.context, left + 7, frontTop, width - 14, frontHeight, 12);
    const frontWall = this.context.createLinearGradient(0, frontTop, 0, bottom + 4);
    frontWall.addColorStop(0, "#e6a363");
    frontWall.addColorStop(0.25, "#c37550");
    frontWall.addColorStop(1, "#804536");
    this.context.fillStyle = frontWall;
    this.context.fill();
    this.context.strokeStyle = "rgba(248,205,131,0.94)";
    this.context.lineWidth = 3;
    this.context.stroke();
    roundedRect(this.context, left + 15, frontTop + 9, width - 30, 7, 3);
    this.context.fillStyle = "rgba(249,208,129,0.72)";
    this.context.fill();

    const hingeGradient = this.context.createLinearGradient(0, frontTop + 4, 0, frontTop + 38);
    hingeGradient.addColorStop(0, "#d6bf72");
    hingeGradient.addColorStop(0.45, "#6e8059");
    hingeGradient.addColorStop(1, "#344d3b");
    for (const hingeX of [left + 3, left + width - 13]) {
      roundedRect(this.context, hingeX, frontTop + 8, 10, Math.min(36, frontHeight - 12), 4);
      this.context.fillStyle = hingeGradient;
      this.context.fill();
      this.context.strokeStyle = "rgba(43,61,47,0.82)";
      this.context.lineWidth = 1;
      this.context.stroke();
    }

    // Redraw the aperture edge over the fruit layer so the opening reads as
    // a real cut-out instead of a flat panel.
    this.context.strokeStyle = "rgba(91,57,46,0.92)";
    this.context.lineWidth = 8;
    roundedRect(this.context, opening.x, opening.y, opening.width, opening.height, 12);
    this.context.stroke();

    this.context.strokeStyle = "rgba(249,207,133,0.94)";
    this.context.lineWidth = 2;
    this.context.beginPath();
    this.context.moveTo(opening.x + 10, opening.y + 5);
    this.context.lineTo(opening.x + opening.width - 10, opening.y + 5);
    this.context.stroke();
  }

  private drawScene(): void {
    const opening = this.getBasketOpeningRect();
    this.context.save();
    roundedRect(this.context, opening.x, opening.y, opening.width, opening.height, 10);
    this.context.clip();
    // Draw active rollers last: the full 3D silhouette stays visible while a
    // row compresses and settles, instead of being hidden by a stationary
    // neighbour halfway through the motion.
    for (const tile of this.sceneTiles) {
      if (tile.removed || this.dropMotions.has(tile.id)) {
        continue;
      }
      this.drawSceneTile(tile);
    }
    for (const tile of this.sceneTiles) {
      if (tile.removed) {
        continue;
      }
      if (!this.dropMotions.has(tile.id)) {
        continue;
      }
      this.drawSceneTile(tile);
    }
    this.context.restore();
  }

  private drawSceneTile(tile: Tile): void {
    const motion = this.dropMotions.get(tile.id);
    const centerX = tile.x + tile.width / 2;
    const centerY = tile.y + tile.height / 2;
    this.context.save();
    let movingScale = 1;
    if (motion) {
      const progress = Math.max(0, Math.min(1, (Date.now() - motion.startedAt) / motion.duration));
      movingScale = progress > 0 ? MOVING_ITEM_SCALE : 1;
      const impactStart = 0.78;
      if (motion.verticalDrop && progress > impactStart) {
        const impactProgress = (progress - impactStart) / (1 - impactStart);
        const compression = Math.sin(impactProgress * Math.PI) * motion.squash * (1 - impactProgress * 0.35);
        this.context.translate(centerX, centerY);
        this.context.scale(1 + compression * 0.48, 1 - compression);
        this.context.translate(-centerX, -centerY);
      }
    }
    drawItemIcon(
      this.context,
      tile.type,
      centerX,
      centerY,
      tile.width * SCENE_ITEM_SCALE * movingScale,
      tile.rotation,
      false,
      STAGE_ITEM_DETAIL,
    );
    this.context.restore();
  }

  private drawCollectMotions(): void {
    if (this.collectMotions.length === 0) {
      return;
    }
    const now = Date.now();
    const duration = COLLECT_MOTION_DURATION_MS;
    for (const motion of this.collectMotions) {
      const progress = Math.max(0, Math.min(1, (now - motion.startedAt) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      const arc = Math.sin(progress * Math.PI) * 18;
      const centerX = motion.fromX + (motion.toX - motion.fromX) * eased;
      const centerY = motion.fromY + (motion.toY - motion.fromY) * eased - arc;
      const scale = 1 - progress * 0.3;
      const fadeProgress = this.clamp((progress - 0.28) / 0.42, 0, 1);
      const fade = 1 - fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
      this.context.save();
      this.context.globalAlpha = fade;
      drawItemIcon(
        this.context,
        motion.tile.type,
        centerX,
        centerY,
        motion.tile.width * SCENE_ITEM_SCALE * scale,
        motion.tile.rotation + progress * 0.35,
        false,
        STAGE_ITEM_DETAIL,
      );
      this.context.restore();

      if (progress > 0.72) {
        const burst = (progress - 0.72) / 0.28;
        this.context.save();
        this.context.globalAlpha = 1 - burst;
        this.context.fillStyle = "rgba(255,255,255,0.72)";
        for (let index = 0; index < 5; index += 1) {
          const angle = (Math.PI * 2 * index) / 5;
          const radius = 8 + burst * 12;
          this.context.beginPath();
          this.context.arc(
            motion.toX + Math.cos(angle) * radius,
            motion.toY + Math.sin(angle) * radius,
            2.5 - burst,
            0,
            Math.PI * 2,
          );
          this.context.fill();
        }
        this.context.restore();
      }
    }
  }

  private drawMoveOutMotions(): void {
    if (this.moveOutMotions.length === 0) {
      return;
    }
    const now = Date.now();
    const duration = 320;
    for (const motion of this.moveOutMotions) {
      const progress = Math.max(0, Math.min(1, (now - motion.startedAt) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      const centerX = motion.fromX + (motion.toX - motion.fromX) * eased;
      const centerY = motion.fromY + (motion.toY - motion.fromY) * eased + Math.sin(progress * Math.PI) * 12;
      this.context.save();
      this.context.globalAlpha = 1 - progress * 0.9;
      drawItemIcon(
        this.context,
        motion.tile.type,
        centerX,
        centerY,
        34 * (1 - progress * 0.18),
        motion.tile.rotation - progress * 0.55,
        false,
        STAGE_ITEM_DETAIL,
      );
      this.context.restore();
    }
  }

  private drawMatchBursts(): void {
    if (this.matchBursts.length === 0) {
      return;
    }
    const now = Date.now();
    for (const burst of this.matchBursts) {
      const progress = Math.max(0, Math.min(1, (now - burst.startedAt) / 420));
      const radius = 16 + progress * 32;
      this.context.save();
      this.context.globalAlpha = 1 - progress;
      this.context.strokeStyle = progress < 0.55 ? ITEM_VISUALS[burst.type].accent : "#ffffff";
      this.context.lineWidth = 4 - progress * 2;
      this.context.beginPath();
      this.context.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
      this.context.stroke();
      this.context.fillStyle = "#fff6c8";
      this.context.font = "bold 17px sans-serif";
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText(burst.combo > 1 ? `+3  x${burst.combo}` : "+3", burst.x, burst.y - 8 - progress * 20);
      for (let index = 0; index < 6; index += 1) {
        const angle = (Math.PI * 2 * index) / 6;
        const particleRadius = radius + 4;
        this.context.beginPath();
        this.context.arc(
          burst.x + Math.cos(angle) * particleRadius,
          burst.y + Math.sin(angle) * particleRadius,
          Math.max(1.5, 3 - progress * 2),
          0,
          Math.PI * 2,
        );
        this.context.fill();
      }
      this.context.restore();
    }
  }

  private drawTapBursts(): void {
    if (this.tapBursts.length === 0) {
      return;
    }
    const now = Date.now();
    for (const burst of this.tapBursts) {
      const progress = Math.max(0, Math.min(1, (now - burst.startedAt) / 240));
      this.context.save();
      this.context.globalAlpha = 0.5 * (1 - progress);
      this.context.strokeStyle = "#fff4b6";
      this.context.lineWidth = 2.5;
      this.context.beginPath();
      this.context.arc(burst.x, burst.y, 8 + progress * 18, 0, Math.PI * 2);
      this.context.stroke();
      this.context.restore();
    }
  }

  private getBasketRect(): { left: number; top: number; width: number; height: number; bottom: number } {
    const { centerX, centerY, radiusX, radiusY } = getSceneLayout(this.width, this.height);
    const left = centerX - radiusX;
    const top = centerY - radiusY;
    const bottom = centerY + radiusY;
    const width = radiusX * 2;
    return { left, top, width, height: bottom - top, bottom };
  }

  private getBasketOpeningRect(): Rect {
    const bounds = getPileBounds(this.width, this.height);
    return {
      x: bounds.left,
      y: bounds.top,
      width: bounds.right - bounds.left,
      height: bounds.bottom - bounds.top,
    };
  }

  private isPointInBasketOpening(point: TapPoint): boolean {
    const opening = this.getBasketOpeningRect();
    const visibleBottom = opening.y + opening.height;
    return point.x >= opening.x
      && point.x <= opening.x + opening.width
      && point.y >= opening.y
      && point.y <= visibleBottom;
  }

  private drawTools(): void {
    const names: ToolName[] = ["moveOut", "gather", "shuffle"];
    const labels: Record<ToolName, string> = {
      moveOut: "移出",
      gather: "凑齐",
      shuffle: "打乱",
    };
    const gap = 9;
    const buttonWidth = (this.width - 36 - gap * 2) / 3;
    // Keep a real breathing gap between the collection tray and the tool
    // shelf.  The old shelf started 12px before the tray ended, so their
    // borders fused into one dark seam on narrow screens.
    const y = this.height - 74;
    roundedRect(this.context, 8, y - 12, this.width - 16, 71, 19);
    const shelf = this.context.createLinearGradient(0, y - 12, 0, y + 59);
    shelf.addColorStop(0, "#f4b18e");
    shelf.addColorStop(0.45, "#df8c72");
    shelf.addColorStop(1, "#b85d63");
    this.context.fillStyle = shelf;
    this.context.fill();
    this.context.strokeStyle = "rgba(255,231,210,0.76)";
    this.context.lineWidth = 2;
    this.context.stroke();
    names.forEach((name, index) => {
      const rect = { x: 18 + index * (buttonWidth + gap), y, width: buttonWidth, height: 47 };
      this.toolButtons[name] = rect;
      const remaining = this.toolRemaining[name];
      const exhausted = remaining <= 0;
      roundedRect(this.context, rect.x, rect.y + 5, rect.width, rect.height, 14);
      this.context.fillStyle = exhausted ? "rgba(40,42,38,0.8)" : "#5b2e1e";
      this.context.fill();
      roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 14);
      const button = this.context.createLinearGradient(0, rect.y, 0, rect.y + rect.height);
      button.addColorStop(0, exhausted ? "#625c4a" : "#ffe45a");
      button.addColorStop(0.55, exhausted ? "#454039" : "#ffc928");
      button.addColorStop(1, exhausted ? "#2d2c29" : "#ec9d16");
      this.context.fillStyle = button;
      this.context.fill();
      this.context.strokeStyle = exhausted ? "rgba(255,255,255,0.14)" : "#753c1f";
      this.context.lineWidth = 3;
      this.context.stroke();
      this.context.fillStyle = exhausted ? "rgba(255,255,255,0.55)" : "#5b271a";
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.drawToolIcon(name, rect.x + rect.width / 2, rect.y + 14, exhausted ? "rgba(255,255,255,0.55)" : "#5b271a");
      this.context.font = "bold 11px sans-serif";
      this.context.fillText(`${labels[name]} ${remaining}次`, rect.x + rect.width / 2, rect.y + 37);
      // Keep the counter completely inside the button.  A badge protruding
      // through the shelf edge looked like a second, misaligned button on
      // narrow screens and was easy to confuse with the native overlay.
      const badgeSize = 16;
      const badgeX = rect.x + rect.width - badgeSize - 7;
      const badgeY = rect.y + 5;
      roundedRect(this.context, badgeX, badgeY, badgeSize, badgeSize, badgeSize / 2);
      this.context.fillStyle = exhausted ? "#5b5547" : "#6b6b65";
      this.context.fill();
      this.context.strokeStyle = "#fff2bd";
      this.context.lineWidth = 2;
      this.context.stroke();
      this.context.fillStyle = "#ffffff";
      this.context.font = "bold 12px sans-serif";
      this.context.fillText(String(remaining), badgeX + badgeSize / 2, badgeY + badgeSize / 2);
    });
  }

  private drawToolIcon(name: ToolName, centerX: number, centerY: number, color: string): void {
    this.context.save();
    this.context.strokeStyle = color;
    this.context.fillStyle = color;
    this.context.lineWidth = 2.8;
    this.context.beginPath();
    if (name === "moveOut") {
      this.context.moveTo(centerX, centerY + 7);
      this.context.lineTo(centerX, centerY - 6);
      this.context.moveTo(centerX, centerY - 6);
      this.context.lineTo(centerX - 5, centerY - 1);
      this.context.moveTo(centerX, centerY - 6);
      this.context.lineTo(centerX + 5, centerY - 1);
      this.context.moveTo(centerX - 7, centerY + 7);
      this.context.lineTo(centerX + 7, centerY + 7);
      this.context.stroke();
    } else if (name === "gather") {
      this.context.arc(centerX, centerY, 3.2, 0, Math.PI * 2);
      this.context.moveTo(centerX - 9, centerY);
      this.context.lineTo(centerX - 3, centerY);
      this.context.moveTo(centerX + 3, centerY);
      this.context.lineTo(centerX + 9, centerY);
      this.context.moveTo(centerX, centerY - 9);
      this.context.lineTo(centerX, centerY - 3);
      this.context.moveTo(centerX, centerY + 3);
      this.context.lineTo(centerX, centerY + 9);
      this.context.stroke();
    } else {
      this.context.moveTo(centerX - 9, centerY - 5);
      this.context.lineTo(centerX - 3, centerY - 5);
      this.context.lineTo(centerX + 3, centerY + 5);
      this.context.lineTo(centerX + 9, centerY + 5);
      this.context.moveTo(centerX + 5, centerY + 1);
      this.context.lineTo(centerX + 9, centerY + 5);
      this.context.lineTo(centerX + 5, centerY + 9);
      this.context.moveTo(centerX - 5, centerY - 9);
      this.context.lineTo(centerX - 9, centerY - 5);
      this.context.lineTo(centerX - 5, centerY - 1);
      this.context.stroke();
    }
    this.context.restore();
  }

  private drawSlots(): void {
    const trayRect = this.getCollectionTrayRect();
    const { x: outerX, y: outerY, width: outerWidth, height: outerHeight } = trayRect;
    // The collection area is a harvest ledger rather than another metal
    // drawer: olive wood outside, a warm canvas inset, and dark green slot
    // outlines make it belong to this farm game's visual language.
    roundedRect(this.context, outerX, outerY + 6, outerWidth, outerHeight, 20);
    this.context.fillStyle = "rgba(84,53,39,0.52)";
    this.context.fill();
    roundedRect(this.context, outerX, outerY, outerWidth, outerHeight, 18);
    const tray = this.context.createLinearGradient(0, outerY, 0, outerY + outerHeight);
    tray.addColorStop(0, "#8d9a63");
    tray.addColorStop(0.32, "#647b55");
    tray.addColorStop(1, "#354e3e");
    this.context.fillStyle = tray;
    this.context.fill();
    this.context.strokeStyle = "#f0c978";
    this.context.lineWidth = 3;
    this.context.stroke();

    roundedRect(this.context, outerX + 7, outerY + 8, outerWidth - 14, 11, 5);
    this.context.fillStyle = "rgba(240,201,120,0.32)";
    this.context.fill();
    this.context.strokeStyle = "rgba(39,66,49,0.7)";
    this.context.lineWidth = 1;
    this.context.stroke();

    this.context.textAlign = "center";
    this.context.textBaseline = "middle";

    for (let index = 0; index < 7; index += 1) {
      const rect = this.getSlotRect(index);
      roundedRect(this.context, rect.x, rect.y + 3, rect.width, rect.height, 10);
      this.context.fillStyle = "rgba(35,59,44,0.72)";
      this.context.fill();
      roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 9);
      const slot = this.context.createLinearGradient(0, rect.y, 0, rect.y + rect.height);
      slot.addColorStop(0, "#fff1c9");
      slot.addColorStop(0.55, "#f2d99e");
      slot.addColorStop(1, "#c9955c");
      this.context.fillStyle = slot;
      this.context.fill();
      this.context.strokeStyle = "#496044";
      this.context.lineWidth = 2;
      this.context.stroke();
      roundedRect(this.context, rect.x + 5, rect.y + 4, rect.width - 10, 5, 2.5);
      this.context.fillStyle = "rgba(255,248,218,0.64)";
      this.context.fill();
      const tile = this.slots.items[index];
      const animating = tile ? this.collectMotions.some((motion) => motion.tile.id === tile.id) : false;
      if (tile && !animating) {
        drawItemIcon(this.context, tile.type, rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width * 0.78, 0, false, STAGE_ITEM_DETAIL);
      }
    }
  }

  private getSlotRect(index: number): Rect {
    const gap = 4;
    const { y: outerY } = this.getCollectionTrayRect();
    const horizontalPadding = 17;
    const slotSize = Math.min(44, (this.width - horizontalPadding * 2 - gap * 6) / 7);
    const totalWidth = slotSize * 7 + gap * 6;
    const startX = (this.width - totalWidth) / 2;
    return {
      x: startX + index * (slotSize + gap),
      // Keep a deliberate header strip above the slots and equal breathing
      // room below them so the seven cells cannot drift inside the tray.
      y: outerY + 25,
      width: slotSize,
      height: slotSize,
    };
  }

  private getCollectionTrayRect(): Rect {
    return {
      x: 9,
      y: this.height - 185,
      width: this.width - 18,
      height: 82,
    };
  }

  private drawPauseOverlay(): void {
    this.context.fillStyle = "rgba(26,31,29,0.66)";
    this.context.fillRect(0, 0, this.width, this.height);
    const panelWidth = Math.min(320, this.width - 36);
    const panelHeight = 246;
    const panelX = (this.width - panelWidth) / 2;
    const panelY = (this.height - panelHeight) / 2 - 8;
    roundedRect(this.context, panelX, panelY, panelWidth, panelHeight, 26);
    this.context.fillStyle = "#fff9df";
    this.context.fill();
    this.context.strokeStyle = "#b77a38";
    this.context.lineWidth = 3;
    this.context.stroke();

    this.context.fillStyle = "#4a7049";
    this.context.font = "bold 29px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(this.pauseReason === "background" ? "已暂停" : "游戏已暂停", this.width / 2, panelY + 53);
    this.context.fillStyle = "#6b735f";
    this.context.font = "14px sans-serif";
    this.context.fillText(
      this.pauseReason === "background" ? "返回小游戏后点击继续" : "时间已冻结，点击继续恢复",
      this.width / 2,
      panelY + 91,
    );
    this.context.fillStyle = "#a06e37";
    this.context.font = "bold 15px sans-serif";
    const remaining = this.getRemainingSeconds();
    this.context.fillText(
      `已用时 ${Math.floor((600 - remaining) / 60)}:${String((600 - remaining) % 60).padStart(2, "0")} · 剩余 ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`,
      this.width / 2,
      panelY + 121,
    );

    this.primaryButton = {
      x: panelX + 38,
      y: panelY + 143,
      width: panelWidth - 76,
      height: 48,
    };
    this.drawRaisedButton(this.primaryButton, "继续游戏", "#ed8a43", "#c45f2c");

    this.pauseExitButton = {
      x: panelX + 60,
      y: panelY + 205,
      width: panelWidth - 120,
      height: 32,
    };
    roundedRect(
      this.context,
      this.pauseExitButton.x,
      this.pauseExitButton.y,
      this.pauseExitButton.width,
      this.pauseExitButton.height,
      14,
    );
    this.context.fillStyle = "rgba(91,112,83,0.16)";
    this.context.fill();
    this.context.strokeStyle = "rgba(91,112,83,0.42)";
    this.context.lineWidth = 1;
    this.context.stroke();
    this.context.fillStyle = "#55705a";
    this.context.font = "bold 12px sans-serif";
    this.context.fillText("退出到首页", this.width / 2, this.pauseExitButton.y + 16);
  }

  private drawResultOverlay(): void {
    this.context.fillStyle = "rgba(33,47,34,0.68)";
    this.context.fillRect(0, 0, this.width, this.height);
    const panelWidth = Math.min(320, this.width - 36);
    // The clear panel has one more information row than the loss panel.
    const panelHeight = this.status === "lost" ? 276 : 284;
    const panelX = (this.width - panelWidth) / 2;
    const panelY = (this.height - panelHeight) / 2 - 12;
    roundedRect(this.context, panelX, panelY, panelWidth, panelHeight, 26);
    this.context.fillStyle = "#fff9df";
    this.context.fill();
    this.context.strokeStyle = "#b77a38";
    this.context.lineWidth = 3;
    this.context.stroke();

    const title = this.isDailyChallenge && this.status === "stageClear"
      ? "每日挑战完成！"
      : this.status === "stageClear"
        ? `第 ${this.levelIndex + 1} 关完成！`
        : this.status === "won"
        ? "30 关全部完成！"
        : "槽位塞满了";
    const subtitle = this.isDailyChallenge && this.status === "stageClear"
      ? `明天刷新 · 今日获得 ${this.stageStars} 颗星`
      : this.status === "stageClear"
        ? `下一关：${LEVEL_SPECS[this.levelIndex + 1].name}`
        : this.status === "won"
        ? "三大章节全部清空，农庄挑战成功"
        : "失败后将从第 1 关重新开始";
    this.context.fillStyle = this.status === "lost" ? "#c85a3f" : "#46814a";
    this.context.font = "bold 29px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(title, this.width / 2, panelY + 61);
    this.context.fillStyle = "#6b735f";
    this.context.font = "14px sans-serif";
    this.context.fillText(subtitle, this.width / 2, panelY + 102);
    this.context.fillStyle = "#a06e37";
    this.context.font = "bold 15px sans-serif";
    this.context.fillText(`累计消除 ${this.totalMatched} 个物品`, this.width / 2, panelY + 132);
    if (this.status !== "lost") {
      this.context.fillStyle = "#bd7a27";
      this.context.font = "bold 14px sans-serif";
      this.context.fillText(`获得金币 +${this.stageCoinReward} · 最佳 Combo ${this.bestCombo}`, this.width / 2, panelY + 185);
    }
    if (this.status !== "lost") {
      this.context.font = "bold 25px sans-serif";
      this.context.fillStyle = "#eab744";
      const earnedStars = this.stageStars || 1;
      this.context.fillText(
        Array.from({ length: 3 }, (_, index) => index < earnedStars ? "★" : "☆").join(" "),
        this.width / 2,
        panelY + 164,
      );
    }
    if (this.status === "lost") {
      this.context.fillStyle = "#e8b63f";
      this.context.font = "bold 22px sans-serif";
      this.context.fillText("复活机会", this.width / 2, panelY + 157);
      this.reviveButton = {
        x: panelX + 38,
        y: panelY + 178,
        width: panelWidth - 76,
        height: 38,
      };
      this.drawRaisedButton(this.reviveButton, this.reviveUsed ? "复活已使用" : "看视频复活一次", "#e5bb46", "#aa7728");
    } else {
      this.reviveButton = { ...EMPTY_RECT };
    }

    this.primaryButton = {
      x: panelX + 38,
      y: this.status === "lost" ? panelY + 225 : panelY + 216,
      width: panelWidth - 76,
      height: this.status === "lost" ? 42 : 50,
    };
    const label = this.isDailyChallenge && this.status === "stageClear"
      ? "再来一次每日挑战"
      : this.status === "stageClear"
        ? `挑战第 ${this.levelIndex + 2} 关`
        : this.status === "lost"
        ? "从第 1 关重新开始"
        : "重新挑战本关";
    this.drawRaisedButton(this.primaryButton, label, "#ed8a43", "#c45f2c");
  }

  private drawSpeechBubble(centerX: number, centerY: number, text: string): void {
    const width = 154;
    const height = 42;
    roundedRect(this.context, centerX - width / 2, centerY - height / 2, width, height, 18);
    this.context.fillStyle = "rgba(255,255,244,0.94)";
    this.context.fill();
    this.context.fillStyle = "#52684c";
    this.context.font = "bold 12px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(text, centerX, centerY);
  }

  private drawRaisedButton(rect: Rect, label: string, color: string, shadow: string): void {
    roundedRect(this.context, rect.x, rect.y + 7, rect.width, rect.height, 20);
    this.context.fillStyle = shadow;
    this.context.fill();
    roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 20);
    this.context.fillStyle = color;
    this.context.fill();
    this.context.fillStyle = "#ffffff";
    this.context.font = "bold 21px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(label, rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  private drawWoodGrain(
    x: number,
    y: number,
    width: number,
    height: number,
    spacing: number,
    light: string,
    dark: string,
  ): void {
    this.context.save();
    roundedRect(this.context, x, y, width, height, 10);
    this.context.clip();
    this.context.lineWidth = 1;
    for (let offset = -height; offset < width + height; offset += spacing) {
      const phase = Math.abs(Math.round(offset / spacing)) % 3;
      this.context.beginPath();
      this.context.moveTo(x + offset, y - 8);
      this.context.quadraticCurveTo(
        x + offset + spacing * 0.32,
        y + height * 0.28,
        x + offset - spacing * 0.18,
        y + height * 0.56,
      );
      this.context.quadraticCurveTo(
        x + offset + spacing * 0.2,
        y + height * 0.78,
        x + offset + spacing * 0.05,
        y + height + 8,
      );
      this.context.strokeStyle = phase === 1 ? dark : light;
      this.context.stroke();
    }
    this.context.restore();
  }

  private isPointInRect(point: TapPoint, rect: Rect): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }

  private getReplayLevel(): number {
    return 0;
  }

}
