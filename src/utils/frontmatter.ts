import { CST, isMap, isScalar, Lexer, parseDocument } from 'yaml'

const BYTE_ORDER_MARK = String.fromCodePoint(0xfeff)
const PARSE_OPTIONS = { stringKeys: true } as const

/** A YAML document marker line, which ends the frontmatter. */
const DOCUMENT_MARKER = /^(?:---|\.\.\.)(?:[ \t]|$)/

/** A line of node properties (anchors and tags) alone, as before an indented root mapping. */
const PROPERTIES_ONLY = /^(?:[!&]\S*[ \t]*)+(?:#.*)?$/

/** Lexer control tokens that stand for no source text. */
const SYNTHETIC_TOKEN_TYPES: ReadonlySet<string> = new Set(['doc-mode', 'flow-error-end', 'scalar'])

/** Lexer tokens that can precede an entry's first node: layout, comments, and node properties. */
const LEADING_TOKEN_TYPES: ReadonlySet<string> = new Set([
  'byte-order-mark',
  'doc-mode',
  'space',
  'newline',
  'comment',
  'tag',
  'anchor',
])

/**
 * Read a top-level scalar from a Markdown file's YAML frontmatter, as text.
 *
 * The frontmatter opens with `---` on the first line and ends at the next document marker
 * (`---` or `...`, alone or followed by whitespace). Plain values keep their source text (`2020`
 * stays `2020`, not a number), quoted values are unescaped, and YAML nulls (`null`, `~`, an empty
 * value) count as absent.
 *
 * Frontmatter with syntax errors is read entry by entry, so a malformed field elsewhere does not
 * hide the value: when its root is still a block mapping, the first top-level entry that defines
 * the key decides, and its value is used only if that entry is valid YAML on its own.
 */
export function readFrontmatterScalar(contents: string, key: string): string | undefined {
  const text = frontmatterText(contents)
  if (text === undefined) return undefined

  const doc = parseDocument(text, PARSE_OPTIONS)
  if (doc.errors.length === 0) return mappingValue(doc.contents, key)
  if (!isMap(doc.contents) || doc.contents.flow) return undefined

  for (const entry of topLevelEntries(text)) {
    const entryDoc = parseDocument(entry, PARSE_OPTIONS)
    const { contents: pair } = entryDoc
    if (isMap(pair) && !pair.flow && pair.has(key)) {
      return entryDoc.errors.length === 0 ? mappingValue(pair, key) : undefined
    }
    // A malformed declaration of the key is still its first declaration.
    if (leadingKeyText(entry) === key) return undefined
  }
  return undefined
}

/** The text of the scalar an entry starts with (after node properties and any `?`), if any. */
function leadingKeyText(entry: string): string | undefined {
  for (const token of new Lexer().lex(entry)) {
    const type = CST.tokenType(token)
    if (type === null) return token
    if (type === 'double-quoted-scalar' || type === 'single-quoted-scalar') {
      // Report escape errors instead of throwing; the best-effort value still identifies the key.
      return CST.resolveAsScalar({ type, offset: 0, indent: 0, source: token }, false, () => undefined).value
    }
    if (!LEADING_TOKEN_TYPES.has(type) && type !== 'explicit-key-ind' && type !== 'scalar') return undefined
  }
  return undefined
}

function frontmatterText(contents: string): string | undefined {
  const text = contents.startsWith(BYTE_ORDER_MARK) ? contents.slice(BYTE_ORDER_MARK.length) : contents
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trimEnd() !== '---') return undefined
  const end = lines.findIndex((line, i) => i > 0 && DOCUMENT_MARKER.test(line))
  return end === -1 ? undefined : lines.slice(1, end).join('\n')
}

function mappingValue(contents: unknown, key: string): string | undefined {
  return isMap(contents) ? scalarText(contents.get(key, true)) : undefined
}

/** A scalar's text; nulls and non-scalars yield `undefined`. Typed plain scalars keep their source text. */
function scalarText(node: unknown): string | undefined {
  if (!isScalar(node)) return undefined
  const { value } = node
  let text: string | undefined
  if (typeof value === 'string') {
    text = value
  } else if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    text = node.source ?? String(value)
  }
  return text?.trim() || undefined
}

