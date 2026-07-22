import { config } from '../../package.json'
import { DataManager } from '../dataGlobals'
import { getLocaleID, getString } from '../utils/locale'
import { getPref, setPref } from '../utils/prefs'

import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { getParam } from './mdbcParam'

import type {
  Entry,
  notificationData,
  NotificationMessage,
  NotificationType,
  NotifyCreateLineOptions,
  ZoteroIconURI,
} from '../mdbcTypes'

const favIcon = `chrome://${config.addonRef}/content/icons/favicon.png` as const

const additionalIcons = [favIcon, 'chrome://zotero/skin/toolbar-item-add@2x.png'] as const
type AddonIconURI = (typeof additionalIcons)[number]
type IconURI = AddonIconURI | ZoteroIconURI

export class Notifier {
  static readonly notificationTypes: Record<NotificationType, IconURI> = {
    addon: favIcon,
    success: 'chrome://zotero/skin/tick@2x.png',
    error: 'chrome://zotero/skin/error@2x.png',
    warn: 'chrome://zotero/skin/warning@2x.png',
    info: 'chrome://zotero/skin/prefs-advanced.png',
    debug: 'chrome://zotero/skin/treeitem-patent@2x.png',
    config: 'chrome://zotero/skin/prefs-general.png',
    itemsadded: 'chrome://zotero/skin/toolbar-item-add@2x.png',
    itemsremoved: 'chrome://zotero/skin/minus@2x.png',
  }

