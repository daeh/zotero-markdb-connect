/**
 * Group ids by key, in insertion order.
 *
 * Returns a `Map`, so keys such as `constructor` or `__proto__` are ordinary entries instead of
 * inherited `Object.prototype` members.
 */
export function indexIdsByKey(pairs: Iterable<readonly [key: string, id: number]>): Map<string, number[]> {
  const index = new Map<string, number[]>()
  for (const [key, id] of pairs) {
    const ids = index.get(key)
    if (ids === undefined) {
      index.set(key, [id])
    } else {
      ids.push(id)
    }
  }
  return index
}
