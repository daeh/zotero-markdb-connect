export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject
// An interface keeps this recursive type compatible with the `no-redundant-type-constituents` and
// `no-unsafe-*` lint rules.
export interface JsonObject {
  [key: string]: JsonValue
}

/** Sentinel for values that cannot be represented as JSON. */
export const JSON_UNSERIALIZABLE = '[unserializable]'

/**
 * Clone `value` through JSON serialization.
 *
 * Returns {@link JSON_UNSERIALIZABLE} when serialization produces `undefined` or throws.
 */
export function safeJsonClone(value: unknown): JsonValue {
  try {
    const json = JSON.stringify(value)
    if (json === undefined) return JSON_UNSERIALIZABLE
    return JSON.parse(json) as JsonValue
  } catch {
    return JSON_UNSERIALIZABLE
  }
}

/**
 * Clone `value` as a plain {@link JsonObject}.
 *
 * Returns `{ error: JSON_UNSERIALIZABLE }` when the clone is `null`, an array, or a primitive.
 */
export function safeJsonObjectClone(value: unknown): JsonObject {
  const cloned = safeJsonClone(value)
  if (cloned === null || typeof cloned !== 'object' || Array.isArray(cloned)) {
    return { error: JSON_UNSERIALIZABLE }
  }
  return cloned
}

export interface LoggerDump {
  info: JsonObject
  config: JsonObject
  logs: JsonObject
  data: JsonObject
}

/** Clone each section again because callers can mutate stored object references. */
export function assembleDump(sections: LoggerDump): LoggerDump {
  return {
    info: safeJsonObjectClone(sections.info),
    config: safeJsonObjectClone(sections.config),
    logs: safeJsonObjectClone(sections.logs),
    data: safeJsonObjectClone(sections.data),
  }
}
