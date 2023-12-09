import { DialogHelper } from 'zotero-plugin-toolkit/dist/helpers/dialog'
import { ColumnOptions } from 'zotero-plugin-toolkit/dist/helpers/virtualizedTable'

import hooks from './hooks'
import { createZToolkit } from './utils/ztoolkit'

class Addon {
  public data: {
    alive: boolean
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
      env: __env__,
      ztoolkit: createZToolkit(),
    }
    this.hooks = hooks
    this.api = {}
  }
}

export default Addon
