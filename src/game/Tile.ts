import type { ItemType } from "../data/ItemConfig";

export interface TileOptions {
  id: number;
  type: ItemType;
  x: number;
  y: number;
  width: number;
  height: number;
  layer?: number;
  rotation?: number;
}

export class Tile {
  public readonly id: number;
  public readonly type: ItemType;
  public x: number;
  public y: number;
  public width: number;
  public height: number;
  public layer: number;
  public rotation: number;
  public blocked = false;
  public removed = false;

  public constructor(options: TileOptions) {
    this.id = options.id;
    this.type = options.type;
    this.x = options.x;
    this.y = options.y;
    this.width = options.width;
    this.height = options.height;
    this.layer = options.layer ?? 0;
    this.rotation = options.rotation ?? 0;
  }

  public containsPoint(x: number, y: number): boolean {
    return (
      !this.removed &&
      !this.blocked &&
      x >= this.x &&
      x <= this.x + this.width &&
      y >= this.y &&
      y <= this.y + this.height
    );
  }
}
