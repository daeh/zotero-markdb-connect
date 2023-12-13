import { version } from '../../package.json'
import { getPref, setPref } from '../utils/prefs'

import { paramTypes, paramVals } from './mdbcConstants'
import { Logger, trace } from './mdbcLogger'
import { getParam } from './mdbcScan'

export class wrappers {
  @trace
  static findPreviousVersion() {
    const version_re =
      /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?<release>[-+]?[0-9A-Za-z]+\.?[0-9A-Za-z]*[-+]?[0-9A-Za-z]*)?$/

    const configurationVersionThis = { major: 0, minor: 0, patch: 0, release: '', str: version }
    const versionThis_rematch = version.match(version_re)
    if (versionThis_rematch?.groups) {
      configurationVersionThis.major = parseInt(versionThis_rematch.groups.major)
      configurationVersionThis.minor = parseInt(versionThis_rematch.groups.minor)
      configurationVersionThis.patch = parseInt(versionThis_rematch.groups.patch)
      configurationVersionThis.release = versionThis_rematch.groups.release ? versionThis_rematch.groups.release : ''
    }

    let configurationVersionPreviousStr: any = ''
    let configurationVersionPrevious = { major: 0, minor: 0, patch: 0, release: '', str: '' }
    try {
      configurationVersionPreviousStr = getPref('configuration')
      if (typeof configurationVersionPreviousStr === 'string') {
        configurationVersionPrevious.str = configurationVersionPreviousStr
      }
      if (typeof configurationVersionPreviousStr === 'string' && version_re.test(configurationVersionPreviousStr)) {
        const version_rematch = configurationVersionPreviousStr.match(version_re)
        if (version_rematch?.groups) {
          configurationVersionPrevious.major = parseInt(version_rematch.groups.major)
          configurationVersionPrevious.minor = parseInt(version_rematch.groups.minor)
          configurationVersionPrevious.patch = parseInt(version_rematch.groups.patch)
          configurationVersionPrevious.release = version_rematch.groups.release ? version_rematch.groups.release : ''
        }
      }
    } catch (e) {}

