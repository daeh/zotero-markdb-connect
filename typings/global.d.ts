import type Addon from '../src/addon'
import type { createZToolkit } from '../src/utils/ztoolkit'

declare global {
  type ZToolkit = ReturnType<typeof createZToolkit>
  const ztoolkit: ZToolkit
  const rootURI: string
  const addon: Addon

  const _globalThis: {
    [key: string]: any
    Zotero: _ZoteroTypes.Zotero
    ztoolkit: ZToolkit
    addon: typeof addon
  }

  const __env__: 'production' | 'development'
}
