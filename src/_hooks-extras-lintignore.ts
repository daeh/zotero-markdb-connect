import { config } from '../package.json'

import { DataManager } from './dataGlobals'
import { Elements } from './modules/create-element'
import {
  BasicExampleFactory,
  HelperExampleFactory,
  KeyExampleFactory,
  PromptExampleFactory,
  UIExampleFactory,
} from './modules/examples'
import { Logger } from './modules/mdbcLogger'
import { Notifier, prefHelpers, ScanMarkdownFiles, systemInterface, UIHelpers } from './modules/mdbcScan'
import { patch as $patch$, unpatch as $unpatch$ } from './modules/monkey-patch'
import { registerPrefsScripts } from './modules/preferenceScript'
import { getString, initLocale } from './utils/locale'
import { createZToolkit } from './utils/ztoolkit'

async function onStartup() {
  await Promise.all([Zotero.initializationPromise, Zotero.unlockPromise, Zotero.uiReadyPromise])
  initLocale()

  BasicExampleFactory.registerPrefs()

  BasicExampleFactory.registerNotifier()

  // registerPreferenceStyleSheet()

  await onMainWindowLoad(window)
}

async function onMainWindowLoad(win: Window): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit()

  const debugMode: DebugMode = 'maximal'
  Logger.setDebugMode(debugMode)

  const popupWin = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString('startup-begin'),
      type: 'default',
      progress: 0,
    })
    .show()

  // KeyExampleFactory.registerShortcuts();

  UIHelpers.registerWindowMenuItem_Sync()

  await Zotero.Promise.delay(1000)
  popupWin.changeLine({
    progress: 30,
    text: `[30%] Debug Mode : ${debugMode}`,
  })

  Logger.log('addon', 'startup')
  // let ggg = await SCAN(window)

  // Only run Sync if config check passes.
  await ScanMarkdownFiles.runSync(false, true)

  popupWin.changeLine({
    progress: 100,
    text: `[80%] ${getString('startup-finish')}`,
  })

  UIHelpers.registerRightClickMenuItem()

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString('startup-finish')}`,
  })

  popupWin.startCloseTimer(5000)
}

function syncWithMarkdown() {
  // called from tools menu
  const promptSaveErrors = true
  const syncTags = true

  let runsync = async () => {
    let output = await ScanMarkdownFiles.runSync(promptSaveErrors, syncTags)
    return output
  }
  runsync().then(function (response) {
    Notifier.showNotification('DONE111', 'done111', true)
  })

  // WIP
  // const notifData = await ScanMarkdownFiles.runSync(promptSaveErrors, syncTags)
  // this.showNotification(...notifData)
}

function DataZotIds() {
  return DataManager.zotIds()
}
function DataStore() {
  return DataManager.data()
}
function Logs() {
  return Logger.getLogs()
}
async function SCAN(win: Window) {
  // addon.data.ztoolkit = createZToolkit();
  // return await Zotero.MDBCX.hooks.SCAN()
  // return BBTHelper.getBBTdata();
  await ScanMarkdownFiles.processData(false, true)
  //.then(() => {alert('finished!')}).catch((e) => {alert(`failed::${e}`)})
  return DataManager.data()
  // return Data.dataZotIds
  // return Data.Store()
}

async function onMainWindowLoadOriginal(win: Window): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit()

  const popupWin = new ztoolkit.ProgressWindow(config.addonName, {
    closeOnClick: true,
    closeTime: -1,
  })
    .createLine({
      text: getString('startup-begin'),
      type: 'default',
      progress: 0,
    })
    .show()

  KeyExampleFactory.registerShortcuts()

  await Zotero.Promise.delay(1000)
  popupWin.changeLine({
    progress: 30,
    text: `[30%] ${getString('startup-begin')}`,
  })

  UIExampleFactory.registerStyleSheet()

  UIExampleFactory.registerRightClickMenuItem()

  UIExampleFactory.registerRightClickMenuPopup()

  UIExampleFactory.registerWindowMenuWithSeparator()

  await UIExampleFactory.registerExtraColumn()

  await UIExampleFactory.registerExtraColumnWithCustomCell()

  await UIExampleFactory.registerCustomItemBoxRow()

  UIExampleFactory.registerLibraryTabPanel()

  await UIExampleFactory.registerReaderTabPanel()

  PromptExampleFactory.registerNormalCommandExample()

  PromptExampleFactory.registerAnonymousCommandExample()

  PromptExampleFactory.registerConditionalCommandExample()

  await Zotero.Promise.delay(1000)

  popupWin.changeLine({
    progress: 100,
    text: `[100%] ${getString('startup-finish')}`,
  })
  popupWin.startCloseTimer(5000)

  addon.hooks.onDialogEvents('dialogExample')
}

async function onMainWindowUnload(win: Window): Promise<void> {
  Elements.removeAll() // maybe?
  $unpatch$()
  ztoolkit.unregisterAll()
  addon.data.dialog?.window?.close()
}

function onShutdown(): void {
  ztoolkit.unregisterAll()
  addon.data.dialog?.window?.close()
  // Remove addon object
  addon.data.alive = false
  delete Zotero[config.addonInstance]
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(event: string, type: string, ids: (string | number)[], extraData: Record<string, any>) {
  // You can add your code to the corresponding notify type
  ztoolkit.log('notify', event, type, ids, extraData)
  if (event == 'select' && type == 'tab' && extraData[ids[0]].type == 'reader') {
    BasicExampleFactory.exampleNotifierCallback()
  } else {
    return
  }
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
      await registerPrefsScripts(data.window as Window)
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
    case 'runAndSaveDebug':
      // TODO: runAndSaveDebug
      break
    default:
      return
  }
}

function onShortcuts(type: string) {
  switch (type) {
    case 'larger':
      KeyExampleFactory.exampleShortcutLargerCallback()
      break
    case 'smaller':
      KeyExampleFactory.exampleShortcutSmallerCallback()
      break
    case 'confliction':
      KeyExampleFactory.exampleShortcutConflictingCallback()
      break
    default:
      break
  }
}

function onDialogEvents(type: string) {
  switch (type) {
    case 'dialogExample':
      HelperExampleFactory.dialogExample()
      break
    case 'clipboardExample':
      HelperExampleFactory.clipboardExample()
      break
    case 'filePickerExample':
      HelperExampleFactory.filePickerExample()
      break
    case 'progressWindowExample':
      HelperExampleFactory.progressWindowExample()
      break
    case 'vtableExample':
      HelperExampleFactory.vtableExample()
      break
    default:
      break
  }
}

// Add your hooks here. For element click, etc.
// Keep in mind hooks only do dispatch. Don't add code that does real jobs in hooks.
// Otherwise the code would be hard to read and maintain.

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
  syncWithMarkdown,
  Logs,
  DataStore,
  DataZotIds,
  SCAN,
}
