// «Imprimir tirilla» en Alegra. Abre tirilla.html en una pestaña nueva.
//  - Vista de una factura (app.alegra.com/invoice/view/id/<id>): botón flotante propio.
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

  /** Número del comprobante visible en pantalla (p. ej. 00006-00000006), si lo hay. */
  function numeroEnPantalla() {
    const m = (document.querySelector("main") || document.body).innerText.match(/\b\d{4,5}-\d{8}\b/)
    return m ? m[0] : ""
  }

  function abrirTirilla(id, numero) {
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
    const modelo = menu.querySelector("button")
    const b = document.createElement("button")
    b.type = "button"
    b.className = (modelo ? modelo.className : "s-button small default outline") + " " + CLASE_MENU
    b.title = "Imprimir esta factura en formato ticket de 80 mm"
    const texto = document.createElement("span")
    texto.textContent = "Imprimir tirilla"
    b.append(texto)
    b.addEventListener("click", (ev) => {
      ev.preventDefault()
      ev.stopPropagation()
      abrirTirilla(m[1], numero.trim())
      document.body.click() // cierra el menú de Alegra
    })
    menu.append(b)
  }

  new MutationObserver(() => {
    if (RUTA.test(location.pathname)) {
      // Alegra puede redibujar la barra y llevarse el botón: se vuelve a crear.
      const b = document.getElementById(ID)
      if (!b) ubicar(boton())
      else if (!b.className && botonImprimirDeAlegra()) ubicar(b)
      return
    }
    if (!/^\/invoice\/?$/.test(location.pathname)) return
    document.querySelectorAll(SEL_MENU).forEach(agregarAlMenu)
  }).observe(document.body, { childList: true, subtree: true })

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

  /** Botón «Imprimir» de la barra de la factura (Descargar PDF, Compartir…), si ya se dibujó. */
  function botonImprimirDeAlegra() {
    return [...document.querySelectorAll("main button")].find(
      (b) => /^\s*Imprimir\s*$/.test(b.textContent) && !b.closest("." + CLASE_MENU) && b.id !== ID,
    )
  }

  /** Pone el botón al lado de «Imprimir», con su mismo estilo; si no lo encuentra, queda flotante. */
  function ubicar(b) {
    const imprimir = botonImprimirDeAlegra()
    if (imprimir) {
      if (b.nextElementSibling === imprimir.nextElementSibling && b.previousElementSibling === imprimir) return
      b.removeAttribute("style")
      b.className = imprimir.className
      imprimir.after(b)
    } else if (!b.isConnected) {
      document.body.append(b)
    }
  }

  function sincronizar() {
    const enFactura = RUTA.test(location.pathname)
    const actual = document.getElementById(ID)
    if (enFactura) ubicar(actual || boton())
    if (!enFactura && actual) actual.remove()
  }

  // Alegra es una SPA: la URL cambia sin recargar.
  let ultima = ""
  setInterval(() => {
    if (location.pathname !== ultima) {
      ultima = location.pathname
      sincronizar()
    }
  }, 500)
  sincronizar()
})()
