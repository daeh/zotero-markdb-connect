import { config, version } from '../../package.json'
import { DataManager } from '../dataGlobals'
import { getString } from '../utils/locale'
import { getPref, setPref } from '../utils/prefs'

import { Elements } from './create-element'
import { Logger, trace } from './mdbcLogger'
import { patch as $patch$, unpatch as $unpatch$, Trampoline } from './monkey-patch'

// Components.utils.import('resource://gre/modules/FileUtils.jsm')
// declare const FileUtils: any

interface BBTCitekeyRecord {
  itemID: number
  libraryID: number
  itemKey: string
  citationKey: string
  pinned: boolean | 0 | 1
}

interface BetterBibTeX {
  // [attr: string]: any;
  KeyManager: {
    // (source: string): Promise<string>;
    get(itemID: number): Partial<BBTCitekeyRecord>
    // first(query: Query<CitekeyRecord, 'itemID'>)
    // find(query: Query<CitekeyRecord, 'itemID'>): CitekeyRecord[]
    all(): BBTCitekeyRecord[]
  }
  ready: boolean | Promise<boolean>
}

const _paramVals_filefilterstrategy = ['default', 'customfileregexp'] as const
declare type _param_filefilterstrategy = (typeof _paramVals_filefilterstrategy)[number]

const _paramVals_matchstrategy = ['bbtcitekeyyaml', 'bbtcitekeyregexp', 'zotitemkey'] as const
declare type _param_matchstrategy = (typeof _paramVals_matchstrategy)[number]

const _paramVals_mdeditor = ['system', 'obsidian', 'logseq'] as const
declare type _param_mdeditor = (typeof _paramVals_mdeditor)[number]

const _paramVals_obsidianresolvewithfile = [false, true] as const
declare type _param_obsidianresolvewithfile = (typeof _paramVals_obsidianresolvewithfile)[number]
const _paramVals_obsidianresolve = ['path', 'file'] as const
declare type _param_obsidianresolve = (typeof _paramVals_obsidianresolvewithfile)[number]

const _paramVals_grouplibraries = ['user', 'group'] as const
declare type _param_grouplibraries = (typeof _paramVals_grouplibraries)[number]

const _paramVals_removetags = ['keepsynced', 'addonly'] as const
declare type _param_removetags = (typeof _paramVals_removetags)[number]

const _paramVals_DebugMode = ['minimal' as DebugMode, 'maximal' as DebugMode] as const

export class Notifier {
  static readonly notificationTypes: Record<NotificationType, ZoteroIconURI> = {
    addon: 'chrome://zotero/skin/cog@2x.png',
    success: 'chrome://zotero/skin/tick@2x.png',
    error: 'chrome://zotero/skin/error@2x.png', //'cross@2x.png',
    warn: 'chrome://zotero/skin/warning@2x.png',
    info: 'chrome://zotero/skin/prefs-advanced.png',
    debug: 'chrome://zotero/skin/treeitem-patent@2x.png',
    config: 'chrome://zotero/skin/prefs-general.png',
    itemsadded: 'chrome://zotero/skin/toolbar-item-add@2x',
  }

  static notify(data: notificationData): void {
    const header = `${config.addonName} : ${data.title}`

    let messageArray: notificationData['messageArray'] = []
    try {
      if (!('messageArray' in data) || !Array.isArray(data.messageArray) || data.messageArray.length === 0) {
        messageArray = [{ body: data.body, type: data.type }]
      } else {
        messageArray = data.messageArray
      }
    } catch (e) {
      Logger.log('Notifier', `ERROR: ${e}`, false, 'error')
      return
    }

    const timeout = 5 // seconds
    const ms = 1000 // milliseconds
    const popupWin = new ztoolkit.ProgressWindow(header, {
      // window?: Window,
      closeOnClick: true,
      closeTime: timeout * ms,
      closeOtherProgressWindows: false,
    })

    for (const message of messageArray) {
      const type = message.type || 'addon'

      const lineOptions: NotifyCreateLineOptions = {
        text: message.body,
        icon: this.notificationTypes[type],
        progress: 100,
      }
      popupWin.createLine(lineOptions)
    }

    popupWin.show()
  }
}

export class BBTHelper {
  @trace
  private static BBTReady() {
    if (
      !Zotero?.BetterBibTeX?.ready ||
      Zotero.BetterBibTeX.ready.pending
      // || !Zotero.BetterBibTeX.TestSupport
    ) {
      Logger.log('bbt-bridge', 'startup: BetterBibTeX not loaded', false, 'error')
      return false
    } else {
      return true
    }
  }

  @trace
  private static async _check() {
    await Zotero.BetterBibTeX.ready
    return this.BBTReady()
  }

  @trace
  private static async _checkOld() {
    // Zotero.BetterBibTeX &&
    // typeof Zotero.BetterBibTeX === 'object'
    if (!Zotero.BetterBibTeX) {
      Logger.log('bbt-bridge', 'startup: BetterBibTeX not loaded', false, 'error')
      return false
    }
    if (!Zotero.BetterBibTeX.ready) {
      if (typeof Zotero.BetterBibTeX.ready === 'boolean') {
        Logger.log('bbt-bridge', 'startup: BetterBibTeX initialization error', false, 'error')
      } else {
        Logger.log('bbt-bridge', 'startup: BetterBibTeX not initialized', false, 'error')
      }
      return false
    }

    Logger.log('bbt-bridge', 'startup: checking if BetterBibTeX ready', false, 'info')
    await Zotero.BetterBibTeX.ready
    Logger.log('bbt-bridge', 'startup: BetterBibTeX ready!', false, 'info')
    return true
  }

  @trace
  private static _fetchBBTdata(BetterBibTeX: BetterBibTeX): BBTCitekeyRecord[] {
    try {
      return BetterBibTeX.KeyManager.all()
    } catch (err) {
      Logger.log('bbt-bridge', `_fetchBBTdata: KeyManager failed: ${err}`, false, 'error')
      DataManager.markFail()
    }
    return []
  }

  @trace
  static async getBBTdata(): Promise<BBTCitekeyRecord[]> {
    if (await this._check()) {
      return this._fetchBBTdata(Zotero.BetterBibTeX as BetterBibTeX)
    } else {
      return []
    }
  }

  // private static async _fetchBBTkeyData(BetterBibTeX): Promise<BBTItem[]> {
  //   try {
  //       if (BetterBibTeX.KeyManager.keys.count() > 0) {
  //         // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  //         return BetterBibTeX.KeyManager.keys.data
  //       }
  //   }
  //   catch (e) {
  //     Zotero.debug(`${config.addonName.replace("-", "")}: Error: ${e}`)
  //   }
  //   return []
  // }
  //
  // static async getBBTkeyData(): Promise<BBTItem[]> {
  //   if (await this._check()) {
  //     return this._fetchBBTkeyData(Zotero.BetterBibTeX as BetterBibTeX)
  //   } else {
  //     return []
  //   }
  // }

  /*
const script = `
(async () => {
  Services.obs.notifyObservers(null, "startupcache-invalidate", null);
  const { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
  const addon = await AddonManager.getAddonByID("${addonID}");
  await addon.reload();
  const progressWindow = new Zotero.ProgressWindow({ closeOnClick: true });
  progressWindow.changeHeadline("${addonName} Hot Reload");
  progressWindow.progress = new progressWindow.ItemProgress(
    "chrome://zotero/skin/tick.png",
    "VERSION=${version}, BUILD=${new Date().toLocaleString()}. By zotero-plugin-toolkit"
  );
  progressWindow.progress.setProgress(100);
  progressWindow.show();
  progressWindow.startCloseTimer(5000);
})()`;
 */

  // @log
  // private static async _check_alt() {
  //
  //   const deferred = Zotero.Promise.defer()
  //
  //   const checkBTT = addon => {
  //     let res = false
  //     if (addon === null || !addon.isActive) {
  //       res = false
  //     }
  //     else {
  //       const win = Services.wm.getMostRecentWindow('navigator:browser')
  //       // win.Zotero.BetterBibTeX.ready.then(() => {
  //       //   res = true
  //       // })
  //       try {
  //         win.Zotero.BetterBibTeX.isPending()
  //         res = true
  //       }
  //       catch (e) {
  //         Zotero.debug(`${config.addonName.replace("-", "")}: Error: ${e}`)
  //       }
  //     }
  //     deferred.resolve(res)
  //   }
  //
  //   const { AddonManager } = ChromeUtils.import("resource://gre/modules/AddonManager.jsm")
  //   const bbt = await AddonManager.getAddonByID('better-bibtex@iris-advies.com')
  //   return deferred.promise
  // }
}