    return { app: configurationVersionThis, config: configurationVersionPrevious }
  }

  @trace
  static async startupVersionCheck() {
    const versonParse = this.findPreviousVersion()

    // Logger.log('startupVersionCheck - versonParse.app', versonParse.app, false, 'debug')
    // Logger.log('startupVersionCheck - configurationVersionPrevious', versonParse.config, false, 'debug')

    if (versonParse.config.str !== versonParse.app.str) {
      let prezot7 = versonParse.config.major === 0 && versonParse.config.minor < 1
      let preprerename1 =
        versonParse.config.major === 0 &&
        versonParse.config.minor === 1 &&
        versonParse.config.patch < 1 &&
        !['-rc.1'].includes(versonParse.config.release)

      if (!preprerename1) {
        let test0 = getPref('sourcedir')
        // Logger.log('startupVersionCheck - preprerename1 - test0', test0, false, 'debug')
        if (typeof test0 !== 'string' || test0 === '') {
          let test1 = getPref('source_dir')
          // Logger.log('startupVersionCheck - preprerename1 - test1', test1, false, 'debug')
          if (test1 && typeof test1 === 'string' && test1.length > 0) {
            // Logger.log('startupVersionCheck - preprerename1 - AMHERE0', test1, false, 'debug')
            preprerename1 = true
          }
        }
      }
      if (!preprerename1 && !prezot7) {
        let test0 = getPref('sourcedir')
        if (typeof test0 !== 'string' || test0 === '') {
          let test1 = Zotero.Prefs.get('extensions.mdbconnect.source_dir', true)
          if (test1 && typeof test1 === 'string' && test1.length > 0) {
            prezot7 = true
          }
        }
      }

      // Logger.log('startupVersionCheck - preprerename1', preprerename1, false, 'debug')

      // Logger.log('startupVersionCheck - prezot7', prezot7, false, 'debug')

      /// sourcedir
      try {
        if (preprerename1) {
          const val = getPref('source_dir') as string
          // Logger.log('startupVersionCheck - sourcedir - val', val, false, 'debug')
          if (val) {
            // Logger.log('startupVersionCheck - sourcedir - AMHERE', val, false, 'debug')
            setPref('sourcedir', val)
            getParam.sourcedir()
          }
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.source_dir', true) as string
          // Logger.log('startupVersionCheck - sourcedir - val2', val, false, 'debug')
          if (val) {
            // Logger.log('startupVersionCheck - sourcedir - AMHERE2', val, false, 'debug')
            setPref('sourcedir', val)
            getParam.sourcedir()
          }
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `sourcedir ERROR: ${e}`, false, 'error')
      }

      /// filefilterstrategy
      try {
        if (preprerename1) {
          const val = getPref('filefilterstrategy') as string
          if (val === 'customfileregex') {
            setPref('filefilterstrategy', 'customfileregexp')
          } else if (paramVals.filefilterstrategy.includes(val as paramTypes['filefilterstrategy'])) {
            setPref('filefilterstrategy', val)
          } else {
            setPref('filefilterstrategy', paramVals.filefilterstrategy[0])
          }
          getParam.filefilterstrategy()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.filefilterstrategy', true) as string
          if (val === 'customfileregex') {
            setPref('filefilterstrategy', 'customfileregexp')
          } else if (paramVals.filefilterstrategy.includes(val as paramTypes['filefilterstrategy'])) {
            setPref('filefilterstrategy', val)
          } else {
            setPref('filefilterstrategy', paramVals.filefilterstrategy[0])
          }
          getParam.filefilterstrategy()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `filefilterstrategy ERROR: ${e}`, false, 'error')
      }

      /// filepattern
      try {
        if (preprerename1) {
          const val = getPref('filepattern') as string
          if (val) setPref('filepattern', val)
          getParam.filepattern()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.filepattern', true) as string
          if (val) setPref('filepattern', val)
          getParam.filepattern()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `filepattern ERROR: ${e}`, false, 'error')
      }

      /// matchstrategy
      try {
        if (preprerename1) {
          const val = getPref('matchstrategy') as string
          if (val === 'bbtcitekey') {
            setPref('matchstrategy', 'bbtcitekeyyaml')
          } else if (paramVals.matchstrategy.includes(val as paramTypes['matchstrategy'])) {
            setPref('matchstrategy', val)
          } else {
            setPref('matchstrategy', paramVals.matchstrategy[0])
          }
          getParam.matchstrategy()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.matchstrategy', true) as string
          if (val === 'bbtcitekey') {
            setPref('matchstrategy', 'bbtcitekeyyaml')
          } else if (paramVals.matchstrategy.includes(val as paramTypes['matchstrategy'])) {
            setPref('matchstrategy', val)
          } else {
            setPref('matchstrategy', paramVals.matchstrategy[0])
          }
          getParam.matchstrategy()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `matchstrategy ERROR: ${e}`, false, 'error')
      }

      /// bbtyamlkeyword
      try {
        if (preprerename1) {
          const val = getPref('metadatakeyword') as string
          if (val) {
            setPref('bbtyamlkeyword', val)
          }
          getParam.bbtyamlkeyword()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.metadatakeyword', true) as string
          if (val) {
            setPref('bbtyamlkeyword', val)
          }
          getParam.bbtyamlkeyword()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `bbtyamlkeyword ERROR: ${e}`, false, 'error')
      }

      /// zotkeyregexp
      try {
        if (preprerename1) {
          const val = getPref('zotkeyregex') as string
          if (val) {
            setPref('zotkeyregexp', val)
          }
          getParam.zotkeyregexp()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.zotkeyregex', true) as string
          if (val) {
            setPref('zotkeyregexp', val)
          }
          getParam.zotkeyregexp()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `zotkeyregexp ERROR: ${e}`, false, 'error')
      }

      /// mdeditor
      try {
        if (preprerename1) {
          const val = getPref('vaultresolution') as string
          if (val === 'path') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', false)
          } else if (val === 'file') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', true)
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
          const val = Zotero.Prefs.get('extensions.mdbconnect.vaultresolution', true) as string
          if (val === 'path') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', false)
          } else if (val === 'file') {
            setPref('mdeditor', 'obsidian')
            setPref('obsidianresolvewithfile', true)
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
      } catch (e) {
        Logger.log('startupDependencyCheck', `mdeditor ERROR: ${e}`, false, 'error')
      }

      /// obsidianvaultname
      try {
        if (preprerename1) {
          const val = getPref('vaultname') as string
          if (val) {
            setPref('obsidianvaultname', val)
          }
          getParam.obsidianvaultname()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.vaultname', true) as string
          if (val) {
            setPref('obsidianvaultname', val)
          }
          getParam.obsidianvaultname()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `obsidianvaultname ERROR: ${e}`, false, 'error')
      }

      /// logseqgraph
      try {
        if (preprerename1) {
          const val = getPref('logseqgraph') as string
          if (val) {
            setPref('logseqgraph', val)
          }
          getParam.logseqgraph()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.logseqgraph', true) as string
          if (val) {
            setPref('logseqgraph', val)
          }
          getParam.logseqgraph()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `logseqgraph ERROR: ${e}`, false, 'error')
      }

      /// grouplibraries
      try {
        if (preprerename1) {
          const val = getPref('grouplibraries') as string
          if (paramVals.grouplibraries.includes(val as paramTypes['grouplibraries'])) {
            setPref('grouplibraries', val)
          } else setPref('grouplibraries', paramVals.grouplibraries[0])
          getParam.grouplibraries()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.grouplibraries', true) as string
          if (paramVals.grouplibraries.includes(val as paramTypes['grouplibraries'])) {
            setPref('grouplibraries', val)
          } else setPref('grouplibraries', paramVals.grouplibraries[0])
          getParam.grouplibraries()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `grouplibraries ERROR: ${e}`, false, 'error')
      }

      /// removetags
      try {
        if (preprerename1) {
          const val = getPref('removetags') as string
          if (paramVals.removetags.includes(val as paramTypes['removetags'])) {
            setPref('removetags', val)
          } else if (val) {
            setPref('removetags', paramVals.removetags[0])
          }
          getParam.removetags()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.removetags', true) as string
          if (paramVals.removetags.includes(val as paramTypes['removetags'])) {
            setPref('removetags', val)
          } else if (val) {
            setPref('removetags', paramVals.removetags[0])
          }
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `removetags ERROR: ${e}`, false, 'error')
      }

      /// tagstr
      try {
        if (preprerename1) {
          const val = getPref('tagstr') as string
          if (val) {
            setPref('tagstr', val)
          }
          getParam.tagstr()
        } else if (prezot7) {
          const val = Zotero.Prefs.get('extensions.mdbconnect.tagstr', true) as string
          if (val) {
            setPref('tagstr', val)
          }
          getParam.tagstr()
        }
      } catch (e) {
        Logger.log('startupDependencyCheck', `tagstr ERROR: ${e}`, false, 'error')
      }

      if (addon.data.env === 'production') {
        setPref('configuration', version)
        Logger.log(
          'startupDependencyCheck',
          `Configuration version set to ${versonParse.app.str}. Was previously ${versonParse.config.str}.`,
          false,
          'debug',
        )
      } else {
        Logger.log(
          'startupDependencyCheck',
          `Configuration version set to ${versonParse.app.str}. Was previously ${versonParse.config.str}.`,
          false,
          'debug',
        )
      }
    }
  }

  @trace
  static async startupConfigCheck() {
    let success = true

    if (!getParam.sourcedir().valid) {
      success = false
    }

    return success
  }
}
