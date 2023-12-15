declare type DebugMode = 'minimal' | 'maximal'

declare type LogType = 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'config'

declare type NotificationType =
  | 'addon'
  | 'success'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'config'
  | 'itemsadded'
  | 'itemsremoved'

declare type ZoteroIconFile = `${keyof typeof globalThis._ZoteroTypes.IconFile}`
declare type ZoteroIconURI = globalThis._ZoteroTypes.IconURI

interface Entry {
  citekey: string
  citekey_metadata: string
  citekey_title: string
  zotkeys: string[]
  zotids: number[]
  name: string
  path: string
}

interface prefParam {
  name: string
  value: string
  valid: boolean
  msg?: string
}

interface OSFile {
  isDir: boolean
  isSymLink: boolean
  name: string
  path: string
}

interface NotifyCreateLineOptions {
  type?: string
  icon?: string
  text?: string
  progress?: number
  idx?: number
}

interface notificationData {
  title: string
  // zotType?: 'default' | 'success' | 'fail'
  // iconFile?: ZoteroIconFile
  // iconURI?: ZoteroIconURI
  body?: string
  type?: NotificationType
  messageArray?: { body: string; type: NotificationType }[]
}

interface messageData {
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
