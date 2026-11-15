import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

/**
 * Ties CI's pinned Zotero runtimes to the range the add-on declares.
 *
 * Every runtime in `.github/workflows/ci.yml`'s matrix must fall inside a Zotero
 * major that `addon/manifest.json` covers, and every covered major must have a
 * runtime. A release that widens the range (say, to Zotero 10 through 11) while
 * CI still runs only Zotero 10 fails here. Coverage is decided by whole majors, the way
 * the release tooling decides bridges: an `N.999` minimum starts at major N+1,
 * any other minimum at its own major; an `M.*` maximum ends at major M.
 */

const repoRoot = join(import.meta.dirname, '..', '..')

function majorOf(version: string): number {
  const major = Number(version.split('.', 1)[0])
  assert.ok(Number.isInteger(major), `${version} starts with a major version`)
  return major
}

function coveredMajors(min: string, max: string): number[] {
  const conventional = /^(\d+)\.999$/.exec(min)
  const first = conventional?.[1] === undefined ? majorOf(min) : Number(conventional[1]) + 1
  const last = majorOf(max)
  assert.ok(first <= last, `range ${min}–${max} covers a Zotero major`)
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

function pinnedRuntimes(ciYaml: string): string[] {
  return [...ciYaml.matchAll(/^\s*-\s*version:\s*"([0-9][0-9.]*)"\s*$/gm)].map((m) => m[1] ?? '')
}

const manifest = JSON.parse(readFileSync(join(repoRoot, 'addon', 'manifest.json'), 'utf8')) as {
  applications: { zotero: { strict_min_version: string; strict_max_version: string } }
}
const { strict_min_version: min, strict_max_version: max } = manifest.applications.zotero
const runtimes = pinnedRuntimes(readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8'))

void test('CI pins at least one Zotero runtime', () => {
  assert.ok(runtimes.length > 0)
})

void test('every pinned runtime lies in a Zotero major the manifest covers', () => {
  const covered = coveredMajors(min, max)
  for (const runtime of runtimes) {
    assert.ok(covered.includes(majorOf(runtime)), `Zotero ${runtime} is outside ${min}–${max}`)
  }
})

void test('every Zotero major the manifest covers has a pinned runtime', () => {
  const pinned = new Set(runtimes.map(majorOf))
  for (const major of coveredMajors(min, max)) {
    assert.ok(pinned.has(major), `Zotero ${String(major)} is covered by ${min}–${max} but CI pins no runtime for it`)
  }
})

void test('the coverage rule matches the repository convention', () => {
  assert.deepEqual(coveredMajors('9.999', '10.*'), [10])
  assert.deepEqual(coveredMajors('9.999', '11.*'), [10, 11])
  assert.deepEqual(coveredMajors('11.0', '11.*'), [11])
})
