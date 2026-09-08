import { ITEM_SET_TYPES, ITEM_TYPES, type ItemType } from "../src/data/ItemConfig";
import { BlockDetector } from "../src/game/BlockDetector";
import { StorageManager, getDateStamp } from "../src/core/StorageManager";
import { DropSystem } from "../src/game/DropSystem";
import { CHAPTER_NAMES, getPileBounds, getSceneLayout, LEVEL_SPECS, LevelGenerator } from "../src/game/LevelGenerator";
import { GameManager } from "../src/core/GameManager";
import { PileLayout, type PileBounds } from "../src/game/PileLayout";
import { SlotManager } from "../src/game/SlotManager";
import { pickVisibleSurface } from "../src/game/SurfacePicker";
import { Tile } from "../src/game/Tile";
import { WechatRuntime, type TapGesture } from "../src/platform/WechatRuntime";
import { drawItemIcon } from "../src/ui/CanvasDrawing";

let nextId = 1;
let passed = 0;

test("空位会沿着原有排列传递，不会把水果直接吸到中心", () => {
  const bounds: PileBounds = { left: 0, top: 0, right: 320, bottom: 300 };
  const removed = createTile("apple", { layer: 0 });
  const left = createTile("corn", { layer: 0 });
  const right = createTile("berry", { layer: 0 });
  const far = createTile("pumpkin", { layer: 0 });
  const tiles = [removed, left, right, far];
  for (const target of new PileLayout().compute(tiles, bounds)) {
    target.tile.x = target.x;
    target.tile.y = target.y;
  }
  removed.removed = true;
  const moves = new DropSystem(bounds).release(tiles, removed);
  const leftMove = moves.find((move) => move.tile.id === left.id);
  const rightMove = moves.find((move) => move.tile.id === right.id);
  expect(leftMove !== undefined && rightMove !== undefined, "空位后面的水果应参与补位");
  expect(leftMove !== undefined && Math.abs(leftMove.toX - leftMove.fromX) > 8, "第一个邻居应明显滑入空位");
  expect(rightMove !== undefined && Math.abs(rightMove.toX - rightMove.fromX) > 8, "后续水果应继续沿排列滑动");
  expect(moves.every((move) => move.delay === 0), "同一排的补位应同时启动");
});

function createTile(type: ItemType, options: Partial<{ x: number; y: number; layer: number }> = {}): Tile {
  return new Tile({
    id: nextId++,
    type,
    x: options.x ?? 0,
    y: options.y ?? 0,
    width: 50,
    height: 50,
    layer: options.layer ?? 0,
  });
}

test("按住时不选择，松手后才按短按或长按选择", () => {
  const environment = globalThis as unknown as { wx?: WxMiniGameApi };
  const previousWx = environment.wx;
  const previousDateNow = Date.now;
  let now = 1000;
  let touchStart: ((event: MiniGameTouchEvent) => void) | undefined;
  let touchMove: ((event: MiniGameTouchEvent) => void) | undefined;
  let touchEnd: ((event: MiniGameTouchEvent) => void) | undefined;
  const context = { scale() {} } as unknown as MiniGameCanvasContext2D;

  environment.wx = {
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    onTouchStart: (listener) => { touchStart = listener; },
    onTouchMove: (listener) => { touchMove = listener; },
    onTouchEnd: (listener) => { touchEnd = listener; },
  };
  Date.now = () => now;

  try {
    const runtime = new WechatRuntime();
    const gestures: TapGesture[] = [];
    runtime.onTap((_, gesture) => gestures.push(gesture));
    const start = (x: number, y: number) => touchStart?.({ touches: [{ clientX: x, clientY: y }], changedTouches: [] });
    const move = (x: number, y: number) => touchMove?.({ touches: [{ clientX: x, clientY: y }], changedTouches: [] });
    const end = (x: number, y: number) => touchEnd?.({ touches: [], changedTouches: [{ clientX: x, clientY: y }] });

    start(100, 200);
    end(100, 200);

    start(120, 220);
    now += 450;
    expect(gestures.join(",") === "tap", "手指仍按住时不应选择任何元素");
    end(120, 220);

    start(140, 240);
    move(170, 240);
    end(170, 240);

    expect(
      gestures.join(",") === "tap,longPressRelease",
      "短按与长按松开应各自只在松手后派发一次选择，滑出元素不应选择",
    );
  } finally {
    Date.now = previousDateNow;
    if (previousWx) {
      environment.wx = previousWx;
    } else {
      delete environment.wx;
    }
  }
});

