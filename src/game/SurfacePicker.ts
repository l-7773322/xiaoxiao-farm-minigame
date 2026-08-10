import { Tile } from "./Tile";

export interface SurfacePoint {
  x: number;
  y: number;
}

/** Returns only the tile whose visible surface is directly under the tap. */
export function pickVisibleSurface(tiles: readonly Tile[], point: SurfacePoint): Tile | undefined {
  return tiles
    .filter((tile) => !tile.removed && tile.containsPoint(point.x, point.y))
    .sort((left, right) => right.layer - left.layer || right.id - left.id)[0];
}
