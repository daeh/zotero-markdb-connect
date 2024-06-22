import { config, version } from '../../package.json'
import { DataManager } from '../dataGlobals'
import { getString } from '../utils/locale'
import { getPref, setPref } from '../utils/prefs'

import { Elements } from './create-element'
import { paramTypes, paramVals } from './mdbcConstants'
import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { wrappers } from './mdbcStartupHelpers'
import { patch as $patch$ } from './monkey-patch'

import type {
  DebugMode,
  Entry,
  messageData,
  notificationData,
  NotificationType,
  NotifyCreateLineOptions,
  OSFile,
  prefParam,
  ZoteroIconURI,
} from '../mdbcTypes'

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

const favIcon = `chrome://${config.addonRef}/content/icons/favicon.png` as const
const additionalIcons = [favIcon, 'chrome://zotero/skin/toolbar-item-add@2x.png'] as const
type AddonIconURI = (typeof additionalIcons)[number]
type IconURI = AddonIconURI | ZoteroIconURI

export class Notifier {
  static readonly notificationTypes: Record<NotificationType, IconURI> = {
    addon: favIcon,
    success: 'chrome://zotero/skin/tick@2x.png',
    error: 'chrome://zotero/skin/error@2x.png', //'cross@2x.png',
    warn: 'chrome://zotero/skin/warning@2x.png',
    info: 'chrome://zotero/skin/prefs-advanced.png',
    debug: 'chrome://zotero/skin/treeitem-patent@2x.png',
    config: 'chrome://zotero/skin/prefs-general.png',
    itemsadded: 'chrome://zotero/skin/toolbar-item-add@2x.png',
    itemsremoved: 'chrome://zotero/skin/minus@2x.png',
    // xmark@2x.png
  }

