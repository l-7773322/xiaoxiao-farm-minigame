import type { ItemType } from "../src/data/ItemConfig";
import { SlotManager } from "../src/game/SlotManager";
import { Tile } from "../src/game/Tile";

let nextId = 1;
let passed = 0;

function createTile(type: ItemType): Tile {
  return new Tile({ id: nextId++, type, x: 0, y: 0, width: 50, height: 50 });
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

test("四个相同物品在前三个消除后保留一个", () => {
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
  expect(matchedCount === 6, "六个莓果应全部消除");
  expect(slots.size === 0, "连续消除后槽位应为空");
});

test("第七个未形成三消的物品触发槽满", () => {
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

console.log(`\n核心逻辑测试通过：${passed} 项`);
