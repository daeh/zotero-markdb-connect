import {
  BasicTool,
  DialogHelper,
  FilePickerHelper,
  KeyboardManager,
  makeHelperTool,
  ProgressWindowHelper,
  UITool,
  unregister,
} from 'zotero-plugin-toolkit'

import { config } from '../../package.json'

export { createZToolkit }

/**
 * Only the toolkit modules this plugin uses.
 *
 * The full `ZoteroToolkit` also builds `FieldHookManager`, which wraps `Zotero.Item.prototype.getField`, `setField`,
 * and `isFieldOfBase` for all of Zotero as soon as it is constructed.
 */
class MarkDBToolkit extends BasicTool {
  readonly UI: UITool
  readonly Keyboard: KeyboardManager
  readonly FilePicker = makeHelperTool(FilePickerHelper, this)
  readonly ProgressWindow = makeHelperTool(ProgressWindowHelper, this)
  readonly Dialog = makeHelperTool(DialogHelper, this)

  constructor() {
    super()
    const production = __env__ === 'production'

    // Set identity before building managers: KeyboardManager registers its Reader listener under
    // basicOptions.api.pluginID in its constructor, and Zotero removes Reader listeners by plugin ID on shutdown.
    this.basicOptions.api.pluginID = config.addonID
    this.basicOptions.log.prefix = `[${config.addonName}]`
    this.basicOptions.log.disableConsole = production

    // UITool creates the shared basicOptions.ui that DialogHelper instances read.
    this.UI = new UITool(this)
    this.UI.basicOptions.ui.enableElementJSONLog = !production
    this.UI.basicOptions.ui.enableElementDOMLog = !production

    this.Keyboard = new KeyboardManager(this)

    this.ProgressWindow.setIconURI('default', `chrome://${config.addonRef}/content/icons/favicon.png`)
    // The toolkit's built-in success/fail icons point at PNGs Zotero 10 removed.
    this.ProgressWindow.setIconURI('success', 'chrome://zotero/skin/16/universal/tick.svg')
    this.ProgressWindow.setIconURI('fail', 'chrome://zotero/skin/16/universal/cross.svg')
  }

  unregisterAll(): void {
    unregister(this)
  }
}

function createZToolkit(): MarkDBToolkit {
  return new MarkDBToolkit()
}
