const assert = require("node:assert/strict");
const path = require("node:path");

const drawnTexts = [];
const storage = new Map();
let touchListener;
let touchEndListener;
let hideListener;
let showListener;
let soundPlayCount = 0;
let vibrationCount = 0;
let imageLoadCount = 0;
let imageDrawCount = 0;
const realNow = Date.now;
let clock = 1_800_000_000_000;
Date.now = () => clock;

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
      if (property === "drawImage") {
        return () => { imageDrawCount += 1; };
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
  onTouchEnd(listener) {
    touchEndListener = listener;
  },
  onHide(listener) {
    hideListener = listener;
  },
  onShow(listener) {
    showListener = listener;
  },
  vibrateShort() {
    vibrationCount += 1;
  },
  createImage() {
    const image = {};
    Object.defineProperty(image, "src", {
      set() {
        imageLoadCount += 1;
        image.onload?.();
      },
    });
    return image;
  },
  createWebAudioContext() {
    return {
      currentTime: 0,
      destination: {},
      resume() {},
      createOscillator() {
        return {
          type: "sine",
          frequency: { setValueAtTime() {} },
          connect() {},
          start() {
            soundPlayCount += 1;
          },
          stop() {},
        };
      },
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime() {},
          },
          connect() {},
        };
      },
    };
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
  touchEndListener({ touches: [], changedTouches: [{ clientX, clientY }] });
}

function longPressRelease(clientX, clientY) {
  touchListener({ touches: [{ clientX, clientY }], changedTouches: [] });
  clock += 450;
  touchEndListener({ touches: [], changedTouches: [{ clientX, clientY }] });
}

require(path.resolve(__dirname, "..", "minigame", "game.js"));
assert.equal(imageLoadCount, 254, "63 种物品和两张界面底图均应完成图片加载");
assert.equal(typeof touchListener, "function", "小游戏入口应注册触摸事件");
assert.equal(typeof touchEndListener, "function", "小游戏入口应注册触摸结束事件");
assert(drawnTexts.includes("消消农场"), "首页应绘制游戏标题");
assert(drawnTexts.includes("农场进度"), "首页应显示精简进度卡");
assert(drawnTexts.includes("开始第 1 关"), "新存档应从第一关开始");
assert(drawnTexts.includes("重新挑战第 1 关"), "首页应显示重新挑战入口");
assert(drawnTexts.includes("关卡地图"), "首页应提供关卡地图入口");
assert(drawnTexts.includes("选择主题"), "首页应提供精简主题选择");
assert(drawnTexts.some((text) => text.includes("每日挑战")), "首页应提供每日挑战入口");
assert(drawnTexts.some((text) => text.includes("图鉴 0/63")), "首页应提供物品图鉴入口");
assert(drawnTexts.some((text) => text.includes("金币 0")), "首页应显示金币余额");
assert(drawnTexts.some((text) => text.includes("连续 0 天")), "首页应显示连续挑战记录");

drawnTexts.length = 0;
tap(187, 570);
assert(imageDrawCount > 0, "produce stage should draw real fruit sprites through Canvas drawImage");
tap(44, 64);
tap(187, 496);

drawnTexts.length = 0;
tap(145, 498);
tap(187, 570);
assert(imageDrawCount > 0, "进入水果关卡后应通过 Canvas drawImage 绘制真实水果素材");
assert(drawnTexts.some((text) => text.includes("1/30")), "进入套装关卡后应显示关卡进度");
assert(!drawnTexts.some((text) => text.includes("剩余 18")), "顶部不应显示多余剩余数量副标题");

drawnTexts.length = 0;
clock += 5000;
hideListener();
showListener();
assert(drawnTexts.includes("已暂停"), "小游戏进入后台后应显示暂停提示");
assert(drawnTexts.includes("9:55"), "后台前已经消耗的时间应保留");

drawnTexts.length = 0;
clock += 60000;
showListener();
assert(drawnTexts.includes("9:55"), "暂停期间经过的时间不应继续扣除");
tap(187, 442);
assert(drawnTexts.includes("继续游戏"), "返回小游戏后点击继续应恢复计时");
tap(44, 64);
tap(187, 496);
assert(drawnTexts.includes("消消农场"), "暂停面板应提供退出到首页入口");

