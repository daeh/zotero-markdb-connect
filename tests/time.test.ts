import assert from 'node:assert/strict'
import { test } from 'node:test'

import { elapsedMs, formatTimestamp } from '../src/utils/time.ts'

void test('elapsedMs returns the exact integer millisecond difference', () => {
  const from = Temporal.Instant.fromEpochMilliseconds(1_000)
  const to = Temporal.Instant.fromEpochMilliseconds(1_250)
  const delta = elapsedMs(from, to)
  assert.equal(delta, 250)
  assert.ok(Number.isInteger(delta))
})

void test('elapsedMs is zero for identical instants', () => {
  const i = Temporal.Instant.fromEpochMilliseconds(42)
  assert.equal(elapsedMs(i, i), 0)
})

void test('elapsedMs can be negative when `to` precedes `from`', () => {
  const from = Temporal.Instant.fromEpochMilliseconds(500)
  const to = Temporal.Instant.fromEpochMilliseconds(200)
  assert.equal(elapsedMs(from, to), -300)
})

void test('formatTimestamp returns the ISO string of a zoned datetime', () => {
  const zdt = Temporal.ZonedDateTime.from('2026-07-21T12:34:56.789-04:00[America/New_York]')
  const s = formatTimestamp(zdt)
  assert.equal(typeof s, 'string')
  assert.ok(s.startsWith('2026-07-21T12:34:56.789-04:00'))
})
