import type { QuoteItem, Room } from './types';

export const isCompositeItem = (item: QuoteItem) =>
  item.itemType === 'composite';

export function orderedCompositeChildren(room: Room, parent: QuoteItem) {
  const children = room.items.filter(
    (item) => item.parentItemId === parent.id && !isCompositeItem(item),
  );
  const positions = new Map(
    (Array.isArray(parent.childrenOrder) ? parent.childrenOrder : []).map(
      (id, index) => [id, index],
    ),
  );
  return children.sort((a, b) => {
    const aPosition = positions.get(a.id);
    const bPosition = positions.get(b.id);
    if (aPosition === undefined && bPosition === undefined)
      return room.items.indexOf(a) - room.items.indexOf(b);
    if (aPosition === undefined) return 1;
    if (bPosition === undefined) return -1;
    return aPosition - bPosition;
  });
}

export function normalizeCompositeItems(items: QuoteItem[]) {
  const compositeIds = new Set(
    items.filter(isCompositeItem).map((item) => item.id),
  );
  const normalized: QuoteItem[] = items.map((item): QuoteItem => {
    if (isCompositeItem(item)) {
      const { parentItemId: _parentItemId, ...parent } = item;
      return {
        ...parent,
        childrenOrder: Array.isArray(parent.childrenOrder)
          ? parent.childrenOrder
          : [],
      };
    }
    if (
      !item.parentItemId ||
      item.parentItemId === item.id ||
      !compositeIds.has(item.parentItemId)
    ) {
      const { parentItemId: _parentItemId, childrenOrder: _childrenOrder, ...root } =
        item;
      return root;
    }
    const { childrenOrder: _childrenOrder, ...child } = item;
    return child;
  });
  const byId = new Map(normalized.map((item) => [item.id, item]));
  return normalized.map((item) => {
    if (!isCompositeItem(item)) return item;
    const linked = normalized.filter(
      (candidate) => candidate.parentItemId === item.id,
    );
    const seen = new Set<string>();
    const childrenOrder = [
      ...(Array.isArray(item.childrenOrder) ? item.childrenOrder : []),
      ...linked.map((c) => c.id),
    ]
      .filter((id) => {
        const child = byId.get(id);
        if (!child || child.parentItemId !== item.id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    return { ...item, childrenOrder };
  });
}

export function removeItemTree(items: QuoteItem[], itemId: string) {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) return items;
  if (isCompositeItem(item))
    return items.filter(
      (candidate) => candidate.id !== itemId && candidate.parentItemId !== itemId,
    );
  return items
    .filter((candidate) => candidate.id !== itemId)
    .map((candidate) =>
      isCompositeItem(candidate)
        ? {
            ...candidate,
            childrenOrder: (candidate.childrenOrder ?? []).filter(
              (id) => id !== itemId,
            ),
          }
        : candidate,
    );
}

export function moveCompositeChild(
  items: QuoteItem[],
  parentId: string,
  childId: string,
  direction: -1 | 1,
) {
  return items.map((item) => {
    if (item.id !== parentId || !isCompositeItem(item)) return item;
    const order = [...(item.childrenOrder ?? [])];
    const index = order.indexOf(childId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= order.length) return item;
    [order[index], order[target]] = [order[target], order[index]];
    return { ...item, childrenOrder: order };
  });
}
