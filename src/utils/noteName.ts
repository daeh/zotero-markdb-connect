export interface NotePrefixResult {
  /** Prefix-stripped note name, decoded when its percent-encoding is valid. */
  value: string
  /** Whether malformed percent-encoding prevented decoding. */
  malformedEncoding: boolean
}

/**
 * Remove a matching literal prefix, then URL-decode the note name.
 *
 * Decoding still runs without a prefix match.
 */
export function stripAndDecodeNotePrefix(name: string, prefix: string): NotePrefixResult {
  const stripped = name.startsWith(prefix) ? name.slice(prefix.length) : name
  try {
    return { value: decodeURIComponent(stripped), malformedEncoding: false }
  } catch {
    return { value: stripped, malformedEncoding: true }
  }
}
