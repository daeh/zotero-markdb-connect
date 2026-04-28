import type { DebugMode } from '../mdbcTypes'

export const paramVals = {
  filefilterstrategy: ['default', 'customfileregexp'],
  matchstrategy: ['citekeyyaml', 'citekeyregexp', 'zotitemkey'],
  mdeditor: ['system', 'obsidian', 'logseq'],
  // obsidianresolvewithfile: [false, true],
  obsidianresolvespec: ['path', 'file'],
  // 'active' is a plugin-internal sentinel meaning "omit paneType from the URI",
  // not an Obsidian-recognized value. 'tab' and 'window' pass through verbatim.
  obsidianpanetype: ['tab', 'active', 'window'],
  grouplibraries: ['user', 'group'],
  removetags: ['keepsynced', 'addonly'],
  debugmode: ['minimal' satisfies DebugMode, 'maximal' satisfies DebugMode],
} as const

// Infer parameter types from values
export type ParamVals = typeof paramVals
export type ParamKey = keyof ParamVals
export type ParamValue<T extends ParamKey> = ParamVals[T][number]

// Re-export paramTypes interface if needed for backward compatibility
// export type paramTypes = {
//   [K in Exclude<ParamKey, 'debugmode'>]: ParamValue<K>
// }