/**
 * Yield the frontmatter's top-level entries, in order, lexing the text once and lazily.
 *
 * Each candidate line (see `candidateOffsets`) begins a new entry only if it starts at a token
 * boundary and the source since the current entry's start is complete (see `EntryState`).
 * Otherwise it is absorbed, so the contents of a string, flow collection, root-level block scalar,
 * or multi-line implicit key never form entries of their own.
 */
function* topLevelEntries(text: string): Generator<string> {
  const candidates = candidateOffsets(text)
  let next = 0
  let start = 0
  let offset = 0
  let entry = new EntryState()
  for (const token of new Lexer().lex(text)) {
    const type = CST.tokenType(token)
    for (; next < candidates.length && (candidates[next] ?? Infinity) <= offset; next += 1) {
      const candidate = candidates[next]
      if (candidate === offset && entry.isComplete()) {
        yield text.slice(start, candidate)
        start = candidate
        entry = new EntryState()
      }
    }
    entry.add(type, token)
    offset += type !== null && SYNTHETIC_TOKEN_TYPES.has(type) ? 0 : token.length
  }
  yield text.slice(start)
}

/**
 * Offsets of the lines that may start a top-level entry, after the first: lines other than
 * comments and explicit-value lines (`: value`), indented no deeper than the previous entry start
 * (initially, the first such line), so deeper lines stay with their entry. A line of node
 * properties alone starts the entry after it; before the first entry, it belongs to the root.
 */
function candidateOffsets(text: string): number[] {
  const offsets: number[] = []
  let level: number | undefined
  let properties: number | undefined
  let offset = 0
  for (const line of text.split('\n')) {
    const indent = line.length - line.trimStart().length
    const rest = line.slice(indent)
    if (rest === '' || rest.startsWith('#')) {
      // Layout and comments start nothing.
    } else if (PROPERTIES_ONLY.test(rest)) {
      if (level !== undefined && indent <= level) properties ??= offset
    } else {
      level ??= indent
      const isCandidate = indent <= level && /^(?:[^:]|:\S)/.test(rest)
      const start = properties ?? (isCandidate ? offset : undefined)
      if (start !== undefined && start > 0) offsets.push(start)
      if (isCandidate) level = indent
      properties = undefined
    }
    offset += line.length + 1
  }
  if (properties !== undefined) offsets.push(properties)
  return offsets
}

/**
 * The lexical state of an entry, from its tokens in order.
 *
 * An entry is complete when it cannot continue onto the following lines: every quoted scalar and
 * flow collection it opens is closed, it is not itself a block scalar (with or without a tag or
 * anchor), whose content may continue at its own indentation, and it is not a bare plain scalar,
 * which may continue as a multi-line implicit key.
 */
class EntryState {
  #depth = 0
  #first: string | null | undefined
  #pairAtTop = false
  #openQuote = false

  add(type: string | null, token: string): void {
    if (this.#first === undefined && !(type !== null && LEADING_TOKEN_TYPES.has(type))) this.#first = type
    switch (type) {
      case 'flow-map-start':
      case 'flow-seq-start':
        this.#depth += 1
        break
      case 'flow-map-end':
      case 'flow-seq-end':
        this.#depth = Math.max(0, this.#depth - 1)
        break
      case 'map-value-ind':
        if (this.#depth === 0) this.#pairAtTop = true
        break
      case 'double-quoted-scalar':
        if (!isClosedQuote(token, '"')) this.#openQuote = true
        break
      case 'single-quoted-scalar':
        if (!isClosedQuote(token, "'")) this.#openQuote = true
        break
      default:
        break
    }
  }

  isComplete(): boolean {
    return (
      this.#depth === 0 &&
      !this.#openQuote &&
      this.#first !== 'block-scalar-header' &&
      !(this.#first === 'scalar' && !this.#pairAtTop)
    )
  }
}

/**
 * Whether a quoted-scalar token ends with its closing quote: one not escaped by a backslash
 * (double quotes) or not part of a doubled `''` (single quotes).
 */
function isClosedQuote(token: string, quote: '"' | "'"): boolean {
  const body = token.trimEnd()
  if (body.length < 2 || !body.endsWith(quote)) return false
  const escape = quote === '"' ? '\\' : "'"
  let run = 0
  for (let i = body.length - 2; i >= 1 && body[i] === escape; i -= 1) run += 1
  return run % 2 === 0
}
