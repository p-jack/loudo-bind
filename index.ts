import { Loud } from "loudify"

let i18n = <T>(value:T):string => {
  return String(value)
}

export const i18nWith = (internationalizer:<T>(text:T)=>string) => {
  i18n = internationalizer
}

type Keys<T extends object> = keyof T | (keyof T)[]
const NOPE = "nope" as const
type Factory<T> = ((value:T)=>HTMLElement|typeof NOPE)|((value:T)=>HTMLElement[]|typeof NOPE)

declare global {
  interface HTMLElement {
    bindAttr<T extends object>(attribute:string, model:Loud<T>, keys:Keys<T>, xlat?:(value:Loud<T>)=>string):this
    bindInner<T extends object>(model:Loud<T>, keys:Keys<T>, xlat?:(value:Loud<T>)=>string):this
    bindReplace<T extends object>(model:Loud<T>, keys:Keys<T>, factory:Factory<Loud<T>>):this
    lingerBindings():this
  }
}

const bindingsSymbol = Symbol("bindings")
const lingerSymbol = Symbol("linger")

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const n of m.removedNodes) {
      if (bindingsSymbol in n) {
        const bindings = n[bindingsSymbol] as Binding<any>[]
        for (const b of bindings) {
          b.model.deref()?.stopHearing(b.ear)
        }
        n[bindingsSymbol] = undefined
      }
    }
  }
})

observer.observe(document.body, {
  childList:true,
  subtree:true,
  attributes:false
})

class XSSError extends Error {}

const BAD_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME"])

const checkTag = (tagName:string) => {
  if (BAD_TAGS.has(tagName)) {
    throw new XSSError("XSS: no bindings allowed on " + tagName + " tag.")
  }
}

const URL_ATTRS = new Set(["href", "src", "srcdoc", "data", "xlink:href", "action", "formaction"])

interface Binding<T extends object> {
  model: WeakRef<Loud<T>>
  key: keyof T
  ear: (changed:Loud<T>)=>void
}

const addBinding = (element:HTMLElement, binding:Binding<any>) => {
  if (lingerSymbol in element) {
    return
  }
  let bindings:Binding<any>[]
  if (bindingsSymbol in element) {
    bindings = element[bindingsSymbol] as Binding<any>[]
  } else {
    bindings = [];
    (element as any)[bindingsSymbol] = bindings
  }
  bindings.push(binding)
}


class InnerText<T extends object> {

  readonly element:WeakRef<HTMLElement>
  readonly key:keyof T
  readonly xlat?:(value:T)=>string

  constructor(element:HTMLElement, key:keyof T, xlat?:(value:T)=>string) {
    checkTag(element.tagName)
    this.element = new WeakRef(element)
    this.key = key
    this.xlat = xlat
  }

  onChange = (object:Loud<T>):void => {
    const element = this.element.deref()
    if (element) {
      if (this.xlat) {
        element.innerText = this.xlat(object)
      } else {
        element.innerText = i18n(object[this.key])
      }
    }
  }

}

HTMLElement.prototype.bindInner = function<T extends object>(
  this:HTMLElement, 
  model:Loud<T>, 
  property:keyof T|(keyof T)[],
  xlat?:(v:any)=>string
):typeof this {
  if (!Array.isArray(property)) {
    property = [property]
  }
  for (const key of property) {
    const bind = new InnerText(this, key, xlat)
    model.hear(key, bind.onChange)
    const binding = {
      model: new WeakRef<Loud<T>>(model),
      key: key,
      ear: bind.onChange
    }
    addBinding(this, binding)
  }
  return this
}


class Replacer<T extends object> {

  readonly element:WeakRef<HTMLElement>
  readonly factory:Factory<T>

  constructor(element:HTMLElement, factory:Factory<T>) {
    checkTag(element.tagName)
    this.element = new WeakRef(element)
    this.factory = factory
  }

  onChange = (object:Loud<T>):void => {
    const element = this.element.deref()
    if (element) {
      const newElements = this.factory(object)
      if (newElements === NOPE) {
        return
      } else if (Array.isArray(newElements)) {
        element.replaceChildren(...newElements)
      } else {
        element.replaceChildren(newElements)
      }
    }
  }

}

HTMLElement.prototype.bindReplace = function<T extends object>(
  this:HTMLElement,
  model:Loud<T>,
  keys:Keys<T>,
  factory:Factory<T>
):typeof this {
  if (!Array.isArray(keys)) {
    keys = [keys]
  }
  for (const key of keys) {
    const replacer = new Replacer(this, factory)
    model.hear(key, replacer.onChange)
    const binding = {
      model: new WeakRef<Loud<T>>(model),
      key: key,
      ear: replacer.onChange
    }
    addBinding(this, binding)
  }
  return this
}


type ElementKey<T> = { [k in keyof T]: T[k] extends HTMLElement ? k : never }[keyof T]

class Attr<T extends object> {

  readonly element:WeakRef<HTMLElement>
  readonly attribute:string
  readonly key:keyof T
  readonly xlat?:(value:Loud<T>)=>string
  readonly checkURL:boolean

  constructor(element:HTMLElement, attribute:string, key:keyof T, xlat?:(value:Loud<T>)=>string) {
    checkTag(element.tagName)
    attribute = attribute.toLowerCase()
    if (attribute.startsWith("on")) {
      throw new Error("XSS: not allowing binding to " + attribute + " event handler.")
    }
    this.element = new WeakRef(element)
    this.attribute = attribute;
    this.key = key
    this.xlat = xlat
    this.checkURL = URL_ATTRS.has(attribute)
  }

  readonly onChange = (object:Loud<T>):void => {
    const element = this.element.deref()
    const value = this.xlat ? this.xlat(object) : String(object[this.key])
    if (this.checkURL) {
      const url = new URL(value, document.location.href)
      if ((url.protocol !== "https:") && (url.protocol !== "http:")) {
        throw new XSSError("XSS: not allowing " + url.protocol + " protocol in a " + this.attribute + " attribute.")
      }
    }
    element?.setAttribute(this.attribute, value)
  }

}

HTMLElement.prototype.bindAttr = function<T extends object>(
  this:HTMLElement, 
  attribute:string,
  model:Loud<T>, 
  keys:Keys<T>,
  xlat?:(v:Loud<T>)=>string
):typeof this {
  if (!Array.isArray(keys)) {
    keys = [keys]
  }
  for (const key of keys) {
    const bind = new Attr(this, attribute, key, xlat)
    model.hear(key, bind.onChange)
    const binding = {
      model: new WeakRef<Loud<T>>(model),
      key: key,
      ear: bind.onChange
    }
    addBinding(this, binding)
  }
  return this
}

HTMLElement.prototype.bindAttr = function(this:HTMLElement):typeof this {
  (this as any)[lingerSymbol] = true
  return this
}
