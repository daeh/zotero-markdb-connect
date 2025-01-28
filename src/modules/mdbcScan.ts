import { config, version } from '../../package.json'
import { DataManager } from '../dataGlobals'
import { getString } from '../utils/locale'
import { getPref, setPref } from '../utils/prefs'

import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { getParam } from './mdbcParam'
import { wrappers } from './mdbcStartupHelpers'
import { Notifier, systemInterface } from './mdbcUX'

import type { Entry, messageData, notificationData } from '../mdbcTypes'

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
    // TODO don't call Zotero.BetterBibTeX.ready before checking if Zotero.BetterBibTeX exists
    // TODO make sure error is reported to summary notification (maybe just throw error)
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

const listDirContents = async (dirpath: string): Promise<OS.File.Entry[]> => {
  const items: OS.File.Entry[] = []
  try {
    /* Zotero.File.iterateDirectory calls new OS.File.DirectoryIterator(dirpath) */
    await Zotero.File.iterateDirectory(dirpath, (item: OS.File.Entry) => {
      if (!item.name.startsWith('.')) {
        items.push(item)
      }
    })
  } catch (err) {
    Logger.log('listDirContents', `Failed to process: ${dirpath} (${getErrorMessage(err)})`, false, 'warn')
  }
  return items
}

const listFilesRecursively = async function* (dirpath: string): AsyncGenerator<OS.File.Entry> {
  // Does not follow symbolic links //

  const entries: OS.File.Entry[] = await listDirContents(dirpath)
  for (const entry of entries) {
    try {
      const zfile: nsIFile = Zotero.File.pathToFile(entry.path)

      if (zfile.exists() && zfile.isReadable() && !zfile.isHidden() && !zfile.isSpecial() && !zfile.isSymlink()) {
        if (zfile.isDirectory()) {
          yield* listFilesRecursively(entry.path)
        } else if (zfile.isFile()) {
          yield entry
        }
      }
    } catch (err) {
      Logger.log('listFilesRecursively', `Failed to process: ${entry.path} (${getErrorMessage(err)})`, false, 'warn')
    }
  }
}

// const collectFilesRecursive = async (dirPath: string, parents: string[] = [], files: OS.File.Entry[] = []) => {
//   await Zotero.File.iterateDirectory(dirPath, async (entry: OS.File.Entry) => {
//     const zfile = Zotero.File.pathToFile(entry.path)
//     if (
//       !entry.name.startsWith('.') &&
//       zfile.exists() &&
//       zfile.isReadable() &&
//       !zfile.isHidden() &&
//       !zfile.isSpecial() &&
//       !zfile.isSymlink()
//     ) {
//       if (zfile.isDirectory()) {
//         await collectFilesRecursive(entry.path, [...parents, entry.name], files)
//       } else if (zfile.isFile()) {
//         files.push(entry)
//       }
//     }
//   })
//   return files
// }

class Utils {
  static async getFilesRecursively(dirpath: string): Promise<OS.File.Entry[]> {
    let files: OS.File.Entry[] = []
    try {
      const zfileBaseDir: nsIFile = Zotero.File.pathToFile(dirpath)

      if (!zfileBaseDir.exists() || !zfileBaseDir.isDirectory()) {
        Logger.log('getFilesRecursively', `ERROR ${zfileBaseDir.path} does not exist or is not a folder`, false, 'warn')
        throw new Error(`${zfileBaseDir.path} does not exist or is file`)
      }
      zfileBaseDir.normalize()

      for await (const file of listFilesRecursively(zfileBaseDir.path)) {
        files.push(file)
      }
    } catch (err) {
      Logger.log('getFilesRecursively', `ERROR: ${getErrorMessage(err)}`, false, 'warn')
    }

    return files
  }

  // static async getFilesRecursively(dirpath: string): Promise<OS.File.Entry[]> {
  //   let files: OS.File.Entry[] = []
  //   try {
  //     const zfileBaseDir: nsIFile = Zotero.File.pathToFile(dirpath)
  //
  //     if (!zfileBaseDir.exists() || !zfileBaseDir.isDirectory()) {
  //       Logger.log('getFilesRecursively', `ERROR ${zfileBaseDir.path} does not exist or is not a folder`, false, 'warn')
  //       throw new Error(`${zfileBaseDir.path} does not exist or is file`)
  //     }
  //     zfileBaseDir.normalize()
  //
  //     await collectFilesRecursive(zfileBaseDir.path, [], files)
  //   } catch (err) {
  //     Logger.log('getFilesRecursively', `ERROR: ${getErrorMessage(err)}`, false, 'warn')
  //   }
  //
  //   return files
  // }

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
    let re_file = /^@.+\.md$/i
    let re_title = /^@(\S+).*\.md$/i
    if (filefilterstrategy === 'customfileregexp') {
      re_file = re_title = getParam.filepattern().value
    }

