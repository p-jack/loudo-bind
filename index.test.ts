import { loudify } from "loudify"
import { i18nWith } from "./index"

describe("attributes", () => {
  test("XSS: illegal tag", () => {
    const model = loudify({n:11})
    const iframe = document.createElement("script")
    expect(() => { iframe.bindAttr("data-test", model, "n") }).toThrow("XSS: no bindings allowed on SCRIPT tag.")
  })
  test("XSS: event handler", () => {
    const model = loudify({n:11})
    const img = document.createElement("img")
    expect(() => { img.bindAttr("onerror", model, "n") }).toThrow("XSS: not allowing binding to onerror event handler.")
  })
  test("XSS: protocol in a URL handler", () => {
    const model = loudify({url:"javascript:alert(1)"})
    const img = document.createElement("img")
    expect(() => { img.bindAttr("src", model, "url") }).toThrow("XSS: not allowing javascript: protocol in a src attribute.")
  })
  test("simple case", () => {
    const model = loudify({n:111})
    const div = document.createElement("div").bindAttr("data-test", model, "n")
    expect(div.getAttribute("data-test")).toBe("111")
    model.n = 222
    expect(div.getAttribute("data-test")).toBe("222")
  })
  test("custom translate", () => {
    const model = loudify({s:"abc"})
    type M = typeof model
    const div = document.createElement("div").bindAttr(
      "data-test",
      model,
      "s",
      (m:M) => m.s.toUpperCase()
    )
    expect(div.getAttribute("data-test")).toBe("ABC")
    model.s = "efg"
    expect(div.getAttribute("data-test")).toBe("EFG")
  })
})

describe("replace", () => {
  const modelSample = loudify({n:0})
  type M = typeof modelSample
  function factory(m:M) {
    return document.createElement(m.n % 2 === 0 ? "h2" : "h1")
  }
  test("XSS: illegal tag", () => {
    const model = loudify({n:11})
    const script = document.createElement("script")
    expect(() => { script.bindReplace(model, "n", factory) }).toThrow("XSS: no bindings allowed on SCRIPT tag.")
  })
  test("simple case", () => {
    const model = loudify({n:11})
    const div = document.createElement("div").bindReplace(model, "n", factory)
    expect(div.children.item(0)?.tagName).toBe("H1")
    model.n = 2222
    expect(div.children.item(0)?.tagName).toBe("H2")
  })
  test("multiple children", () => {
    function factory(m:M) {
      const result = []
      for (let i = 0; i < m.n; i++) {
        result.push(document.createElement("div"))
      }
      return result
    }
    const model = loudify({ n: 1 })
    const div = document.createElement("div").bindReplace(model, "n", factory)
    expect(div.children.length).toBe(1)
    model.n = 2
    expect(div.children.length).toBe(2)
  })
})

describe("inner text", () => {
  test("illegal tag", () => {
    const model = loudify({n:11})
    const iframe = document.createElement("iframe")
    expect(() => { iframe.bindInner(model, "n") }).toThrow("XSS: no bindings allowed on IFRAME tag.")
  })
  test("simple case", () => {
    const model = loudify({n:11})
    const h1 = document.createElement("h1").bindInner(model, "n")
    expect(h1.innerText).toBe("11")
    model.n = 22
    expect(h1.innerText).toBe("22")
  })
  test("multiple keys, custom translate", () => {
    const model = loudify({firstName:"Anastasia", lastName:"Beaverhausen"})
    type M = typeof model
    const h1 = document.createElement("h1").bindInner(
      model,
      ["firstName", "lastName"],
      (m:M) => `Hello, ${m.firstName} ${m.lastName}!`
    )
    expect(h1.innerText).toBe("Hello, Anastasia Beaverhausen!")
    model.firstName = "Karen"
    expect(h1.innerText).toBe("Hello, Karen Beaverhausen!")
    model.lastName = "Walker"
    expect(h1.innerText).toBe("Hello, Karen Walker!")
  })
  test("i18n", () => {
    const model = loudify({ s:"abc" })
    type M = typeof model
    i18nWith(s => String(s).toUpperCase())
    const h1 = document.createElement("h1").bindInner(model, "s")
    expect(h1.innerText).toBe("ABC")
  })
})

test("bindings are cleared by default", () => {
  const model = loudify({ s:"abc" })
  const h1 = document.createElement("h1").bindInner(model, "s")
  document.body.appendChild(h1)
  h1.remove()
  for (const k of Reflect.ownKeys(model)) {
    console.log(k)
  }
})