  static notify(data: notificationData): void {
    const header = `${config.addonName} : ${data.title}`

    let messageArray: NotificationMessage[]
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
    const ms = 1000
    const popupWin = new ztoolkit.ProgressWindow(header, {
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

export class systemInterface {
  static expandSelection(ids: 'selected' | number | number[]): number[] {
    if (Array.isArray(ids)) return ids

    if (ids === 'selected') {
      try {
        return ztoolkit.getGlobal('ZoteroPane').getSelectedItems(true)
      } catch (err) {
        // getSelectedItems throws when the selection is empty.
        Logger.log('expandSelection', `Could not get selected items: ${getErrorMessage(err)}`, false, 'warn')
        return []
      }
    }

    return [ids]
  }

  @trace
  static async dumpDebuggingLog() {
    const data = JSON.stringify(await Logger.dump(), null, 1)
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

    Logger.log('saveDebuggingLog', `Saving to ${filepathstr}`, false, 'info')

    await Zotero.File.putContentsAsync(filepathstr, data)
  }

  @trace
  static async dumpJsonFile(data: string, title: string, filename: string) {
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
          // reveal() is unavailable on some platforms, including Linux.
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
      const paneType = getParam.obsidianpanetype().value
      const vaultnameParam = getParam.obsidianvaultname()
      // Encoding here would double-encode workaround values entered for vault names
      // with spaces: https://github.com/Taitava/obsidian-shellcommands/discussions/412
      const vaultKey = vaultnameParam.valid ? `vault=${vaultnameParam.value}&` : ''

      const fileKey =
        uri_spec === 'file'
          ? `file=${encodeURIComponent(entry_res.name)}`
          : `path=${encodeURIComponent(entry_res.path)}`

      const paneKey = paneType === 'active' ? '' : `&paneType=${paneType}`

      const uri = `obsidian://open?${vaultKey}${fileKey}${paneKey}`
      Zotero.launchURL(uri)

      Logger.log('openObsidianURI', `Launching ${entry_res.path} :: ${uri}`, false, 'info')
    } catch (err) {
      Logger.log('openObsidianURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
    }
  }

  @trace
  static openLogseqURI(entry_res: Entry): void {
    try {
      const fileObj = Zotero.File.pathToFile(entry_res.path)
      fileObj.normalize()
      const filename = fileObj.leafName
      const filenamebase = filename.replace(/\.md$/i, '')

      let graphName = ''
      const graphNameParam = getParam.logseqgraph()
      if (graphNameParam.valid) {
        graphName = graphNameParam.value
      } else {
        // Infer the graph name from the note's grandparent directory.
        try {
          graphName = fileObj.parent.parent.leafName
        } catch (err) {
          Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
          graphName = ''
        }
      }

      if (graphName === '') {
        Notifier.notify({
          title: 'Error',
          body: `logseq graph name not found. Set the graph name in the ${config.addonName} preferences.`,
          type: 'error',
        })
        throw new Error('graphName not resolved')
      }

      const fileKey = `page=${filenamebase}`
      const uri = `logseq://graph/${graphName}?${fileKey}`

      Zotero.launchURL(uri)

      Logger.log('openLogseqURI', `Launching ${entry_res.path} :: ${uri}`, false, 'info')
    } catch (err) {
      Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
    }
  }
}

export class UIHelpers {
  @trace
  static registerWindowMenuItem_Sync() {
    Zotero.MenuManager.registerMenu({
      menuID: `${config.addonRef}-tools-menu-sync`,
      pluginID: config.addonID,
      target: 'main/menubar/tools',
      menus: [
        { menuType: 'separator' },
        {
          menuType: 'menuitem',
          l10nID: getLocaleID('menuitem-sync'),
          onCommand: () => {
            void addon.hooks.syncMarkDB()
          },
        },
      ],
    })
  }

  @trace
  static registerWindowMenuItem_Debug() {
    Zotero.MenuManager.registerMenu({
      menuID: `${config.addonRef}-tools-menu-troubleshoot`,
      pluginID: config.addonID,
      target: 'main/menubar/tools',
      menus: [
        {
          menuType: 'menuitem',
          l10nID: getLocaleID('menuitem-troubleshoot'),
          onCommand: () => {
            void addon.hooks.syncMarkDBReport()
          },
        },
      ],
    })
  }

  // Single matches use direct actions; multiple matches use submenus populated by onShowing.
  static registerRightClickMenuItem() {
    const dispatchOpen = (entry: Entry): void => {
      try {
        const protocol = getParam.mdeditor().value
        switch (protocol) {
          case 'obsidian':
            systemInterface.openObsidianURI(entry)
            break
          case 'logseq':
            systemInterface.openLogseqURI(entry)
            break
          default:
            systemInterface.openFileSystemPath(entry)
            break
        }
      } catch (err) {
        Logger.log('dispatchOpen', `ERROR: ${getErrorMessage(err)}`, false, 'error')
      }
    }

    const dispatchReveal = (entry: Entry): void => {
      try {
        systemInterface.showSelectedItemMarkdownInFilesystem(entry)
      } catch (err) {
        Logger.log('dispatchReveal', `ERROR: ${getErrorMessage(err)}`, false, 'error')
      }
    }

    type Action = 'open' | 'reveal'
    type LibraryMenuContext = _ZoteroTypes.MenuManager.LibraryMenuContext
    type LibraryMenuData = _ZoteroTypes.MenuManager.MenuData<LibraryMenuContext>

    const openSubmenuChildren: LibraryMenuData[] = []
    const revealSubmenuChildren: LibraryMenuData[] = []

    const buildChild = (action: Action, entry: Entry, i: number): LibraryMenuData => ({
      menuType: 'menuitem',
      _key: `zotero-custom-menu-mdbc-${action}-${i}`,
      onShowing: (_ev: Event, ctx: LibraryMenuContext) => {
        try {
          ctx.menuElem.setAttribute('label', entry.name)
        } catch (e) {
          Zotero.logError(e as Error)
        }
      },
      onCommand: () => {
        try {
          if (action === 'open') dispatchOpen(entry)
          else dispatchReveal(entry)
        } catch (e) {
          Zotero.logError(e as Error)
        }
      },
    })

    const rebuildChildren = (target: LibraryMenuData[], action: Action, entries: Entry[]): void => {
      target.length = 0
      entries.forEach((entry, i) => target.push(buildChild(action, entry, i)))
    }

    Zotero.MenuManager.registerMenu({
      menuID: `${config.addonID}-itemmenu-open`,
      pluginID: config.addonID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'menuitem',
          l10nID: getLocaleID('contextmenuitem-open-default'),
          icon: 'chrome://zotero/skin/treeitem-note@2x.png',
          onShowing: (_event: Event, context: LibraryMenuContext) => {
            const entries = UIHelpers.getEntriesForSelection()
            context.setVisible(!!entries && entries.length === 1)
          },
          onCommand: () => {
            const entries = UIHelpers.getEntriesForSelection()
            const entry = entries?.length === 1 ? entries[0] : undefined
            if (entry !== undefined) dispatchOpen(entry)
          },
        },
      ],
    })
    Zotero.MenuManager.registerMenu({
      menuID: `${config.addonID}-itemmenu-reveal`,
      pluginID: config.addonID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'menuitem',
          l10nID: getLocaleID('contextmenuitem-reveal'),
          icon: 'chrome://zotero/skin/toolbar-advanced-search.png',
          onShowing: (_event: Event, context: LibraryMenuContext) => {
            const entries = UIHelpers.getEntriesForSelection()
            context.setVisible(!!entries && entries.length === 1)
          },
          onCommand: () => {
            const entries = UIHelpers.getEntriesForSelection()
            const entry = entries?.length === 1 ? entries[0] : undefined
            if (entry !== undefined) dispatchReveal(entry)
          },
        },
      ],
    })
    Zotero.MenuManager.registerMenu({
      menuID: `${config.addonID}-itemmenu-open-submenu`,
      pluginID: config.addonID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'submenu',
          icon: 'chrome://zotero/skin/treeitem-note@2x.png',
          onShowing: (_ev: Event, ctx: LibraryMenuContext) => {
            const entries = UIHelpers.getEntriesForSelection()
            if (!entries || entries.length < 2) {
              ctx.setVisible(false)
              return
            }
            ctx.menuElem.setAttribute('label', getString('contextmenuitem-open-default'))
            rebuildChildren(openSubmenuChildren, 'open', entries)
            ctx.setVisible(true)
          },
          menus: openSubmenuChildren,
        },
      ],
    })
    Zotero.MenuManager.registerMenu({
      menuID: `${config.addonID}-itemmenu-reveal-submenu`,
      pluginID: config.addonID,
      target: 'main/library/item',
      menus: [
        {
          menuType: 'submenu',
          icon: 'chrome://zotero/skin/toolbar-advanced-search.png',
          onShowing: (_ev: Event, ctx: LibraryMenuContext) => {
            const entries = UIHelpers.getEntriesForSelection()
            if (!entries || entries.length < 2) {
              ctx.setVisible(false)
              return
            }
            ctx.menuElem.setAttribute('label', getString('contextmenuitem-reveal'))
            rebuildChildren(revealSubmenuChildren, 'reveal', entries)
            ctx.setVisible(true)
          },
          menus: revealSubmenuChildren,
        },
      ],
    })
  }

  static getEntriesForSelection(): Entry[] | null {
    try {
      const pane = Zotero.getActiveZoteroPane()
      if (!pane) return null
      const items = pane.getSelectedItems()
      if (items?.length !== 1) return null
      const item = items[0]
      if (item === undefined) return null
      const itemId = item.id
      if (!DataManager.checkForZotId(itemId)) return null
      const entries = DataManager.getEntryList(itemId)
      return entries.length > 0 ? entries : null
    } catch {
      return null
    }
  }

  static hasMarkdownEntryForSelection(): boolean {
    return UIHelpers.getEntriesForSelection() !== null
  }

  @trace
  static highlightTaggedRows() {
    const tagstrParam = getParam.tagstr()
    if (!tagstrParam.valid) return
    const tagstr = tagstrParam.value

    const spans: NodeListOf<HTMLSpanElement> = Zotero.getMainWindow().document.querySelectorAll(
      `span[aria-label*="Tag ${tagstr}."]`,
    )

    spans.forEach((span) => {
      span.style.color = 'red'
    })
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
      return true
    } catch (err) {
      Logger.log('isValidRegExp', `ERROR: RegExp is not valid:: >> ${str} <<.`, false, 'warn')
      return false
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
      // '/' and '#' are allowed in tag strings.
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
        if (tagstr.includes(char)) {
          found.push(char)
        }
      }
      if (found.length > 0) {
        Logger.log('checkTagStr', `ERROR: TagStr cannot contain: ${found.join(' or ')}.`, false, 'warn')
        return false
      } else {
        return true
      }
    } else {
      return true
    }
  }
}

