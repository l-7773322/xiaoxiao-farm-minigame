import { ITEM_TYPES, ITEM_VISUALS, type ItemType } from "../data/ItemConfig";
import { SlotManager } from "../game/SlotManager";
import { Tile } from "../game/Tile";
import { WechatRuntime, type TapPoint } from "../platform/WechatRuntime";
import { drawItemIcon, roundedRect } from "../ui/CanvasDrawing";

type GameStatus = "playing" | "won" | "lost";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class GameManager {
  private readonly slots = new SlotManager(7);
  private readonly context: MiniGameCanvasContext2D;
  private readonly width: number;
  private readonly height: number;
  private sceneTiles: Tile[] = [];
  private status: GameStatus = "playing";
  private restartButton: Rect = { x: 0, y: 0, width: 0, height: 0 };

  public constructor(private readonly runtime: WechatRuntime) {
    this.context = runtime.surface.context;
    this.width = runtime.surface.width;
    this.height = runtime.surface.height;
  }

  public start(): void {
    this.reset();
    this.runtime.onTap((point) => this.handleTap(point));
  }

  private reset(): void {
    this.status = "playing";
    this.slots.reset();
    this.sceneTiles = this.createDemoTiles();
    this.render();
  }

  private createDemoTiles(): Tile[] {
    const horizontalPadding = 20;
    const gap = 10;
    const columns = 4;
    const availableWidth = this.width - horizontalPadding * 2 - gap * (columns - 1);
    const tileSize = Math.min(76, Math.max(52, availableWidth / columns));
    const gridWidth = tileSize * columns + gap * (columns - 1);
    const startX = (this.width - gridWidth) / 2;
    const startY = Math.max(106, this.height * 0.17);

    const orderedTypes: ItemType[] = [
      "apple",
      "corn",
      "pumpkin",
      "berry",
      "corn",
      "berry",
      "apple",
      "pumpkin",
      "pumpkin",
      "apple",
      "berry",
      "corn",
    ];

    return orderedTypes.map((type, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      return new Tile({
        id: index + 1,
        type,
        x: startX + column * (tileSize + gap),
        y: startY + row * (tileSize + gap),
        width: tileSize,
        height: tileSize,
        layer: 0,
        rotation: 0,
      });
    });
  }

  private handleTap(point: TapPoint): void {
    if (this.status !== "playing") {
      if (this.isPointInRect(point, this.restartButton)) {
        this.reset();
      }
      return;
    }

    const tile = [...this.sceneTiles]
      .sort((left, right) => right.layer - left.layer || right.id - left.id)
      .find((candidate) => candidate.containsPoint(point.x, point.y));

    if (!tile) {
      return;
    }

    tile.removed = true;
    const update = this.slots.add(tile);
    if (!update.accepted) {
      tile.removed = false;
      return;
    }

    if (this.sceneTiles.every((candidate) => candidate.removed) && this.slots.size === 0) {
      this.status = "won";
    } else if (update.isFull) {
      this.status = "lost";
    }

    this.render();
  }

  private render(): void {
    this.drawBackground();
    this.drawHeader();
    this.drawScene();
    this.drawSlots();

    if (this.status !== "playing") {
      this.drawResultOverlay();
    }
  }

  private drawBackground(): void {
    const gradient = this.context.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, "#e4f6ec");
    gradient.addColorStop(0.55, "#f8f3df");
    gradient.addColorStop(1, "#f7e7c7");
    this.context.fillStyle = gradient;
    this.context.fillRect(0, 0, this.width, this.height);

    this.context.fillStyle = "rgba(89, 164, 104, 0.10)";
    this.context.beginPath();
    this.context.arc(this.width * 0.13, this.height * 0.16, 82, 0, Math.PI * 2);
    this.context.fill();
    this.context.beginPath();
    this.context.arc(this.width * 0.88, this.height * 0.38, 115, 0, Math.PI * 2);
    this.context.fill();
  }

  private drawHeader(): void {
    const remaining = this.sceneTiles.filter((tile) => !tile.removed).length;
    this.context.fillStyle = "#315b3b";
    this.context.font = "bold 24px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText("消消农场", this.width / 2, 38);

    this.context.fillStyle = "#67816b";
    this.context.font = "14px sans-serif";
    this.context.fillText(`测试关卡 · 剩余 ${remaining}`, this.width / 2, 68);
    this.context.fillText("点击物品，凑齐 3 个即可消除", this.width / 2, 90);
  }

  private drawScene(): void {
    for (const tile of this.sceneTiles) {
      if (tile.removed) {
        continue;
      }

      this.context.save();
      this.context.shadowColor = "rgba(70, 77, 51, 0.18)";
      this.context.shadowBlur = 8;
      this.context.shadowOffsetY = 4;
      roundedRect(this.context, tile.x, tile.y, tile.width, tile.height, 16);
      this.context.fillStyle = "#fffdf7";
      this.context.fill();
      this.context.restore();

      drawItemIcon(
        this.context,
        tile.type,
        tile.x + tile.width / 2,
        tile.y + tile.height * 0.43,
        tile.width * 0.62,
      );
      this.context.fillStyle = "#53604e";
      this.context.font = `bold ${Math.max(11, tile.width * 0.16)}px sans-serif`;
      this.context.textAlign = "center";
      this.context.textBaseline = "middle";
      this.context.fillText(
        ITEM_VISUALS[tile.type].label,
        tile.x + tile.width / 2,
        tile.y + tile.height * 0.82,
      );
    }
  }

  private drawSlots(): void {
    const gap = 5;
    const horizontalPadding = 16;
    const slotSize = Math.min(48, (this.width - horizontalPadding * 2 - gap * 6) / 7);
    const totalWidth = slotSize * 7 + gap * 6;
    const startX = (this.width - totalWidth) / 2;
    const startY = this.height - slotSize - 34;

    this.context.fillStyle = "#526c51";
    this.context.font = "bold 14px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText("收集槽", this.width / 2, startY - 18);

    for (let index = 0; index < 7; index += 1) {
      const x = startX + index * (slotSize + gap);
      roundedRect(this.context, x, startY, slotSize, slotSize, 10);
      this.context.fillStyle = index < this.slots.size ? "#fffdf8" : "rgba(255, 255, 255, 0.48)";
      this.context.fill();
      this.context.strokeStyle = "rgba(76, 108, 78, 0.24)";
      this.context.lineWidth = 1;
      this.context.stroke();

      const tile = this.slots.items[index];
      if (tile) {
        drawItemIcon(
          this.context,
          tile.type,
          x + slotSize / 2,
          startY + slotSize / 2,
          slotSize * 0.72,
        );
      }
    }
  }

  private drawResultOverlay(): void {
    this.context.fillStyle = "rgba(37, 55, 39, 0.62)";
    this.context.fillRect(0, 0, this.width, this.height);

    const panelWidth = Math.min(310, this.width - 40);
    const panelHeight = 190;
    const panelX = (this.width - panelWidth) / 2;
    const panelY = (this.height - panelHeight) / 2;
    roundedRect(this.context, panelX, panelY, panelWidth, panelHeight, 24);
    this.context.fillStyle = "#fffaf0";
    this.context.fill();

    this.context.fillStyle = this.status === "won" ? "#3b8550" : "#d06445";
    this.context.font = "bold 30px sans-serif";
    this.context.textAlign = "center";
    this.context.textBaseline = "middle";
    this.context.fillText(this.status === "won" ? "闯关成功" : "槽位已满", this.width / 2, panelY + 52);

    this.context.fillStyle = "#6b7568";
    this.context.font = "15px sans-serif";
    this.context.fillText(
      this.status === "won" ? "四组农场物品全部消除" : "调整点击顺序，再试一次吧",
      this.width / 2,
      panelY + 88,
    );

    this.restartButton = {
      x: panelX + 42,
      y: panelY + 116,
      width: panelWidth - 84,
      height: 48,
    };
    roundedRect(
      this.context,
      this.restartButton.x,
      this.restartButton.y,
      this.restartButton.width,
      this.restartButton.height,
      16,
    );
    this.context.fillStyle = "#62a85f";
    this.context.fill();
    this.context.fillStyle = "#ffffff";
    this.context.font = "bold 17px sans-serif";
    this.context.fillText("重新开始", this.width / 2, this.restartButton.y + 24);
  }

  private isPointInRect(point: TapPoint, rect: Rect): boolean {
    return (
      point.x >= rect.x &&
      point.x <= rect.x + rect.width &&
      point.y >= rect.y &&
      point.y <= rect.y + rect.height
    );
  }
}