test("长按松手后才收取露出的元素", () => {
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    { createLinearGradient: () => gradient } as Record<string, unknown>,
    {
      get(target, property: string | symbol) {
        const targetRecord = target as Record<PropertyKey, unknown>;
        if (!(property in targetRecord)) {
          targetRecord[property] = () => {};
        }
        return targetRecord[property];
      },
    },
  ) as unknown as MiniGameCanvasContext2D;
  const runtime = {
    surface: {
      canvas: { width: 0, height: 0, getContext: () => context },
      context,
      width: 375,
      height: 812,
      pixelRatio: 1,
    },
    onTap() {},
    playItemSound() {},
    playErrorSound() {},
    vibrateShort() {},
  } as unknown as ConstructorParameters<typeof GameManager>[0];
  const manager = new GameManager(runtime);
  const internal = manager as unknown as {
    status: string;
    sceneTiles: Tile[];
    slots: SlotManager;
    handleTap(point: { x: number; y: number }, gesture: TapGesture): void;
  };
  internal.status = "playing";
  const releasedTile = createTile("apple", { x: 160, y: 390 });
  internal.sceneTiles = [releasedTile];
  expect(!releasedTile.removed && internal.slots.size === 0, "手指仍按住时不应提前收取物件");
  internal.handleTap({ x: 185, y: 415 }, "longPressRelease");
  expect(releasedTile.removed && internal.slots.size === 1, "长按松开应收取当前露出的物件");
});

