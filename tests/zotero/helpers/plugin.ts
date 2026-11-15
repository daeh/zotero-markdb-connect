import { config } from '../../../package.json'

import type { Entry } from '../../../src/mdbcTypes'

type KeyboardCallback = (
  event: KeyboardEvent,
  options: { keyboard?: { equals: (shortcut: string) => boolean } },
) => void

interface TestKeyboard {
  register: (callback: KeyboardCallback) => void
  unregister: (callback: KeyboardCallback) => void
}

interface TestPlugin {
  data: {
    alive: boolean
    env: 'development' | 'production' | 'test'
    initialized: boolean
    ztoolkit: { Keyboard: TestKeyboard }
  }
  hooks: {
    DataStore: () => {
      cleanrun: boolean
      data: Record<string, Entry[]>
      zotIds: number[]
    }
    onMainWindowLoad: (win: _ZoteroTypes.MainWindow) => Promise<void>
    onMainWindowUnload: (win: Window) => void
    syncMarkDB: () => Promise<void>
    syncMarkDBReport: () => void
  }
}

export type MenuName = 'sync' | 'troubleshoot' | 'itemOpen' | 'itemReveal' | 'itemOpenSubmenu' | 'itemRevealSubmenu'

// Hooks that older builds do not have. Keeping them out of TestPlugin lets tests run against an older build fail at
// their behavioral assertions instead of at plugin lookup.
interface NewHooks {
  registerGlobalUI: () => string[]
  unregisterGlobalUI: () => Record<MenuName, boolean>
  ensureTroubleshootMenu: () => string | false
}

export class MissingHookError extends Error {
  override name = 'MissingHookError'
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function isTestKeyboard(value: unknown): value is TestKeyboard {
  return isRecord(value) && typeof value.register === 'function' && typeof value.unregister === 'function'
}

function isTestPlugin(value: unknown): value is TestPlugin {
  if (!isRecord(value) || !isRecord(value.data) || !isRecord(value.hooks)) return false

  const { data, hooks } = value
  const env = data.env
  return (
    (env === 'development' || env === 'production' || env === 'test') &&
    typeof data.alive === 'boolean' &&
    typeof data.initialized === 'boolean' &&
    isRecord(data.ztoolkit) &&
    isTestKeyboard(data.ztoolkit.Keyboard) &&
    typeof hooks.DataStore === 'function' &&
    typeof hooks.onMainWindowLoad === 'function' &&
    typeof hooks.onMainWindowUnload === 'function' &&
    typeof hooks.syncMarkDB === 'function' &&
    typeof hooks.syncMarkDBReport === 'function'
  )
}

export function getTestPlugin(): TestPlugin {
  const plugin: unknown = Reflect.get(Zotero, config.addonInstance)
  if (!isTestPlugin(plugin)) {
    throw new TypeError(`Zotero.${config.addonInstance} is not an initialized MarkDB-Connect test instance`)
  }
  return plugin
}

export function getNewHook<K extends keyof NewHooks>(plugin: TestPlugin, name: K): NewHooks[K] {
  const hook: unknown = Reflect.get(plugin.hooks, name)
  if (typeof hook !== 'function') {
    throw new MissingHookError(`hooks.${name} is absent from this build`)
  }
  // The check above proves only that the hook is callable; its signature comes from the plugin's exported hooks.
  return hook.bind(plugin.hooks) as NewHooks[K]
}

/** Count Zotero.MenuManager.registerMenu calls by menuID while `body` runs, passing each call through. */
export async function countMenuRegistrations(body: () => unknown): Promise<Map<string, number>> {
  const menuManager = Zotero.MenuManager
  // Saved only to restore the exact original property afterwards; calls go through the bound copy below.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = menuManager.registerMenu
  const counts = new Map<string, number>()
  const register = original.bind(menuManager)
  menuManager.registerMenu = (options) => {
    counts.set(options.menuID, (counts.get(options.menuID) ?? 0) + 1)
    return register(options)
  }
  try {
    await body()
  } finally {
    menuManager.registerMenu = original
  }
  return counts
}

export const menuIDs = {
  sync: `${config.addonRef}-tools-menu-sync`,
  troubleshoot: `${config.addonRef}-tools-menu-troubleshoot`,
  itemOpen: `${config.addonID}-itemmenu-open`,
  itemReveal: `${config.addonID}-itemmenu-reveal`,
  itemOpenSubmenu: `${config.addonID}-itemmenu-open-submenu`,
  itemRevealSubmenu: `${config.addonID}-itemmenu-reveal-submenu`,
} as const satisfies Record<MenuName, string>

export const globalMenuNames = ['sync', 'itemOpen', 'itemReveal', 'itemOpenSubmenu', 'itemRevealSubmenu'] as const

/** The window of the report dialog the plugin has open, if any. */
export function reportDialogWindow(plugin: TestPlugin): Window | undefined {
  const dialog: unknown = Reflect.get(plugin.data, 'dialog')
  if (!isRecord(dialog)) return undefined
  const win: unknown = dialog.window
  return isRecord(win) && typeof win.close === 'function' ? (win as unknown as Window) : undefined
}

/** Poll until `condition` returns a value other than `undefined` or `false`, or fail after `timeoutMs`. */
export async function waitFor<T>(condition: () => T | undefined | false, label: string, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = condition()
    if (value !== undefined && value !== false) return value
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
