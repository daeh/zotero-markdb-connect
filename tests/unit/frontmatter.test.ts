import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readFrontmatterScalar } from '../../src/utils/frontmatter.ts'

const note = (...lines: string[]): string => ['---', ...lines, '---', '# Body'].join('\n')

void test('reads a plain value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: saxe2017emobtom'), 'citekey'), 'saxe2017emobtom')
})

void test('keeps an apostrophe inside a plain value', () => {
  assert.equal(readFrontmatterScalar(note("citekey: O'Neil2020"), 'citekey'), "O'Neil2020")
})

void test('unescapes a single-quoted value', () => {
  assert.equal(readFrontmatterScalar(note("citekey: 'O''Neil2020'"), 'citekey'), "O'Neil2020")
})

void test('unescapes a double-quoted value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: "Smith\\"2020"'), 'citekey'), 'Smith"2020')
})

void test('keeps whitespace inside a value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: Smith 2020'), 'citekey'), 'Smith 2020')
  assert.equal(readFrontmatterScalar(note('citekey: "Smith 2020"'), 'citekey'), 'Smith 2020')
})

void test('treats a YAML null as no value', () => {
  for (const value of ['null', 'Null', 'NULL', '~', '']) {
    assert.equal(readFrontmatterScalar(note(`citekey: ${value}`.trimEnd()), 'citekey'), undefined, value)
  }
})

void test('treats a quoted "null" as a real value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: "null"'), 'citekey'), 'null')
  assert.equal(readFrontmatterScalar(note("citekey: 'null'"), 'citekey'), 'null')
})

void test('keeps the source text of plain values that YAML would type', () => {
  for (const value of ['2020', '1e3', '0x1F', 'true']) {
    assert.equal(readFrontmatterScalar(note(`citekey: ${value}`), 'citekey'), value)
  }
})

void test('strips a trailing comment', () => {
  assert.equal(readFrontmatterScalar(note('citekey: smith2020 # imported'), 'citekey'), 'smith2020')
})

void test('trims whitespace around a quoted value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: " smith2020 "'), 'citekey'), 'smith2020')
})

void test('reads only top-level keys', () => {
  assert.equal(readFrontmatterScalar(note('meta:', '  citekey: smith2020'), 'citekey'), undefined)
})

void test('ignores collection values', () => {
  assert.equal(readFrontmatterScalar(note('citekey: [smith2020]'), 'citekey'), undefined)
  assert.equal(readFrontmatterScalar(note('citekey:', '  id: smith2020'), 'citekey'), undefined)
})

void test('returns undefined for a missing key', () => {
  assert.equal(readFrontmatterScalar(note('title: T'), 'citekey'), undefined)
})

void test('matches the key literally', () => {
  assert.equal(readFrontmatterScalar(note('citeXkey: wrong', 'cite.key: right'), 'cite.key'), 'right')
})

void test('uses the first of duplicate keys', () => {
  assert.equal(readFrontmatterScalar(note('citekey: first', 'citekey: second'), 'citekey'), 'first')
})

void test('requires frontmatter at the start of the file', () => {
  assert.equal(readFrontmatterScalar(['Intro', '---', 'citekey: smith2020', '---'].join('\n'), 'citekey'), undefined)
})

void test('requires a closing delimiter', () => {
  assert.equal(readFrontmatterScalar(['---', 'citekey: smith2020', '# Body'].join('\n'), 'citekey'), undefined)
})

void test('accepts "..." as the closing delimiter', () => {
  assert.equal(readFrontmatterScalar(['---', 'citekey: smith2020', '...', 'Body'].join('\n'), 'citekey'), 'smith2020')
})

void test('ignores the key in the body after the frontmatter', () => {
  assert.equal(readFrontmatterScalar(note('title: T') + '\ncitekey: smith2020', 'citekey'), undefined)
})

void test('handles CRLF line endings', () => {
  assert.equal(
    readFrontmatterScalar(note('title: T', 'citekey: smith2020').replaceAll('\n', '\r\n'), 'citekey'),
    'smith2020',
  )
})

void test('tolerates a leading byte order mark', () => {
  assert.equal(readFrontmatterScalar(String.fromCodePoint(0xfeff) + note('citekey: smith2020'), 'citekey'), 'smith2020')
})

void test('reads the key despite a syntax error in an earlier field', () => {
  assert.equal(readFrontmatterScalar(note('title: Theory: A Review', 'citekey: smith2020'), 'citekey'), 'smith2020')
})

void test('reads the key despite stray quotes in an earlier quoted field', () => {
  assert.equal(readFrontmatterScalar(note('title: "The "hard" problem"', 'citekey: smith2020'), 'citekey'), 'smith2020')
})

void test('does not read a key line that YAML parses as part of an unterminated string', () => {
  assert.equal(readFrontmatterScalar(note('title: "Unclosed', 'citekey: smith2020'), 'citekey'), undefined)
})

