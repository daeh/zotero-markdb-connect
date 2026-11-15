import assert from 'node:assert/strict'
import { test } from 'node:test'

import { indexIdsByKey } from '../../src/utils/keyIndex.ts'

void test('groups ids under each key in insertion order', () => {
  const index = indexIdsByKey([
    ['smith2020', 1],
    ['jones2021', 2],
    ['smith2020', 3],
  ])
  assert.deepEqual(
    [...index],
    [
      ['smith2020', [1, 3]],
      ['jones2021', [2]],
    ],
  )
})

void test('treats Object.prototype member names as ordinary keys', () => {
  const names = ['constructor', 'toString', 'hasOwnProperty', '__proto__']
  const index = indexIdsByKey(names.flatMap((name, i) => [[name, i] as const, [name, i + 10] as const]))
  for (const [i, name] of names.entries()) {
    assert.deepEqual(index.get(name), [i, i + 10], name)
  }
})

void test('reports no ids for an Object.prototype member name that was never indexed', () => {
  const index = indexIdsByKey([['smith2020', 1]])
  for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(index.get(name), undefined, name)
  }
})
