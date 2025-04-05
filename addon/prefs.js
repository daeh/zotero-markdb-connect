/* eslint-disable no-undef */
pref('enable', true)

//

pref('configuration', '0.0.0')
pref('debugmode', 'minimal')

pref('sourcedir', '')

pref('filefilterstrategy', 'default') // ['default', 'customfileregexp'][0]
pref('filepattern', '^@.+\\.md$')

pref('matchstrategy', 'bbtcitekeyyaml') // ['bbtcitekeyyaml', 'bbtcitekeyregexp', 'zotitemkey'][0]
pref('bbtyamlkeyword', '')
pref('bbtregexp', '')
pref('zotkeyregexp', '')

pref('mdeditor', 'obsidian') // ['obsidian', 'logseq', 'system'][0]
pref('obsidianvaultname', '')
// pref('obsidianresolvewithfile', false) // [false, true][0]
pref('obsidianresolvespec', 'path') // ['path', 'file'][0]

pref('logseqgraph', '')
pref('logseqprefix', '')

pref('grouplibraries', 'user') // ['user', 'group'][0]
pref('removetags', 'keepsynced') // ['keepsynced', 'addonly'][0]
pref('tagstr', 'ObsCite')
