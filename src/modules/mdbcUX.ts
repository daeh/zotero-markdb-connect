import { config } from '../../package.json'
import { DataManager } from '../dataGlobals'
import { getString } from '../utils/locale'
import { setPref } from '../utils/prefs'

import { Elements } from './create-element'
import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { getParam } from './mdbcParam'
import { patch as $patch$ } from './monkey-patch'

import type { Entry, notificationData, NotificationType, NotifyCreateLineOptions, ZoteroIconURI } from '../mdbcTypes'

const favIcon = `chrome://${config.addonRef}/content/icons/favicon.png` as const // TODO: move def and import form all modules

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

export class systemInterface {
  static expandSelection(ids: 'selected' | number | number[]): number[] {
    if (Array.isArray(ids)) return ids

    if (ids === 'selected') {
      try {
        // return Zotero.getActiveZoteroPane().getSelectedItems(true)
        return ztoolkit.getGlobal('ZoteroPane').getSelectedItems(true)
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

      const uri = `obsidian://open?${vaultKey}${fileKey}`
      Zotero.launchURL(uri)

      Logger.log('openObsidianURI', `Launching ${entry_res.path} :: ${uri}`, false, 'info')
    } catch (err) {
      Logger.log('openObsidianURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
    }
  }

  @trace
  static openLogseqURI(entry_res: Entry): void {
    try {
      /// get filename without extension
      const fileObj = Zotero.File.pathToFile(entry_res.path)
      fileObj.normalize()
      // const filename = fileObj.getRelativePath(fileObj.parent)
      // const filename = fileObj.displayName
      const filename = fileObj.leafName
      const filenamebase = filename.replace(/\.md$/i, '')

      /// get graph name
      let graphName = ''
      const graphNameParam = getParam.logseqgraph()
      if (graphNameParam.valid) {
        graphName = graphNameParam.value
      } else {
        /* if graph name not specified, try to get it from the path */
        try {
          graphName = fileObj.parent.parent.leafName
        } catch (err) {
          Logger.log('openLogseqURI', `ERROR :: ${entry_res?.path} :: ${getErrorMessage(err)}`, false, 'warn')
          /* if candidate graph name not found, abort */
          graphName = '' /// will case error below
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

      /// if using re-encoded note name
      // const fileKey = `page=${logseq_prefix_file}${filenamebase}`
      /// if using filename
      const fileKey = `page=${filenamebase}`
      const uri = `logseq://graph/${graphName}?${fileKey}`

      /* prefix not encoded, filename encoded */
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
      // ztoolkit.getGlobal('ZoteroPane'),
      // ztoolkit.getGlobal('Zotero_Tabs').select('zotero-pane'),
      'buildItemContextMenu',
      (original) =>
        async function ZoteroPane_buildItemContextMenu() {
          // @ts-ignore
          await original.apply(this, arguments)

          // const doc = Zotero.getMainWindow().document

          const itemMenuRevealId = '__addonRef__-itemmenu'
          document.getElementById(itemMenuRevealId)?.remove()

          const itemMenuOpenId = '__addonRef__-itemmenu'
          document.getElementById(itemMenuOpenId)?.remove()

          const itemMenuSeparatorId = '__addonRef__-itemmenu-separator'
          document.getElementById(itemMenuSeparatorId)?.remove()

          //// this ~= Zotero.getActiveZoteroPane() ////
          // @ts-ignore
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

export class Registrar {
  @trace
  static registerPrefs() {
    const prefOptions = {
      pluginID: config.addonID,
      src: rootURI + 'chrome/content/preferences.xhtml',
      label: getString('prefs-title'),
      image: favIcon,
      // defaultXUL: true,
    }
    Zotero.PreferencePanes.register(prefOptions)
  }
}
