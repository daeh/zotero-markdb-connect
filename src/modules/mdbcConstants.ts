import type { DebugMode } from '../mdbcTypes'

export const paramVals = {
  filefilterstrategy: ['default', 'customfileregexp'],
  matchstrategy: ['citekeyyaml', 'citekeyregexp', 'zotitemkey'],
  mdeditor: ['system', 'obsidian', 'logseq'],
  obsidianresolvespec: ['path', 'file'],
  // 'active' omits paneType; 'tab' and 'window' pass through to Obsidian.
  obsidianpanetype: ['tab', 'active', 'window'],
  grouplibraries: ['user', 'group'],
  removetags: ['keepsynced', 'addonly'],
  debugmode: ['minimal' satisfies DebugMode, 'maximal' satisfies DebugMode],
} as const

export type ParamVals = typeof paramVals
export type ParamKey = keyof ParamVals
export type ParamValue<T extends ParamKey> = ParamVals[T][number]
