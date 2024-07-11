declare const _globalThis: {
  [key: string]: any
  Zotero: _ZoteroTypes.Zotero
  ZoteroPane: _ZoteroTypes.ZoteroPane
  Zotero_Tabs: typeof Zotero_Tabs
  window: Window
  document: Document
  ztoolkit: ZToolkit
  addon: typeof addon
}

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare type ZToolkit = ReturnType<typeof import('../src/utils/ztoolkit').createZToolkit>

declare const ztoolkit: ZToolkit

declare const rootURI: string

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
declare const addon: import('../src/addon').default

declare const __env__: 'production' | 'development'

declare class Localization {}