void test('rejects a key entry that is itself invalid YAML', () => {
  assert.equal(readFrontmatterScalar(note('title: Theory: A Review', 'citekey: "smith2020'), 'citekey'), undefined)
})

void test('rejects an unterminated key value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: "smith2020'), 'citekey'), undefined)
})

void test('rejects trailing content after a quoted key value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: "smith2020"junk'), 'citekey'), undefined)
})

void test('does not promote a key nested in a multi-line flow collection', () => {
  const text = note('{meta: {', 'citekey: wrong', '}}', 'broken: Theory: A Review')
  assert.equal(readFrontmatterScalar(text, 'citekey'), undefined)
})

void test('does not read a key line inside a quoted string that follows the root collection', () => {
  assert.equal(readFrontmatterScalar(note('{}', '"title', 'citekey: wrong', 'end"'), 'citekey'), undefined)
})

void test('does not read a key line inside a stray multi-line string', () => {
  assert.equal(readFrontmatterScalar(note('foo: bar', ']', '"title', 'citekey: wrong', 'end"'), 'citekey'), undefined)
})

void test('does not read block scalar content that follows a malformed root header', () => {
  assert.equal(readFrontmatterScalar(note('|0', 'citekey: wrong'), 'citekey'), undefined)
  assert.equal(readFrontmatterScalar(note('foo: bar', '|0', 'citekey: wrong'), 'citekey'), undefined)
})

void test('does not read a key line after a sequence root', () => {
  assert.equal(readFrontmatterScalar(note('- |', '  a', 'citekey: wrong'), 'citekey'), undefined)
})

void test('recovers a key after a multi-line flow collection closed at column 0', () => {
  const seq = note('tags: [', '  one,', '  two', ']', 'citekey: smith2020', 'title: Theory: A Review')
  assert.equal(readFrontmatterScalar(seq, 'citekey'), 'smith2020')
  const map = note('meta: {', '  a: 1', '}', 'citekey: smith2020', 'title: Theory: A Review')
  assert.equal(readFrontmatterScalar(map, 'citekey'), 'smith2020')
})

void test('recovers a key from a consistently indented root mapping', () => {
  assert.equal(readFrontmatterScalar(note('  title: Theory: A Review', '  citekey: smith2020'), 'citekey'), 'smith2020')
})

void test('keeps lines nested under a dedented entry with that entry', () => {
  assert.equal(
    readFrontmatterScalar(note('  title: x', 'meta:', '  citekey: wrong', 'citekey: right'), 'citekey'),
    'right',
  )
  assert.equal(
    readFrontmatterScalar(note('  title: x', 'text: |', '  citekey: wrong', 'citekey: right'), 'citekey'),
    'right',
  )
})

void test('does not read the content of a root block scalar that has a tag or an anchor', () => {
  assert.equal(readFrontmatterScalar(note('foo: bar', '!!str |', 'citekey: wrong'), 'citekey'), undefined)
  assert.equal(readFrontmatterScalar(note('foo: bar', '&a |', 'citekey: wrong'), 'citekey'), undefined)
})

void test('does not split a multi-line implicit key at a stray plain line', () => {
  assert.equal(readFrontmatterScalar(note('title: T', 'foo', 'citekey: wrong'), 'citekey'), undefined)
  assert.equal(readFrontmatterScalar(note('title: T', 'foo', '', 'citekey: wrong'), 'citekey'), undefined)
})

void test('recovers a key after a stray quoted line', () => {
  assert.equal(readFrontmatterScalar(note('title: T', '"foo"', 'citekey: right'), 'citekey'), 'right')
})

void test('does not read a key after a flow mapping root', () => {
  assert.equal(readFrontmatterScalar(note('{citekey: first}', 'citekey: second'), 'citekey'), undefined)
})

void test('does not read a key from a flow mapping line during recovery', () => {
  assert.equal(readFrontmatterScalar(note('title: Theory: A Review', '{citekey: wrong}'), 'citekey'), undefined)
})

void test('recovers a key after an over-indented first line', () => {
  assert.equal(readFrontmatterScalar(note('  title: x', 'citekey: smith2020'), 'citekey'), 'smith2020')
})

void test('does not read a key line after an unterminated flow collection', () => {
  assert.equal(readFrontmatterScalar(note('title: [', 'citekey: wrong', ']'), 'citekey'), undefined)
})

void test('does not read a key line after a quoted value that YAML cuts short', () => {
  assert.equal(readFrontmatterScalar(note('title: "broken', 'citekey: wrong', 'end"'), 'citekey'), undefined)
})

void test('does not read a key line inside a collection that follows a stray bracket', () => {
  const text = note('foo: bar', ']', '{meta: {', 'citekey: wrong', '}}')
  assert.equal(readFrontmatterScalar(text, 'citekey'), undefined)
})

