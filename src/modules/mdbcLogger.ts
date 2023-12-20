import { config } from '../../package.json'
import { getPref } from '../utils/prefs'

import type { DebugMode, LogType, messageData } from '../mdbcTypes'

class LogsStore {
  static debug: DebugMode = getPref('debugmode') as DebugMode
  static time = {
    init: Date.now(),
    last: Date.now(),
  }
  static logs: Record<string, any> = {}
  static data: Record<string, any> = {}
  static messages: messageData[] = []
}

export class Logger {
  static dump() {
    return { logs: LogsStore.logs, data: LogsStore.data }
  }

  static getLogs() {
    return LogsStore.logs
  }

  static getMessages(): messageData[] {
    return LogsStore.messages
  }

  static clear(): void {
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

  private static updateTime() {
    const init = LogsStore.time.init
    const current = Date.now()
    // const last = LogsStore.time.last
    const delta = current - init
    LogsStore.time.last = current
    return delta
  }

  static addMessage(messageData: messageData) {
    LogsStore.messages.push(messageData)
  }

  static addData<T>(key: string, valueIn: T, overwrite: boolean = true) {
    if (LogsStore.debug === 'minimal') {
      LogsStore.data[key] = 'not stored in minimal debugging mode'
    } else {
      const value: T = JSON.parse(JSON.stringify(valueIn))
      if (!(key in LogsStore.data) || LogsStore.data[key] === undefined) {
        LogsStore.data[key] = value
      } else {
        //// if property already exists ////
        if (overwrite) {
          delete LogsStore.data[key]
          LogsStore.data[key] = value
        } else if (Array.isArray(LogsStore.data[key])) {
          LogsStore.data[key].push(value)
        } else {
          LogsStore.data[key] = [LogsStore.data[key], value]
        }
      }
    }
  }

  static getData(key: string) {
    if (key in LogsStore.data) {
      return LogsStore.data[key]
    }
  }

  static addLog(key: string, value: any, overwrite: boolean = false) {
    const timedelta = this.updateTime()
    const timedvalue = { msg: value, td: timedelta }
    if (!(key in LogsStore.logs) || LogsStore.logs[key] === undefined) {
      LogsStore.logs[key] = timedvalue
    } else {
      //// if property already exists ////
      if (overwrite) {
        delete LogsStore.logs[key]
        LogsStore.logs[key] = timedvalue
      } else if (Array.isArray(LogsStore.logs[key])) {
        LogsStore.logs[key].push(timedvalue)
      } else {
        LogsStore.logs[key] = [LogsStore.logs[key], timedvalue]
      }
    }
  }

  static log(key: string, value: any, overwrite: boolean = false, type: LogType = 'info'): void {
    let success: boolean = false
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
            if (!(type in LogsStore.logs)) {
              LogsStore.logs[type] = {} as Record<string, any>
            }
            LogsStore.logs[type][key] = value
            break
          default:
            break
        }
      }

      if (toZoteroDebugConsole) Zotero.debug(`{${config.addonInstance}}[log][${type}] ${key} :: ${value}`)
      if (toZoteroErrorConsole) ztoolkit.log(`{${config.addonInstance}}[log][${type}] ${key}`, value)
      if (toLogsStore) this.addLog(key, value, overwrite)

      success = true
    } catch (error) {
      Zotero.debug(`{${config.addonInstance}}[log][ERROR] addDebugLog Error: ${error}`)
      ztoolkit.log(`{${config.addonInstance}}[log][ERROR] addDebugLog Error`, error)
    }
    if (!success) {
      try {
        LogsStore.logs[key] = [LogsStore.logs[key], value]
      } catch (error) {
        Zotero.debug(`{${config.addonInstance}}[log][ERROR] addDebugLog-fallback Error: ${error}`)
        ztoolkit.log(`{${config.addonInstance}}[log][ERROR] addDebugLog-fallback Error`, error)
      }
    }
  }
}

export function trace(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
  const original = descriptor.value
  const identifier = `${target.name}.${String(propertyKey)}`
  descriptor.value = function (...args: any) {
    try {
      Zotero.debug(`{${config.addonInstance}}[call] : ${identifier}`)
      if (LogsStore.debug === 'maximal') {
        Logger.log('trace', identifier, false, 'trace')
      }
      return original.apply(this, args)
    } catch (error) {
      ztoolkit.log(`{${config.addonInstance}}[call][ERROR] : SOME ERROR`)
      Zotero.debug(`{${config.addonInstance}}[call][ERROR] : ${target.name}.${String(propertyKey)} :: ${error}`)
      ztoolkit.log(`{${config.addonInstance}}[call][ERROR] : ${target.name}.${String(propertyKey)}`, error)
      Logger.log('trace', `ERROR : ${identifier} :: ${error}`, false, 'error')
      throw error
    }
  }
  return descriptor
}
