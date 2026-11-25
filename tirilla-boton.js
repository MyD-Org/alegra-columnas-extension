// «Imprimir tirilla» en Alegra. Abre tirilla.html en una pestaña nueva.
//  - Vista de una factura (app.alegra.com/invoice/view/id/<id>): copia del botón «Imprimir»
//    de la barra (.header-actions), a su derecha; flotante mientras la barra no se dibuja.
//  - Lista de facturas: opción extra en el menú de los 3 puntos de cada fila. Alegra arma
//    ese menú recién al abrirlo (td.sm-table-container-td .more-actions > .actions), así
//    que se agrega cuando aparece. El id sale del enlace de la fila (/invoice/view/id/<id>).
// No toca nada de Alegra: solo agrega nodos propios.

;(() => {
  "use strict"

  const ID = "civa-tirilla-boton"
  const CLASE_MENU = "civa-tirilla-menu"
  document.getElementById(ID)?.remove()
  document.querySelectorAll("." + CLASE_MENU).forEach((el) => el.remove())

  const RUTA = /^\/invoice\/view\/id\/(\d+)/

  /**
   * Al recargar la extensión con Alegra abierto, este script viejo sigue corriendo pero ya
   * no puede usar chrome.* («Extension context invalidated»). En ese caso se apaga solo.
   */
  const vivo = () => {
    try {
      return !!(chrome.runtime && chrome.runtime.id)
    } catch {
      return false
    }
  }
  let observador = null
  let intervalo = null
  function apagar() {
    observador && observador.disconnect()
    clearInterval(intervalo)
  }

  /** Número del comprobante visible en pantalla (p. ej. 00006-00000006), si lo hay. */
  function numeroEnPantalla() {
    const m = (document.querySelector("main") || document.body).innerText.match(/\b\d{4,5}-\d{8}\b/)
    return m ? m[0] : ""
  }

  function abrirTirilla(id, numero) {
    if (!vivo()) {
      alert("La extensión se actualizó. Recargue esta página (F5) y vuelva a intentarlo.")
      return
    }
    const q = new URLSearchParams({ id, numero: numero || "" })
    window.open(chrome.runtime.getURL(`tirilla.html?${q}`), "_blank")
  }

  // ── Menú de los 3 puntos en la lista ─────────────────────────────────────

  const SEL_MENU = "td.sm-table-container-td .more-actions > .actions"

  function agregarAlMenu(menu) {
    if (menu.querySelector("." + CLASE_MENU)) return
    const fila = menu.closest("tr")
    const enlace = fila && fila.querySelector('a[href*="/invoice/view/id/"]')
    const m = enlace && enlace.getAttribute("href").match(/\/invoice\/view\/id\/(\d+)/)
    if (!m) return
    const numero = (fila.querySelector(".cell-number .number") || {}).textContent || ""
    const modelo = [...menu.querySelectorAll("button")].find(esImprimir) || menu.querySelector("button")
    let b
    if (modelo) b = clonarBoton(modelo, "Imprimir tirilla")
    else {
      b = document.createElement("button")
      b.type = "button"
      b.className = "s-button small default outline"
      b.textContent = "Imprimir tirilla"
    }
    b.classList.add(CLASE_MENU)
    b.addEventListener("click", (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      abrirTirilla(m[1], numero.trim())
      document.body.click() // cierra el menú de Alegra
    })
    menu.append(b)
  }

  observador = new MutationObserver(() => {
    if (!vivo()) return apagar()
    if (RUTA.test(location.pathname)) {
      // Alegra puede redibujar la barra y llevarse el botón: se vuelve a crear.
      const b = document.getElementById(ID)
      if (!b) ubicar(boton())
      else if (!b.closest(".header-actions") && barra()) ubicar(b)
      return
    }
    if (!/^\/invoice\/?$/.test(location.pathname)) return
    document.querySelectorAll(SEL_MENU).forEach(agregarAlMenu)
  })
  observador.observe(document.body, { childList: true, subtree: true })

  // ── Botón flotante en la vista de la factura ─────────────────────────────

  function boton() {
    const b = document.createElement("button")
    b.id = ID
    b.type = "button"
    b.textContent = "Imprimir tirilla"
    b.title = "Imprimir esta factura en formato ticket de 80 mm"
    Object.assign(b.style, {
      position: "fixed",
      left: "20px",
      bottom: "20px",
      zIndex: "2147483000",
      padding: "10px 16px",
      font: "600 14px system-ui, -apple-system, 'Segoe UI', sans-serif",
      color: "#fff",
      background: "#30aba9",
      border: "0",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgb(0 0 0 / .18)",
      cursor: "pointer",
    })
    b.addEventListener("click", () => {
      const m = location.pathname.match(RUTA)
      if (m) abrirTirilla(m[1], numeroEnPantalla())
    })
    return b
  }

  const CLASE_CAJA = "civa-tirilla-caja"
  document.querySelectorAll("." + CLASE_CAJA).forEach((el) => el.remove())

  /** Barra de acciones de la factura (Imprimir, Descargar PDF, Compartir, Más acciones). */
  const barra = () => document.querySelector(".header-actions")

  /**
   * Copia de un botón de Alegra con otro texto. Se clona (sin sus eventos) porque los estilos
   * de Alegra dependen de atributos data-v-* de Vue, no solo de las clases.
   */
  function clonarBoton(modelo, texto) {
    const b = modelo.cloneNode(true)
    b.removeAttribute("id")
    b.type = "button"
    const hoja = [...b.querySelectorAll("*")].reverse().find((e) => !e.children.length && e.textContent.trim())
    if (hoja) hoja.textContent = texto
    else b.textContent = texto
    b.title = "Imprimir esta factura en formato ticket de 80 mm"
    return b
  }

  const esImprimir = (b) => b.textContent.trim() === "Imprimir"

  /**
   * Pone «Imprimir tirilla» en la barra, después de «Imprimir», como copia de ese botón.
   * Si la barra todavía no se dibujó, queda el botón flotante abajo a la izquierda.
   */
  function ubicar(flotante) {
    if (flotante.closest(".header-actions")) return
    const bar = barra()
    const imprimir = bar && [...bar.querySelectorAll("button")].find(esImprimir)
    if (!imprimir) {
      if (!flotante.isConnected) document.body.append(flotante)
      return
    }
    flotante.remove()
    const modeloCaja = bar.querySelector("#btn-h-1") || imprimir.parentElement
    const caja = modeloCaja.cloneNode(false)
    caja.removeAttribute("id")
    caja.classList.add(CLASE_CAJA)
    const b = clonarBoton(imprimir, "Imprimir tirilla")
    b.id = ID
    b.addEventListener("click", (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      const m = location.pathname.match(RUTA)
      if (m) abrirTirilla(m[1], numeroEnPantalla())
    })
    caja.append(b)
    ;(bar.firstElementChild || bar).after(caja)
  }

  function sincronizar() {
    const enFactura = RUTA.test(location.pathname)
    const actual = document.getElementById(ID)
    if (enFactura) ubicar(actual || boton())
    if (!enFactura && actual) (actual.closest("." + CLASE_CAJA) || actual).remove()
  }

  // Alegra es una SPA: la URL cambia sin recargar.
  let ultima = ""
  intervalo = setInterval(() => {
    if (!vivo()) return apagar()
    if (location.pathname !== ultima) {
      ultima = location.pathname
      sincronizar()
    }
  }, 500)
  sincronizar()
})()
