import { ITEM_TYPES, ITEM_VISUALS, type ItemType } from "../data/ItemConfig";
import { BlockDetector } from "../game/BlockDetector";
import { LEVEL_SPECS, LevelGenerator } from "../game/LevelGenerator";
import { SlotManager } from "../game/SlotManager";
import { Tile } from "../game/Tile";
import { WechatRuntime, type TapPoint } from "../platform/WechatRuntime";
import { drawItemIcon, drawMascot, roundedRect } from "../ui/CanvasDrawing";

type GameStatus = "home" | "playing" | "stageClear" | "won" | "lost";
type ToolName = "moveOut" | "gather" | "shuffle";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

export class GameManager {
  private readonly slots = new SlotManager(7);
  private readonly detector = new BlockDetector();
  private readonly generator = new LevelGenerator();
  private readonly context: MiniGameCanvasContext2D;
  private readonly width: number;
  private readonly height: number;
  private sceneTiles: Tile[] = [];
  private status: GameStatus = "home";
  private levelIndex = 0;
  private initialTileCount = 0;
  private totalMatched = 0;
  private toolUsed: Record<ToolName, boolean> = {
    moveOut: false,
    gather: false,
    shuffle: false,
  };
  private temporaryTiles: Tile[] = [];
  private temporaryRects: Rect[] = [];
  private backButton: Rect = { ...EMPTY_RECT };
  private primaryButton: Rect = { ...EMPTY_RECT };
  private toolButtons: Record<ToolName, Rect> = {
    moveOut: { ...EMPTY_RECT },
    gather: { ...EMPTY_RECT },
    shuffle: { ...EMPTY_RECT },
  };
  private toast = "";

  public constructor(private readonly runtime: WechatRuntime) {
    this.context = runtime.surface.context;
    this.width = runtime.surface.width;
    this.height = runtime.surface.height;
  }

  public start(): void {
    this.showHome();
    this.runtime.onTap((point) => this.handleTap(point));
  }

  private showHome(): void {
    this.status = "home";
    this.levelIndex = 0;
    this.totalMatched = 0;
    this.sceneTiles = [];
    this.slots.reset();
    this.temporaryTiles = [];
    this.render();
  }

  private beginStage(index: number): void {
    this.levelIndex = index;
    this.status = "playing";
    this.slots.reset();
    this.temporaryTiles = [];
    this.temporaryRects = [];
    this.toolUsed = { moveOut: false, gather: false, shuffle: false };
    this.toast = index === 0 ? "先消掉上层能点的物品" : "第二关物品更多，别塞满槽位";
    this.sceneTiles = this.generator.generate(LEVEL_SPECS[index], this.width, this.height);
    this.initialTileCount = this.sceneTiles.length;
    this.detector.recalculate(this.sceneTiles);
    this.render();
  }

  private handleTap(point: TapPoint): void {
    if (this.status === "home") {
      if (this.isPointInRect(point, this.primaryButton)) {
        this.beginStage(0);
      }
      return;
    }

    if (this.status !== "playing") {
      if (this.isPointInRect(point, this.primaryButton)) {
        if (this.status === "stageClear") {
          this.beginStage(1);
        } else {
          this.beginStage(0);
        }
      }
      return;
    }

    if (this.isPointInRect(point, this.backButton)) {
      this.showHome();
      return;
    }

    const temporaryIndex = this.temporaryRects.findIndex((rect) => this.isPointInRect(point, rect));
    if (temporaryIndex !== -1 && this.temporaryTiles[temporaryIndex]) {
      const temporaryTile = this.temporaryTiles[temporaryIndex];
      if (this.collectTile(temporaryTile)) {
        this.temporaryTiles.splice(temporaryIndex, 1);
        this.detector.recalculate(this.sceneTiles);
        this.finishMove();
      } else {
        this.toast = "收集槽已满，暂存物品还放不回来";
        this.render();
      }
      return;
    }

    for (const name of ["moveOut", "gather", "shuffle"] as const) {
      if (this.isPointInRect(point, this.toolButtons[name])) {
        this.useTool(name);
        return;
      }
    }

    const tile = [...this.sceneTiles]
      .sort((left, right) => right.layer - left.layer || right.id - left.id)
      .find((candidate) => candidate.containsPoint(point.x, point.y));

    if (!tile) {
      this.toast = "这个物品还被压着，先清掉上层";
      this.render();
      return;
    }

    this.collectTile(tile);
    this.detector.recalculate(this.sceneTiles);
    this.finishMove();
  }

