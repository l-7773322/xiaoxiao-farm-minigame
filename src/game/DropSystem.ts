import { Tile } from "./Tile";
import { PileLayout, type PileBounds } from "./PileLayout";

export interface DropMove {
  tile: Tile;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}

export class DropSystem {
  private readonly layout = new PileLayout();

  public constructor(private readonly bounds: PileBounds) {}

  public release(tiles: readonly Tile[], removed: Tile): DropMove[] {
    return this.layout.compute(tiles, this.bounds)
      .filter(({ tile, x, y }) => Math.abs(tile.x - x) > 0.5 || Math.abs(tile.y - y) > 0.5)
      .map(({ tile, x, y, layerRank, sequence }) => ({
        tile,
        fromX: tile.x,
        fromY: tile.y,
        toX: x,
        toY: y,
        delay: tile.layer === removed.layer
          ? 0
          : 70 + layerRank * 42,
      }));
  }
}
