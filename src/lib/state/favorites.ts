export function hasFavorite(ids: readonly string[], id: string): boolean {
  return ids.includes(id);
}

export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return hasFavorite(ids, id)
    ? ids.filter((favoriteId) => favoriteId !== id)
    : [...ids, id];
}
