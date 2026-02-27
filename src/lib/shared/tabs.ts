export type ReorderPosition = 'before' | 'after';

export const slugifyTabId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'tab';

export const reorderById = <T extends { id: string }>(
  items: T[],
  fromId: string,
  toId: string,
  position: ReorderPosition
) => {
  if (!fromId || !toId || fromId === toId) return items;
  const fromIndex = items.findIndex((item) => item.id === fromId);
  const toIndex = items.findIndex((item) => item.id === toId);
  if (fromIndex < 0 || toIndex < 0) return items;

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return items;
  const targetIndex = next.findIndex((item) => item.id === toId);
  if (targetIndex < 0) return items;
  const insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
  next.splice(Math.max(0, Math.min(next.length, insertIndex)), 0, moved);
  return next;
};
