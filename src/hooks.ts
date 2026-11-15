import { DataManager } from './dataGlobals'
import { getErrorMessage, Logger } from './modules/mdbcLogger'
import { ScanMarkdownFiles } from './modules/mdbcScan'
import { wrappers } from './modules/mdbcStartupHelpers'
import { KeyboardShortcuts, Notifier, prefHelpers, Registrar, systemInterface, UIHelpers } from './modules/mdbcUX'
import { registerPrefsScripts } from './modules/preferenceScript'
import { getString, initLocale } from './utils/locale'

type PrefsEvent =
  | [type: 'load', data: { window: Window }]
  | [type: 'chooseVaultFolder' | 'syncMarkDBSaveDebug', data?: undefined]
  | [type: 'checkMetadataFormat' | 'checkRegExpValid' | 'checkTagStr', data: { value: string }]

async function onStartup() {
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise])

  initLocale()

  wrappers.startupVersionCheck()

  Registrar.registerPrefs()

  await Promise.all(Zotero.getMainWindows().map((win) => onMainWindowLoad(win)))

  // Shutdown may have run while the initial scans were pending.
  if (!addon.data.alive) return

  UIHelpers.registerGlobalUI()

  addon.data.initialized = true
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // MenuManager requires the localization IDs before registration.
  win.MozXULElement.insertFTLIfNeeded(`${addon.data.config.addonRef}-addon.ftl`)

  const popupWin = new ztoolkit.ProgressWindow(addon.data.config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString('startup-begin'),
      icon: Notifier.notificationTypes.addon,
      type: 'default',
      progress: 0,
    })
    .show()

  popupWin.changeLine({
    progress: 30,
    text: `[30%]  ${getString('startup-syncing')}`,
  })

  await ScanMarkdownFiles.syncWrapper(false, false)

  popupWin.changeLine({
    progress: 80,
    text: `[80%]  ${getString('startup-finish')}`,
  })

  UIHelpers.ensureTroubleshootMenu()

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString('startup-finish')}`,
  })

  Logger.log('trace', 'onMainWindowLoad:complete', false, 'trace')
  Logger.log('startup', 'onMainWindowLoad:complete', true, 'info')

  if (Logger.mode() !== 'minimal' || addon.data.env === 'development') {
    popupWin.addLines(`DebugMode: ${Logger.mode()}`, Notifier.notificationTypes.debug)
  }

  if (addon.data.env === 'development') {
    popupWin.addLines(`ENV: ${addon.data.env}`, Notifier.notificationTypes.debug)
  }

  popupWin.startCloseTimer(3000)
}

async function syncMarkDB(): Promise<void> {
  const displayReport = false
  const saveLogsToggle = false

  try {
    await ScanMarkdownFiles.syncWrapper(displayReport, saveLogsToggle)
    UIHelpers.ensureTroubleshootMenu()
    Logger.log('syncMarkDB', 'finished', true, 'info')
  } catch (err) {
    Logger.log('syncMarkDB', `ERROR :: ${getErrorMessage(err)}`, true, 'error')
  }
}

function syncMarkDBReport() {
  const displayReport = true
  const saveLogsToggle = false

  ScanMarkdownFiles.syncWrapper(displayReport, saveLogsToggle)
    .then(() => {
      UIHelpers.ensureTroubleshootMenu()
      Logger.log('syncMarkDBReport', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('syncMarkDBReport', `ERROR :: ${err}`, true, 'error')
    })
}

function syncMarkDBSaveDebug() {
  const displayReport = false
  const saveLogsToggle = true

  ScanMarkdownFiles.syncWrapper(displayReport, saveLogsToggle)
    .then(() => {
      UIHelpers.ensureTroubleshootMenu()
      Logger.log('syncMarkDBSaveDebug', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('syncMarkDBSaveDebug', `ERROR :: ${err}`, true, 'error')
    })
}

function saveLogs() {
  systemInterface
    .dumpDebuggingLog()
    .then(() => {
      Logger.log('saveDebuggingLog', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('saveDebuggingLog', `ERROR :: ${err}`, true, 'error')
    })
}

function saveJsonFile(data: string, title: string, filename: string) {
  systemInterface
    .dumpJsonFile(data, title, filename)
    .then(() => {
      Logger.log('dumpJsonFile', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('dumpJsonFile', `ERROR :: ${err}`, true, 'error')
    })
}

function Data() {
  return DataManager.data()
}
function DataZotIds() {
  return DataManager.zotIds()
}
function DataStore() {
  return DataManager.dump()
}
async function Logs() {
  return await Logger.dump()
}

function onMainWindowUnload(_win: Window): void {
  // The toolkit outlives windows: KeyboardManager detaches from a closing window on its own.
  addon.data.dialog?.window?.close()
}

function onShutdown(): void {
  // Mark the instance stopped first so scans or a report still pending register nothing afterwards.
  addon.data.alive = false
  addon.data.initialized = false
  UIHelpers.unregisterGlobalUI()
  ztoolkit.unregisterAll()
  addon.data.dialog?.window?.close()
  // @ts-expect-error -- Zotero's type omits dynamic addon instance properties
  delete Zotero[addon.data.config.addonInstance]
}

async function onPrefsEvent(...[type, data]: PrefsEvent): Promise<void> {
  switch (type) {
    case 'load':
      registerPrefsScripts(data.window)
      break
    case 'chooseVaultFolder':
      await prefHelpers.chooseVaultFolder()
      break
    case 'checkMetadataFormat':
      prefHelpers.checkMetadataFormat(data.value)
      break
    case 'checkRegExpValid':
      prefHelpers.isValidRegExp(data.value)
      break
    case 'checkTagStr':
      prefHelpers.checkTagStr(data.value)
      break
    case 'syncMarkDBSaveDebug':
      syncMarkDBSaveDebug()
      break
    default:
      break
  }
}

function openSelectedItemNote() {
  KeyboardShortcuts.openSelectedItemNote()
}

function registerGlobalUI(): string[] {
  return UIHelpers.registerGlobalUI()
}

function unregisterGlobalUI() {
  return UIHelpers.unregisterGlobalUI()
}

function ensureTroubleshootMenu(): string | false {
  return UIHelpers.ensureTroubleshootMenu()
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
  syncMarkDB,
  syncMarkDBReport,
  syncMarkDBSaveDebug,
  openSelectedItemNote,
  registerGlobalUI,
  unregisterGlobalUI,
  ensureTroubleshootMenu,
  Logs,
  DataStore,
  Data,
  DataZotIds,
  saveLogs,
  saveJsonFile,
}
