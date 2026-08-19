import assert from 'node:assert/strict'
import { test } from 'node:test'

import { stripAndDecodeNotePrefix } from '../../src/utils/noteName.ts'

void test('strips a matching prefix and URL-decodes the remainder', () => {
  assert.deepEqual(stripAndDecodeNotePrefix('prefix%2Ffoo%20bar', 'prefix'), {
    value: '/foo bar',
    malformedEncoding: false,
  })
})

void test('decodes even when the prefix does not match', () => {
  assert.deepEqual(stripAndDecodeNotePrefix('foo%20bar', 'nomatch'), {
    value: 'foo bar',
    malformedEncoding: false,
  })
})

void test('an empty prefix leaves the name intact (still decoded)', () => {
  assert.deepEqual(stripAndDecodeNotePrefix('a%2Fb', ''), { value: 'a/b', malformedEncoding: false })
})

void test('malformed %-encoding is reported without throwing (value left undecoded)', () => {
  const r = stripAndDecodeNotePrefix('bad%zz', '')
  assert.equal(r.malformedEncoding, true)
  assert.equal(r.value, 'bad%zz')
})

void test('a regex-metacharacter prefix is matched literally (regex-injection regression lock)', () => {
  assert.equal(stripAndDecodeNotePrefix('a.b[c', 'a.b[').value, 'c')
  assert.equal(stripAndDecodeNotePrefix('axbYc', 'a.b[').value, 'axbYc')
})
