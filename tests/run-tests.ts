import type { ItemType } from "../src/data/ItemConfig";
import { BlockDetector } from "../src/game/BlockDetector";
import { StorageManager } from "../src/core/StorageManager";
import { DropSystem } from "../src/game/DropSystem";
import { CHAPTER_NAMES, getPileBounds, getSceneLayout, LEVEL_SPECS, LevelGenerator } from "../src/game/LevelGenerator";
import { GameManager } from "../src/core/GameManager";
import { PileLayout, type PileBounds } from "../src/game/PileLayout";
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
