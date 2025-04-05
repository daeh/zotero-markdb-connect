import { config } from '../package.json'

import hooks from './hooks'
import { createZToolkit } from './utils/ztoolkit'

import type { ColumnOptions, DialogHelper } from 'zotero-plugin-toolkit'

class Addon {
  public data: {
    alive: boolean
    config: typeof config
    // Env type, see build.js
    env: 'development' | 'production'
    ztoolkit: ZToolkit
    locale?: {
      current: any
    }
    prefs?: {
      window: Window
      columns: ColumnOptions[]
      rows: Record<string, string>[]
    }
    dialog?: DialogHelper
  }
  // Lifecycle hooks
  public hooks: typeof hooks
  // APIs
  public api: object

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      ztoolkit: createZToolkit(),
    }
    this.hooks = hooks
    this.api = {}
  }
}

export default Addon
