import { config } from '../../package.json'

export { initLocale, getString, getLocaleID }

interface GetStringOptions {
  branch?: string
  args?: L10nArgs
}

type GetStringInputs = [localString: string] | [localString: string, branchOrOptions: string | GetStringOptions]

function initLocale() {
  const l10n = new (typeof Localization === 'undefined' ? ztoolkit.getGlobal('Localization') : Localization)(
    [`${config.addonRef}-addon.ftl`],
    true,
  )
  addon.data.locale = {
    current: l10n,
  }
}

/**
 * Format an add-on Fluent message or attribute.
 * Returns the prefixed message ID when no value is found.
 * @see https://firefox-source-docs.mozilla.org/l10n/fluent/tutorial.html#fluent-translation-list-ftl
 */
function getString(localString: string): string
function getString(localString: string, branch: string): string
function getString(localeString: string, options: GetStringOptions): string
function getString(...inputs: GetStringInputs): string {
  if (inputs.length === 1) {
    return _getString(inputs[0])
  } else if (inputs.length === 2) {
    if (typeof inputs[1] === 'string') {
      return _getString(inputs[0], { branch: inputs[1] })
    } else {
      return _getString(inputs[0], inputs[1])
    }
  } else {
    throw new Error('Invalid arguments')
  }
}

function _getString(localeString: string, options: GetStringOptions = {}): string {
  const localStringWithPrefix = `${config.addonRef}-${localeString}`
  const { branch, args } = options
  const messageKey: L10nIdArgs =
    args === undefined ? { id: localStringWithPrefix } : { id: localStringWithPrefix, args }
  const pattern = addon.data.locale?.current.formatMessagesSync([messageKey])?.[0]
  if (!pattern) {
    return localStringWithPrefix
  }
  if (branch && pattern.attributes) {
    for (const attr of pattern.attributes) {
      if (attr.name === branch) {
        return attr.value
      }
    }
    const legacyBranchValue: unknown = Reflect.get(pattern.attributes, branch)
    return typeof legacyBranchValue === 'string' ? legacyBranchValue : localStringWithPrefix
  } else {
    return pattern.value || localStringWithPrefix
  }
}

function getLocaleID(id: string) {
  return `${config.addonRef}-${id}`
}
