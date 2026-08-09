export const ITEM_TYPES = ["apple", "corn", "pumpkin", "berry"] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export interface ItemVisual {
  label: string;
  color: string;
  accent: string;
}

export const ITEM_VISUALS: Record<ItemType, ItemVisual> = {
  apple: { label: "苹果", color: "#ef5b55", accent: "#7abf45" },
  corn: { label: "玉米", color: "#f3c746", accent: "#72aa43" },
  pumpkin: { label: "南瓜", color: "#f28c3c", accent: "#5f9b45" },
  berry: { label: "莓果", color: "#d85f7d", accent: "#68a84b" },
};