void test('recovers a key that precedes an unterminated value', () => {
  assert.equal(readFrontmatterScalar(note('citekey: smith2020', 'title: "broken'), 'citekey'), 'smith2020')
})

void test('recovers an explicit key with its value line', () => {
  assert.equal(
    readFrontmatterScalar(note('? citekey', ': smith2020', 'broken: Theory: A Review'), 'citekey'),
    'smith2020',
  )
  assert.equal(
    readFrontmatterScalar(note('broken: Theory: A Review', '? citekey', ': smith2020'), 'citekey'),
    'smith2020',
  )
})

void test('recovers a key after a malformed quoted key in another entry', () => {
  assert.equal(readFrontmatterScalar(note('"bad\\q": value', 'citekey: right'), 'citekey'), 'right')
})

void test('attaches a standalone anchor or tag line to the entry after it', () => {
  for (const props of ['&anchor', '!!str']) {
    assert.equal(
      readFrontmatterScalar(note('citekey: right', props, 'title: Theory: Review'), 'citekey'),
      'right',
      props,
    )
    assert.equal(
      readFrontmatterScalar(note('title: Theory: Review', 'citekey: right', props), 'citekey'),
      'right',
      props,
    )
  }
})

void test('does not skip a malformed first declaration of the key for a later one', () => {
  for (const value of [': first', ': null']) {
    assert.equal(
      readFrontmatterScalar(note('title: T', '"citekey"', value, 'citekey: second'), 'citekey'),
      undefined,
      value,
    )
  }
})

void test('recovers the first of duplicate keys regardless of how the key is written', () => {
  assert.equal(readFrontmatterScalar(note('"citekey": first', 'citekey: second'), 'citekey'), 'first')
  assert.equal(readFrontmatterScalar(note('citekey : first', 'citekey: second'), 'citekey'), 'first')
})

void test('recovers a quoted key, or one with a space before the colon, despite a malformed field', () => {
  assert.equal(readFrontmatterScalar(note('title: Theory: A Review', '"citekey": smith2020'), 'citekey'), 'smith2020')
  assert.equal(readFrontmatterScalar(note('title: Theory: A Review', 'citekey : smith2020'), 'citekey'), 'smith2020')
})

void test('reads field names that YAML would type as non-strings', () => {
  for (const key of ['true', 'null', '2020', '0x1F']) {
    assert.equal(readFrontmatterScalar(note(`${key}: smith2020`), key), 'smith2020', key)
  }
})

void test('requires a mapping at the frontmatter root', () => {
  assert.equal(readFrontmatterScalar(note('- wrong'), '0'), undefined)
})

void test('reads a block scalar value as its text', () => {
  assert.equal(readFrontmatterScalar(note('citekey: |', '  smith2020'), 'citekey'), 'smith2020')
  assert.equal(readFrontmatterScalar(note('citekey: >', '  smith2020'), 'citekey'), 'smith2020')
})

void test('does not read a key without a space after the colon', () => {
  assert.equal(readFrontmatterScalar(note('title: T', 'citekey:smith2020'), 'citekey'), undefined)
})

void test('returns undefined for a file without frontmatter', () => {
  assert.equal(readFrontmatterScalar('# Just a note\n', 'citekey'), undefined)
  assert.equal(readFrontmatterScalar('', 'citekey'), undefined)
})

void test('ends the frontmatter at a document marker followed by a comment', () => {
  assert.equal(
    readFrontmatterScalar(['---', 'title: T', '--- # end', 'citekey: wrong', '---'].join('\n'), 'citekey'),
    undefined,
  )
  assert.equal(readFrontmatterScalar(['---', 'citekey: right', '--- # end', 'Body'].join('\n'), 'citekey'), 'right')
})

void test('recovers a key from a mapping introduced by a standalone anchor or tag line', () => {
  for (const props of ['&root', '!!map']) {
    assert.equal(
      readFrontmatterScalar(note(props, '  citekey: good', '  title: Theory: A Review'), 'citekey'),
      'good',
      props,
    )
  }
})

void test('recovers in linear time from a long unfinished collection', () => {
  const words = Array.from({ length: 20_000 }, () => 'word,')
  const started = performance.now()
  assert.equal(readFrontmatterScalar(note('citekey: right', 'title: [', ...words), 'citekey'), 'right')
  // YAML abandons the flow collection at the first unindented line and reads `word, … ] citekey`
  // as one multi-line implicit key, so there is no top-level `citekey` to recover.
  const later = note('title: [', ...words, ']', 'citekey: wrong', 'broken: Theory: A Review')
  assert.equal(readFrontmatterScalar(later, 'citekey'), undefined)
  const elapsed = performance.now() - started
  assert.ok(elapsed < 2000, `took ${elapsed.toFixed(0)} ms`)
})
