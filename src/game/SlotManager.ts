import { Tile } from "./Tile";

export interface SlotUpdate {
  accepted: boolean;
  matched: Tile[];
  isFull: boolean;
}

export class SlotManager {
  private readonly tiles: Tile[] = [];

  public constructor(public readonly capacity = 7) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("槽位数量必须是正整数");
    }
  }

  public get size(): number {
    return this.tiles.length;
  }

  public get items(): readonly Tile[] {
    return this.tiles;
  }

  public add(tile: Tile): SlotUpdate {
    if (this.tiles.length >= this.capacity) {
      return { accepted: false, matched: [], isFull: true };
    }

    const lastSameTypeIndex = this.findLastTypeIndex(tile.type);
    const insertIndex = lastSameTypeIndex === -1 ? this.tiles.length : lastSameTypeIndex + 1;
    this.tiles.splice(insertIndex, 0, tile);

    const firstSameTypeIndex = this.tiles.findIndex((item) => item.type === tile.type);
    const sameTypeCount = this.tiles.reduce(
      (count, item) => count + (item.type === tile.type ? 1 : 0),
      0,
    );
    const matched = sameTypeCount >= 3 ? this.tiles.splice(firstSameTypeIndex, 3) : [];

    return {
      accepted: true,
      matched,
      isFull: this.tiles.length >= this.capacity,
    };
  }

  public remove(tileId: number): Tile | undefined {
    const index = this.tiles.findIndex((tile) => tile.id === tileId);
    if (index === -1) {
      return undefined;
    }
    return this.tiles.splice(index, 1)[0];
  }

  public countType(type: Tile["type"]): number {
    return this.tiles.reduce((count, tile) => count + (tile.type === type ? 1 : 0), 0);
  }

  public reset(): void {
    this.tiles.length = 0;
  }

  private findLastTypeIndex(type: Tile["type"]): number {
    for (let index = this.tiles.length - 1; index >= 0; index -= 1) {
      if (this.tiles[index].type === type) {
        return index;
      }
    }
    return -1;
  }
}
