import { Tile } from "./Tile";

export interface DropMove {
  tile: Tile;
  fromY: number;
  toY: number;
}

export class DropSystem {
  public constructor(private readonly sceneBottom: number) {}

  public release(tiles: readonly Tile[], removed: Tile): DropMove[] {
    if (removed.layer === 0) {
      return [];
    }

    const moves: DropMove[] = [];
    for (const tile of tiles) {
      if (tile.removed || tile.layer >= removed.layer || this.getOverlapRatio(tile, removed) < 0.08) {
        continue;
      }

      const depth = removed.layer - tile.layer;
      const distance = 16 + depth * 7;
      const maxY = this.sceneBottom - tile.height - 8;
      const toY = Math.min(maxY, tile.y + distance);
      if (toY > tile.y + 0.5) {
        moves.push({ tile, fromY: tile.y, toY });
      }
    }
    return moves;
  }

  private getOverlapRatio(lower: Tile, upper: Tile): number {
    const overlapWidth = Math.max(
      0,
      Math.min(lower.x + lower.width, upper.x + upper.width) - Math.max(lower.x, upper.x),
    );
    const overlapHeight = Math.max(
      0,
      Math.min(lower.y + lower.height, upper.y + upper.height) - Math.max(lower.y, upper.y),
    );
    return (overlapWidth * overlapHeight) / (lower.width * lower.height);
  }
}