drawnTexts.length = 0;
tap(187, 710);
assert(drawnTexts.includes("30 关挑战地图"), "关卡地图应展示 30 关");
assert(drawnTexts.includes("第 1 章 · 新手农场"), "关卡地图应展示第一章");
assert(drawnTexts.includes("第 2 章 · 丰收田园"), "关卡地图应展示第二章");
assert(drawnTexts.includes("第 3 章 · 疯狂农庄"), "关卡地图应展示第三章");

drawnTexts.length = 0;
tap(60, 189);
assert(drawnTexts.includes("第 1 关 · 清晨果摊"), "点击已解锁关卡后应进入第一关");
assert(!drawnTexts.some((text) => text.includes("剩余 18")), "游戏标题区不应显示剩余数量副标题");
assert(!drawnTexts.includes("点准露出的图案，三个相同就消除"), "游戏区不应显示额外提示条");
assert(!drawnTexts.some((text) => text.includes("熟悉抓取与三消节奏")), "顶部不应显示多余副标题");
assert(!drawnTexts.includes("收 集 槽 · 7 格"), "收集槽上方不应显示多余说明文字");
assert(!drawnTexts.some((text) => text.startsWith("已消除 ")), "顶部不应显示已消除计数");
assert(!drawnTexts.some((text) => text.includes("本关目标")), "顶部不应显示拥挤的目标小字");
assert(drawnTexts.some((text) => text.includes("移出 1次")), "第一关应提供 1 次移出道具");
assert(drawnTexts.some((text) => text.includes("凑齐 1次")), "第一关应提供 1 次凑齐道具");
assert(drawnTexts.some((text) => text.includes("打乱 1次")), "第一关应提供 1 次打乱道具");
assert(!drawnTexts.includes("||"), "暂停按钮不应依赖字体符号绘制");
assert(!drawnTexts.includes("..."), "右上角不应重复绘制微信原生更多菜单");
assert(!drawnTexts.includes("O"), "右上角不应重复绘制微信原生退出菜单");
assert(!drawnTexts.some((text) => /^[↥✦↻]/u.test(text)), "道具按钮不应出现设备相关的特殊符号");

drawnTexts.length = 0;
tap(90, 512);
assert.equal(soundPlayCount, 1, "普通点击应取走一个物品并播放音效");
assert(!drawnTexts.some((text) => text.includes("空位沿排列传递")), "游戏区不应显示额外补位提示条");
assert.equal(soundPlayCount, 1, "每次成功点击物品应播放一次音效");
assert.equal(vibrationCount, 0, "普通收集不应触发震动");

drawnTexts.length = 0;
tap(75, 738);
assert(drawnTexts.some((text) => text.includes("移出 0次")), "移出使用后应显示剩余 0 次");
assert(!drawnTexts.includes("暂存区"), "移出后的物品不应再显示在第二排暂存区域");

tap(187, 738);
assert.equal(soundPlayCount, 10, "移出和凑齐道具应播放完整音效");

drawnTexts.length = 0;
tap(318, 738);
assert(drawnTexts.some((text) => text.includes("打乱 0次")), "打乱使用后应显示剩余 0 次");
drawnTexts.length = 0;
tap(318, 738);
assert.equal(soundPlayCount, 14, "打乱使用后应播放一次道具音效");

drawnTexts.length = 0;
tap(44, 64);
assert(drawnTexts.includes("游戏已暂停"), "点击顶部暂停按钮后应显示暂停面板");
tap(187, 496);
assert(drawnTexts.includes("重新挑战第 1 关"), "退出暂停面板后应保留重新挑战入口");

drawnTexts.length = 0;
tap(187, 670);
assert(drawnTexts.includes("第 1 关 · 清晨果摊"), "点击重新挑战应返回刚才游玩的关卡");
const soundsBeforeLongPressRelease = soundPlayCount;
longPressRelease(90, 512);
assert.equal(soundPlayCount, soundsBeforeLongPressRelease + 1, "长按后松开露出的物品也应只收集一次");

console.log("✓ 30关地图、全局套装、暂停计时、物品音效与道具次数限制冒烟测试通过");
Date.now = realNow;