  private collectTile(tile: Tile): boolean {
    tile.removed = true;
    const update = this.slots.add(tile);
    if (!update.accepted) {
      tile.removed = false;
      return false;
    }

    if (update.matched.length === 3) {
      this.totalMatched += 3;
      this.toast = `${ITEM_VISUALS[tile.type].label} × 3，消除！`;
      this.runtime.vibrate("medium");
    } else {
      this.toast = `已收集 ${ITEM_VISUALS[tile.type].label}`;
      this.runtime.vibrate("light");
    }
    return true;
  }

  private finishMove(): void {
    const remaining = this.sceneTiles.filter((tile) => !tile.removed).length;
    if (remaining === 0 && this.slots.size === 0 && this.temporaryTiles.length === 0) {
      this.status = this.levelIndex === LEVEL_SPECS.length - 1 ? "won" : "stageClear";
      this.runtime.vibrate("heavy");
    } else if (this.slots.size >= this.slots.capacity) {
      this.status = "lost";
      this.runtime.vibrate("heavy");
    }
    this.render();
  }

  private useTool(name: ToolName): void {
    if (this.toolUsed[name]) {
      this.toast = "本关已经用过这个道具了";
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
      this.toolUsed[name] = true;
      this.detector.recalculate(this.sceneTiles);
      this.finishMove();
    } else {
      this.render();
    }
  }

  private moveOutTiles(): boolean {
    const count = Math.min(3, this.slots.size);
    if (count === 0) {
      this.toast = "收集槽还是空的，暂时不需要移出";
      return false;
    }
    const ids = this.slots.items.slice(0, count).map((tile) => tile.id);
    this.temporaryTiles = ids
      .map((id) => this.slots.remove(id))
      .filter((tile): tile is Tile => tile !== undefined);
    this.toast = `已将 ${this.temporaryTiles.length} 个物品移到暂存区`;
    this.runtime.vibrate("medium");
    return true;
  }

  private gatherTriplet(): boolean {
    const exposed = this.sceneTiles.filter((tile) => !tile.removed && !tile.blocked);
    const capacityLeft = this.slots.capacity - this.slots.size;
    const candidates = ITEM_TYPES.map((type) => {
      const inSlot = this.slots.countType(type);
      const need = 3 - inSlot;
      const available = exposed.filter((tile) => tile.type === type);
      return { type, inSlot, need, available };
    })
      .filter((candidate) => candidate.need <= capacityLeft && candidate.available.length >= candidate.need)
      .sort((left, right) => right.inSlot - left.inSlot || right.available.length - left.available.length);

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
    this.runtime.vibrate("medium");
    return true;
  }

  private render(): void {
    this.context.clearRect(0, 0, this.width, this.height);
    this.drawBackground();
    if (this.status === "home") {
      this.drawHome();
      return;
    }

    this.drawGameHeader();
    this.drawBasket();
    this.drawScene();
    this.drawTemporaryArea();
    this.drawTools();
    this.drawSlots();

    if (this.status !== "playing") {
      this.drawResultOverlay();
    } else if (this.toast) {
      this.drawToast();
    }
  }

  private drawBackground(): void {
    const gradient = this.context.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#9ed9ee");
    gradient.addColorStop(0.42, "#dff2c5");
    gradient.addColorStop(1, "#f1d59a");
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, this.width, this.height);

    this.context.fillStyle = "rgba(255,255,255,0.72)";
    for (const [x, y, size] of [[52, 98, 24], [79, 92, 33], [105, 102, 22], [294, 73, 22], [320, 69, 30]]) {
      this.context.beginPath();
      this.context.arc(x, y, size, 0, Math.PI * 2);
      this.context.fill();
    }

    this.context.fillStyle = "#78b966";
    this.context.beginPath();
    this.context.moveTo(0, this.height * 0.32);
    this.context.quadraticCurveTo(this.width * 0.24, this.height * 0.2, this.width * 0.55, this.height * 0.33);
    this.context.quadraticCurveTo(this.width * 0.78, this.height * 0.22, this.width, this.height * 0.31);
    this.context.lineTo(this.width, this.height);
    this.context.lineTo(0, this.height);
    this.context.closePath();
    this.context.fill();

