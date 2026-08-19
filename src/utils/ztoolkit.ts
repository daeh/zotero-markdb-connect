import { ZoteroToolkit } from 'zotero-plugin-toolkit/ztoolkit'

import { config } from '../../package.json'

export { createZToolkit }

function createZToolkit() {
  const _ztoolkit = new ZoteroToolkit()
  initZToolkit(_ztoolkit)
  return _ztoolkit
}

function initZToolkit(_ztoolkit: ReturnType<typeof createZToolkit>) {
  const env = __env__
  const enableDebugLogs = env !== 'production'
  _ztoolkit.basicOptions.log.prefix = `[${config.addonName}]`
  _ztoolkit.basicOptions.log.disableConsole = env === 'production'
  _ztoolkit.UI.basicOptions.ui.enableElementJSONLog = enableDebugLogs
  _ztoolkit.UI.basicOptions.ui.enableElementDOMLog = enableDebugLogs
  _ztoolkit.basicOptions.api.pluginID = config.addonID
  _ztoolkit.ProgressWindow.setIconURI('default', `chrome://${config.addonRef}/content/icons/favicon.png`)
  // The toolkit's built-in success/fail icons point at PNGs Zotero 10 removed.
  _ztoolkit.ProgressWindow.setIconURI('success', 'chrome://zotero/skin/16/universal/tick.svg')
  _ztoolkit.ProgressWindow.setIconURI('fail', 'chrome://zotero/skin/16/universal/cross.svg')
}
