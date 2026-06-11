export interface NavLink {
  href: string;
  label: string;
}
export interface NavGroup {
  label: string;
  items: NavLink[];
}
export type NavEntry = NavLink | NavGroup;

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return (entry as NavGroup).items !== undefined;
}

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export const NAV: NavEntry[] = [
  {
    label: "Compendium",
    items: [
      { href: "/compendium", label: "Overview" },
      { href: "/items", label: "Items" },
      { href: "/cargo", label: "Cargo" },
      { href: "/buildings", label: "Buildings" },
      { href: "/recipes", label: "Recipes" },
      { href: "/resources", label: "Resources" },
      { href: "/creatures", label: "Creatures" },
    ],
  },
  { href: "/calculator", label: "Calculator" },
  { href: "/map", label: "Map" },
  {
    label: "Data",
    items: [
      { href: "/market", label: "Market" },
      { href: "/settlements", label: "Settlements" },
      { href: "/empires", label: "Empires" },
      { href: "/players", label: "Players" },
      { href: "/leaderboards", label: "Leaderboards" },
    ],
  },
  { href: "/blog", label: "Blog" },
];
