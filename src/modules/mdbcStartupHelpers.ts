import { config, version } from '../../package.json'
import { getPref, setPref } from '../utils/prefs'

import { paramVals } from './mdbcConstants'
import { getErrorMessage, Logger, trace } from './mdbcLogger'
import { getParam } from './mdbcParam'
import { Notifier } from './mdbcUX'

interface UpdateManifest {
  addons: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUpdateManifest(value: unknown): value is UpdateManifest {
  return isRecord(value) && isRecord(value.addons)
}

export class wrappers {
  @trace
  static async fetchAndParseJsonFromGitHub(): Promise<'match' | 'mismatch' | 'error'> {
    const url = config.updateJSON
    let status: 'match' | 'mismatch' | 'error'
    try {
      const response = await Zotero.HTTP.request('GET', url, {})

      if (response.status !== 200) {
        throw new Error(`Failed to fetch data: Status code ${response.status}`)
      }

      try {
        const jsonData: unknown = JSON.parse(response.responseText)
        if (!isUpdateManifest(jsonData)) {
          throw new TypeError('Update manifest must contain an addons object')
        }
        const addonIds = Object.keys(jsonData.addons)
        status = config.addonID === 'dev@daeh.info' && addonIds.includes('daeda@mit.edu') ? 'mismatch' : 'match'
        Logger.log('fetchAndParseJsonFromGitHub', `JSON data: ${JSON.stringify(Object.keys(jsonData))}`, false, 'debug')
      } catch (jsonError) {
        throw new Error('Failed to parse JSON data', { cause: jsonError })
      }
    } catch (error) {
      const message = getErrorMessage(error)
      Logger.log('fetchAndParseJsonFromGitHub', `Error fetching JSON data: ${message}`, false, 'error')
      throw error
    }
    return status
  }

  @trace
  static findPreviousVersion() {
    const version_re =
      /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?<release>[-+]?[0-9A-Za-z]+\.?[0-9A-Za-z]*[-+]?[0-9A-Za-z]*)?$/

    const configurationVersionThis = {
      major: 0,
      minor: 0,
      patch: 0,
      release: '',
      str: version,
    }
    const versionThis_rematch = version_re.exec(version)
    if (versionThis_rematch?.groups) {
      configurationVersionThis.major = Number.parseInt(versionThis_rematch.groups.major ?? '0', 10)
      configurationVersionThis.minor = Number.parseInt(versionThis_rematch.groups.minor ?? '0', 10)
      configurationVersionThis.patch = Number.parseInt(versionThis_rematch.groups.patch ?? '0', 10)
      configurationVersionThis.release = versionThis_rematch.groups.release ? versionThis_rematch.groups.release : ''
    }

    const configurationVersionPrevious = {
      major: 0,
      minor: 0,
      patch: 0,
      release: '',
      str: '',
    }
    try {
      const configurationVersionPreviousStr = getPref('configuration')
      if (typeof configurationVersionPreviousStr === 'string') {
        configurationVersionPrevious.str = configurationVersionPreviousStr
        if (version_re.test(configurationVersionPreviousStr)) {
          const version_rematch = version_re.exec(configurationVersionPreviousStr)
          if (version_rematch?.groups) {
            configurationVersionPrevious.major = Number.parseInt(version_rematch.groups.major ?? '0', 10)
            configurationVersionPrevious.minor = Number.parseInt(version_rematch.groups.minor ?? '0', 10)
            configurationVersionPrevious.patch = Number.parseInt(version_rematch.groups.patch ?? '0', 10)
            configurationVersionPrevious.release = version_rematch.groups.release ? version_rematch.groups.release : ''
          }
        }
      }
    } catch (err) {
      Logger.log('findPreviousVersion', `Error reading previous version: ${getErrorMessage(err)}`, false, 'warn')
    }

    return {
      app: configurationVersionThis,
      config: configurationVersionPrevious,
    }
  }

