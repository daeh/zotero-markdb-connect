const _paramVals_filefilterstrategy = ['default', 'customfileregexp'] as const
type _param_filefilterstrategy = (typeof _paramVals_filefilterstrategy)[number]

const _paramVals_matchstrategy = ['bbtcitekeyyaml', 'bbtcitekeyregexp', 'zotitemkey'] as const
type _paramTypes_matchstrategy = (typeof _paramVals_matchstrategy)[number]

const _paramVals_mdeditor = ['system', 'obsidian', 'logseq'] as const
type _param_mdeditor = (typeof _paramVals_mdeditor)[number]

const _paramVals_obsidianresolvewithfile = [false, true] as const
type _param_obsidianresolvewithfile = (typeof _paramVals_obsidianresolvewithfile)[number]
const _paramVals_obsidianresolvespec = ['path', 'file'] as const
type _param_obsidianresolvespec = (typeof _paramVals_obsidianresolvespec)[number]

const _paramVals_grouplibraries = ['user', 'group'] as const
type _param_grouplibraries = (typeof _paramVals_grouplibraries)[number]

const _paramVals_removetags = ['keepsynced', 'addonly'] as const
type _param_removetags = (typeof _paramVals_removetags)[number]

const _paramVals_debugmode = ['minimal' as DebugMode, 'maximal' as DebugMode] as const

export const paramVals = {
  filefilterstrategy: _paramVals_filefilterstrategy,
  matchstrategy: _paramVals_matchstrategy,
  mdeditor: _paramVals_mdeditor,
  obsidianresolvewithfile: _paramVals_obsidianresolvewithfile,
  obsidianresolvespec: _paramVals_obsidianresolvespec,
  grouplibraries: _paramVals_grouplibraries,
  removetags: _paramVals_removetags,
  debugmode: _paramVals_debugmode,
}

export declare interface paramTypes {
  filefilterstrategy: _param_filefilterstrategy
  matchstrategy: _paramTypes_matchstrategy
  mdeditor: _param_mdeditor
  obsidianresolvewithfile: _param_obsidianresolvewithfile
  obsidianresolvespec: _param_obsidianresolvespec
  grouplibraries: _param_grouplibraries
  removetags: _param_removetags
}