function expect(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function expectTypes(slots: SlotManager, expected: ItemType[]): void {
  const actual = slots.items.map((tile) => tile.type);
  expect(JSON.stringify(actual) === JSON.stringify(expected), `槽位顺序错误：${actual.join(",")}`);
}

function test(name: string, body: () => void): void {
  body();
  passed += 1;
  console.log(`✓ ${name}`);
}

test("所有农场物品都能绘制立体明暗", () => {
  let gradientStops = 0;
  const gradient = {
    addColorStop() {
      gradientStops += 1;
    },
  };
  const context = new Proxy(
    { createLinearGradient: () => gradient } as Record<string, unknown>,
    {
      get(target, property: string | symbol) {
        const targetRecord = target as Record<PropertyKey, unknown>;
        if (!(property in targetRecord)) {
          targetRecord[property] = () => {};
        }
        return targetRecord[property];
      },
    },
  ) as unknown as MiniGameCanvasContext2D;
  for (const type of ITEM_TYPES) {
    drawItemIcon(context, type, 96, 96, 64, 0.18);
  }
  expect(gradientStops === ITEM_TYPES.length * 3, "每个物品都应包含受光、主色和暗侧三段渐变");
  drawItemIcon(context, "apple", 96, 96, 64, 0.18);
  expect(gradientStops === ITEM_TYPES.length * 3, "重复绘制同尺寸物品应复用渐变以保持流畅");
});

test("三个相同物品自动消除", () => {
  const slots = new SlotManager();
  slots.add(createTile("apple"));
  slots.add(createTile("apple"));
  const result = slots.add(createTile("apple"));
  expect(result.matched.length === 3, "应消除三个苹果");
  expect(slots.size === 0, "消除后槽位应为空");
});

test("同类型物品自动靠近排列", () => {
  const slots = new SlotManager();
  slots.add(createTile("apple"));
  slots.add(createTile("corn"));
  slots.add(createTile("berry"));
  slots.add(createTile("apple"));
  expectTypes(slots, ["apple", "apple", "corn", "berry"]);
});

test("四个相同物品消除前三个后保留一个", () => {
  const slots = new SlotManager();
  for (let index = 0; index < 4; index += 1) {
    slots.add(createTile("pumpkin"));
  }
  expectTypes(slots, ["pumpkin"]);
});

test("六个相同物品连续形成两次消除", () => {
  const slots = new SlotManager();
  let matchedCount = 0;
  for (let index = 0; index < 6; index += 1) {
    matchedCount += slots.add(createTile("berry")).matched.length;
  }
  expect(matchedCount === 6, "六个草莓应全部消除");
  expect(slots.size === 0, "连续消除后槽位应为空");
});

test("七个未成组物品会触发槽满", () => {
  const slots = new SlotManager();
  const sequence: ItemType[] = ["apple", "apple", "corn", "corn", "pumpkin", "pumpkin", "berry"];
  let lastResult = slots.add(createTile(sequence[0]));
  for (const type of sequence.slice(1)) {
    lastResult = slots.add(createTile(type));
  }
  expect(lastResult.isFull, "七个槽位占满后应返回失败信号");
  expect(slots.size === 7, "槽位中应保留七个物品");
});

test("槽位已满时拒绝继续加入", () => {
  const slots = new SlotManager(1);
  slots.add(createTile("corn"));
  const result = slots.add(createTile("apple"));
  expect(!result.accepted, "满槽时不应接收新物品");
  expect(slots.size === 1, "拒绝后槽位内容不应变化");
});

test("指定物品可以移出槽位", () => {
  const slots = new SlotManager();
  const apple = createTile("apple");
  const corn = createTile("corn");
  slots.add(apple);
  slots.add(corn);
  const removed = slots.remove(apple.id);
  expect(removed?.id === apple.id, "应返回被撤回的物品");
  expectTypes(slots, ["corn"]);
});

test("只有露出的最上层表面可以被点击", () => {
  const detector = new BlockDetector();
  const lower = createTile("apple", { x: 20, y: 20, layer: 0 });
  const upper = createTile("corn", { x: 25, y: 25, layer: 1 });
  detector.recalculate([lower, upper]);
  expect(lower.blocked, "下层重叠物品应被标记为遮挡");
  expect(pickVisibleSurface([lower, upper], { x: 45, y: 45 })?.id === upper.id, "覆盖区域只能选中上层表面");
  expect(pickVisibleSurface([lower, upper], { x: 32, y: 36 })?.id === lower.id, "露出的下层边缘仍应可以点击");
  upper.removed = true;
  detector.recalculate([lower, upper]);
  expect(!lower.blocked, "移除上层后下层应恢复可点击");
  expect(pickVisibleSurface([lower, upper], { x: 45, y: 45 })?.id === lower.id, "上层移除后应选中下层表面");
});

test("拿走同层物品后旁边物品会补进空位", () => {
  const bounds: PileBounds = { left: 0, top: 0, right: 260, bottom: 300 };
  const tiles = [
    createTile("apple", { layer: 0 }),
    createTile("corn", { layer: 0 }),
    createTile("berry", { layer: 0 }),
    createTile("pumpkin", { layer: 0 }),
    createTile("carrot", { layer: 0 }),
  ];
  for (const target of new PileLayout().compute(tiles, bounds)) {
    target.tile.x = target.x;
    target.tile.y = target.y;
  }
  const removed = tiles[1];
  const following = tiles[2];
  removed.removed = true;
  const moves = new DropSystem(bounds).release(tiles, removed);
  const followingMove = moves.find((move) => move.tile.id === following.id);
  expect(followingMove !== undefined, "空位后面的物品应该参加挤压补位");
  expect(
    followingMove !== undefined
      && (Math.abs(followingMove.toX - followingMove.fromX) > 0.5
        || Math.abs(followingMove.toY - followingMove.fromY) > 0.5),
    "旁边物品的位置应该发生变化",
  );
  expect(moves.every((move) => move.delay === 0), "同层补位应该同时开始，不应逐个排队移动");
});

test("相邻行会从左右两个方向交错补位", () => {
  const bounds: PileBounds = { left: 0, top: 0, right: 260, bottom: 300 };
  const createRowSet = (): Tile[] => Array.from({ length: 14 }, () => createTile("apple", { layer: 0 }));
  const place = (tiles: Tile[]): void => {
    for (const target of new PileLayout().compute(tiles, bounds)) {
      target.tile.x = target.x;
      target.tile.y = target.y;
    }
  };

  const firstRow = createRowSet();
  place(firstRow);
  firstRow[0].removed = true;
  const leftMove = new DropSystem(bounds).release(firstRow, firstRow[0])
    .find((move) => move.tile.id === firstRow[1].id);
  expect(leftMove !== undefined && leftMove.toX < leftMove.fromX, "一行应该能从右向左补位");

  const secondRow = createRowSet();
  place(secondRow);
  secondRow[7].removed = true;
  const rightMove = new DropSystem(bounds).release(secondRow, secondRow[7])
    .find((move) => move.tile.id === secondRow[8].id);
  expect(rightMove !== undefined && rightMove.toX > rightMove.fromX, "相邻行应该能从左向右补位");
});

test("最上层清空后下一层会整体向下落一格", () => {
  const bounds: PileBounds = { left: 0, top: 0, right: 260, bottom: 300 };
  const lowerTiles = [
    createTile("apple", { layer: 0 }),
    createTile("corn", { layer: 0 }),
    createTile("berry", { layer: 0 }),
  ];
  const upper = createTile("pumpkin", { layer: 1 });
  const tiles = [...lowerTiles, upper];
  for (const target of new PileLayout().compute(tiles, bounds)) {
    target.tile.x = target.x;
    target.tile.y = target.y;
  }
  upper.removed = true;
  const moves = new DropSystem(bounds).release(tiles, upper);
  expect(moves.length === lowerTiles.length, "下一层的全部物品都应该一起下落");
  expect(moves.every((move) => move.toY > move.fromY), "下一层应该保持层次并直向下落");
});

test("物品离场后下一层才按重力加速并轻微回弹落稳", () => {
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    { createLinearGradient: () => gradient } as Record<string, unknown>,
    {
      get(target, property: string | symbol) {
        const targetRecord = target as Record<PropertyKey, unknown>;
        if (!(property in targetRecord)) {
          targetRecord[property] = () => {};
        }
        return targetRecord[property];
      },
    },
  ) as unknown as MiniGameCanvasContext2D;
  const runtime = {
    surface: {
      canvas: { width: 0, height: 0, getContext: () => context },
      context,
      width: 375,
      height: 812,
      pixelRatio: 1,
    },
    onTap() {},
    playItemSound() {},
    vibrateShort() {},
  } as unknown as ConstructorParameters<typeof GameManager>[0];

  const previousNow = Date.now;
  const previousRequestAnimationFrame = globalThis.requestAnimationFrame;
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let now = 10_000;
  let frameId = 1;
  Date.now = () => now;
  globalThis.requestAnimationFrame = (() => frameId++) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;

  try {
    const manager = new GameManager(runtime);
    const internal = manager as unknown as {
      sceneTiles: Tile[];
      queueDrop(tile: Tile): void;
      stepDropAnimation(): void;
      dropMotions: Map<number, {
        tile: Tile;
        fromX: number;
        fromY: number;
        toX: number;
        toY: number;
        duration: number;
        verticalDrop: boolean;
        rollRadians: number;
        squash: number;
        startedAt: number;
      }>;
    };
    const lowerTiles = [
      createTile("apple", { layer: 0 }),
      createTile("corn", { layer: 0 }),
      createTile("berry", { layer: 0 }),
    ];
    const removedUpper = createTile("pumpkin", { layer: 1 });
    const tiles = [...lowerTiles, removedUpper];
    const bounds = getPileBounds(375, 812);
    for (const target of new PileLayout().compute(tiles, bounds)) {
      target.tile.x = target.x;
      target.tile.y = target.y;
    }
    removedUpper.removed = true;
    internal.sceneTiles = tiles;
    internal.queueDrop(removedUpper);

    const motion = internal.dropMotions.get(lowerTiles[0].id);
    expect(motion !== undefined && motion.verticalDrop, "整层补位应该使用垂直重力落体");
    if (!motion) {
      return;
    }
    expect(motion.startedAt - now >= 200, "应先让被选物品淡出离场，再开始落体");
    expect(motion.rollRadians === 0, "下落物品不应随机滚动，避免造成整盘抖动感");
    expect(motion.squash === 0.04, "每个落地物品应使用同样轻微的压缩反馈");

    now = motion.startedAt - 1;
    internal.stepDropAnimation();
    expect(Math.abs(motion.tile.y - motion.fromY) < 0.01, "离场尚未完成时其余物品不应提前移动");

    now = motion.startedAt + motion.duration * 0.25;
    internal.stepDropAnimation();
    const earlyTravel = (motion.tile.y - motion.fromY) / (motion.toY - motion.fromY);
    expect(earlyTravel > 0 && earlyTravel < 0.2, "落体前段应该缓慢起步并持续加速");

    now = motion.startedAt + motion.duration * 0.9;
    internal.stepDropAnimation();
    expect(motion.tile.y < motion.toY, "落地后应只有一次轻微向上回弹");

    now = motion.startedAt + Math.ceil(motion.duration) + 1;
    internal.stepDropAnimation();
    expect(Math.abs(motion.tile.y - motion.toY) < 0.01, "回弹结束后物品应精确落稳");
    expect(!internal.dropMotions.has(motion.tile.id), "落稳后应结束落体动画状态");

    const rowTiles = [
      createTile("apple", { layer: 0 }),
      createTile("corn", { layer: 0 }),
      createTile("berry", { layer: 0 }),
      createTile("pumpkin", { layer: 0 }),
    ];
    for (const target of new PileLayout().compute(rowTiles, bounds)) {
      target.tile.x = target.x;
      target.tile.y = target.y;
    }
    const removedRowTile = rowTiles[0];
    removedRowTile.removed = true;
    internal.sceneTiles = rowTiles;
    internal.queueDrop(removedRowTile);
    const rowMotion = internal.dropMotions.get(rowTiles[1].id);
    expect(rowMotion !== undefined && !rowMotion.verticalDrop, "同层空位应触发平滑横向补位");
    if (!rowMotion) {
      return;
    }
    expect(rowMotion.rollRadians === 0 && rowMotion.squash === 0, "横向补位不应滚动、拉伸或抖动");

    now = rowMotion.startedAt + rowMotion.duration * 0.5;
    internal.stepDropAnimation();
    const midpointProgress = 0.5;
    const midpointSettled = midpointProgress * midpointProgress * (3 - 2 * midpointProgress);
    const expectedMidY = rowMotion.fromY + (rowMotion.toY - rowMotion.fromY) * midpointSettled;
    expect(Math.abs(rowMotion.tile.y - expectedMidY) < 0.01, "横向补位应始终沿目标路径平滑移动，不额外下沉摆动");
  } finally {
    Date.now = previousNow;
    globalThis.requestAnimationFrame = previousRequestAnimationFrame;
    globalThis.cancelAnimationFrame = previousCancelAnimationFrame;
  }
});

