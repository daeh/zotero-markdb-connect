import { config, version } from '../../package.json'
import {
  assembleDump,
  type JsonObject,
  type JsonValue,
  type LoggerDump,
  safeJsonClone,
  safeJsonObjectClone,
} from '../utils/json'
import { getPref, setPref } from '../utils/prefs'
import { elapsedMs, formatTimestamp } from '../utils/time'

import { paramVals } from './mdbcConstants'

import type { DebugMode, LogType, messageData } from '../mdbcTypes'

const getInitialDebugMode = (): DebugMode => {
  const valueRaw = getPref('debugmode')
  const valueVerified = paramVals.debugmode.find((validMode) => validMode === valueRaw)
  if (valueVerified) return valueVerified

  const valueDefault = paramVals.debugmode[0]
  setPref('debugmode', valueDefault)
  return valueDefault
}

class LogsStore {
  static debug: DebugMode = getInitialDebugMode()
  static time = {
    init: Temporal.Now.instant(),
    last: Temporal.Now.instant(),
  }
  static info: JsonObject = {}
  static config: JsonObject = {}
  static logs: JsonObject = {}
  static data: JsonObject = {}
  static messages: messageData[] = []
}

export class Logger {
  private static async collectInfo(): Promise<JsonObject> {
    const info: JsonObject = {
      MDBC: version,
      Zotero: Zotero.version,
      clientName: Zotero.clientName,
      platform: Zotero.platform,
      platformMajorVersion: Zotero.platformMajorVersion,
      locale: Zotero.locale,
      env: addon.data.env,
      timestamp: formatTimestamp(Temporal.Now.zonedDateTimeISO()),
    }
    try {
      info.osVersion = await Zotero.getOSVersion()
    } catch (err) {
      info.osVersion = `ERROR :: ${getErrorMessage(err)}`
    }
    try {
      info.extensions = await Zotero.getInstalledExtensions()
    } catch (err) {
      info.extensions = `ERROR :: ${getErrorMessage(err)}`
    }
    LogsStore.info = safeJsonObjectClone(info)
    return LogsStore.info
  }

  static async dump(): Promise<LoggerDump> {
    await this.collectInfo()
    return assembleDump({
      info: LogsStore.info,
      config: LogsStore.config,
      logs: LogsStore.logs,
      data: LogsStore.data,
    })
  }

  static getLogs(): JsonObject {
    return LogsStore.logs
  }

  static getMessages(): messageData[] {
    return LogsStore.messages
  }

  static clear(): void {
    LogsStore.info = {}
    LogsStore.config = {}
    LogsStore.logs = {}
    LogsStore.messages = []
    LogsStore.data = {}
  }

  static clearMessages(): void {
    LogsStore.messages = []
  }

  static mode() {
    return LogsStore.debug
  }

  static setDebugMode(mode: DebugMode) {
    LogsStore.debug = mode
  }

  private static updateTime(): number {
    const init = LogsStore.time.init
    const current = Temporal.Now.instant()
    const delta = elapsedMs(init, current)
    LogsStore.time.last = current
    return delta
  }

  static addMessage(messageData: messageData) {
    LogsStore.messages.push(messageData)
  }

