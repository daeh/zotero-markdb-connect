/** Elapsed whole milliseconds between two instants. */
export function elapsedMs(from: Temporal.Instant, to: Temporal.Instant): number {
  return to.epochMilliseconds - from.epochMilliseconds
}

/** Timestamp with UTC offset and bracketed time-zone identifier. */
export function formatTimestamp(zdt: Temporal.ZonedDateTime): string {
  return zdt.toString()
}
