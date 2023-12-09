import { BasicTool } from 'zotero-plugin-toolkit/dist/basic'

import { config } from '../package.json'

import Addon from './addon'

const basicTool = new BasicTool()

if (!basicTool.getGlobal('Zotero')[config.addonInstance]) {
  // Set global variables
  _globalThis.Zotero = basicTool.getGlobal('Zotero')
  defineGlobal('window')
  defineGlobal('document')
  defineGlobal('ZoteroPane')
  defineGlobal('Zotero_Tabs')
  _globalThis.addon = new Addon()
  defineGlobal('ztoolkit', () => {
    return _globalThis.addon.data.ztoolkit
  })
  Zotero[config.addonInstance] = addon
  // Trigger addon hook for initialization
  addon.hooks.onStartup()
}

function defineGlobal(name: Parameters<BasicTool['getGlobal']>[0]): void
function defineGlobal(name: string, getter: () => any): void
function defineGlobal(name: string, getter?: () => any) {
  Object.defineProperty(_globalThis, name, {
    get() {
      return getter ? getter() : basicTool.getGlobal(name)
    },
  })
}
