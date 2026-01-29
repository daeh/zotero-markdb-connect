import { KeyModifier } from 'zotero-plugin-toolkit'

import { config } from '../../package.json'
import { getPref, setPref } from '../utils/prefs'

import { KeyboardShortcuts } from './mdbcUX'

export async function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  // See addon/content/preferences.xhtml onpaneload
  if (!addon.data.prefs) {
    addon.data.prefs = {
      window: _window,
      columns: [],
      rows: [],
    }
  } else {
    addon.data.prefs.window = _window
  }
  initShortcutRecorder(_window)
}

function initShortcutRecorder(_window: Window) {
  const doc = _window.document
  const btn = doc.querySelector(`#zotero-prefpane-${config.addonRef}-shortcutOpenNote-btn`)
  const clearBtn = doc.querySelector(`#zotero-prefpane-${config.addonRef}-shortcutOpenNote-clear`)

  if (!btn || !clearBtn) return

  // Display current shortcut
  const currentShortcut = getPref('shortcutOpenNote') || ''
  updateButtonLabel(btn, currentShortcut)

  // Handle recording
  btn.addEventListener('command', () => {
    btn.setAttribute('label', '[Press keys...]')
    let recordedShortcut = ''

    const keyDownListener = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const shortcut = new KeyModifier(recordedShortcut)
      shortcut.control = e.ctrlKey
      shortcut.meta = e.metaKey
      shortcut.shift = e.shiftKey
      shortcut.alt = e.altKey

      // Only set the key if it's not a modifier key itself
      if (!['Shift', 'Meta', 'Ctrl', 'Alt', 'Control'].includes(e.key)) {
        // Use e.code to get physical key (avoids Alt producing special chars like ø)
        // e.code is like "KeyO", "Digit1", "F2", etc.
        let key = e.key
        if (e.code.startsWith('Key')) {
          key = e.code.slice(3).toLowerCase()
        } else if (e.code.startsWith('Digit')) {
          key = e.code.slice(5)
        } else if (e.code.startsWith('F') && /^F\d+$/.test(e.code)) {
          key = e.code // F1, F2, etc.
        }
        shortcut.key = key
      }

      recordedShortcut = shortcut.getRaw()
      btn.setAttribute('label', shortcut.getLocalized() || '[Press keys...]')
    }

    const keyUpListener = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      _window.removeEventListener('keydown', keyDownListener, true)
      _window.removeEventListener('keyup', keyUpListener, true)

      // Save the shortcut and re-register
      if (recordedShortcut) {
        setPref('shortcutOpenNote', recordedShortcut)
        updateButtonLabel(btn, recordedShortcut)
        KeyboardShortcuts.registerShortcuts()
      } else {
        updateButtonLabel(btn, getPref('shortcutOpenNote') || '')
      }
    }

    _window.addEventListener('keydown', keyDownListener, true)
    _window.addEventListener('keyup', keyUpListener, true)
  })

  // Handle clear
  clearBtn.addEventListener('command', () => {
    setPref('shortcutOpenNote', '')
    updateButtonLabel(btn, '')
    KeyboardShortcuts.registerShortcuts()
  })
}

function updateButtonLabel(btn: Element, shortcut: string) {
  if (shortcut) {
    const km = new KeyModifier(shortcut)
    btn.setAttribute('label', km.getLocalized() || shortcut)
  } else {
    btn.setAttribute('label', '[Click to record]')
  }
}

/*
async function updatePrefsUI() {
  // You can initialize some UI elements on prefs window
  // with addon.data.prefs.window.document
  // Or bind some events to the elements
  const renderLock = ztoolkit.getGlobal('Zotero').Promise.defer()
  if (addon.data.prefs?.window == undefined) return
  const tableHelper = new ztoolkit.VirtualizedTable(addon.data.prefs?.window)
    .setContainerId(`${config.addonRef}-table-container`)
    .setProp({
      id: `${config.addonRef}-prefs-table`,
      // Do not use setLocale, as it modifies the Zotero.Intl.strings
      // Set locales directly to columns
      columns: addon.data.prefs?.columns,
      showHeader: true,
      multiSelect: true,
      staticColumns: true,
      disableFontSizeScaling: true,
    })
    .setProp('getRowCount', () => addon.data.prefs?.rows.length || 0)
    .setProp(
      'getRowData',
      (index) =>
        addon.data.prefs?.rows[index] || {
          title: 'no data',
          detail: 'no data',
        },
    )
    // Show a progress window when selection changes
    .setProp('onSelectionChange', (selection) => {
      new ztoolkit.ProgressWindow(config.addonName)
        .createLine({
          text: `Selected line: ${addon.data.prefs?.rows
            .filter((v, i) => selection.isSelected(i))
            .map((row) => row.title)
            .join(',')}`,
          progress: 100,
        })
        .show()
    })
    // When pressing delete, delete selected line and refresh table.
    // Returning false to prevent default event.
    .setProp('onKeyDown', (event: KeyboardEvent) => {
      if (event.key == 'Delete' || (Zotero.isMac && event.key == 'Backspace')) {
        addon.data.prefs!.rows =
          addon.data.prefs?.rows.filter((v, i) => !tableHelper.treeInstance.selection.isSelected(i)) || []
        tableHelper.render()
        return false
      }
      return true
    })
    // For find-as-you-type
    .setProp('getRowString', (index) => addon.data.prefs?.rows[index].title || '')
    // Render the table.
    .render(-1, () => {
      renderLock.resolve()
    })
  await renderLock.promise
  ztoolkit.log('Preference table rendered!')
}

function bindPrefEvents() {
  addon.data
    .prefs!.window.document?.querySelector(`#zotero-prefpane-${config.addonRef}-enable`)
    ?.addEventListener('command', (e: Event) => {
      ztoolkit.log(e)
      addon.data.prefs!.window.alert(`Successfully changed to ${(e.target as XUL.Checkbox).checked}!`)
    })

  addon.data
    .prefs!.window.document?.querySelector(`#zotero-prefpane-${config.addonRef}-input`)
    ?.addEventListener('change', (e: Event) => {
      ztoolkit.log(e)
      addon.data.prefs!.window.alert(`Successfully changed to ${(e.target as HTMLInputElement).value}!`)
    })
}
*/