    this.context.fillStyle = "#6aa659";
    this.context.fillRect(0, this.height - 120, this.width, 120);
    this.context.strokeStyle = "rgba(70,110,54,0.2)";
    this.context.lineWidth = 1;
    for (let y = this.height - 108; y < this.height; y += 18) {
      this.context.beginPath();
      this.context.moveTo(0, y);
      this.context.lineTo(this.width, y + 24);
      this.context.stroke();
    }
  }

  private drawHome(): void {
    this.context.fillStyle = "#294f36";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.font = "bold 37px sans-serif";
    this.context.fillText("消消农场", this.width / 2, 66);
    this.context.fillStyle = "#55745b";
    this.context.font = "bold 15px sans-serif";
    this.context.fillText("翻开丰收大盘 · 三个相同就消除", this.width / 2, 105);

    drawMascot(this.context, this.width / 2 - 4, 218, 190);
    this.drawSpeechBubble(this.width / 2 + 69, 166, "今天也要清空大盘！");

    const cardX = 28;
    const cardY = 315;
    const cardWidth = this.width - 56;
    roundedRect(this.context, cardX, cardY, cardWidth, 148, 24);
    this.context.fillStyle = "rgba(255,253,234,0.94)";
    this.context.fill();
    this.context.strokeStyle = "rgba(85,118,65,0.24)";
    this.context.lineWidth = 2;
    this.context.stroke();
    this.context.fillStyle = "#496845";
    this.context.font = "bold 18px sans-serif";
    this.context.fillText("今日丰收挑战", this.width / 2, cardY + 28);
    this.context.fillStyle = "#ed7b40";
    this.context.font = "bold 34px sans-serif";
    this.context.fillText("12,638", this.width / 2, cardY + 72);
    this.context.fillStyle = "#72806b";
    this.context.font = "13px sans-serif";
    this.context.fillText("位农场主已经加入挑战", this.width / 2, cardY + 101);
    this.context.fillStyle = "#8a6e4a";
    this.context.font = "bold 13px sans-serif";
    this.context.fillText("热身小摊  →  丰收大堆", this.width / 2, cardY + 126);

    this.primaryButton = {
      x: 43,
      y: this.height - 182,
      width: this.width - 86,
      height: 62,
    };
    this.drawRaisedButton(this.primaryButton, "开始挑战", "#f08a43", "#c95f29");
    this.context.fillStyle = "rgba(255,255,255,0.82)";
    this.context.font = "13px sans-serif";
    this.context.fillText("无需登录 · 直接试玩", this.width / 2, this.height - 94);
  }

  private drawGameHeader(): void {
    const spec = LEVEL_SPECS[this.levelIndex];
    const remaining = this.sceneTiles.filter((tile) => !tile.removed).length;
    const progress = Math.round(((this.initialTileCount - remaining) / this.initialTileCount) * 100);
    roundedRect(this.context, 12, 14, this.width - 24, 111, 20);
    this.context.fillStyle = "rgba(43,78,52,0.93)";
    this.context.fill();
    this.context.strokeStyle = "rgba(255,244,190,0.38)";
    this.context.lineWidth = 2;
    this.context.stroke();

    this.context.textAlign = "left";
    this.context.textBaseline = "middle";
    this.context.fillStyle = "#fff4bf";
    this.context.font = "bold 13px sans-serif";
    this.context.fillText("今日挑战 12,638", 28, 35);
    this.context.textAlign = "right";
    this.context.fillStyle = "#d7ead0";
    this.context.fillText(`已消除 ${this.totalMatched}`, this.width - 28, 35);
    this.context.textAlign = "center";
    this.context.fillStyle = "#ffffff";
    this.context.font = "bold 22px sans-serif";
    this.context.fillText(`第 ${this.levelIndex + 1} 关 · ${spec.name}`, this.width / 2, 63);
    this.context.fillStyle = "#d7ead0";
    this.context.font = "12px sans-serif";
    this.context.fillText(`${spec.subtitle}　剩余 ${remaining}`, this.width / 2, 86);

    roundedRect(this.context, 28, 101, this.width - 56, 8, 4);
    this.context.fillStyle = "rgba(255,255,255,0.18)";
    this.context.fill();
    const progressWidth = (this.width - 56) * (progress / 100);
    if (progressWidth > 0) {
      roundedRect(this.context, 28, 101, progressWidth, 8, 4);
      this.context.fillStyle = "#f4c84d";
      this.context.fill();
    }

    this.backButton = { x: 20, y: 50, width: 48, height: 28 };
    roundedRect(this.context, this.backButton.x, this.backButton.y, this.backButton.width, this.backButton.height, 12);
    this.context.fillStyle = "rgba(255,255,255,0.13)";
    this.context.fill();
    this.context.fillStyle = "#fff6ce";
    this.context.textAlign = "center";
    this.context.font = "bold 11px sans-serif";
    this.context.fillText("‹ 返回", 44, 64);
  }

  private drawBasket(): void {
    const centerX = this.width / 2;
    const centerY = Math.min(365, this.height * 0.45);
    const radiusX = this.width / 2 - 12;
    const radiusY = Math.min(226, this.height * 0.28);

    this.context.save();
    this.context.shadowColor = "rgba(62,43,24,0.35)";
    this.context.shadowBlur = 14;
    this.context.shadowOffsetY = 9;
    this.context.beginPath();
    this.context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    this.context.fillStyle = "#9b5f2e";
    this.context.fill();
    this.context.restore();

    this.context.beginPath();
    this.context.ellipse(centerX, centerY - 5, radiusX - 8, radiusY - 12, 0, 0, Math.PI * 2);
    const weave = this.context.createLinearGradient(0, centerY - radiusY, 0, centerY + radiusY);
    weave.addColorStop(0, "#e4b761");
    weave.addColorStop(0.5, "#c9883e");
    weave.addColorStop(1, "#a96831");
    this.context.fillStyle = weave;
    this.context.fill();
    this.context.strokeStyle = "rgba(100,55,24,0.42)";
    this.context.lineWidth = 3;
    this.context.stroke();

    this.context.strokeStyle = "rgba(117,68,31,0.18)";
    this.context.lineWidth = 2;
    for (let offset = -130; offset <= 130; offset += 26) {
      const length = Math.sqrt(Math.max(0, radiusX * radiusX - offset * offset));
      this.context.beginPath();
      this.context.moveTo(centerX - length * 0.84, centerY + offset * 0.72);
      this.context.lineTo(centerX + length * 0.84, centerY + offset * 0.72);
      this.context.stroke();
    }
  }

  private drawScene(): void {
    const visible = this.sceneTiles
      .filter((tile) => !tile.removed)
      .sort((left, right) => left.layer - right.layer || left.id - right.id);
    for (const tile of visible) {
      drawItemIcon(
        this.context,
        tile.type,
        tile.x + tile.width / 2,
        tile.y + tile.height / 2,
        tile.width * 0.9,
        tile.rotation,
        tile.blocked,
      );
    }
  }

  private drawTools(): void {
    const names: ToolName[] = ["moveOut", "gather", "shuffle"];
    const labels: Record<ToolName, string> = {
      moveOut: "↥  移出",
      gather: "✦  凑齐",
      shuffle: "↻  打乱",
    };
    const gap = 9;
    const buttonWidth = (this.width - 36 - gap * 2) / 3;
    const y = this.height - 206;
    names.forEach((name, index) => {
      const rect = { x: 18 + index * (buttonWidth + gap), y, width: buttonWidth, height: 47 };
      this.toolButtons[name] = rect;
      roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 14);
      this.context.fillStyle = this.toolUsed[name] ? "rgba(77,82,68,0.55)" : "#fff8dc";
      this.context.fill();
      this.context.strokeStyle = this.toolUsed[name] ? "rgba(255,255,255,0.16)" : "#b27338";
      this.context.lineWidth = 2;
      this.context.stroke();
      this.context.fillStyle = this.toolUsed[name] ? "rgba(255,255,255,0.6)" : "#6a4728";
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.font = "bold 14px sans-serif";
      this.context.fillText(this.toolUsed[name] ? `${labels[name]} ✓` : labels[name], rect.x + rect.width / 2, rect.y + 24);
    });
  }

  private drawTemporaryArea(): void {
    this.temporaryRects = [];
    if (this.temporaryTiles.length === 0) {
      return;
    }

    const cellSize = 36;
    const gap = 5;
    const areaWidth = 62 + cellSize * 3 + gap * 2;
    const x = (this.width - areaWidth) / 2;
    const y = this.height - 254;
    roundedRect(this.context, x, y, areaWidth, 42, 14);
    this.context.fillStyle = "rgba(255,248,218,0.95)";
    this.context.fill();
    this.context.strokeStyle = "#9f6734";
    this.context.lineWidth = 2;
    this.context.stroke();
    this.context.fillStyle = "#6b482b";
    this.context.font = "bold 11px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText("暂存区", x + 31, y + 21);

    for (let index = 0; index < 3; index += 1) {
      const rect = { x: x + 58 + index * (cellSize + gap), y: y + 3, width: cellSize, height: cellSize };
      this.temporaryRects.push(rect);
      roundedRect(this.context, rect.x, rect.y, rect.width, rect.height, 8);
      this.context.fillStyle = "rgba(255,255,255,0.72)";
      this.context.fill();
      const tile = this.temporaryTiles[index];
      if (tile) {
        drawItemIcon(this.context, tile.type, rect.x + cellSize / 2, rect.y + cellSize / 2, cellSize * 0.76);
      }
    }
  }

  private drawSlots(): void {
    const gap = 4;
    const outerX = 9;
    const outerY = this.height - 143;
    const outerWidth = this.width - 18;
    const outerHeight = 82;
    roundedRect(this.context, outerX, outerY, outerWidth, outerHeight, 18);
    this.context.fillStyle = "#79502d";
    this.context.fill();
    this.context.strokeStyle = "#4d311d";
    this.context.lineWidth = 3;
    this.context.stroke();

    this.context.fillStyle = "#fff1b7";
    this.context.font = "bold 12px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText("收 集 槽 · 满 7 格 挑 战 失 败", this.width / 2, outerY + 14);

    const horizontalPadding = 17;
    const slotSize = Math.min(44, (this.width - horizontalPadding * 2 - gap * 6) / 7);
    const totalWidth = slotSize * 7 + gap * 6;
    const startX = (this.width - totalWidth) / 2;
    const startY = outerY + 27;
    for (let index = 0; index < 7; index += 1) {
      const x = startX + index * (slotSize + gap);
      roundedRect(this.context, x, startY, slotSize, slotSize, 9);
      this.context.fillStyle = "rgba(255,248,221,0.92)";
      this.context.fill();
      this.context.strokeStyle = "rgba(71,43,23,0.42)";
      this.context.lineWidth = 1;
      this.context.stroke();
      const tile = this.slots.items[index];
      if (tile) {
        drawItemIcon(this.context, tile.type, x + slotSize / 2, startY + slotSize / 2, slotSize * 0.78);
      }
    }
  }

  private drawToast(): void {
    const y = this.height - 240;
    roundedRect(this.context, 58, y, this.width - 116, 34, 17);
    this.context.fillStyle = "rgba(45,59,42,0.82)";
    this.context.fill();
    this.context.fillStyle = "#fff8d8";
    this.context.font = "bold 12px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(this.toast, this.width / 2, y + 17);
  }

  private drawResultOverlay(): void {
    this.context.fillStyle = "rgba(33,47,34,0.68)";
    this.context.fillRect(0, 0, this.width, this.height);
    const panelWidth = Math.min(320, this.width - 36);
    const panelHeight = 238;
    const panelX = (this.width - panelWidth) / 2;
    const panelY = (this.height - panelHeight) / 2 - 12;
    roundedRect(this.context, panelX, panelY, panelWidth, panelHeight, 26);
    this.context.fillStyle = "#fff9df";
    this.context.fill();
    this.context.strokeStyle = "#b77a38";
    this.context.lineWidth = 3;
    this.context.stroke();

    const title = this.status === "stageClear" ? "第一关完成！" : this.status === "won" ? "大丰收！" : "槽位塞满了";
    const subtitle = this.status === "stageClear"
      ? "小摊只是热身，真正的大堆来了"
      : this.status === "won"
        ? "两关全部清空，今天的挑战成功"
        : "优先凑齐已有物品，再试一次吧";
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

    this.primaryButton = {
      x: panelX + 38,
      y: panelY + 164,
      width: panelWidth - 76,
      height: 50,
    };
    const label = this.status === "stageClear" ? "进入丰收大堆" : "重新挑战";
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

  private isPointInRect(point: TapPoint, rect: Rect): boolean {
    return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
  }
}
