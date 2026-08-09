export const ITEM_TYPES = [
  "apple",
  "corn",
  "pumpkin",
  "berry",
  "carrot",
  "eggplant",
  "mushroom",
  "milk",
  "bread",
  "egg",
  "pepper",
  "potato",
] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export interface ItemVisual {
  label: string;
  color: string;
  accent: string;
}

export const ITEM_VISUALS: Record<ItemType, ItemVisual> = {
  apple: { label: "苹果", color: "#ef514c", accent: "#67a83f" },
  corn: { label: "玉米", color: "#f5c83c", accent: "#6cab42" },
  pumpkin: { label: "南瓜", color: "#ef8732", accent: "#568d3e" },
  berry: { label: "莓果", color: "#d94f72", accent: "#69a545" },
  carrot: { label: "胡萝卜", color: "#f47b2d", accent: "#58a249" },
  eggplant: { label: "茄子", color: "#7751a7", accent: "#65a644" },
  mushroom: { label: "蘑菇", color: "#df765c", accent: "#f6dfbe" },
  milk: { label: "牛奶", color: "#f5fbff", accent: "#4d91c9" },
  bread: { label: "面包", color: "#d99445", accent: "#f2c775" },
  egg: { label: "鸡蛋", color: "#fff4d9", accent: "#efb846" },
  pepper: { label: "甜椒", color: "#55a64e", accent: "#2f783b" },
  potato: { label: "土豆", color: "#b98255", accent: "#805735" },
};