export class Registrar {
  @trace
  static registerPrefs() {
    void Zotero.PreferencePanes.register({
      pluginID: addon.data.config.addonID,
      src: rootURI + 'content/preferences.xhtml',
      label: getString('prefs-title'),
      image: `chrome://${addon.data.config.addonRef}/content/icons/favicon.png`,
    })
  }
}

export class KeyboardShortcuts {
  private static currentCallback: ((ev: KeyboardEvent, options: { keyboard?: unknown }) => void) | null = null
  private static currentShortcut: string | null = null

  @trace
  static registerShortcuts() {
    const pref = getPref('shortcutOpenNote')
    const shortcut = pref && pref.trim() !== '' ? pref.trim() : null

    if (this.currentCallback) {
      ztoolkit.Keyboard.unregister(this.currentCallback)
      this.currentCallback = null
      this.currentShortcut = null
    }

    if (!shortcut) {
      return
    }

    this.currentShortcut = shortcut

    this.currentCallback = (ev, keyOptions) => {
      if (keyOptions.keyboard) {
        const kb = keyOptions.keyboard as { equals: (s: string) => boolean }

        // Block accel+A (Select All) to prevent freezing with large selections.
        if (kb.equals('accel,a')) {
          return
        }

        const targetName = (ev.target as HTMLElement)?.localName?.toLowerCase() || ''
        if (['input', 'textarea', 'select', 'search-textbox', 'textbox'].includes(targetName)) {
          return
        }

        if (kb.equals(this.currentShortcut!)) {
          this.openSelectedItemNote()
        }
      }
    }

    ztoolkit.Keyboard.register(this.currentCallback)
  }