test("30关难度递进且整局可切换全局元素套装", () => {
  expect(LEVEL_SPECS.length === 30, "应提供完整 30 关");
  expect(
    LEVEL_SPECS[0].itemTypes.includes("apple")
      && LEVEL_SPECS[0].itemTypes.includes("pear")
      && LEVEL_SPECS[0].itemTypes.includes("orange"),
    "第一关应包含基础写实水果",
  );
  expect(LEVEL_SPECS.every((spec) => spec.itemSet === "produce"), "关卡配置不应按章节偷偷切换物品套装");
  for (const chapter of CHAPTER_NAMES) {
    expect(LEVEL_SPECS.filter((spec) => spec.chapter === chapter).length === 10, `${chapter} 应有 10 关`);
  }
  expect(LEVEL_SPECS[1].layerCounts.reduce((sum, count) => sum + count, 0) >= 126, "第二关应直接进入地狱级密度");
  expect(LEVEL_SPECS[1].layerCounts.length >= 5, "第二关应直接采用至少五层遮挡");
  expect(LEVEL_SPECS[1].itemTypes.length === ITEM_SET_TYPES.produce.length, "第二关应启用全部写实水果");
  expect(LEVEL_SPECS[5].layerCounts.reduce((sum, count) => sum + count, 0) >= 160, "第六关应保持高数量堆叠");
  const generator = new LevelGenerator();
  let previousTotal = 0;
  for (const spec of LEVEL_SPECS) {
    const tiles = generator.generate(spec, 375, 812);
    const expectedTotal = spec.layerCounts.reduce((sum, count) => sum + count, 0);
    expect(tiles.length === expectedTotal, `${spec.name} 数量错误`);
    expect(expectedTotal >= previousTotal, `${spec.name} 难度数量不应倒退`);
    previousTotal = expectedTotal;
    for (const type of spec.itemTypes) {
      const count = tiles.filter((tile) => tile.type === type).length;
      expect(count % 3 === 0, `${spec.name} 全局的 ${type} 不是三的倍数`);
    }
    spec.layerCounts.forEach((expectedCount, layer) => {
      const layerTiles = tiles.filter((tile) => tile.layer === layer);
      expect(layerTiles.length === expectedCount, `${spec.name} 第 ${layer} 层数量错误`);
      for (let index = 1; index < layerTiles.length; index += 1) {
        expect(layerTiles[index].type !== layerTiles[index - 1].type, `${spec.name} 同类物品不应连续堆在一起`);
      }
    });
  }
  const secondLevelTiles = generator.generate(LEVEL_SPECS[1], 375, 812);
  expect(
    (["cherry", "lime", "zucchini"] as ItemType[]).every(
      (type) => secondLevelTiles.some((tile) => tile.type === type),
    ),
    "新增水果蔬菜应从第二关开始进入水果菜篮",
  );
  const deeplySpreadTypes = LEVEL_SPECS[1].itemTypes.filter((type) => (
    new Set(secondLevelTiles.filter((tile) => tile.type === type).map((tile) => tile.layer)).size >= 3
  ));
  expect(deeplySpreadTypes.length === LEVEL_SPECS[1].itemTypes.length, "第二关每种水果都应横跨至少三层深度");
  const secondTopLayer = Math.max(...secondLevelTiles.map((tile) => tile.layer));
  for (const type of LEVEL_SPECS[1].itemTypes) {
    const exposedCount = secondLevelTiles.filter((tile) => tile.layer === secondTopLayer && tile.type === type).length;
    expect(exposedCount < 3, `第二关顶层不应直接摆齐三个 ${type}`);
  }
  const thirdLevelFirstLayer = generator.generate(LEVEL_SPECS[2], 375, 812)
    .filter((tile) => tile.layer === 0)
    .map((tile) => tile.type);
  const patternedTriplets = Array.from(
    { length: Math.floor(thirdLevelFirstLayer.length / 3) },
    (_, index) => thirdLevelFirstLayer.slice(index * 3, index * 3 + 3),
  ).filter((group) => group[0] === group[1] && group[1] === group[2]);
  expect(patternedTriplets.length === 0, "同类三件物品不应继续按整组三连规律排放");

  const cupTypes = new Set(ITEM_SET_TYPES.cups);
  const cupFirstLevel = generator.generate(LEVEL_SPECS[0], 375, 812, "cups");
  const cupLastLevel = generator.generate(LEVEL_SPECS[29], 375, 812, "cups");
  expect(cupFirstLevel.every((tile) => cupTypes.has(tile.type)), "选择水杯套装后第一关也必须全部使用水杯元素");
  expect(cupLastLevel.every((tile) => cupTypes.has(tile.type)), "选择水杯套装后最后一关仍必须全部使用水杯元素");
  expect(
    (["wineGlass", "masonJar", "enamelMug"] as ItemType[]).every(
      (type) => cupLastLevel.some((tile) => tile.type === type),
    ),
    "水杯套装的三个新增模型都应进入高难度关卡",
  );

  const kitchenTypes = new Set(ITEM_SET_TYPES.kitchen);
  const kitchenFirstLevel = generator.generate(LEVEL_SPECS[0], 375, 812, "kitchen");
  const kitchenLastLevel = generator.generate(LEVEL_SPECS[29], 375, 812, "kitchen");
  expect(kitchenFirstLevel.every((tile) => kitchenTypes.has(tile.type)), "选择厨房套装后第一关也必须全部使用厨房元素");
  expect(
    (["cheese", "rollingPin", "whisk"] as ItemType[]).every(
      (type) => kitchenLastLevel.some((tile) => tile.type === type),
    ),
    "厨房套装的三个新增模型都应进入高难度关卡",
  );
  const dessertTypes = new Set(ITEM_SET_TYPES.desserts);
  const dessertFirstLevel = generator.generate(LEVEL_SPECS[0], 375, 812, "desserts");
  const dessertLastLevel = generator.generate(LEVEL_SPECS[29], 375, 812, "desserts");
  expect(
    (["croissant", "fruitTart", "chocolate"] as ItemType[]).every(
      (type) => dessertLastLevel.some((tile) => tile.type === type),
    ),
    "甜品套装的三个新增模型都应进入高难度关卡",
  );
  expect(dessertFirstLevel.every((tile) => dessertTypes.has(tile.type)), "选择甜品套装后第一关也必须全部使用甜品元素");
  expect(dessertLastLevel.every((tile) => dessertTypes.has(tile.type)), "选择甜品套装后最后一关也必须全部使用甜品元素");
});