  static notify(data: notificationData): void {
    const header = `${config.addonName} : ${data.title}`

    let messageArray: notificationData['messageArray'] = []
    try {
      if (!('messageArray' in data) || !Array.isArray(data.messageArray) || data.messageArray.length === 0) {
        if (!data.body || !data.type) return
        messageArray = [{ body: data.body, type: data.type }]
      } else {
        messageArray = data.messageArray
      }
    } catch (err) {
      Logger.log('Notifier', `ERROR: ${getErrorMessage(err)}`, false, 'error')
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
    ////TODO don't call Zotero.BetterBibTeX.ready before checking if Zotero.BetterBibTeX exists
    ////TODO make sure error is reported to summary notification (maybe just throw error)
    await Zotero.BetterBibTeX.ready
    return this.BBTReady()
  }

  @trace
  private static _fetchBBTdata(BetterBibTeX: BetterBibTeX): BBTCitekeyRecord[] {
    try {
      return BetterBibTeX.KeyManager.all()
    } catch (err) {
      Logger.log('bbt-bridge', `_fetchBBTdata: KeyManager failed: ${getErrorMessage(err)}`, false, 'error')
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
}

export class getParam {
  @trace
  static sourcedir(): prefParam {
    const name = 'sourcedir'
    const defaultValue = ''
    const valid = false
    const param: prefParam = {
      name: name,
      value: defaultValue,
      valid: valid,
      msg: '',
    }
    try {
      const value = getPref(name) as string
      param.msg += `pref value: ${value}. `
      if (typeof value !== 'string') {
        param.msg += `type: ${typeof value}. `
        throw new Error('Vault Path Not Found')
      }
      if (value.length === 0) {
        param.msg += 'length: 0. '
        throw new Error('Vault Path Not Found')
      }

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
      } else {
        param.msg += `sourcedirpath: ${sourcedirpath}. `
        param.msg += `sourcedirpathObj.exists(): ${sourcedirpathObj.exists()}. `
        param.msg += `sourcedirpathObj.isDirectory(): ${sourcedirpathObj.isDirectory()}. `
      }
    } catch (err) {
      // TODO only show notification if user sync run manually (not run on startup)
      Logger.log('getParam', `ERROR: sourcedirpath :: ${getErrorMessage(err)}`, false, 'error')
      Notifier.notify({
        title: 'Warning',
        body: `Vault Path Not Found. Set the path to your notes in the ${config.addonName} preferences.`,
        type: 'error',
      })
      param.msg += `Error:: ${getErrorMessage(err)}. `
    }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static filefilterstrategy() {
    const name = 'filefilterstrategy'
    const defaultValue = paramVals.filefilterstrategy[0] as paramTypes['filefilterstrategy']
    const valid = true
    const param = { name: name, value: defaultValue, valid: valid }

    const value = getPref(name) as paramTypes['filefilterstrategy']
    if (paramVals.filefilterstrategy.includes(value)) {
      param.value = value
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
    const param = { name: name, value: defaultRegExp, valid: valid, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    const defaultValue = paramVals.matchstrategy[0] as paramTypes['matchstrategy']
    const param = { name: name, value: defaultValue, valid: true }
    const value = getPref(name) as paramTypes['matchstrategy']
    if (paramVals.matchstrategy.includes(value)) {
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
    const param = { name: name, value: defaultValue, valid: valid, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    const param = { name: name, value: defaultRegExp, valid: valid, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    const param = { name: name, value: new RegExp(''), valid: false, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `

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
    const defaultValue = paramVals.mdeditor[0] as paramTypes['mdeditor']
    const param = { name: name, value: defaultValue, valid: true }

    let value = getPref(name) as paramTypes['mdeditor']
    if (paramVals.mdeditor.includes(value)) {
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
    const defaultValue = paramVals.obsidianresolvewithfile[0] as paramTypes['obsidianresolvewithfile']
    const valid = true
    const param = {
      name: name,
      value: defaultValue === false ? paramVals.obsidianresolvespec[0] : paramVals.obsidianresolvespec[1], //// if defaultValue === false use 'path' (the default), if defaultValue === true use 'file',
      valid: valid,
    }

    const value = getPref('obsidianresolvewithfile') as paramTypes['obsidianresolvewithfile']
    if (paramVals.obsidianresolvewithfile.includes(value)) {
      param.value = value === false ? paramVals.obsidianresolvespec[0] : paramVals.obsidianresolvespec[1]
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
    const param = { name: name, value: defaultValue, valid: valid, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    const param = { name: name, value: defaultValue, valid: valid, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    const param = { name: name, value: defaultValue, valid: valid, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    const defaultValue = paramVals.grouplibraries[0] as paramTypes['grouplibraries']
    const param = { name: name, value: defaultValue, valid: true }

    const value = getPref(name) as paramTypes['grouplibraries']
    if (paramVals.grouplibraries.includes(value)) {
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
    const defaultValue = paramVals.removetags[0] as paramTypes['removetags']
    const param = { name: name, value: defaultValue, valid: true }

    const value = getPref(name) as paramTypes['removetags']
    if (paramVals.removetags.includes(value)) {
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
    const param = { name: name, value: defaultValue, valid: true, msg: '' }
    const value = getPref(name) as string
    param.msg += `pref value: ${value}. `
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
    if (paramVals.debugmode.includes(value)) {
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
    } catch (err) {
      Logger.log('getFilesRecursively', `ERROR: ${getErrorMessage(err)}`, false, 'warn')
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
    // let logseq_prefix_title = ''
    if (protocol === 'logseq') {
      const logseqprefixParam = getParam.logseqprefix()
      logseq_prefix_valid = logseqprefixParam.valid
      logseq_prefix_file = logseqprefixParam.value
      // logseq_prefix_title = logseqprefixParam.value
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
            noteName = decodeURIComponent(noteName)
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
            entry_res.citekey_title = reTitle_match_res[1].trim()
          }
        } catch (err) {
          Logger.log('scanVault', `ERROR: get citekey from filename :: ${getErrorMessage(err)}`, false, 'warn')
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
        } catch (err) {
          Logger.log('scanVault', `ERROR: get citekey from metadata :: ${getErrorMessage(err)}`, false, 'warn')
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
    // let logseq_prefix_title = ''
    if (protocol === 'logseq') {
      const logseqprefixParam = getParam.logseqprefix()
      logseq_prefix_valid = logseqprefixParam.valid
      logseq_prefix_file = logseqprefixParam.value
      // logseq_prefix_title = logseqprefixParam.value
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
            noteName = decodeURIComponent(noteName)
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

          const reContents_match_res = contents.match(re_contents)
          if (reContents_match_res && reContents_match_res.length > 1 && reContents_match_res[1].trim() !== '') {
            entry_res.zotkeys.push(reContents_match_res[1].trim())
          }
        } catch (err) {
          Logger.log('scanVaultCustomRegex', `ERROR: get zotid from contents :: ${getErrorMessage(err)}`, false, 'warn')
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

    // const keymaperr = []

    /// get all items in library
    const s = new Zotero.Search()
    if (getParam.grouplibraries().value === 'user') {
      // @ts-ignore
      s.libraryID = Zotero.Libraries.userLibraryID
    }
    s.addCondition('deleted', 'false' as Zotero.Search.Operator, '')
    const itemIds = await s.search()

    let ZotItems: Zotero.Item[] = await Zotero.Items.getAsync(itemIds)

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
    let res: Entry[] = []

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
  private static async updateItems(zotids: number[]) {
    const tagstr = getParam.tagstr().value

    /// find all item already tagged
    const items_withtags: Zotero.Item[] = await Utils.findTaggedItems(tagstr)
    const items_withtags_zotids: number[] = items_withtags.map((item) => item.id)

    /// find all items that should be tagged
    const items_withnotes: Zotero.Item[] = await Zotero.Items.getAsync(zotids)
    const items_withnotes_zotids: number[] = items_withnotes.map((item) => item.id)

    /// find items to be tagged
    const items_totag = items_withnotes.filter((item) => !items_withtags_zotids.includes(item.id))

    /// find items that should not be tagged
    let items_removetag: Zotero.Item[] = []
    if (getParam.removetags().value === 'keepsynced') {
      items_removetag = items_withtags.filter((item) => !items_withnotes_zotids.includes(item.id))
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

    const messageArray: notificationData['messageArray'] = [
      {
        body: `Found ${items_withnotes.length} notes.`,
        type: nitems_notlocatable === 0 ? 'success' : 'info',
      },
    ]

    if (nitems_notlocatable !== 0) {
      messageArray.push({
        body: ` ${nitems_notlocatable} IDs could not be matched to items in the library.`,
        type: 'warn',
      })
    }

    if (items_totag.length > 0) {
      messageArray.push({
        body: ` Added ${items_totag.length} tags.`,
        type: 'itemsadded',
      })
    }

    if (items_removetag.length > 0) {
      messageArray.push({
        body: ` Removed ${items_removetag.length} tags.`,
        type: 'itemsremoved',
      })
    }

    return messageArray
  }

  @trace
  static async syncRun() {
    let dryrun = false

    DataManager.initialize()

    await this.processData()

    if (DataManager.numberRecords() === 0) {
      dryrun = true
    }

    //////////////
    // Promise<notificationData['messageArray']>

    // let messageArray: notificationData['messageArray'] = [{ body: 'Some Error Occurred', type: 'error' }]
    // if (!dryrun) {
    // messageArray = await this.updateItems(DataManager.zotIds())
    // } else {
    // messageArray = [{ body: `Found ${DataManager.numberRecords()} notes.`, type: 'error' }]
    // }
    // let header = 'Synced'

    // Object.values(messageArray).map((value) => `${value?.body}`)
    // let aaa: string[] = []
    // for (const msg of messageArray) {
    //   aaa.push(msg.body)
    // }
    //
    // const summaryMessages = Object.entries(messageArray).map(([key, value]) => `${value.body}`)

    ////////////////

    let messageArray: notificationData['messageArray']
    if (!dryrun) {
      messageArray = await this.updateItems(DataManager.zotIds())
    } else {
      if (DataManager.numberRecords() === 0) {
        messageArray = [
          {
            body: `Found ${DataManager.numberRecords()} notes. Check your settings.`,
            type: 'error',
          },
        ]
      } else {
        messageArray = [{ body: `Found ${DataManager.numberRecords()} notes.`, type: 'info' }]
      }
    }

    return messageArray
  }

  @trace
  static async syncWrapper(displayReport = false, saveLogs = false) {
    /// TODO validate settings on preference window close.

    const debug = displayReport || saveLogs

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

    let header = 'Error'

    let messageArray: notificationData['messageArray']

    const configPass = await wrappers.startupConfigCheck()
    if (!configPass) {
      header = 'Error - Configuration Invalid'
      messageArray = [
        {
          body: `Aborting. Check the ${config.addonName} preferences.`,
          type: 'error',
        },
      ]
      // Notifier.notify({
      //   title: 'Configuration Invalid',
      //   body: `Aborting. Check the ${config.addonName} preferences.`,
      //   type: 'error',
      // })
      // return
    } else {
      try {
        messageArray = await this.syncRun()
        header = 'Synced'
      } catch (err) {
        messageArray = [{ body: `An error occurred :: ${getErrorMessage(err)}`, type: 'error' }]
      }
    }

    const summaryMessages = messageArray.map((msg) => `${msg.body}`)

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
            body: `${msg.notification.title}: ${msg.notification.body || ''}`,
            type: msg.notification.type || 'error',
          })
        }
      }
      if (!DataManager.isClean() || DataManager.numberRecords() === 0) {
        messageArray.push({
          body: `For details, run "${getString('menuitem-troubleshoot')}" in Tools menu.`,
          type: 'warn',
        })
      }
      const notification: notificationData = {
        title: header,
        messageArray: messageArray,
      }
      Notifier.notify(notification)
    }

    if (getPref('configuration') !== version) {
      setPref('configuration', version)
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
                    msg.saveData?.dataGetter() || '',
                    msg.saveData?.saveDialogTitle || '',
                    msg.saveData?.fileNameSuggest || '',
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

export class systemInterface {
  static expandSelection(ids: 'selected' | number | number[]): number[] {
    if (Array.isArray(ids)) return ids

    if (ids === 'selected') {
      try {
        return Zotero.getActiveZoteroPane().getSelectedItems(true)
      } catch (err) {
        // zoteroPane.getSelectedItems() doesn't test whether there's a selection and errors out if not
        Logger.log('expandSelection', `Could not get selected items: ${getErrorMessage(err)}`, false, 'warn')
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

    if (!data) {
      Logger.log(
        'saveJsonFile',
        `ERROR No data to save. \n  filename :: ${filename} \n  title :: ${title} \n  data :: ${data}`,
        false,
        'error',
      )
    }

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

  @trace
  static showSelectedItemMarkdownInFilesystem(entry_res: Entry): void {
    try {
      const fileObj = Zotero.File.pathToFile(entry_res.path)
      fileObj.normalize()
      if (fileObj.isFile()) {
        try {
          fileObj.reveal()
          Logger.log('showSelectedItemMarkdownInFilesystem', `Revealing ${fileObj.path}`, false, 'info')
        } catch (err) {
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
    } catch (err) {
      Logger.log(
        'showSelectedItemMarkdownInFilesystem',
        `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`,
        false,
        'warn',
      )
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
    } catch (err) {
      Logger.log('openFileSystemPath', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
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
    } catch (err) {
      Logger.log('openObsidianURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
    }
  }

  @trace
  static openLogseqURI(entry_res: Entry): void {
    try {
      const graphNameParam = getParam.logseqgraph()
      let graphName = ''

      const logseqprefixParam = getParam.logseqprefix()
      // const logseq_prefix_valid = logseqprefixParam.valid
      const logseq_prefix_file = logseqprefixParam.value
      // const logseq_prefix_title = logseqprefixParam.value

      if (graphNameParam.valid) {
        graphName = graphNameParam.value
      } else {
        //// if graph name not specified, try to get it from the path ////
        try {
          const fileObj = Zotero.File.pathToFile(entry_res.path)
          fileObj.normalize()
          graphName = fileObj.parent.parent.leafName
        } catch (err) {
          Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
          //// if candidate graph name not found, abort ////
          throw err
        }
      }

      if (graphName === '') throw new Error('graphName not resolved')

      const encodedFileName = encodeURIComponent(entry_res.name)
      /// define pairs of characters to replace
      /*
      const charmap = [
        ['%3A', ':'],
        // ["%2F", "/"],
        // ["%3F", "?"],
        // ["%3D", "="],
        // ["%26", "&"],
        // ["%25", "%"],
        // ["%23", "#"],
        // ["%2B", "+"],
        // ["%2C", ","],
        // ["%3B", ";"],
        // ["%40", "@"],
        // ["%24", "$"],
        // ["%5B", "["],
        // ["%5D", "]"],
        // ["%7B", "{"],
        // ["%7D", "}"],
        // ["%7C", "|"],
        // ["%5C", "\\"],
        // ["%22", '"'],
        // ["%27", "'"],
        // ["%60", "`"],
        // ["%20", " "]
      ]
      for (const [encoded, decoded] of charmap) {
        encodedFileName = encodedFileName.replaceAll(encoded, decoded)
      }
      // encodedFileName.replace(/%20/g, '+')
      */
      const fileKey = `page=${logseq_prefix_file}${encodedFileName}`

      /* prefix not encoded, filename encoded */
      Zotero.launchURL(`logseq://graph/${graphName}?${fileKey}`)

      Logger.log(
        'openLogseqURI',
        `Launching ${entry_res.path} :: logseq://graph/${graphName}?${fileKey}`,
        false,
        'info',
      )
    } catch (err) {
      Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
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
      id: `${config.addonRef}-tools-menu-sync`,
      label: getString('menuitem-sync'),
      oncommand: `Zotero.${config.addonInstance}.hooks.syncMarkDB();`,
    })
  }

  @trace
  static registerWindowMenuItem_Debug() {
    // menu->Tools menuitem
    ztoolkit.Menu.register('menuTools', {
      tag: 'menuitem',
      id: `${config.addonRef}-tools-menu-troubleshoot`,
      label: getString('menuitem-troubleshoot'),
      oncommand: `Zotero.${config.addonInstance}.hooks.syncMarkDBReport();`,
    })
    //   tag: "menuitem",
    //   id: "zotero-itemmenu-addontemplate-test",
    //   label: "Addon Template: Menuitem",
    //   oncommand: "alert('Hello World! Default Menuitem.')",
    //   icon: menuIcon,
    // register(menuPopup: XUL.MenuPopup | keyof typeof MenuSelector, options: MenuitemOptions, insertPosition?: "before" | "after", anchorElement?: XUL.Element): false | undefined;
    // unregister(menuId: string): void;
  }

  @trace
  static registerRightClickMenuItem() {
    $patch$(
      ZoteroPane,
      'buildItemContextMenu',
      (original) =>
        async function ZoteroPane_buildItemContextMenu() {
          await original.apply(this, arguments)

          const itemMenuRevealId = '__addonRef__-itemmenu'
          document.getElementById(itemMenuRevealId)?.remove()

          const itemMenuOpenId = '__addonRef__-itemmenu'
          document.getElementById(itemMenuOpenId)?.remove()

          const itemMenuSeparatorId = '__addonRef__-itemmenu-separator'
          document.getElementById(itemMenuSeparatorId)?.remove()

          //// this ~= Zotero.getActiveZoteroPane() ////
          const selectedItemIds: number[] = this.getSelectedItems(true)

          if (!selectedItemIds) return

          if (selectedItemIds.length > 1) return

          const itemId: number = selectedItemIds[0]

          if (!DataManager.checkForZotId(itemId)) return

          const entry_res_list: Entry[] = DataManager.getEntryList(itemId)

          const numEntries = entry_res_list.length

          if (numEntries == 0) return

          const elements = new Elements(document)

          const itemmenu = document.getElementById('zotero-itemmenu')

          if (!itemmenu) return

          let menuitemopenlabel: string
          let openfn: (entry: Entry) => void

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

          itemmenu?.appendChild(elements.create('menuseparator', { id: itemMenuSeparatorId }))
          ////WIP
          // itemmenu?.appendChild(ztoolkit.UI.createElement(document, 'menuseparator', { id: itemMenuSeparatorId }))

          if (numEntries == 1) {
            itemmenu.appendChild(
              elements.create('menuitem', {
                id: itemMenuOpenId,
                label: menuitemopenlabel,
                // class: 'menuitem-iconic',
                // image: 'chrome://.....svg',
                // oncommand: () => openfn(entry_res_list[0]),systemInterface.showSelectedItemMarkdownInFilesystem(entry_res_list[0]),
                oncommand: () => openfn(entry_res_list[0]),
              }),
            )
            ////WIP
            // itemmenu.appendChild(
            //   ztoolkit.UI.createElement(document, 'menuitem', {
            //     id: itemMenuOpenId,
            //     attributes: {
            //       label: menuitemopenlabel,
            //     },
            //     // properties: {}
            //     // classList: ['icon'],
            //     listeners: [
            //       {
            //         type: 'command',
            //         listener: (event) => {
            //           openfn(entry_res_list[0])
            //           // event.preventDefault()
            //         },
            //       },
            //     ],
            //   }),
            // )

            itemmenu.appendChild(
              elements.create('menuitem', {
                id: itemMenuRevealId,
                label: getString('contextmenuitem-reveal'),
                oncommand: () => systemInterface.showSelectedItemMarkdownInFilesystem(entry_res_list[0]),
              }),
            )
            ////WIP
            // itemmenu.appendChild(
            //   ztoolkit.UI.createElement(document, 'menuitem', {
            //     id: itemMenuRevealId,
            //     attributes: {
            //       label: getString('contextmenuitem-reveal'),
            //     },
            //     // properties: {}
            //     // classList: ['icon'],
            //     listeners: [
            //       {
            //         type: 'command',
            //         listener: (event) => {
            //           systemInterface.showSelectedItemMarkdownInFilesystem(entry_res_list[0])
            //           // event.preventDefault()
            //         },
            //       },
            //     ],
            //   }),
            // )
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

            ////WIP
            // const menupopupOpen =
            // itemmenu.appendChild(
            //   ztoolkit.UI.createElement(document, 'menu', {
            //     id: itemMenuOpenId,
            //     attributes: {
            //       label: menuitemopenlabel,
            //     },
            //   }),
            // )
            // .appendChild(
            //   ztoolkit.UI.createElement(document, 'menupopup', {
            //     // children: [
            //     //   {
            //     //     tag: 'menuitem',
            //     //     attributes: {
            //     //       id: 'zotero-tb-tara-create-backup',
            //     //       label: getString('toolbar-create'),
            //     //       class: 'menuitem-iconic',
            //     //       style: "list-style-image: url('chrome://tara/content/icons/create_icon.png');",
            //     //       oncommand: "alert('create');",
            //     //     },
            //     //   },
            //     // ],
            //     children: entry_res_list.map((entry_res) => {
            //       return {
            //         tag: 'menuitem',
            //         attributes: {
            //           label: entry_res.name,
            //         },
            //         listeners: [
            //           {
            //             type: 'command',
            //             listener: (event) => {
            //               openfn(entry_res)
            //               // event.preventDefault()
            //             },
            //           },
            //         ],
            //       }
            //     }),
            //   }),
            // )

            /////REVERT ME

            // entry_res_list.forEach((entry_res) => {
            //   menupopupOpen.appendChild(
            //     ztoolkit.UI.createElement(document, 'menuitem', {
            //       attributes: {
            //         label: entry_res.name,
            //       },
            //       listeners: [
            //         {
            //           type: 'command',
            //           listener: (event) => {
            //             openfn(entry_res)
            //             // event.preventDefault()
            //           },
            //         },
            //       ],
            //     }),
            //   )
            //   // menupopupReveal.appendChild(
            //   //   elements.create('menuitem', {
            //   //     label: entry_res.name,
            //   //     oncommand: () => systemInterface.showSelectedItemMarkdownInFilesystem(entry_res),
            //   //   }),
            //   // )
            // })

            //     const menupopupReveal = itemmenu
            //       .appendChild(
            //         elements.create('menu', {
            //           id: itemMenuRevealId,
            //           label: getString('contextmenuitem-reveal'),
            //         }),
            //       )
            //       .appendChild(elements.create('menupopup'))
            //
            //     entry_res_list.forEach((entry_res) => {
            //       menupopupOpen.appendChild(
            //         elements.create('menuitem', {
            //           label: entry_res.name,
            //           oncommand: () => openfn(entry_res),
            //         }),
            //       )
            //       menupopupReveal.appendChild(
            //         elements.create('menuitem', {
            //           label: entry_res.name,
            //           oncommand: () => systemInterface.showSelectedItemMarkdownInFilesystem(entry_res),
            //         }),
            //       )
            //     })
            //   }
          }
        },
    )
  }

  @trace
  static highlightTaggedRows() {
    /* Render primary cell
    _renderCell
    _renderPrimaryCell
    https://github.com/zotero/zotero/blob/32ba987c2892e2aee6046a82c08d69145e758afd/chrome/content/zotero/elements/colorPicker.js#L178
    https://github.com/windingwind/ZoteroStyle/blob/6b7c7c95abb7e5d75d0e1fbcc2d824c0c4e2e81a/src/events.ts#L263
    https://github.com/ZXLYX/ZoteroStyle/blob/57fa178a1a45e710a73706f0087892cf19c9caf1/src/events.ts#L286
     */
    const tagstrParam = getParam.tagstr()
    if (!tagstrParam.valid) return
    const tagstr = tagstrParam.value

    // Select all span elements with aria-label containing "Tag ObsCite."
    const spans: NodeListOf<HTMLSpanElement> = document.querySelectorAll(`span[aria-label*="Tag ${tagstr}."]`)

    // Iterate over the NodeList and change the text color to red
    spans.forEach((span) => {
      span.style.color = 'red'
    })

    // await ztoolkit.ItemTree.register()
  }
}

export class prefHelpers {
  @trace
  static async chooseVaultFolder() {
    const vaultpath = await new ztoolkit.FilePicker('Select Folder containing MD reading notes', 'folder').open()

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
    } catch (err) {
      Logger.log('chooseVaultFolder', `ERROR chooseVaultFolder :: ${getErrorMessage(err)}`, false, 'warn')
    }
  }

  static isValidRegExp(str: string): boolean {
    try {
      new RegExp(str)
      return true // No error means it's a valid RegExp
    } catch (err) {
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
        // '#',
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

export class BasicExampleFactory {
  @trace
  static registerPrefs() {
    const prefOptions = {
      pluginID: config.addonID,
      src: rootURI + 'chrome/content/preferences.xhtml',
      label: getString('prefs-title'),
      image: favIcon,
      defaultXUL: true,
    }
    ztoolkit.PreferencePane.register(prefOptions)
  }
}
