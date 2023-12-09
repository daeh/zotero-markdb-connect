// import { is7 } from './client'

export const NAMESPACE = {
  XUL: 'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
  HTML: 'http://www.w3.org/1999/xhtml',
}

type Handler = (event?: any) => void | Promise<void>

export class Elements {
  // static all: Set<WeakRef<HTMLElement>> = new Set
  static all = new Set()

  static removeAll(): void {
    for (const eltRef of this.all) {
      try {
        eltRef.deref()?.remove()
      } catch (err) {}
    }
    this.all = new Set()
  }

  private className: string
  constructor(private document: Document) {
    this.className = `better-bibtex-${Zotero.Utilities.generateObjectKey()}`
  }

  public serialize(node: HTMLElement): string {
    const s = new XMLSerializer()
    return s.serializeToString(node)
  }

  create(name: string, attrs: Record<string, number | string | Handler | HTMLElement[]> = {}): HTMLElement {
    const children: HTMLElement[] = (attrs.$ as unknown as HTMLElement[]) || []
    delete attrs.$

    /// temp
    const is7 = true

    const namespace = name.startsWith('html:') ? NAMESPACE.HTML : NAMESPACE.XUL
    name = name.replace('html:', '')

    const elt: HTMLElement = is7
      ? (this.document[namespace === NAMESPACE.XUL ? 'createXULElement' : 'createElement'](name) as HTMLElement)
      : (this.document.createElementNS(namespace, name) as HTMLElement)
    const aaa = attrs?.class || ''
    let attrsclass: string = ''
    try {
      attrsclass = attrs.class as string
    } catch (err) {}
    attrs.class = `${this.className} ${attrsclass}`.trim()
    for (const [a, v] of Object.entries(attrs)) {
      if (typeof v === 'string') {
        elt.setAttribute(a, v)
      } else if (typeof v === 'number') {
        elt.setAttribute(a, `${v}`)
      } else if (a.startsWith('on') && typeof v === 'function') {
        elt.addEventListener(a.replace('on', ''), (event) => {
          ;(v(event) as Promise<void>)?.catch?.((err) => {
            throw err
          })
        })
      } else {
        throw new Error(`unexpected attribute ${a}`)
      }
    }
    for (const child of children) {
      elt.appendChild(child)
    }

    // if (is7) Elements.all.add(new WeakRef(elt))

    return elt
  }

  remove(): void {
    for (const elt of Array.from(this.document.getElementsByClassName(this.className))) {
      elt.remove()
    }
  }
}
