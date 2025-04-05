import type { DebugMode } from '../mdbcTypes'

export const paramVals = {
  filefilterstrategy: ['default', 'customfileregexp'],
  matchstrategy: ['bbtcitekeyyaml', 'bbtcitekeyregexp', 'zotitemkey'],
  mdeditor: ['system', 'obsidian', 'logseq'],
  // obsidianresolvewithfile: [false, true],
  obsidianresolvespec: ['path', 'file'],
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
