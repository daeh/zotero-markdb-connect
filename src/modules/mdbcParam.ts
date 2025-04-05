import { config } from '../../package.json'
import { getPref, setPref } from '../utils/prefs'

import { paramVals } from './mdbcConstants'
import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { Notifier, prefHelpers } from './mdbcUX'

import type { ParamKey, ParamValue } from './mdbcConstants'

export class getParam {
  static sourcedir() {
    ///TYPE: path
    const name = 'sourcedir'
    const valueDefault = ''
    let valid = false
    let msg: string[] = []

    const param = { name, value: valueDefault, valid, msg: '' }

    try {
      const valueRaw = getPref(name)
      msg.push(`pref value: >>${valueRaw}<<.`)

      if (valueRaw === undefined || typeof valueRaw !== 'string') {
        msg.push(`type: ${typeof valueRaw}.`)
        throw new Error('Vault Path Not Found')
      }
      if (valueRaw.length === 0) {
        msg.push('length: 0.')
        throw new Error('Vault Path Not Found')
      }

      const zfileSourcedir = Zotero.File.pathToFile(valueRaw)
      if (!zfileSourcedir.exists() || !zfileSourcedir.isDirectory()) {
        msg.push('Invalid path.')
        throw new Error('Vault Path Valid')
      }
      zfileSourcedir.normalize()
      const sourcedirpath = zfileSourcedir.path

      if (sourcedirpath && typeof sourcedirpath === 'string' && sourcedirpath.length > 0) {
        valid = true
      } else {
        msg.push(`sourcedirpath: ${sourcedirpath}.`)
        msg.push(`sourcedirpathObj.exists(): ${zfileSourcedir.exists()}.`)
        msg.push(`sourcedirpathObj.isDirectory(): ${zfileSourcedir.isDirectory()}.`)
      }

      // const value = valid ? sourcedirpath : valueDefault
      param.valid = valid
      param.value = valid ? sourcedirpath : valueDefault
    } catch (err) {
      Logger.log('getParam', `ERROR: sourcedirpath :: ${getErrorMessage(err)}`, false, 'error')
      Notifier.notify({
        title: 'Warning',
        body: `Vault Path Not Found. Set the path to your notes in the ${config.addonName} preferences.`,
        type: 'error',
      })
      msg.push(`Error:: ${getErrorMessage(err)}.`)
    }

    param.msg = msg.join(' ')
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static filefilterstrategy() {
    ///TYPE: enum
    const name: ParamKey = 'filefilterstrategy'
    const valueDefault = paramVals[name][0]
    const valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'filefilterstrategy'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static filepattern() {
    ///TYPE: regex
    const name = 'filepattern'
    const valueDefault = '^@(\\S+).*\\.md$'
    const valid = true
    let msg = ''
    const flags = 'i'

    const valueRaw = getPref(name)
    msg += `pref value: >>${valueRaw}<<. `

    const verified = typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.isValidRegExp(valueRaw)
    const valueVerified = verified ? valueRaw : valueDefault
    const value = new RegExp(valueVerified, flags)
    const param = { name, value, valid, msg }

    if (verified) {
    } else {
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        Logger.log('getParam', `ERROR: ${name}: invalid RegExp :: ${valueRaw}. Using default instead.`, false, 'error')
        Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    Logger.log(name, { ...param, value: param.value.toString() }, false, 'config')
    return param
  }

  @trace
  static matchstrategy() {
    ///TYPE: enum
    const name: ParamKey = 'matchstrategy'
    const valueDefault = paramVals[name][0]
    const valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'matchstrategy'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static bbtyamlkeyword() {
    ///TYPE: string
    const name = 'bbtyamlkeyword'
    const valueDefault = ''
    let verified = false
    let valid = false
    let msg: string[] = []
    let value = valueDefault

    const valueRaw = getPref(name)
    msg.push(`pref value: >>${valueRaw}<<.`)

    /// NB checkMetadataFormat() will show a notification
    if (valueRaw && typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.checkMetadataFormat(valueRaw)) {
      verified = true
      valid = true
      value = valueRaw
    }

    if (verified) {
      msg.push('value passed verification checks.')
    } else {
      msg.push('value FAILED verification checks.')
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        msg.push('pref overwritten with default.')
        Logger.log(
          'getParam',
          `ERROR: ${name}: Invalid value :: >>${valueRaw}<<. Using default >>${valueDefault}<< instead.`,
          false,
          'error',
        )
        Logger.log('getParam', `${name}: set to default :: >>${valueDefault}<<`, false, 'error')
        setPref(name, valueDefault)
      }
    }
    const param = { name, value, valid, msg }

    Logger.log(name, param, false, 'config')

    return param
  }

  @trace
  static bbtregexp() {
    ///TYPE: regex
    const name = 'bbtregexp'
    const valueDefault = ''
    let valid = false
    let msg = ''
    const flags = 'm'

    const valueRaw = getPref(name)
    msg += `pref value: >>${valueRaw}<<. `

    const verified = typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.isValidRegExp(valueRaw)
    if (verified) {
      valid = true
      msg += 'valid RegExp. '
    }
    const valueVerified = verified ? valueRaw : valueDefault
    const value = new RegExp(valueVerified, flags)
    const param = { name, value, valid, msg }

    if (verified) {
    } else {
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        Logger.log('getParam', `ERROR: ${name}: invalid RegExp :: ${valueRaw}. Using default instead.`, false, 'error')
        Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    Logger.log(name, { ...param, value: param.value.toString() }, false, 'config')
    return param
  }

  @trace
  static zotkeyregexp() {
    ///TYPE: regex
    const name = 'zotkeyregexp'
    const valueDefault = ''
    let valid = false
    let msg = ''
    const flags = ''

    const valueRaw = getPref(name)
    msg += `pref value: >>${valueRaw}<<. `

    const verified = typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.isValidRegExp(valueRaw)
    if (verified) {
      valid = true
      msg += 'valid RegExp. '
    }
    const valueVerified = verified ? valueRaw : valueDefault
    const value = new RegExp(valueVerified, flags)
    const param = { name, value, valid, msg }

    if (verified) {
    } else {
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        Logger.log('getParam', `ERROR: ${name}: invalid RegExp :: ${valueRaw}. Using default instead.`, false, 'error')
        Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    Logger.log(name, { ...param, value: param.value.toString() }, false, 'config')
    return param
  }

  @trace
  static mdeditor() {
    ///TYPE: enum
    const name: ParamKey = 'mdeditor'
    const valueDefault = paramVals[name][0]
    let valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'mdeditor'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static obsidianresolve() {
    ///TYPE: enum
    const name: ParamKey = 'obsidianresolvespec'
    const valueDefault = paramVals[name][0]
    let valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'obsidianresolvespec'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static obsidianvaultname() {
    ///TYPE: string
    const name = 'obsidianvaultname'
    const valueDefault = ''
    let value = valueDefault
    let verified = false
    let valid = false
    let msg: string[] = []

    const valueRaw = getPref(name)
    msg.push(`pref value: >>${valueRaw}<<.`)

    /// NB checkMetadataFormat() will show a notification
    if (valueRaw && typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.checkMetadataFormat(valueRaw)) {
      verified = true
      valid = true
      value = valueRaw
    }

    if (verified) {
      msg.push('value passed verification checks.')
    } else {
      msg.push('value FAILED verification checks.')
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        msg.push('pref overwritten with default.')
        Logger.log(
          'getParam',
          `ERROR: ${name}: invalid value :: >>${valueRaw}<<. Using default >>${valueDefault}<< instead.`,
          false,
          'error',
        )
        Logger.log('getParam', `${name}: set to default :: >>${valueDefault}<<`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    const param = { name, value, valid, msg: msg.join(' ') }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static logseqgraph() {
    ///TYPE: string
    const name = 'logseqgraph'
    const valueDefault = ''
    let value = valueDefault
    let verified = false
    let valid = false
    let msg: string[] = []

    const valueRaw = getPref(name)
    msg.push(`pref value: >>${valueRaw}<<.`)

    /// NB checkMetadataFormat() will show a notification
    if (valueRaw && typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.checkMetadataFormat(valueRaw)) {
      verified = true
      valid = true
      value = valueRaw
    }

    if (verified) {
      msg.push('value passed verification checks.')
    } else {
      msg.push('value FAILED verification checks.')
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        msg.push('pref overwritten with default.')
        Logger.log(
          'getParam',
          `ERROR: ${name}: invalid value :: >>${valueRaw}<<. Using default >>${valueDefault}<< instead.`,
          false,
          'error',
        )
        Logger.log('getParam', `${name}: set to default :: >>${valueDefault}<<`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    const param = { name, value, valid, msg: msg.join(' ') }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static logseqprefix() {
    ///TYPE: string
    const name = 'logseqprefix'
    const valueDefault = ''
    let value = valueDefault
    let verified = false
    let valid = false
    let msg: string[] = []

    const valueRaw = getPref(name)
    msg.push(`pref value: >>${valueRaw}<<.`)

    /// NB checkMetadataFormat() will show a notification
    if (valueRaw && typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.checkMetadataFormat(valueRaw)) {
      verified = true
      valid = true
      value = valueRaw
    }

    if (verified) {
      msg.push('value passed verification checks.')
    } else {
      msg.push('value FAILED verification checks.')
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        msg.push('pref overwritten with default.')
        Logger.log(
          'getParam',
          `ERROR: ${name}: invalid value :: >>${valueRaw}<<. Using default >>${valueDefault}<< instead.`,
          false,
          'error',
        )
        Logger.log('getParam', `${name}: set to default :: >>${valueDefault}<<`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    const param = { name, value, valid, msg: msg.join(' ') }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static grouplibraries() {
    ///TYPE: enum
    const name: ParamKey = 'grouplibraries'
    const valueDefault = paramVals[name][0]
    let valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'grouplibraries'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static removetags() {
    ///TYPE: enum
    const name: ParamKey = 'removetags'
    const valueDefault = paramVals[name][0]
    let valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'removetags'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static tagstr() {
    ///TYPE: string
    const name = 'tagstr'
    const valueDefault = 'ObsCite'
    let value = valueDefault
    let verified = false
    let valid = true
    let msg: string[] = []

    const valueRaw = getPref(name)
    msg.push(`pref value: >>${valueRaw}<<.`)

    /// NB checkMetadataFormat() will show a notification
    if (valueRaw && typeof valueRaw === 'string' && valueRaw.length > 0 && prefHelpers.checkMetadataFormat(valueRaw)) {
      verified = true
      valid = true
      value = valueRaw
    }

    if (verified) {
      msg.push('value passed verification checks.')
    } else {
      msg.push('value FAILED verification checks.')
      if (valueRaw !== '' && valueRaw !== valueDefault) {
        msg.push('pref overwritten with default.')
        Logger.log(
          'getParam',
          `ERROR: ${name}: invalid value :: >>${valueRaw}<<. Using default >>${valueDefault}<< instead.`,
          false,
          'error',
        )
        Logger.log('getParam', `${name}: set to default :: >>${valueDefault}<<`, false, 'error')
        setPref(name, valueDefault)
      }
    }

    const param = { name, value, valid, msg: msg.join(' ') }
    Logger.log(name, param, false, 'config')
    return param
  }

  @trace
  static debugmode() {
    ///TYPE: enum
    const name: ParamKey = 'debugmode'
    const valueDefault = paramVals[name][0]
    let valid = true

    const valueRaw = getPref(name)

    const valueVerified = paramVals[name].find((validName) => validName === valueRaw)
    const value: ParamValue<'debugmode'> = valueVerified ? valueVerified : valueDefault
    const param = { name, value, valid }

    if (valueVerified) {
    } else {
      Logger.log('getParam', `ERROR: ${name}: invalid value :: ${valueRaw}`, false, 'error')
      Logger.log('getParam', `${name}: set to default :: ${valueDefault}`, false, 'error')
      setPref(name, valueDefault)
    }

    Logger.log(name, param, false, 'config')
    return param
  }
}
