import { useState } from "react";

export type SortDir = "asc" | "desc";

export function useSortable() {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return { sortKey, sortDir, handleSort };
}

export function applySortable<T>(
  items: T[],
  sortKey: string | null,
  sortDir: SortDir,
  getValue: (key: string, item: T) => string | number | null | undefined
): T[] {
  if (!sortKey) return items;
  return [...items].sort((a, b) => {
    const av = getValue(sortKey, a);
    const bv = getValue(sortKey, b);
    if (av == null && bv == null) return 0;
    if (av == null) return sortDir === "asc" ? 1 : -1;
    if (bv == null) return sortDir === "asc" ? -1 : 1;
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    return sortDir === "asc"
      ? String(av).toLowerCase().localeCompare(String(bv).toLowerCase())
      : String(bv).toLowerCase().localeCompare(String(av).toLowerCase());
  });
}