test("矮屏设备会给底部操作区和盘面留出空间", () => {
  const layout = getSceneLayout(460, 735);
  const pileBounds = getPileBounds(460, 735);
  const controlsTop = 735 - 206;
  expect(layout.sceneBottom < controlsTop, "盘面底部不应压住道具按钮");
  expect(layout.centerY + layout.radiusY < controlsTop, "长方体盘面不应进入底部操作区");
  const tiles = new LevelGenerator().generate(LEVEL_SPECS[5], 460, 735);
  const minX = pileBounds.left;
  const maxX = pileBounds.right;
  const minY = pileBounds.top;
  const maxY = pileBounds.bottom;
  for (const tile of tiles) {
    const centerX = tile.x + tile.width / 2;
    const centerY = tile.y + tile.height / 2;
    expect(centerX >= minX && centerX <= maxX, "高密度物品中心应保持在长方体盘面内");
    expect(centerY >= minY && centerY <= maxY, "高密度物品中心应保持在长方体盘面内");
  }
});

test("失败后重试会从第一关开始", () => {
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    { createLinearGradient: () => gradient } as Record<string, unknown>,
    {
      get(target, property: string | symbol) {
        const targetRecord = target as Record<PropertyKey, unknown>;
        if (!(property in targetRecord)) {
          targetRecord[property] = () => {};
        }
        return targetRecord[property];
      },
    },
  ) as unknown as MiniGameCanvasContext2D;
  const runtime = {
    surface: {
      canvas: { width: 0, height: 0, getContext: () => context },
      context,
      width: 375,
      height: 812,
      pixelRatio: 1,
    },
    onTap() {},
    playItemSound() {},
    vibrateShort() {},
  } as unknown as ConstructorParameters<typeof GameManager>[0];
  const manager = new GameManager(runtime);
  const internal = manager as unknown as {
    beginStage(index: number): void;
    drawResultOverlay(): void;
    handleTap(point: { x: number; y: number }): void;
    status: string;
    levelIndex: number;
    primaryButton: { x: number; y: number; width: number; height: number };
  };
  internal.beginStage(5);
  internal.status = "lost";
  internal.drawResultOverlay();
  const button = internal.primaryButton;
  internal.handleTap({ x: button.x + button.width / 2, y: button.y + button.height / 2 });
  expect(internal.levelIndex === 0, "失败重试不应继续当前关卡");
});