    /// pattern to trim extension from filename
    const re_suffix = /\.md$/i

    let logseq_prefix_valid = false
    let logseq_prefix_file = ''
    if (protocol === 'logseq') {
      /* logseq filename prefix, should be URL encoded */
      const logseqprefixParam = getParam.logseqprefix()
      logseq_prefix_valid = logseqprefixParam.valid
      logseq_prefix_file = logseqprefixParam.value
    }

    const allFiles = await Utils.getFilesRecursively(sourcedir)
    const filteredFiles = allFiles.filter((file) => re_file.test(file.name))

    await Promise.all(
      filteredFiles.map(async (entry) => {
        const filename = entry.name
        const filenamebase = filename.replace(re_suffix, '')
        const filepath = entry.path

        // TODO make separate fields for name (filename, filenamebase, displayname)
        /* use display name in context menu
        for obsidian, display name is the filenamebase
        for logseq, display name is the filenamebase with prefix removed and URL decoded
        for URI, always use filenamebase
         */
        let noteName = filenamebase
        if (protocol === 'logseq' && logseq_prefix_valid) {
          if (logseq_prefix_valid) {
            if (noteName.startsWith(logseq_prefix_file)) {
              noteName = noteName.replace(new RegExp(`^${logseq_prefix_file}`), '')
            }
          }
          noteName = decodeURIComponent(noteName)
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
              const contentsRaw = await Zotero.File.getContentsAsync(filepath) // as string
              const contents = contentsRaw && typeof contentsRaw === 'string' ? contentsRaw : ''
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
              const contentsRaw = await Zotero.File.getContentsAsync(filepath) // as string
              const contents = contentsRaw && typeof contentsRaw === 'string' ? contentsRaw : ''
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

  @trace
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
    let re_file = /^@.+\.md$/i
    if (filefilterstrategy === 'customfileregexp') {
      re_file = getParam.filepattern().value
    }
    const re_contents = zotkeyregexpParam.valid ? new RegExp(zotkeyregexpParam.value, 'm') : new RegExp('', 'm')

    /// pattern to trim extension from filename
    const re_suffix = /\.md$/i

    let logseq_prefix_valid = false
    let logseq_prefix_file = ''
    if (protocol === 'logseq') {
      /* logseq filename prefix, should be URL encoded */
      const logseqprefixParam = getParam.logseqprefix()
      logseq_prefix_valid = logseqprefixParam.valid
      logseq_prefix_file = logseqprefixParam.value
    }

    const allFiles = await Utils.getFilesRecursively(sourcedir)
    const filteredFiles = allFiles.filter((file) => re_file.test(file.name))

    await Promise.all(
      filteredFiles.map(async (entry) => {
        const filename = entry.name
        const filenamebase = filename.replace(re_suffix, '')
        const filepath = entry.path

        let noteName = filenamebase
        if (protocol === 'logseq' && logseq_prefix_valid) {
          if (logseq_prefix_valid) {
            if (noteName.startsWith(logseq_prefix_file)) {
              noteName = noteName.replace(new RegExp(`^${logseq_prefix_file}`), '')
            }
          }
          noteName = decodeURIComponent(noteName)
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
          const contentsRaw = await Zotero.File.getContentsAsync(filepath) // as string
          const contents = contentsRaw && typeof contentsRaw === 'string' ? contentsRaw : ''

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

    const minWidth = '300px'
    const maxWidth = '1000px'

    dialogHelper
      .addCell(irow++, 0, {
        tag: 'h1',
        properties: { innerHTML: config.addonName },
        namespace: 'html',
        styles: {
          textAlign: 'center',
          minWidth: minWidth,
          maxWidth: maxWidth,
        },
      })
      .addCell(irow++, 0, {
        tag: 'h2',
        properties: { innerHTML: 'Summary' },
        namespace: 'html',
        styles: {
          textAlign: 'center',
          minWidth: minWidth,
          maxWidth: maxWidth,
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
          minWidth: minWidth,
          maxWidth: maxWidth,
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
            minWidth: minWidth,
            maxWidth: maxWidth,
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
            minWidth: minWidth,
            maxWidth: maxWidth,
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
            minWidth: minWidth,
            maxWidth: maxWidth,
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
            minWidth: minWidth,
            maxWidth: maxWidth,
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
              minWidth: minWidth,
              maxWidth: maxWidth,
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

    dialogHelper.open(`${config.addonName} Report`, {
      // width: 400, // ignored if fitContent is true
      centerscreen: true,
      resizable: true,
      fitContent: true,
      // noDialogMode: false,
      // alwaysRaised?: boolean;
    }) // { resizable: true, centerscreen: true }

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