export class getParam {
  @trace
  static sourcedir(): prefParam {
    const name = 'sourcedir'
    const defaultValue = ''
    const valid = false
    const param: prefParam = { name: name, value: defaultValue, valid: valid }
    try {
      const value = getPref(name) as string
      if (typeof value !== 'string') throw new Error('Vault Path Not Found')
      if (value.length === 0) throw new Error('Vault Path Not Found')

      const sourcedirpathObj = Zotero.File.pathToFile(value)
      sourcedirpathObj.normalize()
      const sourcedirpath = sourcedirpathObj.path
      if (
        typeof sourcedirpath === 'string' &&
        sourcedirpath.length > 0 &&
        sourcedirpathObj.exists() &&
        sourcedirpathObj.isDirectory()
      ) {
        param.value = sourcedirpath
        param.valid = true
      }
    } catch (e) {
      // TODO only show notification if user sync run manually (not run on startup)
      Logger.log('getParam', `ERROR: sourcedirpath :: ${e}`, false, 'error')
      Notifier.notify({
        title: 'Warning',
        body: `Vault Path Not Found. Set the path to your notes in the ${config.addonName} preferences.`,
        type: 'error',
      })
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static filefilterstrategy() {
    const name = 'filefilterstrategy'
    const defaultValue = _paramVals_filefilterstrategy[0] as _param_filefilterstrategy
    const valid = true
    const param = { name: name, value: defaultValue, valid: valid }

    const value = getPref(name) as _param_filefilterstrategy
    if (_paramVals_filefilterstrategy.includes(value)) {
      param.value = value as _param_filefilterstrategy
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: filefilterstrategy: invalid RegExp :: ${value}`, false, 'error')
      Logger.log('getParam', `filefilterstrategy: set to default :: ${defaultValue.toString()}`, false, 'error')
      setPref(name, defaultValue)
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static filepattern() {
    const name = 'filepattern'
    const defaultValue = '^@(\\S+).*\\.md$'
    const defaultRegExp_ = /^@(\S+).*\.md$/i
    const defaultRegExp = new RegExp(defaultValue, 'i')
    const valid = true
    const param = { name: name, value: defaultRegExp, valid: valid }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0 && prefHelpers.isValidRegExp(value)) {
      param.value = new RegExp(value, 'i')
      param.valid = true
    } else {
      if (value !== '' && value !== defaultValue) {
        Logger.log('getParam', `ERROR: filepattern: invalid RegExp :: ${value}. Using default instead.`, false, 'error')
        Logger.log('getParam', `filepattern: set to default :: ${defaultRegExp_.toString()}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, { ...param, value: param.value.toString() }, false, 'config')
    return param
  }

  @trace
  static matchstrategy() {
    const name = 'matchstrategy'
    const defaultValue = _paramVals_matchstrategy[0] as _param_matchstrategy
    const param = { name: name, value: defaultValue, valid: true }
    const value = getPref(name) as _param_matchstrategy
    if (_paramVals_matchstrategy.includes(value)) {
      param.value = value
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: matchstrategy: invalid :: ${value}`, false, 'error')
      Logger.log('getParam', `matchstrategy: set to default :: ${defaultValue}`, false, 'error')
      setPref(name, defaultValue)
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static bbtyamlkeyword() {
    const name = 'bbtyamlkeyword'
    const defaultValue = ''
    const valid = false
    const param = { name: name, value: defaultValue, valid: valid }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0 && prefHelpers.checkMetadataFormat(value)) {
      /// checkMetadataFormat() will show a notification
      param.value = value
      param.valid = true
    } else {
      if (value !== '' && value !== defaultValue) {
        Logger.log('getParam', `ERROR: bbtyamlkeyword: invalid param :: ${value}`, false, 'error')
        Logger.log('getParam', `bbtyamlkeyword: set to default :: ${defaultValue}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static bbtregexp() {
    const name = 'bbtregexp'
    const defaultValue = ''
    const defaultRegExp = new RegExp(defaultValue, 'm')
    const valid = false
    const param = { name: name, value: defaultRegExp, valid: valid }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0 && prefHelpers.isValidRegExp(value)) {
      param.value = new RegExp(value, 'm')
      param.valid = true
    } else {
      if (value !== '' && value !== defaultValue) {
        Logger.log('getParam', `ERROR: bbtregexp: invalid RegExp :: ${value}`, false, 'error')
        Logger.log('getParam', `bbtregexp: set to default :: ${defaultRegExp.toString()}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, { ...param, value: param.value.toString() }, false, 'config')
    return param
  }

  @trace
  static zotkeyregexp() {
    const name = 'zotkeyregexp'
    const param = { name: name, value: new RegExp(''), valid: false }
    const value = getPref(name) as string

    if (typeof value === 'string' && value.length > 0 && prefHelpers.isValidRegExp(value)) {
      param.value = new RegExp(value)
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: filepattern: invalid RegExp :: ${value}`, false, 'error')
      // TODO only show notification if user sync run manually (not run on startup)
      //TODO DEBUG
      // Notifier.showNotification(
      //   'Warning',
      //   `User Defined RegExp Invalid. The RegExp you specified in the preferences is invalid: ${value}`,
      //   false,
      // )
    }
    Logger.log(name, { ...param, value: param.value.toString() }, false, 'config')
    return param
  }

  @trace
  static mdeditor() {
    const name = 'mdeditor'
    const defaultValue = _paramVals_mdeditor[0] as _param_mdeditor
    const param = { name: name, value: defaultValue, valid: true }

    let value = getPref(name) as _param_mdeditor
    if (_paramVals_mdeditor.includes(value)) {
      param.value = value
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: mdeditor: invalid param :: ${value}`, false, 'error')
      Logger.log('getParam', `mdeditor: set to default :: ${defaultValue}`, false, 'error')
      setPref(name, defaultValue)
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static obsidianresolve() {
    const name = 'obsidianresolvewithfile'
    const defaultValue = _paramVals_obsidianresolvewithfile[0] as _param_obsidianresolvewithfile
    const valid = true
    const param = {
      name: name,
      value: defaultValue ? _paramVals_obsidianresolve[1] : _paramVals_obsidianresolve[0], //// if true use 'file', if false use 'path' (the default)
      valid: valid,
    }

    const value = getPref('obsidianresolvewithfile') as _param_obsidianresolvewithfile
    if (_paramVals_obsidianresolvewithfile.includes(value)) {
      param.value = value ? _paramVals_obsidianresolve[1] : _paramVals_obsidianresolve[0]
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: obsidianresolve: invalid param :: ${value}`, false, 'error')
      Logger.log('getParam', `obsidianresolve: set to default :: ${defaultValue.toString()}`, false, 'error')
      setPref(name, defaultValue)
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static obsidianvaultname() {
    const name = 'obsidianvaultname'
    const defaultValue = ''
    const valid = false
    const param = { name: name, value: defaultValue, valid: valid }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0) {
      param.value = value
      param.valid = true
    } else {
      if (value !== '' && value !== defaultValue) {
        Logger.log('getParam', `ERROR: obsidianvaultname: invalid param :: ${value}`, false, 'error')
        Logger.log('getParam', `obsidianvaultname: set to default :: ${defaultValue}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static logseqgraph() {
    const name = 'logseqgraph'
    const defaultValue = ''
    const valid = false
    const param = { name: name, value: defaultValue, valid: valid }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0) {
      param.value = value
      param.valid = true
    } else {
      if (value !== '' && value !== defaultValue) {
        Logger.log('getParam', `ERROR: logseqgraph: invalid param :: ${value}`, false, 'error')
        Logger.log('getParam', `logseqgraph: set to default :: ${defaultValue}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static logseqprefix() {
    const name = 'logseqprefix'
    const defaultValue = ''
    const valid = false
    const param = { name: name, value: defaultValue, valid: valid }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0) {
      param.value = value
      param.valid = true
    } else {
      if (value !== '' && value !== defaultValue) {
        Logger.log('getParam', `ERROR: logseqprefix: invalid param :: ${value}`, false, 'error')
        Logger.log('getParam', `logseqprefix: set to default :: ${defaultValue}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static grouplibraries() {
    const name = 'grouplibraries'
    const defaultValue = _paramVals_grouplibraries[0] as _param_grouplibraries
    const param = { name: name, value: defaultValue, valid: true }

    const value = getPref(name) as _param_grouplibraries
    if (_paramVals_grouplibraries.includes(value)) {
      param.value = value
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: grouplibraries: invalid param :: ${value}`, false, 'error')
      Logger.log('getParam', `grouplibraries: set to default :: ${defaultValue}`, false, 'error')
      setPref(name, defaultValue)
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static removetags() {
    const name = 'removetags'
    const defaultValue = _paramVals_removetags[0] as _param_removetags
    const param = { name: name, value: defaultValue, valid: true }

    const value = getPref(name) as _param_removetags
    if (_paramVals_removetags.includes(value)) {
      param.value = value
      param.valid = true
    } else {
      Logger.log('getParam', `ERROR: removetags: invalid param :: ${value}`, false, 'error')
      Logger.log('getParam', `removetags: set to default :: ${defaultValue}`, false, 'error')
      setPref(name, defaultValue)
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static tagstr() {
    const name = 'tagstr'
    const defaultValue = 'ObsCite'
    const param = { name: name, value: defaultValue, valid: true }
    const value = getPref(name) as string
    if (typeof value === 'string' && value.length > 0 && prefHelpers.checkTagStr(value)) {
      param.value = value
      param.valid = true
    } else {
      if (value !== '') {
        Logger.log('getParam', `ERROR: tagstr: invalid param :: ${value}`, false, 'error')
        Logger.log('getParam', `tagstr: set to default :: ${defaultValue}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static debugmode() {
    const name = 'debugmode'
    const defaultValue = 'minimal' as DebugMode
    const param = { name: name, value: defaultValue, valid: true }
    const value = getPref(name) as DebugMode
    if (_paramVals_DebugMode.includes(value)) {
      param.value = value
      param.valid = true
    } else {
      if (value !== defaultValue) {
        Logger.log('getParam', `ERROR: debugmode: invalid param :: ${value}`, false, 'error')
        Logger.log('getParam', `debugmode: set to default :: ${defaultValue}`, false, 'error')
        setPref(name, defaultValue)
      }
    }
    Logger.log(name, param, false, 'config')
    return param
  }
}

const listDirContents = async (dirpath: string): Promise<OSFile[]> => {
  const items: OSFile[] = []
  /* Zotero.File.iterateDirectory calls new OS.File.DirectoryIterator(dirpath) */
  await Zotero.File.iterateDirectory(dirpath, (item: OSFile) => {
    if (!item.name.startsWith('.')) {
      items.push(item)
    }
  })
  return items
}

const listFilesRecursively = async function* (dirpath: string): AsyncGenerator<OSFile> {
  // Does not follow symbolic links //
  const entries = await listDirContents(dirpath)
  for (const entry of entries) {
    if (entry.isDir) {
      yield* listFilesRecursively(entry.path)
    } else if (!entry.isSymLink) {
      yield entry
    }
  }
}

class Utils {
  static async getFilesRecursively(dirpath: string): Promise<OSFile[]> {
    const files: OSFile[] = [] // OS.File.Entry[]

    try {
      const basedirObj = Zotero.File.pathToFile(dirpath)
      basedirObj.normalize()

      if (!basedirObj.exists() || !basedirObj.isDirectory()) {
        Logger.log('getFilesRecursively', `ERROR ${basedirObj.path} does not exist or is not a folder`, false, 'warn')
        throw new Error(`${basedirObj.path} does not exist or is file`)
      }

      for await (const filepath of listFilesRecursively(basedirObj.path)) {
        files.push(filepath)
      }
    } catch (e) {
      Logger.log('getFilesRecursively', `ERROR: ${e}`, false, 'warn')
    }

    return files
  }

  static async findTaggedItems(tagstr: string): Promise<Zotero.Item[]> {
    const s = new Zotero.Search()
    if (getParam.grouplibraries().value === 'user') {
      // @ts-ignore
      s.libraryID = Zotero.Libraries.userLibraryID
    }
    s.addCondition('deleted', 'false' as Zotero.Search.Operator, '')
    s.addCondition('tag', 'is', tagstr)
    const itemIds = await s.search()
    return await Zotero.Items.getAsync(itemIds)
  }

  static async removeAllTags(tagstr: string): Promise<void> {
    const items_tagged = await this.findTaggedItems(tagstr)
    //// remove tags ////
    for (const item of items_tagged) {
      item.removeTag(tagstr)
      await item.saveTx()
    }
  }
}

export class ScanMarkdownFiles {
  @trace
  static async scanVault(): Promise<Entry[]> {
    const res: Entry[] = []
    const reserr: Entry[] = []

    const protocol = getParam.mdeditor().value

    const matchstrategy = getParam.matchstrategy().value

    const sourcedirParam = getParam.sourcedir()
    if (!sourcedirParam.valid) return res
    const sourcedir = sourcedirParam.value

    const bbtyamlkeywordParam =
      matchstrategy === 'bbtcitekeyyaml' ? getParam.bbtyamlkeyword() : { name: '', value: '', valid: false }

    const bbtregexpParam =
      matchstrategy === 'bbtcitekeyregexp' ? getParam.bbtregexp() : { name: '', value: new RegExp(''), valid: false }

    /// pattern to match MD files
    const filefilterstrategy = getParam.filefilterstrategy().value

    /// pattern to match citekey in MD file name
    let re_file: RegExp = /^@.+\.md$/i
    let re_title: RegExp = /^@(\S+).*\.md$/i
    if (filefilterstrategy === 'customfileregexp') {
      re_file = re_title = getParam.filepattern().value
    }
    // if (filefilterstrategy === 'default && protocol === 'logseq') {
    //   const logseq_prefix_file = getParam.logseqprefix().value
    //   // const logseq_prefix_file_encoded = encodeURIComponent(logseq_prefix_file)
    //   re_title = new RegExp(`^@${logseq_prefix_file}(\\S+).*\\.md$`, 'i')
    // }

    /// pattern to trim extension from filename
    const re_suffix = /\.md$/i

    let logseq_prefix_valid = false
    let logseq_prefix_file = ''
    let logseq_prefix_title = ''
    if (protocol === 'logseq') {
      const logseqprefixParam = getParam.logseqprefix()
      logseq_prefix_valid = logseqprefixParam.valid
      logseq_prefix_file = logseqprefixParam.value
      logseq_prefix_title = logseqprefixParam.value
    }

    const allFiles = await Utils.getFilesRecursively(sourcedir)
    const filteredFiles = allFiles.filter((file) => re_file.test(file.name))

    await Promise.all(
      filteredFiles.map(async (entry) => {
        const filename = entry.name
        const filenamebase = filename.replace(re_suffix, '')
        const filepath = entry.path

        let noteName = filenamebase
        if (protocol === 'logseq') {
          if (logseq_prefix_valid) {
            if (noteName.startsWith(logseq_prefix_file)) {
              noteName = noteName.replace(new RegExp(`^${logseq_prefix_file}`), '')
            }
            // const noteNameWithoutPrefix = decodeURIComponent(filenamebase).replace(decodeURIComponent(logseq_prefix_file), '')
          }
        }

        const entry_res: Entry = {
          citekey: '',
          citekey_metadata: '',
          citekey_title: '',
          zotkeys: [],
          zotids: [],
          name: noteName,
          path: filepath,
        }

        /// get citekey from filename
        try {
          const reTitle_match_res = filename.match(re_title)
          if (reTitle_match_res && reTitle_match_res.length > 1) {
            entry_res.citekey_title = filename.match(re_title)[1].trim()
          }
        } catch (e) {
          Logger.log('scanVault', `ERROR: get citekey from filename :: ${e}`, false, 'warn')
        }

        /// get citekey from metadata
        try {
          if (matchstrategy === 'bbtcitekeyyaml') {
            if (bbtyamlkeywordParam.valid) {
              /// pattern to match citekey in MD file metadata
              const re_metadata = new RegExp(`^${bbtyamlkeywordParam.value}: *(?:['"])?(\\S+?)(?:['"]|\\s|$)`, 'm')
              const contents = (await Zotero.File.getContentsAsync(filepath)) as string
              /// get metadata
              const contentSections = contents.split('\n---')
              const metadata = contentSections[0]
              if (contentSections.length > 1 && metadata.startsWith('---')) {
                const reBody_match_res = metadata.match(re_metadata)
                if (reBody_match_res && reBody_match_res.length > 1) {
                  entry_res.citekey_metadata = reBody_match_res[1].trim()
                }
              }
            }
          } else if (matchstrategy === 'bbtcitekeyregexp') {
            if (bbtregexpParam.valid) {
              /// pattern to match citekey in MD file contents
              const re_body = bbtregexpParam.value
              const contents = (await Zotero.File.getContentsAsync(filepath)) as string
              const reBody_match_res = contents.match(re_body)
              if (reBody_match_res && reBody_match_res.length > 1) {
                entry_res.citekey_metadata = reBody_match_res[1].trim()
              }
            }
          }
        } catch (e) {
          Logger.log('scanVault', `ERROR: get citekey from metadata :: ${e}`, false, 'warn')
        }

        entry_res.citekey = entry_res.citekey_metadata || entry_res.citekey_title
        if (entry_res.citekey === '') {
          reserr.push(entry_res)
        }

        res.push(entry_res)
      }),
    )

    const enableSaveData = Logger.mode() === 'maximal'
    const LogDataKey = 'scanVault'
    if (enableSaveData) Logger.addData(LogDataKey, res, true)

    if (reserr.length > 0) {
      DataManager.markFail()
      Logger.log(LogDataKey, `ERROR :: ${reserr.length} Errors`, true, 'warn')
      const LogDataErrorsKey = `${LogDataKey}-Errors`
      if (enableSaveData) Logger.addData(LogDataErrorsKey, reserr, true)

      const message: messageData = {
        rowData: {
          title: 'Markdown Import Errors',
          message: [
            `There were ${reserr.length} Markdown notes that could not be parsed.`,
            `(${res.length - reserr.length} notes were parsed successfully.)`,
          ].join('\n\n'),
        },
        notification: {
          title: 'Markdown Import Error',
          body: `Unable to parse ${reserr.length} of ${filteredFiles.length} MD notes.`,
          type: 'error',
        },
      }

      if (enableSaveData) {
        message.rowData.message += '\n\nWould you like to save these errors to a json file?'
        message.saveData = {
          saveButtonTitle: 'Save Parsing Errors',
          saveDialogTitle: `Save ${config.addonName} Parsing Errors To...`,
          fileNameSuggest: `${config.addonName.replace('-', '')}-parsing-errors.json`,
          dataGetter: (): string => {
            return JSON.stringify(Logger.getData(LogDataErrorsKey), null, 1)
          },
        }
      }

      Logger.addMessage(message)
    }

    return res
  }

  static async scanVaultCustomRegex(): Promise<Entry[]> {
    const res: Entry[] = []
    const reserr: Entry[] = []

    const protocol = getParam.mdeditor().value

    const matchstrategy = getParam.matchstrategy().value

    if (matchstrategy !== 'zotitemkey') return res

    const sourcedirParam = getParam.sourcedir()
    if (!sourcedirParam.valid) return res
    const sourcedir = sourcedirParam.value

    const zotkeyregexpParam = getParam.zotkeyregexp()

    /// pattern to match MD files
    const filefilterstrategy = getParam.filefilterstrategy().value

    /// pattern to match citekey in MD file name
    let re_file: RegExp = /^@.+\.md$/i
    if (filefilterstrategy === 'customfileregexp') {
      re_file = getParam.filepattern().value
    }
    const re_contents = zotkeyregexpParam.valid ? new RegExp(zotkeyregexpParam.value, 'm') : new RegExp('', 'm')

    /// pattern to trim extension from filename
    const re_suffix = /\.md$/i

    let logseq_prefix_valid = false
    let logseq_prefix_file = ''
    let logseq_prefix_title = ''
    if (protocol === 'logseq') {
      const logseqprefixParam = getParam.logseqprefix()
      logseq_prefix_valid = logseqprefixParam.valid
      logseq_prefix_file = logseqprefixParam.value
      logseq_prefix_title = logseqprefixParam.value
    }

    const allFiles = await Utils.getFilesRecursively(sourcedir)
    const filteredFiles = allFiles.filter((file) => re_file.test(file.name))

    await Promise.all(
      filteredFiles.map(async (entry) => {
        const filename = entry.name
        const filenamebase = filename.replace(re_suffix, '')
        const filepath = entry.path

        let noteName = filenamebase
        if (protocol === 'logseq') {
          if (logseq_prefix_valid) {
            if (noteName.startsWith(logseq_prefix_file)) {
              noteName = noteName.replace(new RegExp(`^${logseq_prefix_file}`), '')
            }
            // const noteNameWithoutPrefix = decodeURIComponent(filenamebase).replace(decodeURIComponent(logseq_prefix_file), '')
          }
        }

        const entry_res: Entry = {
          citekey: '',
          citekey_metadata: '',
          citekey_title: '',
          zotkeys: [],
          zotids: [],
          name: noteName,
          path: filepath,
        }

        /// get the ZoteroKey from the contents
        try {
          const contents = (await Zotero.File.getContentsAsync(filepath)) as string
          entry_res.zotkeys.push(contents.match(re_contents)[1].trim())
        } catch (e) {
          Logger.log('scanVaultCustomRegex', `ERROR: get zotid from contents :: ${e}`, false, 'warn')
        }

        if (entry_res.zotkeys.length === 0) {
          reserr.push(entry_res)
        }

        res.push(entry_res)
      }),
    )

    const enableSaveData = Logger.mode() === 'maximal'
    const LogDataKey = 'scanVaultCustomRegex'
    if (enableSaveData) Logger.addData(LogDataKey, res, true)

    if (reserr.length > 0) {
      DataManager.markFail()
      Logger.log(LogDataKey, `ERROR :: ${reserr.length} Errors`, true, 'warn')
      const LogDataErrorsKey = `${LogDataKey}-Errors`
      if (enableSaveData) Logger.addData(LogDataErrorsKey, reserr, true)

      const message: messageData = {
        rowData: {
          title: 'Markdown Import Errors',
          message: [
            `There were ${reserr.length} Markdown notes that could not be parsed.`,
            `(${res.length - reserr.length} notes were parsed successfully.)`,
          ].join('\n\n'),
        },
        notification: {
          title: 'Markdown Import Error',
          body: `Unable to parse ${reserr.length} of ${filteredFiles.length} MD notes.`,
          type: 'error',
        },
      }

      if (enableSaveData) {
        message.rowData.message += '\n\nWould you like to save these errors to a json file?'
        message.saveData = {
          saveButtonTitle: 'Save Parsing Errors',
          saveDialogTitle: `Save ${config.addonName} Parsing Errors To...`,
          fileNameSuggest: `${config.addonName.replace('-', '')}-parsing-errors.json`,
          dataGetter: (): string => {
            return JSON.stringify(Logger.getData(LogDataErrorsKey), null, 1)
          },
        }
      }

      Logger.addMessage(message)
    }

    return res
  }

  @trace
  private static async mapCitekeysBBTquery(): Promise<Record<string, number[]>> {
    /*
     * make Record of BBTcitekey -> zoteroID for every item in the library
     */

    /// get all items in library
    const s = new Zotero.Search()
    if (getParam.grouplibraries().value === 'user') {
      // @ts-ignore
      s.libraryID = Zotero.Libraries.userLibraryID
    }
    s.addCondition('deleted', 'false' as Zotero.Search.Operator, '')
    const itemIds = await s.search()

    const BBTItems = await BBTHelper.getBBTdata()

    const citekeymap = BBTItems.reduce((accumulator: Record<string, number[]>, bbtitem) => {
      if (!itemIds.includes(bbtitem.itemID)) {
        return accumulator
      }
      if (!accumulator[bbtitem.citationKey]) {
        accumulator[bbtitem.citationKey] = [bbtitem.itemID]
      } else {
        accumulator[bbtitem.citationKey].push(bbtitem.itemID)
      }
      return accumulator
    }, {})

    Logger.addData('mapCitekeysBBTquery', citekeymap, true)

    return citekeymap
  }

  @trace
  private static async mapIDkeysZoteroquery(): Promise<Record<string, number[]>> {
    /*
     * make Record of zoteroKey -> zoteroID for every item in the library
     */

    const keymaperr = []

    /// get all items in library
    const s = new Zotero.Search()
    if (getParam.grouplibraries().value === 'user') {
      // @ts-ignore
      s.libraryID = Zotero.Libraries.userLibraryID
    }
    s.addCondition('deleted', 'false' as Zotero.Search.Operator, '')
    const itemIds = await s.search()

    let ZotItems: Zotero.Item[] = await Zotero.Items.getAsync(itemIds)

    // ZotItems.forEach((zotitem) => {
    //   try {
    //     keymap[zotitem.key] = zotitem.id
    //   } catch (e) {
    //     keymaperr.push(zotitem)
    //   }
    // })

    const keymap = ZotItems.reduce((accumulator: Record<string, number[]>, zotitem) => {
      if (!itemIds.includes(zotitem.id)) {
        return accumulator
      }
      if (!accumulator[zotitem.key]) {
        accumulator[zotitem.key] = [zotitem.id]
      } else {
        accumulator[zotitem.key].push(zotitem.id)
      }
      return accumulator
    }, {})

    Logger.addData('mapCitekeysBBTquery', keymap, true)

    return keymap
  }

  @trace
  private static sliceObj(res: Entry[], citekeymap: Record<string, number[]>): Entry[] {
    /*
     * res :: array of item data
     * citekeymap :: dict of BBT citekeys to Zotero itemIDs
     */

    // Logger.addDebugLog('sliceObj - res', `${res.length}`)
    // Logger.addDebugLog('sliceObj - res[0].citekey', `${res[0].citekey}`)
    // Logger.addDebugLog('sliceObj - Object.keys(citekeymap).length', `${Object.keys(citekeymap).length}`)
    // Logger.addDebugLog('sliceObj - Object.keys(citekeymap).length', `${Object.keys(citekeymap)}`)

    const reserr: Entry[] = []

    const citekeys = Object.keys(citekeymap)

    for (const entry_res of res) {
      if (entry_res.citekey) {
        if (citekeys.includes(entry_res.citekey)) {
          entry_res.zotids = citekeymap[entry_res.citekey]
        } else if (citekeys.includes(entry_res.citekey_metadata)) {
          entry_res.zotids = citekeymap[entry_res.citekey_metadata]
        } else if (citekeys.includes(entry_res.citekey_title)) {
          entry_res.zotids = citekeymap[entry_res.citekey_title]
        } else {
          reserr.push(entry_res)
        }
      } else {
        reserr.push(entry_res)
      }
    }

    const enableSaveData = Logger.mode() === 'maximal'
    const LogDataKey = 'sliceObj'
    if (enableSaveData) Logger.addData(LogDataKey, res, true)

    if (reserr.length > 0) {
      DataManager.markFail()
      Logger.log('sliceObj', `ERROR :: ${reserr.length} Errors`, true, 'warn')
      const LogDataErrorsKey = `${LogDataKey}-Errors`
      if (enableSaveData) Logger.addData('sliceObj-Errors', reserr, true)

      const message: messageData = {
        rowData: {
          title: 'Unmatched citekeys',
          message: [
            `There were ${reserr.length} citekeys in your Markdown notes that could not be matched to items in your Zotero library.`,
            `(Matches for ${res.length - reserr.length} citekeys were found successfully.)`,
          ].join('\n\n'),
        },
        notification: {
          title: 'Unmatched citekeys',
          body: `${reserr.length} unmatched citekeys.`, // Run Sync from Tools menu to generate report.`,
          type: 'error',
        },
      }

      if (enableSaveData) {
        message.rowData.message += '\n\nWould you like to save the names of these citekeys in a json file?'
        message.saveData = {
          saveButtonTitle: 'Save Mapping Errors',
          saveDialogTitle: `Save ${config.addonName} Errors To...`,
          fileNameSuggest: `${config.addonName.replace('-', '')}-matching-errors.json`,
          dataGetter: (): string => {
            return JSON.stringify(Logger.getData(LogDataErrorsKey), null, 1)
          },
        }
      }

      Logger.addMessage(message)
    }

    return res
  }

  @trace
  private static sliceObjCustomRegex(res: Entry[], zoterokeymap: Record<string, number[]>): Entry[] {
    /*
     * res :: array of item data
     * zoterokeymap :: dict of Zotero itemKeys to Zotero itemIDs
     */

    const reserr: Entry[] = []

    const zotkeys = Object.keys(zoterokeymap)

    res.forEach((entry_res) => {
      entry_res.zotkeys.forEach((zotkey) => {
        if (zotkeys.includes(zotkey)) {
          entry_res.zotids = zoterokeymap[zotkey]
        } else {
          reserr.push(entry_res)
        }
      })
    })

    const enableSaveData = Logger.mode() === 'maximal'
    const LogDataKey = 'sliceObjCustomRegex'
    if (enableSaveData) Logger.addData(LogDataKey, res, true)

    if (reserr.length > 0) {
      DataManager.markFail()
      Logger.log('sliceObjCustomRegex', `ERROR :: ${reserr.length} Errors`, true, 'warn')
      const LogDataErrorsKey = `${LogDataKey}-Errors`
      if (enableSaveData) Logger.addData('sliceObjCustomRegex-Errors', reserr, true)

      const message: messageData = {
        rowData: {
          title: 'Unmatched zoteroKeys',
          message: [
            `There were ${reserr.length} zoteroKeys in your Markdown notes that could not be matched to items in your Zotero library.`,
            `(Matches for ${res.length - reserr.length} zoteroKeys were found successfully.)`,
          ].join('\n\n'),
        },
        notification: {
          title: 'Unmatched zoteroKeys',
          body: `${reserr.length} unmatched zoteroKeys.`, // Run Sync from Tools menu to generate report.`,
          type: 'error',
        },
      }

      if (enableSaveData) {
        message.rowData.message += '\n\nWould you like to save the unmatched entries as a json file?'
        message.saveData = {
          saveButtonTitle: 'Save Mapping Errors',
          saveDialogTitle: `Save ${config.addonName} Errors To...`,
          fileNameSuggest: `${config.addonName.replace('-', '')}-matching-errors.json`,
          dataGetter: (): string => {
            return JSON.stringify(Logger.getData(LogDataErrorsKey), null, 1)
          },
        }
      }

      Logger.addMessage(message)
    }

    return res
  }

  @trace
  static async processData(): Promise<void> {
    // debug = debug || false
    let res: Entry[]

    const matchstrategy = getParam.matchstrategy().value

    /*
    1 - match MD notes based on BBT citekey
    /// 1 - bbtcitekey in md note title or body >> use bbtdata
    /// const bbtdata = await _getBBTkeyData();

    MD files to Include:
    md notes begin with @mycitekey
    (optional) md notes contain the BBT citekey in the metadata id: 'citekey'

    OR

    2- match MD notes based on zotero item key
    /// 2 - zotkey in md body >> use contentregex

    MD files to Include:
    include notes whose filenames match this regex: '^@.+'
        /// first filter MD files, then filter by user regex
    regex to extract the zotkey: regex
    */

    if (matchstrategy === 'bbtcitekeyyaml' || matchstrategy === 'bbtcitekeyregexp') {
      //// get BBT citekeys from markdown files ////
      res = await this.scanVault() /// returns data array containing BBT citekeys

      if (res.length === 0) {
        let message: messageData
        if (getParam.filefilterstrategy().value === 'default') {
          message = {
            rowData: {
              title: 'No Markdown files found',
              message: `Check the path to your Markdown notes in the ${config.addonName} preferences.`,
            },
            notification: {
              title: 'No Markdown files found',
              body: `Check the path to your Markdown notes in the ${config.addonName} preferences.`,
              type: 'error',
            },
          }
        } else {
          message = {
            rowData: {
              title: 'No Markdown files found',
              message: `Check the File Filter RegExp and the path to your Markdown notes in the ${config.addonName} preferences.`,
            },
            notification: {
              title: 'No Markdown files found',
              body: `Check the File Filter RegExp and the path to your Markdown notes in the ${config.addonName} preferences.`,
              type: 'error',
            },
          }
        }
        Logger.addMessage(message)
        return
      }

      //// get zoteroKeys and zoteroIDs for every item in Zotero library ////
      const citekeymap: Record<string, number[]> = await this.mapCitekeysBBTquery() /// returns dict mapping citekey => [zoteroId_1, zoteroId_2, ...]

      //// map BBT citekeys from markdown files with zoteroIDs ////
      res = this.sliceObj(res, citekeymap)
    } else if (matchstrategy === 'zotitemkey') {
      //// get zoterokeys from markdown files ////
      res = await this.scanVaultCustomRegex() /// returns data array containing zoteroKeys

      if (res.length === 0) {
        let message: messageData
        if (getParam.filefilterstrategy().value === 'default') {
          message = {
            rowData: {
              title: 'No Markdown files found',
              message: `Check the path to your Markdown notes in the ${config.addonName} preferences.`,
            },
            notification: {
              title: 'No Markdown files found',
              body: `Check the path to your Markdown notes in the ${config.addonName} preferences.`,
              type: 'error',
            },
          }
        } else {
          message = {
            rowData: {
              title: 'No Markdown files found',
              message: `Check the File Filter RegExp and the path to your Markdown notes in the ${config.addonName} preferences.`,
            },
            notification: {
              title: 'No Markdown files found',
              body: `Check the File Filter RegExp and the path to your Markdown notes in the ${config.addonName} preferences.`,
              type: 'error',
            },
          }
        }
        Logger.addMessage(message)
        return
      }

      //// get zoteroKeys and zoteroIDs for every item in Zotero library ////
      const zoterokeymap: Record<string, number[]> = await this.mapIDkeysZoteroquery() /// returns dict mapping citekey => [zoteroId_1, zoteroId_2, ...]

      //// map zoteroKeys from markdown files with zoteroIDs ////
      res = this.sliceObjCustomRegex(res, zoterokeymap)
    }

    // Logger.initalize()

    // res.forEach((entry_res: Entry) => {
    //   entry_res.zotids.forEach((zotid: number) => {
    //     if (typeof zotid === 'number') {
    //       /// filter located zoteroIDs from data array
    //       if (Object.keys(this.data).includes(zotid.toString())) {
    //         this.data[zotid.toString()].push(entry_res)
    //       }
    //       else {
    //         this.data[zotid.toString()] = [entry_res]
    //         this.dataZotIds.push(zotid)
    //       }
    //     }
    //   })
    // })

    for (const entry_res of res) {
      for (const zotid of entry_res.zotids) {
        if (typeof zotid === 'number') {
          //// filter located zoteroIDs from data array ////
          DataManager.addEntry(zotid, entry_res)
        }
      }
    }

    const enableSaveData = Logger.mode() === 'maximal'
    const LogDataKey = 'scanVault'
    // Logger.addData(`${LogDataKey}-clearun`, DataManager.isClean(), true)
    if (enableSaveData) Logger.addData(LogDataKey, DataManager.data(), true)
    // Logger.addData(`${LogDataKey}-zotIds`, DataManager.zotIds(), true)

    if (DataManager.numberRecords() === 0) {
      const message: messageData = {
        rowData: {
          title: 'No Matching Entries',
          message: `None of the ${res.length} Markdown notes could be matched to items in the Zotero library.`,
        },
        notification: {
          title: 'No Matching Entries',
          body: `None of the ${res.length} Markdown notes could be matched to items in the Zotero library.`,
          type: 'error',
        },
      }

      if (enableSaveData) {
        message.saveData = {
          saveButtonTitle: 'Save Data',
          saveDialogTitle: `Save ${config.addonName} Data To...`,
          fileNameSuggest: `${config.addonName.replace('-', '')}-matched.json`,
          dataGetter: (): string => {
            return JSON.stringify(Logger.getData(LogDataKey), null, 1)
            // return JSON.stringify(
            //   {
            //     cleanRun: Logger.getData(`${LogDataKey}-clearun`),
            //     data: Logger.getData(`${LogDataKey}-data`),
            //     zotIds: Logger.getData(`${LogDataKey}-zotIds`),
            //   },
            //   null,
            //   1,
            // )
          },
        }
      }

      Logger.addMessage(message)
    } else if (!DataManager.isClean()) {
      const message: messageData = {
        rowData: {
          title: 'Warning',
          message: [
            'There was an issue matching some of your Markdown notes.',
            `(${DataManager.numberRecords()} notes were matched successfully).`,
          ].join('\n\n'),
        },
      }

      if (enableSaveData) {
        message.rowData.message += '\n\nWould you like to save the data extracted from the notes to a json file?'
        message.saveData = {
          saveButtonTitle: 'Save Data',
          saveDialogTitle: `Save ${config.addonName} Data To...`,
          fileNameSuggest: `${config.addonName.replace('-', '')}-matched.json`,
          dataGetter: (): string => {
            return JSON.stringify(Logger.getData(LogDataKey), null, 1)
          },
        }
      }

      Logger.addMessage(message)
    }
  }

  @trace
  private static async updateItems(zotids: number[]): Promise<notificationData['messageArray']> {
    const tagstr = getParam.tagstr().value

    /// find all item already tagged
    const items_withtags: Zotero.Item[] = await Utils.findTaggedItems(tagstr)
    const items_withtags_zotids: number[] = items_withtags.map((x) => x.id)

    /// find all items that should be tagged
    const items_withnotes: Zotero.Item[] = await Zotero.Items.getAsync(zotids)
    const items_withnotes_zotids: number[] = items_withnotes.map((x) => x.id)

    /// find items to be tagged
    const items_totag = items_withnotes.filter((x) => !items_withtags_zotids.includes(x.id))

    /// find items that should not be tagged
    let items_removetag: Zotero.Item[] = []
    if (getParam.removetags().value === 'keepsynced') {
      items_removetag = items_withtags.filter((x) => !items_withnotes_zotids.includes(x.id))
    }

    /// find items that cannot be located in library
    const nitems_notlocatable = zotids.length - items_withnotes.length

    /// remove tag from items that should not be tagged
    for (const item of items_removetag) {
      item.removeTag(tagstr)
      await item.saveTx()
    }

    /// NB this doesn't run successfully as soon as Zotero is started, needs to wait for schema to load
    /// add tag to items that should be tagged
    for (const item of items_totag) {
      item.addTag(tagstr)
      await item.saveTx()
    }
    /// TODO set color :: https://github.com/zotero/zotero/blob/52932b6eb03f72b5fb5591ba52d8e0f4c2ef825f/chrome/content/zotero/tagColorChooser.js

    const messageArray: notificationData['messageArray'] = []
    messageArray.push({ body: `Found ${items_withnotes.length} notes.`, type: zotids.length > 0 ? 'success' : 'warn' })

    if (nitems_notlocatable !== 0) {
      messageArray.push({
        body: ` ${nitems_notlocatable} IDs could not be matched to items in the library.`,
        type: zotids.length > 0 ? 'success' : 'warn',
      })
    }
    if (items_totag.length > 0) {
      messageArray.push({
        body: ` Added ${items_totag.length} tags.`,
        type: zotids.length > 0 ? 'itemsadded' : 'info',
      })
    }
    if (items_removetag.length > 0) {
      messageArray.push({
        body: ` Removed ${items_removetag.length} tags.`,
        type: zotids.length > 0 ? 'success' : 'warn',
      })
    }

    return messageArray
  }

  @trace
  static async runSync(displayReport = false, saveLogs = false) {
    /// TODO better error notification handling. Collect errors and show them at the end.
    /// TODO validate settings on preference window close.

    let dryrun = false
    const debug = displayReport || saveLogs

    const configPass = await wrappers.startupConfigCheck()
    if (!configPass) {
      Notifier.notify({
        title: 'Configuration Invalid',
        body: `Aborting. Check the ${config.addonName} preferences.`,
        type: 'error',
      })
      return
    }

    if (debug) {
      Logger.setDebugMode('maximal')
    }

    if (Logger.mode() === 'minimal') {
      //// clear logs, data, and messages ////
      Logger.clear()
    } else {
      //// only clear messages ////
      Logger.clearMessages()
    }

    // let notifData: NotificationData = [`${config.addonName} Syncing Error`, 'Some Error Occurred', false]

    DataManager.initialize()

    await this.processData()

    if (DataManager.numberRecords() === 0) {
      dryrun = true
    }

    let header: string = 'Syncing Error'
    let messageArray: notificationData['messageArray'] = [{ body: 'Some Error Occurred', type: 'error' }]
    if (!dryrun) {
      messageArray = await this.updateItems(DataManager.zotIds())
    } else {
      messageArray = [{ body: `Found ${DataManager.numberRecords()} notes.`, type: 'error' }]
    }
    header = 'Synced'

    const summaryMessages = Object.entries(messageArray).map(([key, value]) => `${value.body}`)
    const loggedMessages = Logger.getMessages()

    if (displayReport) {
      if (!DataManager.isClean() || DataManager.numberRecords() === 0) {
        await this.displayReportDialog(summaryMessages, loggedMessages)
      }
    } else if (saveLogs) {
      await systemInterface.dumpDebuggingLog()
    } else {
      for (const msg of loggedMessages) {
        if (msg.notification) {
          messageArray.push({
            body: `${msg.notification.title}: ${msg.notification.body}`,
            type: msg.notification.type,
          })
        }
      }
      if (!DataManager.isClean() || DataManager.numberRecords() === 0) {
        messageArray.push({ body: `For details, run "${getString('menuitem-debug')}" in Tools menu.`, type: 'warn' })
      }
      const notification: notificationData = {
        title: header,
        messageArray: messageArray,
      }
      Notifier.notify(notification)
    }

    if (debug) {
      Logger.setDebugMode(getParam.debugmode().value)
    }
  }

  static async displayReportDialog(summaryMessages: string[], loggedMessages: messageData[]) {
    addon.data.dialog?.window?.close()
    addon.data.dialog = undefined

    const dialogData: Record<string | number, any> = {
      loadCallback: () => {
        Logger.log('displayReportDialog - Dialog opened - loadCallback', dialogData, false, 'info')
      },
      unloadCallback: () => {
        Logger.log('displayReportDialog - Dialog closed - unloadCallback', dialogData, false, 'info')
      },
    }

    let nrows = 0
    nrows += 2 // title h1 + summary h2
    nrows += summaryMessages.length
    nrows += loggedMessages.length > 0 ? 2 : 0 // messages h2 + message p
    nrows += 2 * loggedMessages.length // number of messages
    nrows += loggedMessages.filter((x) => x.saveData).length // number of saveData buttons

    let irow = 0

    const dialogHelper = new ztoolkit.Dialog(nrows, 1)

    dialogHelper
      .addCell(irow++, 0, {
        tag: 'h1',
        properties: { innerHTML: config.addonName },
        namespace: 'html',
        styles: {
          textAlign: 'center',
        },
      })
      .addCell(irow++, 0, {
        tag: 'h2',
        properties: { innerHTML: 'Summary' },
        namespace: 'html',
        styles: {
          textAlign: 'center',
        },
      })

    for (const msgstr of summaryMessages) {
      dialogHelper.addCell(irow++, 0, {
        tag: 'p',
        properties: {
          innerHTML: msgstr.replace('\n', '<br>'),
        },
        namespace: 'html',
        styles: {
          textAlign: 'center',
          width: '200px',
        },
      })
    }

    if (loggedMessages.length) {
      dialogHelper
        .addCell(irow++, 0, {
          tag: 'h2',
          properties: { innerHTML: 'Messages' },
          namespace: 'html',
          styles: {
            textAlign: 'center',
          },
        })
        .addCell(irow++, 0, {
          tag: 'p',
          properties: {
            innerHTML: `Specific errors and warnings are listed below. For a complete debugging log, click the "${getString(
              'report-savedebuglogs',
            )}" button.`,
          },
          namespace: 'html',
          styles: {
            textAlign: 'center',
            width: '200px',
          },
        })
    }

    for (const msg of loggedMessages) {
      dialogHelper
        .addCell(irow++, 0, {
          tag: 'h3',
          properties: {
            innerHTML: msg.rowData.title,
          },
          namespace: 'html',
          styles: {
            textAlign: 'center',
            width: '200px',
            paddingBottom: '3px',
            marginBottom: '0px',
            lineHeight: '1em',
          },
        })
        .addCell(irow++, 0, {
          tag: 'p',
          properties: {
            innerHTML: msg.rowData.message,
          },
          namespace: 'html',
          styles: {
            textAlign: 'center',
            width: '200px',
          },
        })

      if (msg.saveData) {
        dialogHelper.addCell(
          irow++,
          0,
          {
            tag: 'button',
            namespace: 'html',
            attributes: {
              type: 'button',
            },
            styles: {
              // border: '3px solid blue',
              // marginLeft: 'auto',
              // width: '100%',
            },
            listeners: [
              {
                type: 'click',
                listener: (e: Event) => {
                  addon.hooks.saveJsonFile(
                    msg.saveData?.dataGetter(),
                    msg.saveData?.saveDialogTitle,
                    msg.saveData?.fileNameSuggest,
                  )
                },
              },
            ],
            children: [
              {
                tag: 'div',
                properties: {
                  innerHTML: msg.saveData?.saveButtonTitle,
                },
                namespace: 'html',
                styles: {
                  // border: '2px solid green',
                  // color: 'red',
                  // textAlign: 'center',
                  // marginLeft: 'auto',
                  padding: '2.5px 15px',
                  whiteSpace: 'nowrap',
                },
              },
            ],
          },
          true,
        )
      }
    }

    const enableSaveData = Logger.mode() === 'maximal'

    if (enableSaveData) {
      dialogHelper.addButton(getString('report-savedebuglogs'), 'save', {
        noClose: true,
        callback: (e) => {
          addon.hooks.saveLogs()
        },
      })
    } else {
      dialogHelper.addButton(getString('report-syncdebug'), 'debug', {
        noClose: true,
        callback: (e) => {
          addon.hooks.syncMarkDBSaveDebug()
        },
      })
    }

    dialogHelper.addButton('Close', 'cancel')
    dialogHelper.setDialogData(dialogData)
    dialogHelper.open(`${config.addonName} Report`) // { resizable: true, centerscreen: true }

    addon.data.dialog = dialogHelper
    await dialogData.unloadLock?.promise
    addon.data.dialog = undefined
    if (addon.data.alive)
      Logger.log(
        'displayReportDialog - Dialog closed',
        `Closed dialog with ${dialogData._lastButtonId}.\nCheckbox: ${dialogData.checkboxValue}\nInput: ${dialogData.inputValue}.`,
        false,
        'info',
      )
    Logger.log('displayReportDialog - Dialog closed - dialogData', dialogData, false, 'info')
  }
}

export class wrappers {
  @trace
  static findPreviousVersion() {
    const version_re =
      /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?<release>[-+]?[0-9A-Za-z]+\.?[0-9A-Za-z]*[-+]?[0-9A-Za-z]*)?$/

    const configurationVersionThis = { major: 0, minor: 0, patch: 0, release: '', str: version }
    const versionThis_rematch = version.match(version_re)
    if (versionThis_rematch?.groups) {
      configurationVersionThis.major = parseInt(versionThis_rematch.groups.major)
      configurationVersionThis.minor = parseInt(versionThis_rematch.groups.minor)
      configurationVersionThis.patch = parseInt(versionThis_rematch.groups.patch)
      configurationVersionThis.release = versionThis_rematch.groups.release ? versionThis_rematch.groups.release : ''
    }

    let configurationVersionPreviousStr: any = ''
    let configurationVersionPrevious = { major: 0, minor: 0, patch: 0, release: '', str: '' }
    try {
      configurationVersionPreviousStr = getPref('configuration')
      if (typeof configurationVersionPreviousStr === 'string') {
        configurationVersionPrevious.str = configurationVersionPreviousStr
      }
      if (typeof configurationVersionPreviousStr === 'string' && version_re.test(configurationVersionPreviousStr)) {
        const version_rematch = configurationVersionPreviousStr.match(version_re)
        if (version_rematch?.groups) {
          configurationVersionPrevious.major = parseInt(version_rematch.groups.major)
          configurationVersionPrevious.minor = parseInt(version_rematch.groups.minor)
          configurationVersionPrevious.patch = parseInt(version_rematch.groups.patch)
          configurationVersionPrevious.release = version_rematch.groups.release ? version_rematch.groups.release : ''
        }
      }
    } catch (e) {}

    return { app: configurationVersionThis, config: configurationVersionPrevious }
  }

  @trace
  static async startupVersionCheck() {
    const versonParse = this.findPreviousVersion()

    // Logger.log('startupVersionCheck - versonParse.app', versonParse.app, false, 'debug')
    // Logger.log('startupVersionCheck - configurationVersionPrevious', versonParse.config, false, 'debug')

    if (versonParse.config.str !== versonParse.app.str) {
      let prezot7 = versonParse.config.major === 0 && versonParse.config.minor < 1
      let preprerename1 =
        versonParse.config.major === 0 &&
        versonParse.config.minor === 1 &&
        versonParse.config.patch < 1 &&
        !['-rc.1'].includes(versonParse.config.release)

      if (!preprerename1) {
        let test0 = getPref('sourcedir')
        // Logger.log('startupVersionCheck - preprerename1 - test0', test0, false, 'debug')
        if (typeof test0 !== 'string' || test0 === '') {
          let test1 = getPref('source_dir')
          // Logger.log('startupVersionCheck - preprerename1 - test1', test1, false, 'debug')
          if (test1 && typeof test1 === 'string' && test1.length > 0) {
            // Logger.log('startupVersionCheck - preprerename1 - AMHERE0', test1, false, 'debug')
            preprerename1 = true
          }
        }
      }
      if (!preprerename1 && !prezot7) {
        let test0 = getPref('sourcedir')
        if (typeof test0 !== 'string' || test0 === '') {
          let test1 = Zotero.Prefs.get('extensions.mdbconnect.source_dir', true)
          if (test1 && typeof test1 === 'string' && test1.length > 0) {
            prezot7 = true
          }
        }
      }

      // Logger.log('startupVersionCheck - preprerename1', preprerename1, false, 'debug')

      // Logger.log('startupVersionCheck - prezot7', prezot7, false, 'debug')

      /// sourcedir
      try {
        if (preprerename1) {
          const val = getPref('source_dir') as string
          // Logger.log('startupVersionCheck - sourcedir - val', val, false, 'debug')
          if (val) {
            // Logger.log('startupVersionCheck - sourcedir - AMHERE', val, false, 'debug')
            setPref('sourcedir', val)
            getParam.sourcedir()
          }
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.source_dir', true) as string
          // Logger.log('startupVersionCheck - sourcedir - val2', val, false, 'debug')
          if (val) {
            // Logger.log('startupVersionCheck - sourcedir - AMHERE2', val, false, 'debug')
            setPref('sourcedir', val)
            getParam.sourcedir()
          }
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `sourcedir ERROR: ${e}`, false, 'error')
      }

      /// filefilterstrategy
      try {
        if (preprerename1) {
          const val = getPref('filefilterstrategy') as string
          if (val === 'customfileregex') {
            setPref('filefilterstrategy', 'customfileregexp')
          } else if (_paramVals_filefilterstrategy.includes(val as _param_filefilterstrategy)) {
            setPref('filefilterstrategy', val)
          } else {
            setPref('filefilterstrategy', _paramVals_filefilterstrategy[0])
          }
          getParam.filefilterstrategy()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.filefilterstrategy', true) as string
          if (val === 'customfileregex') {
            setPref('filefilterstrategy', 'customfileregexp')
          } else if (_paramVals_filefilterstrategy.includes(val as _param_filefilterstrategy)) {
            setPref('filefilterstrategy', val)
          } else {
            setPref('filefilterstrategy', _paramVals_filefilterstrategy[0])
          }
          getParam.filefilterstrategy()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `filefilterstrategy ERROR: ${e}`, false, 'error')
      }

      /// filepattern
      try {
        if (preprerename1) {
          const val = getPref('filepattern') as string
          if (val) setPref('filepattern', val)
          getParam.filepattern()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.filepattern', true) as string
          if (val) setPref('filepattern', val)
          getParam.filepattern()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `filepattern ERROR: ${e}`, false, 'error')
      }

      /// matchstrategy
      try {
        if (preprerename1) {
          const val = getPref('matchstrategy') as string
          if (val === 'bbtcitekey') {
            setPref('matchstrategy', 'bbtcitekeyyaml')
          } else if (_paramVals_matchstrategy.includes(val as _param_matchstrategy)) {
            setPref('matchstrategy', val)
          } else {
            setPref('matchstrategy', _paramVals_matchstrategy[0])
          }
          getParam.matchstrategy()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.matchstrategy', true) as string
          if (val === 'bbtcitekey') {
            setPref('matchstrategy', 'bbtcitekeyyaml')
          } else if (_paramVals_matchstrategy.includes(val as _param_matchstrategy)) {
            setPref('matchstrategy', val)
          } else {
            setPref('matchstrategy', _paramVals_matchstrategy[0])
          }
          getParam.matchstrategy()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `matchstrategy ERROR: ${e}`, false, 'error')
      }

      /// bbtyamlkeyword
      try {
        if (preprerename1) {
          const val = getPref('metadatakeyword') as string
          if (val) {
            setPref('bbtyamlkeyword', val)
          }
          getParam.bbtyamlkeyword()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.metadatakeyword', true) as string
          if (val) {
            setPref('bbtyamlkeyword', val)
          }
          getParam.bbtyamlkeyword()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `bbtyamlkeyword ERROR: ${e}`, false, 'error')
      }

      /// zotkeyregexp
      try {
        if (preprerename1) {
          const val = getPref('zotkeyregex') as string
          if (val) {
            setPref('zotkeyregexp', val)
          }
          getParam.zotkeyregexp()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.zotkeyregex', true) as string
          if (val) {
            setPref('zotkeyregexp', val)
          }
          getParam.zotkeyregexp()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `zotkeyregexp ERROR: ${e}`, false, 'error')
      }

      /// mdeditor
      try {
        if (preprerename1) {
          const val = getPref('vaultresolution') as string
          if (val === 'path') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', false)
          } else if (val === 'file') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', true)
            getParam.obsidianresolve()
          } else if (val === 'logseq') {
            setPref('mdeditor', 'logseq')
          } else if (val === 'default') {
            setPref('mdeditor', 'system')
          } else {
            setPref('mdeditor', 'system')
          }
          getParam.mdeditor()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.vaultresolution', true) as string
          if (val === 'path') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', false)
          } else if (val === 'file') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', true)
            getParam.obsidianresolve()
          } else if (val === 'logseq') {
            setPref('mdeditor', 'logseq')
          } else if (val === 'default') {
            setPref('mdeditor', 'system')
          } else {
            setPref('mdeditor', 'system')
          }
          getParam.mdeditor()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `mdeditor ERROR: ${e}`, false, 'error')
      }

      /// obsidianvaultname
      try {
        if (preprerename1) {
          const val = getPref('vaultname') as string
          if (val) {
            setPref('obsidianvaultname', val)
          }
          getParam.obsidianvaultname()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.vaultname', true) as string
          if (val) {
            setPref('obsidianvaultname', val)
          }
          getParam.obsidianvaultname()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `obsidianvaultname ERROR: ${e}`, false, 'error')
      }

      /// logseqgraph
      try {
        if (preprerename1) {
          const val = getPref('logseqgraph') as string
          if (val) {
            setPref('logseqgraph', val)
          }
          getParam.logseqgraph()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.logseqgraph', true) as string
          if (val) {
            setPref('logseqgraph', val)
          }
          getParam.logseqgraph()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `logseqgraph ERROR: ${e}`, false, 'error')
      }

      /// grouplibraries
      try {
        if (preprerename1) {
          const val = getPref('grouplibraries') as string
          if (_paramVals_grouplibraries.includes(val as _param_grouplibraries)) {
            setPref('grouplibraries', val)
          } else setPref('grouplibraries', _paramVals_grouplibraries[0])
          getParam.grouplibraries()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.grouplibraries', true) as string
          if (_paramVals_grouplibraries.includes(val as _param_grouplibraries)) {
            setPref('grouplibraries', val)
          } else setPref('grouplibraries', _paramVals_grouplibraries[0])
          getParam.grouplibraries()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `grouplibraries ERROR: ${e}`, false, 'error')
      }

      /// removetags
      try {
        if (preprerename1) {
          const val = getPref('removetags') as string
          if (_paramVals_removetags.includes(val as _param_removetags)) {
            setPref('removetags', val)
          } else if (val) {
            setPref('removetags', _paramVals_removetags[0])
          }
          getParam.removetags()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.removetags', true) as string
          if (_paramVals_removetags.includes(val as _param_removetags)) {
            setPref('removetags', val)
          } else if (val) {
            setPref('removetags', _paramVals_removetags[0])
          }
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `removetags ERROR: ${e}`, false, 'error')
      }

      /// tagstr
      try {
        if (preprerename1) {
          const val = getPref('tagstr') as string
          if (val) {
            setPref('tagstr', val)
          }
          getParam.tagstr()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.tagstr', true) as string
          if (val) {
            setPref('tagstr', val)
          }
          getParam.tagstr()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `tagstr ERROR: ${e}`, false, 'error')
      }

      if (addon.data.env === 'production') {
        setPref('configuration', version)
        Logger.log(
          'startupDependencyCheck',
          `Configuration version set to ${versonParse.app.str}. Was previously ${versonParse.config.str}.`,
          false,
          'debug',
        )
      } else {
        Logger.log(
          'startupDependencyCheck',
          `Configuration version set to ${versonParse.app.str}. Was previously ${versonParse.config.str}.`,
          false,
          'debug',
        )
      }
    }
  }

  @trace
  static async startupConfigCheck() {
    let success = true

    if (!getParam.sourcedir().valid) {
      success = false
    }

    return success
  }
}

export class systemInterface {
  static expandSelection(ids: 'selected' | number | number[]): number[] {
    if (Array.isArray(ids)) return ids

    if (ids === 'selected') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return Zotero.getActiveZoteroPane().getSelectedItems(true)
      } catch (e) {
        // zoteroPane.getSelectedItems() doesn't test whether there's a selection and errors out if not
        Logger.log('expandSelection', `Could not get selected items: ${e}`, false, 'warn')
        return []
      }
    }

    return [ids]
  }

  @trace
  static async dumpDebuggingLog() {
    const data = JSON.stringify(Logger.dump(), null, 1)
    const filename = `${config.addonName.replace('-', '')}-logs.json`

    const filepathstr = await new ztoolkit.FilePicker(
      `Save ${config.addonName} Debugging Logs`,
      'save',
      [
        ['JSON File(*.json)', '*.json'],
        ['Any', '*.*'],
      ],
      filename,
    ).open()

    if (!filepathstr) return

    // const fileObj = Zotero.File.pathToFile(pathstr)
    // if (fileObj instanceof Components.interfaces.nsIFile) {}
    // fileObj.normalize()
    // fileObj.isFile()

    Logger.log('saveDebuggingLog', `Saving to ${filepathstr}`, false, 'info')

    await Zotero.File.putContentsAsync(filepathstr, data)
  }

  @trace
  static async dumpJsonFile(data: string, title: string, filename: string) {
    // saveButtonTitle
    // saveDialogTitle
    // fileNameSuggest
    // dataGetter

    // const data = JSON.stringify(Logger.dump(), null, 1)

    // const filename = `${config.addonName.replace('-', '')}-logs.json`

    const filepathstr = await new ztoolkit.FilePicker(
      title,
      'save',
      [
        ['JSON File(*.json)', '*.json'],
        ['Any', '*.*'],
      ],
      filename,
    ).open()

    if (!filepathstr) return

    // const fileObj = Zotero.File.pathToFile(pathstr)
    // if (fileObj instanceof Components.interfaces.nsIFile) {}
    // fileObj.normalize()
    // fileObj.isFile()

    Logger.log('saveJsonFile', `Saving to ${filepathstr}`, false, 'info')

    await Zotero.File.putContentsAsync(filepathstr, data)
  }

  static _getSelectedEntry(idx: number): Entry {
    // get all selected items
    const items: number[] = this.expandSelection('selected')

    // find first selected item with data associated
    for (const itemId of items) {
      if (DataManager.checkForZotId(itemId)) {
        // get all associated entries
        const entry_res_list: Entry[] = DataManager.getEntryList(itemId)
        // ensure that requested idx is within range of associated entries
        idx = idx < entry_res_list.length && idx >= 0 ? idx : 0
        return entry_res_list[idx]
      }
    }
  }

  @trace
  static showSelectedItemMarkdownInFilesystem(entry_res: Entry): void {
    try {
      const fileObj = Zotero.File.pathToFile(entry_res.path)
      fileObj.normalize()
      if (fileObj.isFile()) {
        try {
          fileObj.reveal()
          Logger.log('showSelectedItemMarkdownInFilesystem', `Revealing ${fileObj.path}`, false, 'info')
        } catch (e) {
          // On platforms that don't support nsIFileObj.reveal() (e.g. Linux), launch the parent directory
          Zotero.launchFile(fileObj.parent.path)
          Logger.log(
            'showSelectedItemMarkdownInFilesystem',
            `Reveal failed, falling back to opening parent directory of ${fileObj.path}`,
            false,
            'warn',
          )
        }
      }
    } catch (e) {
      Logger.log('showSelectedItemMarkdownInFilesystem', `ERROR :: ${entry_res?.path} :: ${e}`, false, 'warn')
    }
  }

  @trace
  static openFileSystemPath(entry_res: Entry): void {
    try {
      const fileObj = Zotero.File.pathToFile(entry_res.path)
      fileObj.normalize()
      if (fileObj.isFile()) {
        Zotero.launchFile(fileObj.path)
        Logger.log('openFileSystemPath', `Revealing ${fileObj.path}`, false, 'info')
      }
    } catch (e) {
      Logger.log('openFileSystemPath', `ERROR :: ${entry_res?.path} :: ${e}`, false, 'warn')
    }
  }

  @trace
  static openObsidianURI(entry_res: Entry): void {
    try {
      const uri_spec = getParam.obsidianresolve().value
      const vaultnameParam = getParam.obsidianvaultname()
      const vaultKey = vaultnameParam.valid ? `vault=${vaultnameParam.value}&` : ''

      const fileKey =
        uri_spec === 'file'
          ? `file=${encodeURIComponent(entry_res.name)}`
          : `path=${encodeURIComponent(entry_res.path)}`

      Zotero.launchURL(`obsidian://open?${vaultKey}${fileKey}`)

      Logger.log(
        'openObsidianURI',
        `Launching ${entry_res.path} :: obsidian://open?${vaultKey}${fileKey}`,
        false,
        'info',
      )
    } catch (e) {
      Logger.log('openObsidianURI', `ERROR :: ${entry_res?.path} :: ${e}`, false, 'warn')
    }
  }

  @trace
  static openLogseqURI(entry_res: Entry): void {
    try {
      const graphNameParam = getParam.logseqgraph()
      let graphName = ''

      const logseqprefixParam = getParam.logseqprefix()
      const logseq_prefix_valid = logseqprefixParam.valid
      const logseq_prefix_file = logseqprefixParam.value
      const logseq_prefix_title = logseqprefixParam.value

      if (graphNameParam.valid) {
        graphName = graphNameParam.value
      } else {
        //// if graph name not specified, try to get it from the path ////
        try {
          const fileObj = Zotero.File.pathToFile(entry_res.path)
          fileObj.normalize()
          graphName = fileObj.parent.parent.leafName as string
        } catch (e) {
          Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${e}`, false, 'warn')
          //// if candidate graph name not found, abort ////
          throw e
        }
      }

      if (graphName === '') throw new Error('graphName not resolved')

      const fileKey = `page=${logseq_prefix_file}${encodeURIComponent(entry_res.name)}`

      /* prefix not encoded, filename encoded */
      Zotero.launchURL(`logseq://graph/${graphName}?${fileKey}`)

      Logger.log(
        'openLogseqURI',
        `Launching ${entry_res.path} :: logseq://graph/${graphName}?${fileKey}`,
        false,
        'info',
      )
    } catch (e) {
      Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${e}`, false, 'warn')
    }
  }
}

export class UIHelpers {
  @trace
  static registerWindowMenuItem_Sync() {
    ztoolkit.Menu.register('menuTools', {
      tag: 'menuseparator',
    })
    // menu->Tools menuitem
    ztoolkit.Menu.register('menuTools', {
      tag: 'menuitem',
      label: getString('menuitem-sync'),
      oncommand: `Zotero.${config.addonInstance}.hooks.syncMarkDB();`,
    })
  }

  @trace
  static registerWindowMenuItem_Debug() {
    // menu->Tools menuitem
    ztoolkit.Menu.register('menuTools', {
      tag: 'menuitem',
      label: getString('menuitem-debug'),
      oncommand: `Zotero.${config.addonInstance}.hooks.syncMarkDBReport();`,
    })
  }

  // @log
  // static registerRightClickMenuPopup() {
  //   ztoolkit.Menu.register(
  //     'item',
  //     {
  //       tag: 'menu',
  //       label: getString('contextmenuitem-reveal'),
  //       children: [
  //         {
  //           tag: 'menuitem',
  //           label: getString('menuitem-submenulabel'),
  //           oncommand: "alert('Hello World! Sub Menuitem.')",
  //           // commandListener: (ev) => systemInterface.openMDfile()
  //         },
  //       ],
  //     },
  //     'after',
  //     document.querySelector(`#${config.addonRef}-itemmenu-open`),
  //   )
  // }

  @trace
  static registerRightClickMenuItem() {
    $patch$(
      ZoteroPane,
      'buildItemContextMenu',
      (original) =>
        async function ZoteroPane_buildItemContextMenu() {
          await original.apply(this, arguments) // eslint-disable-line prefer-rest-params

          const itemMenuRevealId = '__addonRef__-itemmenu'
          document.getElementById(itemMenuRevealId)?.remove()

          const itemMenuOpenId = '__addonRef__-itemmenu'
          document.getElementById(itemMenuOpenId)?.remove()

          const itemMenuSeparatorId = '__addonRef__-itemmenu-separator'
          document.getElementById(itemMenuSeparatorId)?.remove()

          const selectedItemIds: number[] = this.getSelectedItems(true)

          if (!selectedItemIds) return

          if (selectedItemIds.length > 1) return

          const itemId: number = selectedItemIds[0]

          if (!DataManager.checkForZotId(itemId)) return

          const entry_res_list: Entry[] = DataManager.getEntryList(itemId)

          const numEntries = entry_res_list.length

          if (numEntries == 0) return

          let menuitemopenlabel = getString('contextmenuitem-open-default')
          let openfn = (entry: Entry) => {
            systemInterface.openFileSystemPath(entry)
          }

          const protocol = getParam.mdeditor().value
          switch (protocol) {
            case 'obsidian':
              menuitemopenlabel = getString('contextmenuitem-open-obsidian')
              openfn = (entry: Entry) => systemInterface.openObsidianURI(entry)
              break
            case 'logseq':
              menuitemopenlabel = getString('contextmenuitem-open-logseq')
              openfn = (entry: Entry) => systemInterface.openLogseqURI(entry)
              break
            case 'system':
              menuitemopenlabel = getString('contextmenuitem-open-default')
              openfn = (entry: Entry) => systemInterface.openFileSystemPath(entry)
              break
            default:
              menuitemopenlabel = getString('contextmenuitem-open-default')
              openfn = (entry: Entry) => systemInterface.openFileSystemPath(entry)
              break
          }

          const elements = new Elements(document)

          const itemmenu = document.getElementById('zotero-itemmenu')

          itemmenu.appendChild(elements.create('menuseparator', { id: itemMenuSeparatorId }))

          if (numEntries == 1) {
            const menuitemopen = itemmenu.appendChild(
              elements.create('menuitem', {
                id: itemMenuOpenId,
                label: menuitemopenlabel,
                // class: 'menuitem-iconic',
                // image: 'chrome://.....svg',
                // oncommand: () => openfn(entry_res_list[0]),systemInterface.showSelectedItemMarkdownInFilesystem(entry_res_list[0]),
                oncommand: () => openfn(entry_res_list[0]),
              }),
            )

            const menuitemreveal = itemmenu.appendChild(
              elements.create('menuitem', {
                id: itemMenuRevealId,
                label: getString('contextmenuitem-reveal'),
                oncommand: () => systemInterface.showSelectedItemMarkdownInFilesystem(entry_res_list[0]),
              }),
            )
          } else if (numEntries > 1) {
            const menupopupOpen = itemmenu
              .appendChild(
                elements.create('menu', {
                  id: itemMenuOpenId,
                  label: menuitemopenlabel,
                }),
              )
              .appendChild(elements.create('menupopup'))

            const menupopupReveal = itemmenu
              .appendChild(
                elements.create('menu', {
                  id: itemMenuRevealId,
                  label: getString('contextmenuitem-reveal'),
                }),
              )
              .appendChild(elements.create('menupopup'))

            entry_res_list.forEach((entry_res) => {
              menupopupOpen.appendChild(
                elements.create('menuitem', {
                  label: entry_res.name,
                  oncommand: () => openfn(entry_res),
                }),
              )
              menupopupReveal.appendChild(
                elements.create('menuitem', {
                  label: entry_res.name,
                  oncommand: () => systemInterface.showSelectedItemMarkdownInFilesystem(entry_res),
                }),
              )
            })
          }
        },
    )

    // const mdreader = getParam.mdreader()
    // let labelkey =  "contextmenuitem-open-default"
    // if (mdreader === 'obsidian') {
    //   labelkey = "contextmenuitem-open-obsidian"
    // }
    // if (mdreader === 'logseq') {
    //   labelkey = "contextmenuitem-open-logseq"
    // }
    //
    // const menuIcon = `chrome://${config.addonRef}/content/icons/favicon@0.5x.png`
    // // item menuitem with icon
    // ztoolkit.Menu.register("item", {
    //   tag: "menuitem",
    //   id: `${config.addonRef}-itemmenu-open`,
    //   label: getString(labelkey),
    //   // commandListener: (ev) => addon.hooks.onDialogEvents("filePickerExample"),
    //   // commandListener: (ev) => {alert(`ev: ${ev}`)},
    //   // oncommand: () => Zotero.BetterBibTeX.scanAUX('tag'),
    //   icon: menuIcon,
    // })
  }

  //   addon.data
  // .prefs!.window.document.querySelector(
  // `#zotero-prefpane-${config.addonRef}-enable`,
  // )
  // ?.addEventListener("command", (e) => {
  // ztoolkit.log(e);
  // addon.data.prefs!.window.alert(
  // `Successfully changed to ${(e.target as XUL.Checkbox).checked}!`,
  // );
  // });

  // addon.data
  // .prefs!.window.document.querySelector(
  // `#zotero-prefpane-${config.addonRef}-input`,
  // )
  // ?.addEventListener("change", (e) => {
  // ztoolkit.log(e);
  // addon.data.prefs!.window.alert(
  // `Successfully changed to ${(e.target as HTMLInputElement).value}!`,
  // );
  // });
}

export class prefHelpers {
  @trace
  static async chooseVaultFolder() {
    const vaultpath = await new ztoolkit.FilePicker(
      'Select Folder containing MD reading notes',
      'folder',
      // [
      //   ['PNG File(*.png)', '*.png'],
      //   ['Any', '*.*'],
      // ],
      // 'image.png',
    ).open()

    try {
      if (!vaultpath) throw new Error('No folder selected')

      const vaultpathObj = Zotero.File.pathToFile(vaultpath)
      vaultpathObj.normalize()

      if (
        vaultpath !== '' &&
        vaultpath !== undefined &&
        vaultpath != null &&
        vaultpathObj.exists() &&
        vaultpathObj.isDirectory()
      ) {
        setPref('sourcedir', vaultpath)
      }
    } catch (e) {
      Logger.log('chooseVaultFolder', `ERROR chooseVaultFolder :: ${e}`, false, 'warn')
    }
  }

  static isValidRegExp(str: string): boolean {
    try {
      new RegExp(str)
      return true // No error means it's a valid RegExp
    } catch (e) {
      Logger.log('isValidRegExp', `ERROR: RegExp is not valid:: >> ${str} <<.`, false, 'warn')
      return false // An error indicates an invalid RegExp
    }
  }

  static checkMetadataFormat(metadatakeyword: string): boolean {
    if (typeof metadatakeyword === 'string' && metadatakeyword.length > 0) {
      const found: string[] = []
      const notallowed = [
        "'",
        '"',
        ':',
        '\n',
        '/',
        '\\',
        '?',
        '*',
        '|',
        '>',
        '<',
        ',',
        ';',
        '=',
        '`',
        '~',
        '!',
        '#',
        '$',
        '%',
        '^',
        '&',
        '(',
        ')',
        '[',
        ']',
        '{',
        '}',
        ' ',
      ]
      for (const char of notallowed) {
        if (metadatakeyword.includes(char)) {
          found.push(char)
        }
      }
      if (found.length > 0) {
        Logger.log('checkMetadataFormat', `ERROR: metadata id cannot contain: ${found.join(' or ')}.`, false, 'warn')
        //TODO DEBUG
        // Notifier.showNotification(
        //   'Warning',
        //   `Invalid citekey metadata. metadata keyword cannot contain: ${found.join(' or ')}.`,
        //   false,
        // )
        return false
      } else {
        return true
      }
    } else {
      return true
    }
  }

  static checkTagStr(tagstr: string): boolean {
    if (typeof tagstr === 'string' && tagstr.length > 0) {
      const found: string[] = []
      const notallowed = [
        "'",
        '"',
        ':',
        '\n',
        '\\',
        '?',
        '*',
        '|',
        '>',
        '<',
        ',',
        ';',
        '=',
        '`',
        '~',
        '!',
        '#',
        '$',
        '%',
        '^',
        '&',
        '(',
        ')',
        '[',
        ']',
        '{',
        '}',
        ' ',
      ]
      // '/',
      for (const char of notallowed) {
        if (tagstr.includes(char)) {
          found.push(char)
        }
      }
      if (found.length > 0) {
        Logger.log('checkTagStr', `ERROR: TagStr cannot contain: ${found.join(' or ')}.`, false, 'warn')
        //TODO DEBUG
        // Notifier.showNotification('Warning', `Invalid tag string. Tag cannot contain: ${found.join(' or ')}.`, false)
        return false
      } else {
        return true
      }
    } else {
      return true
    }
  }
}

/*
class PatchZoteroPane {

  private patched: Trampoline[] = []
  private elements = []
  private ZoteroPane: any
  private window: any

  public unloader(): void {
    $unpatch$(this.patched)
    this.elements.remove()
  }

  public async loader(win: Window) {

    const doc = win.document
    const elements = this.elements = new Elements(doc)
    this.window = win
    this.ZoteroPane = (this.window as any).ZoteroPane
    this.ZoteroPane.BetterBibTeX = this

    $patch$(this.ZoteroPane, 'buildItemContextMenu', original => async function ZoteroPane_buildItemContextMenu() {
      await original.apply(this, arguments)

      const id = 'better-bibtex-item-menu'
      doc.getElementById(id)?.remove()

      if (!this.getSelectedItems()) return

      const menupopup = doc.getElementById('zotero-itemmenu')
          .appendChild(elements.create('menu', {
            id,
            label: 'Better BibTeX',
            class: 'menuitem-iconic',
            image: 'chrome://zotero-better-bibtex/content/skin/bibtex-menu.svg',
          }))
          .appendChild(elements.create('menupopup'))

      menupopup.appendChild(elements.create('menuitem', {
        label: 'teteste',
        oncommand: () => Zotero.BetterBibTeX.KeyManager.set(),
      }))

    })
  }
}
*/

// class ZoteroPane {
//   private patched: Trampoline[] = []
//   private elements: Elements
//   private ZoteroPane: any
//   private window: Window
//
//   public unload(): void {
//     $unpatch$(this.patched)
//     this.elements.remove()
//   }
//
//   public async load(win: Window) {
//     const doc = win.document
//     const elements = this.elements = new Elements(doc)
//     this.window = win
//     this.ZoteroPane = (this.window as any).ZoteroPane
//     this.ZoteroPane.BetterBibTeX = this
//
//     this.window.addEventListener('unload', () => { this.unload() })
//
//     const bbt_zotero_pane_helper = this // eslint-disable-line @typescript-eslint/no-this-alias
//
//     $patch$(this.ZoteroPane, 'buildItemContextMenu', original => async function ZoteroPane_buildItemContextMenu() {
//       await original.apply(this, arguments) // eslint-disable-line prefer-rest-params
//
//       const id = 'better-bibtex-item-menu'
//       doc.getElementById(id)?.remove()
//
//       if (!this.getSelectedItems()) return
//
//       const menupopup = doc.getElementById('zotero-itemmenu')
//         .appendChild(elements.create('menu', {
//           id,
//           label: 'Better BibTeX',
//           class: 'menuitem-iconic',
//           image: 'chrome://zotero-better-bibtex/content/skin/bibtex-menu.svg',
//         }))
//         .appendChild(elements.create('menupopup'))
//
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_citekey_set'),
//         oncommand: () => Zotero.BetterBibTeX.KeyManager.set(),
//       }))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_citekey_pin'),
//         oncommand: () => Zotero.BetterBibTeX.KeyManager.pin('selected'),
//       }))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_zotero-pane_citekey_pin_inspire-hep'),
//         oncommand: () => Zotero.BetterBibTeX.KeyManager.pin('selected', true),
//       }))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_zotero-pane_citekey_unpin'),
//         oncommand: () => Zotero.BetterBibTeX.KeyManager.unpin('selected'),
//       }))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_zotero-pane_citekey_refresh'),
//         oncommand: () => Zotero.BetterBibTeX.KeyManager.refresh('selected', true),
//       }))
//
//       menupopup.appendChild(elements.create('menuseparator'))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_zotero-pane_patch-dates'),
//         oncommand: () => { bbt_zotero_pane_helper.patchDates().catch(err => log.error('patchDates', err)) },
//       }))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_zotero-pane_sentence-case'),
//         oncommand: () => { bbt_zotero_pane_helper.sentenceCase().catch(err => log.error('sentenceCase', err)) },
//       }))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_zotero-pane_add-citation-links'),
//         oncommand: () => { bbt_zotero_pane_helper.addCitationLinks().catch(err => log.error('addCitationLinks', err)) },
//       }))
//
//       if (TeXstudio.enabled) {
//         menupopup.appendChild(elements.create('menuseparator', { class: 'bbt-texstudio' }))
//         menupopup.appendChild(elements.create('menuitem', {
//           class: 'bbt-texstudio',
//           label: l10n.localize('better-bibtex_zotero-pane_tex-studio'),
//           oncommand: () => { bbt_zotero_pane_helper.toTeXstudio().catch(err => log.error('toTeXstudio', err)) },
//         }))
//       }
//
//       menupopup.appendChild(elements.create('menuseparator'))
//       menupopup.appendChild(elements.create('menuitem', {
//         label: l10n.localize('better-bibtex_report-errors'),
//         oncommand: () => { bbt_zotero_pane_helper.errorReport('items') },
//       }))
//     })
//
//     $patch$(this.ZoteroPane, 'buildCollectionContextMenu', original => async function() {
//       // eslint-disable-next-line prefer-rest-params
//       await original.apply(this, arguments)
//
//       const id = 'better-bibtex-collection-menu'
//
//       if (!doc.getElementById(id)) {
//         const menupopup = doc.getElementById('zotero-collectionmenu')
//           .appendChild(elements.create('menu', {
//             id,
//             label: 'Better BibTeX',
//             class: 'menuitem-iconic',
//             image: 'chrome://zotero-better-bibtex/content/skin/bibtex-menu.svg',
//           }))
//           .appendChild(elements.create('menupopup'))
//
//         menupopup
//           .appendChild(elements.create('menu', {
//             id: 'zotero-collectionmenu-bbt-autoexport',
//             label: l10n.localize('better-bibtex_preferences_tab_auto-export.label'),
//           }))
//           .appendChild(elements.create('menupopup'))
//
//         menupopup.appendChild(elements.create('menuitem', {
//           id: 'bbt-collectionmenu-pull-url',
//           label: l10n.localize('better-bibtex_zotero-pane_show_collection-key'),
//           oncommand: event => {
//             event.stopPropagation();
//             bbt_zotero_pane_helper.pullExport()
//           },
//           // class: 'menuitem-iconic',
//           // image: 'chrome://zotero-better-bibtex/content/skin/bibtex-menu.svg',
//         }))
//
//         menupopup.appendChild(elements.create('menuitem', {
//           id: 'bbt-collectionmenu-scan-aux',
//           label: l10n.localize('better-bibtex_aux-scanner'),
//           oncommand: async event => {
//             event.stopPropagation();
//             await Zotero.BetterBibTeX.scanAUX('collection')
//           },
//           // class: 'menuitem-iconic',
//           // image: 'chrome://zotero-better-bibtex/content/skin/bibtex-menu.svg',
//         }))
//
//         menupopup.appendChild(elements.create('menuitem', {
//           id: 'bbt-collectionmenu-tag-duplicates',
//           label: l10n.localize('better-bibtex_zotero-pane_tag_duplicates'),
//           oncommand: async event => {
//             event.stopPropagation()
//             await Zotero.BetterBibTeX.KeyManager.tagDuplicates(parseInt(event.target.getAttribute('libraryID')))
//           },
//         }))
//
//         menupopup.appendChild(elements.create('menuitem', {
//           id: 'bbt-collectionmenu-report-errors',
//           label: l10n.localize('better-bibtex_report-errors'),
//           oncommand: event => {
//             event.stopPropagation();
//             bbt_zotero_pane_helper.errorReport('collection')
//           },
//         }))
//       }
//     }
//   }
//
// }

export class BasicExampleFactory {
  @trace
  static registerPrefs() {
    const prefOptions = {
      pluginID: config.addonID,
      src: rootURI + 'chrome/content/preferences.xhtml',
      label: getString('prefs-title'),
      image: `chrome://${config.addonRef}/content/icons/favicon.png`,
      defaultXUL: true,
    }
    ztoolkit.PreferencePane.register(prefOptions)
  }
}
