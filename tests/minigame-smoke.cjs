const assert = require("node:assert/strict");
const path = require("node:path");

const drawnTexts = [];
const storage = new Map();
let touchListener;
let vibrationCount = 0;

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
  vibrateShort() {
    vibrationCount += 1;
  },
  getStorageSync(key) {
    return storage.get(key);
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
};

function tap(clientX, clientY) {
  touchListener({ touches: [{ clientX, clientY }], changedTouches: [] });
}

require(path.resolve(__dirname, "..", "minigame", "game.js"));
assert.equal(typeof touchListener, "function", "小游戏入口应注册触摸事件");
assert(drawnTexts.includes("消消农场"), "首页应绘制游戏标题");
assert(drawnTexts.includes("30 关农场冒险"), "首页应显示 30 关进度");
assert(drawnTexts.includes("开始第 1 关"), "新存档应从第一关开始");
assert(drawnTexts.includes("查看 30 关地图"), "首页应提供关卡地图入口");

drawnTexts.length = 0;
tap(187, 710);
assert(drawnTexts.includes("30 关挑战地图"), "关卡地图应展示 30 关");
assert(drawnTexts.includes("第 1 章 · 新手农场"), "关卡地图应展示第一章");
assert(drawnTexts.includes("第 2 章 · 丰收田园"), "关卡地图应展示第二章");
assert(drawnTexts.includes("第 3 章 · 疯狂农庄"), "关卡地图应展示第三章");

drawnTexts.length = 0;
tap(60, 189);
assert(drawnTexts.includes("第 1 关 · 清晨果摊"), "点击已解锁关卡后应进入第一关");
assert(drawnTexts.some((text) => text.includes("剩余 18")), "第一关应有 18 个散堆物品");
assert(drawnTexts.includes("点准露出的图案，三个相同就消除"), "首关应显示抓取提示");
assert(drawnTexts.includes("↥  移出"), "第一关应提供移出道具");
assert(drawnTexts.includes("✦  凑齐"), "第一关应提供凑齐道具");
assert(drawnTexts.includes("↻  打乱"), "第一关应提供打乱道具");

drawnTexts.length = 0;
tap(202, 387);
assert(drawnTexts.some((text) => text.includes("剩余 17")), "普通点击应取走一个物品");
assert.equal(vibrationCount, 0, "普通点击不应触发震动");

tap(184, 347);
tap(237, 385);
assert(drawnTexts.some((text) => text.startsWith("苹果 × 3，消除！")), "三个相同物品应形成三消");
assert.equal(vibrationCount, 1, "只有三消完成时才应触发一次震动");

console.log("✓ 30关地图、首关容器、普通点击静默与三消震动冒烟测试通过");
