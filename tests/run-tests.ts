import type { ItemType } from "../src/data/ItemConfig";
import { BlockDetector } from "../src/game/BlockDetector";
import { StorageManager } from "../src/core/StorageManager";
import { DropSystem } from "../src/game/DropSystem";
import { CHAPTER_NAMES, getSceneLayout, LEVEL_SPECS, LevelGenerator } from "../src/game/LevelGenerator";
import { GameManager } from "../src/core/GameManager";
import { SlotManager } from "../src/game/SlotManager";
import { Tile } from "../src/game/Tile";

let nextId = 1;
let passed = 0;

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

test("重叠关系会更新但不会锁住下层物品", () => {
  const detector = new BlockDetector();
  const lower = createTile("apple", { x: 20, y: 20, layer: 0 });
  const upper = createTile("corn", { x: 25, y: 25, layer: 1 });
  detector.recalculate([lower, upper]);
  expect(lower.blocked, "下层重叠物品应被标记为遮挡");
  expect(lower.containsPoint(45, 45), "重叠只记录层级，不应锁住下层物品的点击");
  expect(!upper.blocked, "最上层物品应可点击");
  upper.removed = true;
  detector.recalculate([lower, upper]);
  expect(!lower.blocked, "移除上层后下层应恢复可点击");
});

test("清掉上层后重叠的下层会有落坠动画", () => {
  const drop = new DropSystem(600);
  const lower = createTile("apple", { x: 20, y: 100, layer: 0 });
  const upper = createTile("corn", { x: 25, y: 105, layer: 1 });
  const farAway = createTile("berry", { x: 220, y: 100, layer: 0 });
  const moves = drop.release([lower, upper, farAway], upper);
  expect(moves.length === 1, "只应检测到与清除物品实际重叠的下层");
  expect(moves[0].tile.id === lower.id && moves[0].toY > moves[0].fromY, "下层物品应向下落位");
});

test("30关分为三章且每层都可组成三消", () => {
  expect(LEVEL_SPECS.length === 30, "应提供完整 30 关");
  for (const chapter of CHAPTER_NAMES) {
    expect(LEVEL_SPECS.filter((spec) => spec.chapter === chapter).length === 10, `${chapter} 应有 10 关`);
  }
  expect(LEVEL_SPECS[1].layerCounts.reduce((sum, count) => sum + count, 0) >= 100, "第二关应明显提高密度");
  expect(LEVEL_SPECS[5].layerCounts.reduce((sum, count) => sum + count, 0) >= 160, "第六关应保持高数量堆叠");
  const generator = new LevelGenerator();
  for (const spec of LEVEL_SPECS) {
    const tiles = generator.generate(spec, 375, 812);
    expect(tiles.length === spec.layerCounts.reduce((sum, count) => sum + count, 0), `${spec.name} 数量错误`);
    spec.layerCounts.forEach((expectedCount, layer) => {
      const layerTiles = tiles.filter((tile) => tile.layer === layer);
      expect(layerTiles.length === expectedCount, `${spec.name} 第 ${layer} 层数量错误`);
      for (const type of spec.itemTypes) {
        const count = layerTiles.filter((tile) => tile.type === type).length;
        expect(count % 3 === 0, `${spec.name} 第 ${layer} 层的 ${type} 不是三的倍数`);
      }
    });
  }
});

test("矮屏设备会给底部操作区和盘面留出空间", () => {
  const layout = getSceneLayout(460, 735);
  const controlsTop = 735 - 206;
  expect(layout.sceneBottom < controlsTop, "盘面底部不应压住道具按钮");
  expect(layout.centerY + layout.radiusY < controlsTop, "盘面椭圆不应进入底部操作区");
  const tiles = new LevelGenerator().generate(LEVEL_SPECS[5], 460, 735);
  const minX = layout.centerX - layout.radiusX + 14;
  const maxX = layout.centerX + layout.radiusX - 14;
  const minY = layout.centerY - layout.radiusY + 14;
  const maxY = layout.centerY + layout.radiusY - 32;
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
});

console.log(`\n核心逻辑测试通过：${passed} 项`);