  @trace
  static openSelectedItemNote() {
    try {
      const selectedItemIds = systemInterface.expandSelection('selected')

      if (selectedItemIds.length === 0) {
        Notifier.notify({
          title: 'No Selection',
          body: 'No Zotero item is selected.',
          type: 'warn',
        })
        return
      }

      if (selectedItemIds.length > 1) {
        Notifier.notify({
          title: 'Multiple Selection',
          body: 'Please select only one item to open its linked note.',
          type: 'warn',
        })
        return
      }

      const itemId = selectedItemIds[0]
      if (itemId === undefined) return

      if (!DataManager.checkForZotId(itemId)) {
        Notifier.notify({
          title: 'No Linked Note',
          body: 'No markdown note is linked to this Zotero item.',
          type: 'warn',
        })
        return
      }

      const entryList: Entry[] = DataManager.getEntryList(itemId)

      if (entryList.length === 0) {
        Notifier.notify({
          title: 'No Linked Note',
          body: 'No markdown note is linked to this Zotero item.',
          type: 'warn',
        })
        return
      }

      const entry = entryList[0]
      if (entry === undefined) return
      const protocol = getParam.mdeditor().value

      switch (protocol) {
        case 'obsidian':
          systemInterface.openObsidianURI(entry)
          break
        case 'logseq':
          systemInterface.openLogseqURI(entry)
          break
        case 'system':
          systemInterface.openFileSystemPath(entry)
          break
        default:
          systemInterface.openFileSystemPath(entry)
          break
      }

      if (entryList.length > 1) {
        Notifier.notify({
          title: 'Multiple Notes',
          body: `Opening first of ${entryList.length} linked notes. Use context menu for others.`,
          type: 'info',
        })
      }
    } catch (err) {
      Logger.log('openSelectedItemNote', `ERROR: ${getErrorMessage(err)}`, false, 'error')
      Notifier.notify({
        title: 'Error',
        body: `Failed to open linked note: ${getErrorMessage(err)}`,
        type: 'error',
      })
    }
  }
}
