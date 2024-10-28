export type DebugMode = 'minimal' | 'maximal'

export type LogType = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'config'

export type NotificationType =
  | 'addon'
  | 'success'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'config'
  | 'itemsadded'
  | 'itemsremoved'

export type ZoteroIconFile = `${keyof typeof globalThis._ZoteroTypes.IconFile}`
export type ZoteroIconURI = globalThis._ZoteroTypes.IconURI

export interface Entry {
  citekey: string
  citekey_metadata: string
  citekey_title: string
  zotkeys: string[]
  zotids: number[]
  name: string
  path: string
  // filename: string
  // filenamebase: string
  // displayname: string
}

export interface NotifyCreateLineOptions {
  type?: string
  icon?: string
  text?: string
  progress?: number
  idx?: number
}

export interface notificationData {
  title: string
  // zotType?: 'default' | 'success' | 'fail'
  // iconFile?: ZoteroIconFile
  // iconURI?: ZoteroIconURI
  body?: string
  type?: NotificationType
  messageArray?: { body: string; type: NotificationType }[]
}

export interface messageData {
  rowData: {
    title: string
    message: string
  }
  saveData?: {
    saveButtonTitle: string
    saveDialogTitle: string
    fileNameSuggest: string
    dataGetter: () => string
  }
  notification?: notificationData
}
