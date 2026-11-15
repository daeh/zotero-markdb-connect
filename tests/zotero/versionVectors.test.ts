import vectors from '../fixtures/version-vectors.json'

/**
 * The release tooling decides version ordering and range containment with a
 * Python port of Mozilla's comparator. This asserts the same vectors against
 * the real `Services.vc`, so a disagreement between the port and Zotero fails
 * here.
 */

declare const Services: {
  vc: { compare: (a: string, b: string) => number }
}

const comparisons = vectors.comparisons.map((row) => ({
  ...row,
  title: `compares ${row.a} with ${row.b} as ${String(row.expected)}`,
}))

describe('shared version vectors', function () {
  it('has vectors', function () {
    assert.isAbove(comparisons.length, 40)
  })

  for (const { a, b, expected, title } of comparisons) {
    it(title, function () {
      assert.strictEqual(Math.sign(Services.vc.compare(a, b)), expected)
      assert.strictEqual(Math.sign(Services.vc.compare(b, a)), -expected)
    })
  }
})
