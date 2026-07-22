import assert from 'node:assert/strict'
import { test } from 'node:test'

import { assembleDump, JSON_UNSERIALIZABLE, safeJsonClone, safeJsonObjectClone } from '../src/utils/json.ts'

void test('safeJsonClone deep-clones plain JSON data', () => {
  const input = { a: 1, b: [2, 'x'], c: null, d: { e: true } }
  const cloned = safeJsonClone(input)
  assert.deepEqual(cloned, input)
  assert.notEqual(cloned, input)
})

void test('safeJsonClone returns the sentinel for non-serializable inputs (never throws)', () => {
  assert.equal(safeJsonClone(undefined), JSON_UNSERIALIZABLE)
  assert.equal(
    safeJsonClone(() => 1),
    JSON_UNSERIALIZABLE,
  )
  assert.equal(safeJsonClone(Symbol('s')), JSON_UNSERIALIZABLE)
  assert.equal(safeJsonClone(10n), JSON_UNSERIALIZABLE)
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  assert.equal(safeJsonClone(cyclic), JSON_UNSERIALIZABLE)
  assert.equal(
    safeJsonClone({
      get x() {
        throw new Error('boom')
      },
    }),
    JSON_UNSERIALIZABLE,
  )
})

void test('safeJsonObjectClone always yields a plain object', () => {
  assert.deepEqual(safeJsonObjectClone({ a: 1 }), { a: 1 })
  // A primitive from `toJSON()` triggers the object fallback.
  assert.deepEqual(safeJsonObjectClone({ toJSON: () => 'x' }), { error: JSON_UNSERIALIZABLE })
  assert.deepEqual(safeJsonObjectClone(null), { error: JSON_UNSERIALIZABLE })
  assert.deepEqual(safeJsonObjectClone([1, 2]), { error: JSON_UNSERIALIZABLE })
})

void test('assembleDump produces a JSON.stringify-able dump preserving structure', () => {
  const dump = assembleDump({
    info: { timestamp: '2026-07-21T00:00:00Z' },
    config: {},
    logs: { k: { msg: 'hi', td: 5 } },
    data: {},
  })
  assert.equal(typeof dump.info.timestamp, 'string')
  assert.doesNotThrow(() => JSON.stringify(dump))
  assert.deepEqual(dump.logs, { k: { msg: 'hi', td: 5 } })
})