test("移出道具退场后不再绘制残留物，并保持后续三消可解", () => {
  const gradient = { addColorStop() {} };
  const context = new Proxy(
    { createLinearGradient: () => gradient } as Record<string, unknown>,
    {
      get(target, property: string | symbol) {
        const targetRecord = target as Record<PropertyKey, unknown>;
        if (!(property in targetRecord)) {
          targetRecord[property] = () => {};
        }
        return targetRecord[property];
      },
    },
  ) as unknown as MiniGameCanvasContext2D;
  const runtime = {
    surface: {
      canvas: { width: 0, height: 0, getContext: () => context },
      context,
      width: 375,
      height: 812,
      pixelRatio: 1,
    },
    onTap() {},
    playItemSound() {},
    playMatchSound() {},
    vibrateShort() {},
  } as unknown as ConstructorParameters<typeof GameManager>[0];

  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;
  let nextFrame = 1;
  globalThis.requestAnimationFrame = (() => nextFrame++) as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as typeof cancelAnimationFrame;
  try {
    const manager = new GameManager(runtime);
    const internal = manager as unknown as {
      slots: SlotManager;
      moveOutTiles(): boolean;
      collectTile(tile: Tile): boolean;
      cancelCollectAnimation(): void;
      moveOutCredits: Map<ItemType, number>;
      moveOutMotions: Array<{ tile: Tile }>;
      totalMatched: number;
    };
    internal.slots.add(createTile("apple"));
    internal.slots.add(createTile("corn"));
    internal.slots.add(createTile("pear"));

    expect(internal.moveOutTiles(), "槽位有物品时移出道具应该成功");
    expect(internal.slots.size === 0, "移出后收集槽应立即变空");
    expect(internal.moveOutMotions.length === 3, "至多三个物品应只保留短暂退场动画");
    expect(internal.moveOutCredits.get("apple") === 1, "移出物品应在后台保留三消平衡额度");
    expect(!("temporaryTiles" in (manager as unknown as Record<string, unknown>)), "不应再保存可见暂存物品");
    expect(!("drawTemporaryArea" in (manager as unknown as Record<string, unknown>)), "不应再绘制第二排暂存区域");

    internal.collectTile(createTile("apple"));
    internal.collectTile(createTile("apple"));
    expect(internal.slots.countType("apple") === 0, "隐藏额度加两个同类物品应正常完成三消");
    expect(!internal.moveOutCredits.has("apple"), "完成三消后应消费隐藏额度");
    expect(internal.totalMatched === 3, "隐藏额度参与的消除也应计入正常三消");
    internal.cancelCollectAnimation();
  } finally {
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
  }
});

