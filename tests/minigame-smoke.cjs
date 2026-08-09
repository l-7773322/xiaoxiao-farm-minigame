const assert = require("node:assert/strict");
const path = require("node:path");

const drawnTexts = [];
let touchListener;

const gradient = { addColorStop() {} };
const context = new Proxy(
  {},
  {
    get(target, property) {
      if (property === "createLinearGradient") {
        return () => gradient;
      }
      if (property === "fillText") {
        return (value) => drawnTexts.push(String(value));
      }
      if (!(property in target)) {
        target[property] = () => {};
      }
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  },
);

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: 375, windowHeight: 812, pixelRatio: 2 };
  },
  createCanvas() {
    return { width: 0, height: 0, getContext: () => context };
  },
  onTouchStart(listener) {
    touchListener = listener;
  },
};

require(path.resolve(__dirname, "..", "minigame", "game.js"));
assert.equal(typeof touchListener, "function", "小游戏入口应注册触摸事件");
assert(drawnTexts.includes("消消农场"), "首次渲染应绘制游戏标题");
assert(drawnTexts.includes("测试关卡 · 剩余 12"), "首次渲染应显示 12 个剩余物品");

const centers = [
  [58, 176],
  [144, 176],
  [230, 176],
  [316, 176],
  [58, 262],
  [144, 262],
  [230, 262],
  [316, 262],
  [58, 348],
  [144, 348],
  [230, 348],
  [316, 348],
];

function tap(index) {
  const [clientX, clientY] = centers[index];
  touchListener({ touches: [{ clientX, clientY }], changedTouches: [] });
}

for (const index of [0, 6, 9, 1, 4, 11, 2, 7, 8, 3, 5, 10]) {
  tap(index);
}
assert(drawnTexts.includes("闯关成功"), "按四组三元组点击后应胜利");

drawnTexts.length = 0;
touchListener({ touches: [{ clientX: 187, clientY: 451 }], changedTouches: [] });
assert(drawnTexts.includes("测试关卡 · 剩余 12"), "结果页重新开始按钮应重置关卡");

for (const index of [0, 6, 1, 4, 2, 7, 3]) {
  tap(index);
}
assert(drawnTexts.includes("槽位已满"), "七个未成组物品应触发失败");

console.log("✓ 微信小游戏入口、胜利流程、失败流程冒烟测试通过");
