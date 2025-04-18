// import { config } from '../package.json'

import { DataManager } from './dataGlobals'
import { Elements } from './modules/create-element'
import { Logger } from './modules/mdbcLogger'
import { ScanMarkdownFiles } from './modules/mdbcScan'
import { wrappers } from './modules/mdbcStartupHelpers'
import { Notifier, prefHelpers, Registrar, systemInterface, UIHelpers } from './modules/mdbcUX'
import { unpatch as $unpatch$ } from './modules/monkey-patch'
import { registerPrefsScripts } from './modules/preferenceScript'
import { getString, initLocale } from './utils/locale'
import { createZToolkit } from './utils/ztoolkit'

async function onStartup() {
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise])

  initLocale()

  await wrappers.startupVersionCheck()

  Registrar.registerPrefs()

  // BasicExampleFactory.registerNotifier()

  // registerPreferenceStyleSheet()

  // await onMainWindowLoad(window)

  await Promise.all(Zotero.getMainWindows().map((win) => onMainWindowLoad(win)))
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit()

  // @ts-ignore This is a moz feature
  // win.MozXULElement.insertFTLIfNeeded(`${addon.data.config.addonRef}-mainWindow.ftl`)

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

  // KeyExampleFactory.registerShortcuts();

  popupWin.changeLine({
    progress: 30,
    text: `[30%]  ${getString('startup-syncing')}`,
  })

  // TODO Only run Sync if config check passes.
  await ScanMarkdownFiles.syncWrapper(false, false)

  popupWin.changeLine({
    progress: 80,
    text: `[80%]  ${getString('startup-finish')}`,
  })

  UIHelpers.registerWindowMenuItem_Sync()
  if (!DataManager.isClean() || DataManager.numberRecords() === 0 || addon.data.env === 'development') {
    UIHelpers.registerWindowMenuItem_Debug()
  } else {
    ///WIP
    // try {
    //   ztoolkit.Menu.unregister(`${config.addonRef}-tools-menu-troubleshoot`)
    // } catch (err) {
    //   Logger.log('toolsmenu', `ERROR: unregister :: ${err}`)
    // }
  }
  // register(menuPopup: XUL.MenuPopup | keyof typeof MenuSelector, options: MenuitemOptions, insertPosition?: "before" | "after", anchorElement?: XUL.Element): false | undefined;
  // unregister(menuId: string): void;

  UIHelpers.registerRightClickMenuItem()

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString('startup-finish')}`,
  })

  if (Logger.mode() !== 'minimal' || addon.data.env === 'development') {
    popupWin.addLines(`DebugMode: ${Logger.mode()}`, Notifier.notificationTypes.debug)
  }

  if (addon.data.env === 'development') {
    popupWin.addLines(`ENV: ${addon.data.env}`, Notifier.notificationTypes.debug)
  }

  popupWin.startCloseTimer(3000)
}

function syncMarkDB() {
  //// called from tools menu ////
  const displayReport = false
  const saveLogsToggle = false

  ScanMarkdownFiles.syncWrapper(displayReport, saveLogsToggle)
    .then(() => {
      Logger.log('syncMarkDB', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('syncMarkDB', `ERROR :: ${err}`, true, 'error')
    })
}

function syncMarkDBReport() {
  //// called from tools menu ////
  const displayReport = true
  const saveLogsToggle = false

  ScanMarkdownFiles.syncWrapper(displayReport, saveLogsToggle)
    .then(() => {
      Logger.log('syncMarkDBReport', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('syncMarkDBReport', `ERROR :: ${err}`, true, 'error')
    })
}

function syncMarkDBSaveDebug() {
  //// called from prefs ////
  const displayReport = false
  const saveLogsToggle = true

  ScanMarkdownFiles.syncWrapper(displayReport, saveLogsToggle)
    .then(() => {
      Logger.log('syncMarkDBSaveDebug', 'finished', true, 'info')
    })
    .catch((err) => {
      Logger.log('syncMarkDBSaveDebug', `ERROR :: ${err}`, true, 'error')
      // const loggedMessages = Logger.getMessages()
      // await
      // ScanMarkdownFiles.displayReportDialog([], loggedMessages)
      // await
      // systemInterface.dumpDebuggingLog()
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
function Logs() {
  return Logger.dump()
}

async function onMainWindowUnload(win: Window): Promise<void> {
  Elements.removeAll()
  $unpatch$()
  ztoolkit.unregisterAll()
  addon.data.dialog?.window?.close()
}

function onShutdown(): void {
  ztoolkit.unregisterAll()
  addon.data.dialog?.window?.close()
  // Remove addon object
  addon.data.alive = false
  // @ts-ignore - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance]
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this function clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: Record<string, any>) {
  switch (type) {
    case 'load':
      // await registerPrefsScripts(data.window as Window)
      registerPrefsScripts(data.window)
      break
    case 'chooseVaultFolder':
      await prefHelpers.chooseVaultFolder()
      break
    case 'checkMetadataFormat':
      prefHelpers.checkMetadataFormat(data.value as string)
      break
    case 'checkRegExpValid':
      prefHelpers.isValidRegExp(data.value as string)
      break
    case 'checkTagStr':
      prefHelpers.checkTagStr(data.value as string)
      break
    case 'syncMarkDBSaveDebug':
      syncMarkDBSaveDebug()
      break
    default:
      break
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

/*
 * E.g.:
 * Zotero.MDBC.hooks.DataStore()
 * Zotero.MDBC.hooks.Logs()
 */
export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsEvent,
  syncMarkDB,
  syncMarkDBReport,
  syncMarkDBSaveDebug,
  Logs,
  DataStore,
  Data,
  DataZotIds,
  saveLogs,
  saveJsonFile,
}