  @trace
  static startupVersionCheck() {
    const versionParse = this.findPreviousVersion()

    if (versionParse.config.str !== versionParse.app.str) {
      let prezot7 = versionParse.config.major === 0 && versionParse.config.minor < 1
      let preprerename1 =
        versionParse.config.major === 0 &&
        versionParse.config.minor === 1 &&
        versionParse.config.patch < 1 &&
        !['-rc.1'].includes(versionParse.config.release)

      if (!preprerename1) {
        const test0 = getPref('sourcedir')
        if (typeof test0 !== 'string' || test0 === '') {
          // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
          const test1 = getPref('source_dir')
          if (test1 && typeof test1 === 'string' && test1.length > 0) {
            preprerename1 = true
          }
        }
      }
      if (!preprerename1 && !prezot7) {
        const test0 = getPref('sourcedir')
        if (typeof test0 !== 'string' || test0 === '') {
          const test1 = Zotero.Prefs.get('extensions.mdbconnect.source_dir', true)
          if (test1 && typeof test1 === 'string' && test1.length > 0) {
            prezot7 = true
          }
        }
      }

      // sourcedir
      try {
        if (preprerename1) {
          // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
          const val = getPref('source_dir')
          if (val && typeof val === 'string' && val.length > 0) {
            setPref('sourcedir', val)
            getParam.sourcedir()
          }
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.source_dir', true)
          if (val && typeof val === 'string' && val.length > 0) {
            setPref('sourcedir', val)
            getParam.sourcedir()
          }
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `sourcedir ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // filefilterstrategy
      try {
        if (preprerename1) {
          const val = getPref('filefilterstrategy')
          if (val === 'customfileregex') {
            setPref('filefilterstrategy', 'customfileregexp')
          } else if (
            val &&
            typeof val === 'string' &&
            paramVals.filefilterstrategy.find((validName) => validName === val)
          ) {
            setPref('filefilterstrategy', val)
          } else {
            setPref('filefilterstrategy', paramVals.filefilterstrategy[0])
          }
          getParam.filefilterstrategy()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.filefilterstrategy', true)
          if (val === 'customfileregex') {
            setPref('filefilterstrategy', 'customfileregexp')
          } else if (
            val &&
            typeof val === 'string' &&
            paramVals.filefilterstrategy.find((validName) => validName === val)
          ) {
            setPref('filefilterstrategy', val)
          } else {
            setPref('filefilterstrategy', paramVals.filefilterstrategy[0])
          }
          getParam.filefilterstrategy()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `filefilterstrategy ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // filepattern
      try {
        if (preprerename1) {
          const val = getPref('filepattern')
          if (val && typeof val === 'string') setPref('filepattern', val)
          getParam.filepattern()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.filepattern', true)
          if (val && typeof val === 'string') setPref('filepattern', val)
          getParam.filepattern()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `filepattern ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // matchstrategy
      try {
        if (preprerename1) {
          const val = getPref('matchstrategy')
          if (val === 'bbtcitekey' || val === 'bbtcitekeyyaml') {
            setPref('matchstrategy', 'citekeyyaml')
          } else if (val === 'bbtcitekeyregexp') {
            setPref('matchstrategy', 'citekeyregexp')
          } else if (val && typeof val === 'string' && paramVals.matchstrategy.find((validName) => validName === val)) {
            setPref('matchstrategy', val)
          } else {
            setPref('matchstrategy', paramVals.matchstrategy[0])
          }
          getParam.matchstrategy()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.matchstrategy', true)
          if (val === 'bbtcitekey' || val === 'bbtcitekeyyaml') {
            setPref('matchstrategy', 'citekeyyaml')
          } else if (val === 'bbtcitekeyregexp') {
            setPref('matchstrategy', 'citekeyregexp')
          } else if (val && typeof val === 'string' && paramVals.matchstrategy.find((validName) => validName === val)) {
            setPref('matchstrategy', val)
          } else {
            setPref('matchstrategy', paramVals.matchstrategy[0])
          }
          getParam.matchstrategy()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `matchstrategy ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // yamlkeyword
      try {
        if (preprerename1) {
          // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
          const val = getPref('metadatakeyword')
          if (val && typeof val === 'string') {
            setPref('yamlkeyword', val)
          }
          getParam.yamlkeyword()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.metadatakeyword', true)
          if (val && typeof val === 'string') {
            setPref('yamlkeyword', val)
          }
          getParam.yamlkeyword()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `yamlkeyword ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // zotkeyregexp
      try {
        if (preprerename1) {
          // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
          const val = getPref('zotkeyregex')
          if (val && typeof val === 'string') {
            setPref('zotkeyregexp', val)
          }
          getParam.zotkeyregexp()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.zotkeyregex', true)
          if (val && typeof val === 'string') {
            setPref('zotkeyregexp', val)
          }
          getParam.zotkeyregexp()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `zotkeyregexp ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // mdeditor
      try {
        if (preprerename1) {
          // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
          const val = getPref('vaultresolution')
          if (val === 'path') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvespec', 'path')
          } else if (val === 'file') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvespec', 'file')
            getParam.obsidianresolve()
          } else if (val === 'logseq') {
            setPref('mdeditor', 'logseq')
          } else if (val === 'default') {
            setPref('mdeditor', 'system')
          } else {
            setPref('mdeditor', 'system')
          }
          getParam.mdeditor()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.vaultresolution', true)
          if (val === 'path') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvespec', 'path')
          } else if (val === 'file') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvespec', 'file')
            getParam.obsidianresolve()
          } else if (val === 'logseq') {
            setPref('mdeditor', 'logseq')
          } else if (val === 'default') {
            setPref('mdeditor', 'system')
          } else {
            setPref('mdeditor', 'system')
          }
          getParam.mdeditor()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `mdeditor ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // obsidianvaultname
      try {
        if (preprerename1) {
          // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
          const val = getPref('vaultname')
          if (val && typeof val === 'string') {
            setPref('obsidianvaultname', val)
          }
          getParam.obsidianvaultname()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.vaultname', true)
          if (val && typeof val === 'string') {
            setPref('obsidianvaultname', val)
          }
          getParam.obsidianvaultname()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `obsidianvaultname ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // logseqgraph
      try {
        if (preprerename1) {
          const val = getPref('logseqgraph')
          if (val && typeof val === 'string') {
            setPref('logseqgraph', val)
          }
          getParam.logseqgraph()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.logseqgraph', true)
          if (val && typeof val === 'string') {
            setPref('logseqgraph', val)
          }
          getParam.logseqgraph()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `logseqgraph ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // grouplibraries
      try {
        if (preprerename1) {
          const val = getPref('grouplibraries')
          if (val && typeof val === 'string' && paramVals.grouplibraries.find((validName) => validName === val)) {
            setPref('grouplibraries', val)
          } else setPref('grouplibraries', paramVals.grouplibraries[0])
          getParam.grouplibraries()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.grouplibraries', true)
          if (val && typeof val === 'string' && paramVals.grouplibraries.find((validName) => validName === val)) {
            setPref('grouplibraries', val)
          } else setPref('grouplibraries', paramVals.grouplibraries[0])
          getParam.grouplibraries()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `grouplibraries ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // removetags
      try {
        if (preprerename1) {
          const val = getPref('removetags')
          if (val && typeof val === 'string' && paramVals.removetags.find((validName) => validName === val)) {
            setPref('removetags', val)
          } else if (val) {
            setPref('removetags', paramVals.removetags[0])
          }
          getParam.removetags()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.removetags', true)
          if (val && typeof val === 'string' && paramVals.removetags.find((validName) => validName === val)) {
            setPref('removetags', val)
          } else if (val) {
            setPref('removetags', paramVals.removetags[0])
          }
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `removetags ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // tagstr
      try {
        if (preprerename1) {
          const val = getPref('tagstr')
          if (val) {
            setPref('tagstr', val)
          }
          getParam.tagstr()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.tagstr', true)
          if (val && typeof val === 'string' && val.length > 0) {
            setPref('tagstr', val)
          }
          getParam.tagstr()
        }
      } catch (err) {
        Logger.log('startupDependencyCheck', `tagstr ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      // Migrate BBT-prefixed preference keys.
      try {
        const matchVal = getPref('matchstrategy')
        if (matchVal === 'bbtcitekey' || matchVal === 'bbtcitekeyyaml') {
          setPref('matchstrategy', 'citekeyyaml')
        } else if (matchVal === 'bbtcitekeyregexp') {
          setPref('matchstrategy', 'citekeyregexp')
        }

        // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
        const yamlVal = getPref('bbtyamlkeyword')
        if (yamlVal && typeof yamlVal === 'string' && yamlVal.length > 0) {
          setPref('yamlkeyword', yamlVal)
        }

        // @ts-expect-error Legacy preference key is absent from PluginPrefsMap.
        const regexpVal = getPref('bbtregexp')
        if (regexpVal && typeof regexpVal === 'string' && regexpVal.length > 0) {
          setPref('citekeypattern', regexpVal)
        }
      } catch (err) {
        Logger.log('startupVersionCheck', `pref migration ERROR: ${getErrorMessage(err)}`, false, 'error')
      }

      if (addon.data.env === 'production') {
        setPref('configuration', version)
        Logger.log(
          'startupDependencyCheck',
          `Configuration version set to ${versionParse.app.str}. Was previously ${versionParse.config.str}.`,
          false,
          'debug',
        )
      } else {
        Logger.log(
          'startupDependencyCheck',
          `Configuration version set to ${versionParse.app.str}. Was previously ${versionParse.config.str}.`,
          false,
          'debug',
        )
      }
    }

    if (config.addonID !== 'daeda@mit.edu') {
      this.fetchAndParseJsonFromGitHub()
        .then((status) => {
          if (status === 'mismatch') {
            Notifier.notify({
              title: 'UPDATE AVAILABLE',
              body: `Please visit the ${config.addonName} GitHub repository to download.`,
              type: 'warn',
            })
            Logger.log('fetchAndParseJsonFromGitHub', 'update suggested', false, 'info')
          }
        })
        .catch((err) => {
          Logger.log('fetchAndParseJsonFromGitHub', `ERROR :: ${err}`, true, 'error')
        })
    }
  }

  @trace
  static startupConfigCheck() {
    let success = true

    if (!getParam.sourcedir().valid) {
      success = false
    }

    getParam.obsidianresolve()

    return success
  }
}
