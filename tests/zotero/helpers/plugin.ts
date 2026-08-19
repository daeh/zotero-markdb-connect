import { config } from '../../../package.json'

import type { Entry } from '../../../src/mdbcTypes'

interface TestPlugin {
  data: {
    env: 'development' | 'production' | 'test'
    initialized: boolean
  }
  hooks: {
    DataStore: () => {
      cleanrun: boolean
      data: Record<string, Entry[]>
      zotIds: number[]
    }
    onMainWindowLoad: (win: _ZoteroTypes.MainWindow) => Promise<void>
    syncMarkDB: () => Promise<void>
  }
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function isTestPlugin(value: unknown): value is TestPlugin {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.hooks)) return false

  const env = value.data.env
  return (
    (env === 'development' || env === 'production' || env === 'test') &&
    typeof value.data.initialized === 'boolean' &&
    typeof value.hooks.DataStore === 'function' &&
    typeof value.hooks.onMainWindowLoad === 'function' &&
    typeof value.hooks.syncMarkDB === 'function'
  )
}

export function getTestPlugin(): TestPlugin {
  const plugin: unknown = Reflect.get(Zotero, config.addonInstance)
  if (!isTestPlugin(plugin)) {
    throw new TypeError(`Zotero.${config.addonInstance} is not an initialized MarkDB-Connect test instance`)
  }
  return plugin
}
