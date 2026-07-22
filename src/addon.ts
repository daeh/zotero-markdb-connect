import { config } from '../package.json'

import hooks from './hooks'
import { createZToolkit } from './utils/ztoolkit'

import type { ColumnOptions, DialogHelper } from 'zotero-plugin-toolkit'

class Addon {
  public data: {
    alive: boolean
    initialized: boolean
    config: typeof config
    env: 'development' | 'production' | 'test'
    ztoolkit: ZToolkit
    locale?: {
      current: Localization
    }
    prefs?: {
      window: Window
      columns: ColumnOptions[]
      rows: Record<string, string>[]
    }
    dialog?: DialogHelper | undefined
  }
  public hooks: typeof hooks
  public api: object

  constructor() {
    this.data = {
      alive: true,
      initialized: false,
      config,
      env: __env__,
      ztoolkit: createZToolkit(),
    }
    this.hooks = hooks
    this.api = {}
  }
}

export default Addon