test("通关后会保存并恢复下一关解锁进度", () => {
  const storage = new Map<string, unknown>();
  Object.assign(globalThis, {
    wx: {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    },
  });
  const manager = new StorageManager();
  const initial = manager.load();
  expect(initial.highestUnlocked === 1, "新存档应从第一关开始");
  manager.completeLevel(initial, 1);
  const restored = manager.load();
  expect(restored.highestUnlocked === 2, "完成第一关后应解锁第二关");
  expect(restored.completedLevels.includes(1), "完成记录应写入本地存档");
  expect(restored.levelStars[1] === 1, "完成关卡应保存至少一颗星");
  expect(restored.reward.coins >= 0, "完成关卡后应保留金币存档");
});

test("图鉴与每日挑战会持久化并按日期重置", () => {
  const storage = new Map<string, unknown>();
  Object.assign(globalThis, {
    wx: {
      getStorageSync: (key: string) => storage.get(key),
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    },
  });
  const manager = new StorageManager();
  const initial = manager.load();
  const discovered = manager.discoverItems(initial, ["apple", "cup"]);
  expect(discovered.discoveredItems.length === 2, "图鉴应记录新发现物品");
  const completed = manager.completeDaily(discovered, 3, Date.parse("2026-08-12T12:00:00+08:00"));
  expect(completed.daily.completed && completed.daily.stars === 3, "每日挑战应保存星级");
  expect(completed.reward.coins >= 30 && completed.reward.streak === 1, "完成每日挑战应奖励金币并开始连续天数");
  const nextDay = manager.load();
  expect(nextDay.daily.stamp === getDateStamp(), "读取新日期时应刷新每日挑战状态");
});

console.log(`\n核心逻辑测试通过：${passed} 项`);