  static addData(key: string, valueIn: unknown, overwrite = true) {
    if (LogsStore.debug === 'minimal') {
      LogsStore.data[key] = 'not stored in minimal debugging mode'
    } else {
      const value = safeJsonClone(valueIn)
      const existing = LogsStore.data[key]
      if (existing === undefined || overwrite) {
        LogsStore.data[key] = value
      } else if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        LogsStore.data[key] = [existing, value]
      }
    }
  }

  static getData(key: string): JsonValue | undefined {
    if (key in LogsStore.data) {
      return LogsStore.data[key]
    }
    return undefined
  }

  static addLog(key: string, value: unknown, overwrite = false) {
    const timedelta = this.updateTime()
    const timedvalue: JsonValue = { msg: safeJsonClone(value), td: timedelta }
    const existing = LogsStore.logs[key]
    if (existing === undefined || overwrite) {
      LogsStore.logs[key] = timedvalue
    } else if (Array.isArray(existing)) {
      existing.push(timedvalue)
    } else {
      LogsStore.logs[key] = [existing, timedvalue]
    }
  }

  static log(key: string, value: unknown, overwrite = false, type: LogType = 'info'): void {
    let success = false
    try {
      let toZoteroDebugConsole = false
      let toZoteroErrorConsole = false
      let toLogsStore = false
      if (LogsStore.debug === 'minimal') {
        switch (type) {
          case 'error':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            toLogsStore = true
            break
          case 'warn':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            break
          case 'info':
            break
          case 'debug':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            toLogsStore = true
            break
          case 'trace':
            break
          case 'config':
            LogsStore.config[key] = safeJsonClone(value)
            break
          default:
            break
        }
      } else {
        switch (type) {
          case 'error':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            toLogsStore = true
            break
          case 'warn':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            toLogsStore = true
            break
          case 'info':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            toLogsStore = true
            break
          case 'debug':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = true
            toLogsStore = true
            break
          case 'trace':
            toZoteroDebugConsole = true
            toZoteroErrorConsole = false
            toLogsStore = true
            break
          case 'config':
            LogsStore.config[key] = safeJsonClone(value)
            break
          default:
            break
        }
      }

      if (toZoteroDebugConsole) Zotero.debug(`{${config.addonInstance}}[log][${type}] ${key} :: ${String(value)}`)
      if (toZoteroErrorConsole) ztoolkit.log(`{${config.addonInstance}}[log][${type}] ${key}`, value)
      if (toLogsStore) this.addLog(key, value, overwrite)

      success = true
    } catch (err) {
      Zotero.debug(`{${config.addonInstance}}[log][ERROR] addDebugLog Error: ${getErrorMessage(err)}`)
      ztoolkit.log(`{${config.addonInstance}}[log][ERROR] addDebugLog Error`, err)
    }
    if (!success) {
      try {
        const existing = LogsStore.logs[key]
        LogsStore.logs[key] = [existing === undefined ? null : existing, safeJsonClone(value)]
      } catch (err) {
        Zotero.debug(`{${config.addonInstance}}[log][ERROR] addDebugLog-fallback Error: ${getErrorMessage(err)}`)
        ztoolkit.log(`{${config.addonInstance}}[log][ERROR] addDebugLog-fallback Error`, err)
      }
    }
  }
}

type DecoratedMethod = (this: unknown, ...args: unknown[]) => unknown

function isDecoratedMethod(value: unknown): value is DecoratedMethod {
  return typeof value === 'function'
}

export function trace(
  target: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  const original: unknown = descriptor.value
  if (!isDecoratedMethod(original)) {
    throw new TypeError(`Cannot trace non-callable property ${String(propertyKey)}`)
  }
  const targetName = 'name' in target && typeof target.name === 'string' ? target.name : undefined
  const identifier = `${targetName}.${String(propertyKey)}`
  descriptor.value = function (this: unknown, ...args: unknown[]): unknown {
    try {
      Zotero.debug(`{${config.addonInstance}}[call] : ${identifier}`)
      if (LogsStore.debug === 'maximal') {
        Logger.log('trace', identifier, false, 'trace')
      }
      return original.apply(this, args)
    } catch (err) {
      ztoolkit.log(`{${config.addonInstance}}[call][ERROR] : SOME ERROR`)
      Zotero.debug(
        `{${config.addonInstance}}[call][ERROR] : ${targetName}.${String(propertyKey)} :: ${getErrorMessage(err)}`,
      )
      ztoolkit.log(`{${config.addonInstance}}[call][ERROR] : ${targetName}.${String(propertyKey)}`, err)
      Logger.log('trace', `ERROR : ${identifier} :: ${getErrorMessage(err)}`, false, 'error')
      throw err
    }
  }
  return descriptor
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  return String(err)
}
