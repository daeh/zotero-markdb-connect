import { KeyModifier } from 'zotero-plugin-toolkit'

import { config } from '../../package.json'
import { getPref, setPref } from '../utils/prefs'

import { KeyboardShortcuts } from './mdbcUX'

export function registerPrefsScripts(_window: Window): void {
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

  const currentShortcut = getPref('shortcutOpenNote') || ''
  updateButtonLabel(btn, currentShortcut)

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

      if (!['Shift', 'Meta', 'Ctrl', 'Alt', 'Control'].includes(e.key)) {
        // Use the physical key code so Alt does not produce locale-specific characters.
        let key = e.key
        if (e.code.startsWith('Key')) {
          key = e.code.slice(3).toLowerCase()
        } else if (e.code.startsWith('Digit')) {
          key = e.code.slice(5)
        } else if (e.code.startsWith('F') && /^F\d+$/.test(e.code)) {
          key = e.code
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
