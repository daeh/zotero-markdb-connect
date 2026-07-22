import { BasicTool } from 'zotero-plugin-toolkit'

import { config } from '../package.json'

import Addon from './addon'

const basicTool = new BasicTool()

// @ts-expect-error -- Zotero's type omits dynamic addon instance properties
if (!basicTool.getGlobal('Zotero')[config.addonInstance]) {
  _globalThis.addon = new Addon()
  defineGlobal('ztoolkit', () => {
    return _globalThis.addon.data.ztoolkit
  })
  // @ts-expect-error -- Zotero's type omits dynamic addon instance properties
  Zotero[config.addonInstance] = addon
}

function defineGlobal(name: Parameters<BasicTool['getGlobal']>[0]): void
function defineGlobal<K extends keyof typeof _globalThis>(name: K, getter: () => (typeof _globalThis)[K]): void
function defineGlobal(name: string, getter?: () => unknown): void {
  Object.defineProperty(_globalThis, name, {
    get(): unknown {
      if (getter) return getter()

      const globalValue: unknown = basicTool.getGlobal(name)
      return globalValue
    },
  })
}
