import { config, version } from '../../package.json'
import { DataManager } from '../dataGlobals'
import { getString } from '../utils/locale'
import { stripAndDecodeNotePrefix } from '../utils/noteName'
import { getPref, setPref } from '../utils/prefs'

import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { getParam } from './mdbcParam'
import { wrappers } from './mdbcStartupHelpers'
import { Notifier, systemInterface } from './mdbcUX'

import type { Entry, messageData, notificationData, NotificationMessage } from '../mdbcTypes'
import type { DialogData } from 'zotero-plugin-toolkit'

interface DirEntry {
  name: string
  path: string
}

interface ReportDialogData extends DialogData {
  _lastButtonId?: string
  checkboxValue?: boolean
  inputValue?: string
  loadCallback: () => void
  unloadCallback: () => void
}

const listDirContents = async (dirpath: string): Promise<DirEntry[]> => {
  const items: DirEntry[] = []
  try {
    await Zotero.File.iterateDirectory(dirpath, (item: DirEntry) => {
      if (!item.name.startsWith('.')) {
        items.push(item)
      }
    })
  } catch (err) {
    Logger.log('listDirContents', `Failed to process: ${dirpath} (${getErrorMessage(err)})`, false, 'warn')
  }
  return items
}

const listFilesRecursively = async function* (dirpath: string): AsyncGenerator<DirEntry> {
  // Skip symbolic links.

  const entries: DirEntry[] = await listDirContents(dirpath)
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

class Utils {
  static async getFilesRecursively(dirpath: string): Promise<DirEntry[]> {
    const files: DirEntry[] = []
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

  static async findTaggedItems(tagstr: string): Promise<Zotero.Item[]> {
    const s =
      getParam.grouplibraries().value === 'user'
        ? new Zotero.Search({ libraryID: Zotero.Libraries.userLibraryID })
        : new Zotero.Search()
    s.addCondition('deleted', 'false', '')
    s.addCondition('tag', 'is', tagstr)
    const itemIds = await s.search()
    return await Zotero.Items.getAsync(itemIds)
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

    const yamlkeywordParam =
      matchstrategy === 'citekeyyaml' ? getParam.yamlkeyword() : { name: '', value: '', valid: false }

    const citekeypatternParam =
      matchstrategy === 'citekeyregexp' ? getParam.citekeypattern() : { name: '', value: new RegExp(''), valid: false }

    const filefilterstrategy = getParam.filefilterstrategy().value

    let re_file = /^@.+\.md$/i
    let re_title = /^@(\S+).*\.md$/i
    if (filefilterstrategy === 'customfileregexp') {
      re_file = re_title = getParam.filepattern().value
    }

    const re_suffix = /\.md$/i

    let logseq_prefix_valid = false
    let logseq_prefix_file = ''
    if (protocol === 'logseq') {
      // Logseq filename prefixes are URL-encoded.
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
          const stripped = stripAndDecodeNotePrefix(noteName, logseq_prefix_file)
          if (stripped.malformedEncoding) {
            Logger.log('resolveItems', `Malformed URL-encoding in note name: ${noteName}`, false, 'warn')
          }
          noteName = stripped.value
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

        try {
          const citekeyTitle = filename.match(re_title)?.[1]
          if (citekeyTitle !== undefined) {
            entry_res.citekey_title = citekeyTitle.trim()
          }
        } catch (err) {
          Logger.log('scanVault', `ERROR: get citekey from filename :: ${getErrorMessage(err)}`, false, 'warn')
        }

        try {
          if (matchstrategy === 'citekeyyaml') {
            if (yamlkeywordParam.valid) {
              const re_metadata = new RegExp(
                `^${RegExp.escape(yamlkeywordParam.value)}: *(?:['"])?(\\S+?)(?:['"]|\\s|$)`,
                'm',
              )
              const contentsRaw = await Zotero.File.getContentsAsync(filepath)
              const contents = contentsRaw && typeof contentsRaw === 'string' ? contentsRaw : ''
              const contentSections = contents.split('\n---')
              const metadata = contentSections[0]
              if (contentSections.length > 1 && metadata?.startsWith('---')) {
                const citekeyMetadata = metadata.match(re_metadata)?.[1]
                if (citekeyMetadata !== undefined) {
                  entry_res.citekey_metadata = citekeyMetadata.trim()
                }
              }
            }
          } else if (matchstrategy === 'citekeyregexp') {
            if (citekeypatternParam.valid) {
              const re_body = citekeypatternParam.value
              const contentsRaw = await Zotero.File.getContentsAsync(filepath)
              const contents = contentsRaw && typeof contentsRaw === 'string' ? contentsRaw : ''
              const citekeyMetadata = contents.match(re_body)?.[1]
              if (citekeyMetadata !== undefined) {
                entry_res.citekey_metadata = citekeyMetadata.trim()
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

    const filefilterstrategy = getParam.filefilterstrategy().value

    let re_file = /^@.+\.md$/i
    if (filefilterstrategy === 'customfileregexp') {
      re_file = getParam.filepattern().value
    }
    const re_contents = zotkeyregexpParam.valid ? new RegExp(zotkeyregexpParam.value, 'm') : new RegExp('', 'm')

    const re_suffix = /\.md$/i

    let logseq_prefix_valid = false
    let logseq_prefix_file = ''
    if (protocol === 'logseq') {
      // Logseq filename prefixes are URL-encoded.
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
          const stripped = stripAndDecodeNotePrefix(noteName, logseq_prefix_file)
          if (stripped.malformedEncoding) {
            Logger.log('resolveItems', `Malformed URL-encoding in note name: ${noteName}`, false, 'warn')
          }
          noteName = stripped.value
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

        try {
          const contentsRaw = await Zotero.File.getContentsAsync(filepath)
          const contents = contentsRaw && typeof contentsRaw === 'string' ? contentsRaw : ''

          const zotkey = contents.match(re_contents)?.[1]?.trim()
          if (zotkey !== undefined && zotkey !== '') {
            entry_res.zotkeys.push(zotkey)
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
  private static async mapCitekeysQuery(): Promise<Record<string, number[]>> {
    const s =
      getParam.grouplibraries().value === 'user'
        ? new Zotero.Search({ libraryID: Zotero.Libraries.userLibraryID })
        : new Zotero.Search()
    s.addCondition('deleted', 'false', '')
    const itemIds = await s.search()

    const ZotItems: Zotero.Item[] = await Zotero.Items.getAsync(itemIds)

    const citekeymap = ZotItems.reduce((accumulator: Record<string, number[]>, zotitem) => {
      if (!zotitem.isRegularItem()) {
        return accumulator
      }
      let citationKey = ''
      try {
        citationKey = zotitem.getField('citationKey') || ''
      } catch {
        // Some regular item types do not expose citationKey.
      }
      if (!citationKey) {
        return accumulator
      }
      const existingIds = accumulator[citationKey]
      if (existingIds === undefined) {
        accumulator[citationKey] = [zotitem.id]
      } else {
        existingIds.push(zotitem.id)
      }
      return accumulator
    }, {})

    Logger.addData('mapCitekeysQuery', citekeymap, true)

    return citekeymap
  }

  @trace
  private static async mapIDkeysZoteroquery(): Promise<Record<string, number[]>> {
    const s =
      getParam.grouplibraries().value === 'user'
        ? new Zotero.Search({ libraryID: Zotero.Libraries.userLibraryID })
        : new Zotero.Search()
    s.addCondition('deleted', 'false', '')
    const itemIds = await s.search()

    const ZotItems: Zotero.Item[] = await Zotero.Items.getAsync(itemIds)

    const keymap = ZotItems.reduce((accumulator: Record<string, number[]>, zotitem) => {
      const existingIds = accumulator[zotitem.key]
      if (existingIds === undefined) {
        accumulator[zotitem.key] = [zotitem.id]
      } else {
        existingIds.push(zotitem.id)
      }
      return accumulator
    }, {})

    Logger.addData('mapIDkeysZoteroquery', keymap, true)

    return keymap
  }

  @trace
  private static sliceObj(res: Entry[], citekeymap: Record<string, number[]>): Entry[] {
    const reserr: Entry[] = []

    const citekeys = Object.keys(citekeymap)

    for (const entry_res of res) {
      if (entry_res.citekey) {
        if (citekeys.includes(entry_res.citekey)) {
          entry_res.zotids = citekeymap[entry_res.citekey] ?? []
        } else if (citekeys.includes(entry_res.citekey_metadata)) {
          entry_res.zotids = citekeymap[entry_res.citekey_metadata] ?? []
        } else if (citekeys.includes(entry_res.citekey_title)) {
          entry_res.zotids = citekeymap[entry_res.citekey_title] ?? []
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
          body: `${reserr.length} unmatched citekeys.`,
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
    const reserr: Entry[] = []

    const zotkeys = Object.keys(zoterokeymap)

    for (const entry_res of res) {
      const zotids = new Set<number>()
      for (const zotkey of entry_res.zotkeys) {
        if (zotkeys.includes(zotkey)) {
          for (const zotid of zoterokeymap[zotkey] ?? []) {
            zotids.add(zotid)
          }
        }
      }
      entry_res.zotids = [...zotids]
      if (entry_res.zotids.length === 0) {
        reserr.push(entry_res)
      }
    }

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
          body: `${reserr.length} unmatched zoteroKeys.`,
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
    let res: Entry[] = []

    const matchstrategy = getParam.matchstrategy().value

    if (matchstrategy === 'citekeyyaml' || matchstrategy === 'citekeyregexp') {
      res = await this.scanVault()

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

      const citekeymap: Record<string, number[]> = await this.mapCitekeysQuery()

      res = this.sliceObj(res, citekeymap)
    } else if (matchstrategy === 'zotitemkey') {
      res = await this.scanVaultCustomRegex()

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

      const zoterokeymap: Record<string, number[]> = await this.mapIDkeysZoteroquery()

      res = this.sliceObjCustomRegex(res, zoterokeymap)
    }

    for (const entry_res of res) {
      for (const zotid of entry_res.zotids) {
        if (typeof zotid === 'number') {
          DataManager.addEntry(zotid, entry_res)
        }
      }
    }

    const enableSaveData = Logger.mode() === 'maximal'
    const LogDataKey = 'scanVault'
    if (enableSaveData) Logger.addData(LogDataKey, DataManager.data(), true)

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

    const items_withtags: Zotero.Item[] = await Utils.findTaggedItems(tagstr)
    const items_withtags_zotids: number[] = items_withtags.map((item) => item.id)

    const items_withnotes: Zotero.Item[] = await Zotero.Items.getAsync(zotids)
    const items_withnotes_zotids: number[] = items_withnotes.map((item) => item.id)

    const items_totag = items_withnotes.filter((item) => !items_withtags_zotids.includes(item.id))

    let items_removetag: Zotero.Item[] = []
    if (getParam.removetags().value === 'keepsynced') {
      items_removetag = items_withtags.filter((item) => !items_withnotes_zotids.includes(item.id))
    }

    const nitems_notlocatable = zotids.length - items_withnotes.length

    for (const item of items_removetag) {
      item.removeTag(tagstr)
      await item.saveTx()
    }

    for (const item of items_totag) {
      item.addTag(tagstr)
      await item.saveTx()
    }
    // TODO: Assign the tag color; see
    // https://github.com/zotero/zotero/blob/52932b6eb03f72b5fb5591ba52d8e0f4c2ef825f/chrome/content/zotero/tagColorChooser.js

    const messageArray: NotificationMessage[] = [
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

    let messageArray: NotificationMessage[]
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
    const debug = displayReport || saveLogs

    if (debug) {
      Logger.setDebugMode('maximal')
    }

    if (Logger.mode() === 'minimal') {
      Logger.clear()
    } else {
      Logger.clearMessages()
    }

    let header = 'Error'

    let messageArray: NotificationMessage[]

    const configPass = wrappers.startupConfigCheck()
    if (!configPass) {
      header = 'Error - Configuration Invalid'
      messageArray = [
        {
          body: `Aborting. Check the ${config.addonName} preferences.`,
          type: 'error',
        },
      ]
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
      if (!DataManager.isClean() || DataManager.numberRecords() === 0 || addon.data.env === 'development') {
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

    const dialogData: ReportDialogData = {
      loadCallback: () => {
        Logger.log('displayReportDialog - Dialog opened - loadCallback', dialogData, false, 'info')
      },
      unloadCallback: () => {
        Logger.log('displayReportDialog - Dialog closed - unloadCallback', dialogData, false, 'info')
      },
    }

    let nrows = 0
    nrows += 2 // report title and summary heading
    nrows += summaryMessages.length
    nrows += loggedMessages.length > 0 ? 2 : 0 // messages heading and description
    nrows += 2 * loggedMessages.length // title and body for each message
    nrows += loggedMessages.filter((x) => x.saveData).length // one save button per saveable message

    let irow = 0

    const dialogHelper = new ztoolkit.Dialog(nrows, 1)

    const minWidth = '300px'
    const maxWidth = '1000px'

    dialogHelper
      .addCell(irow++, 0, {
        tag: 'h1',
        properties: { textContent: config.addonName },
        namespace: 'html',
        styles: {
          textAlign: 'center',
          minWidth: minWidth,
          maxWidth: maxWidth,
        },
      })
      .addCell(irow++, 0, {
        tag: 'h2',
        properties: { textContent: 'Summary' },
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
          textContent: msgstr,
        },
        namespace: 'html',
        styles: {
          textAlign: 'center',
          whiteSpace: 'pre-line',
          minWidth: minWidth,
          maxWidth: maxWidth,
        },
      })
    }

    if (loggedMessages.length) {
      dialogHelper
        .addCell(irow++, 0, {
          tag: 'h2',
          properties: { textContent: 'Messages' },
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
            textContent: `Specific errors and warnings are listed below. For a complete debugging log, click the "${getString(
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
            textContent: msg.rowData.title,
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
            textContent: msg.rowData.message,
          },
          namespace: 'html',
          styles: {
            textAlign: 'center',
            whiteSpace: 'pre-line',
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
                  textContent: msg.saveData?.saveButtonTitle,
                },
                namespace: 'html',
                styles: {
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
      centerscreen: true,
      resizable: true,
      fitContent: true,
    })

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
