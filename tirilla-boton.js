// «Imprimir tirilla» en Alegra. Abre la tirilla en un recuadro encima de Alegra (iframe con
// tirilla.html) y lanza la impresión; el recuadro se cierra solo al imprimir o cancelar.
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

  // ── Recuadro con la tirilla, encima de Alegra ────────────────────────────
  // La tirilla se carga en un iframe (tirilla.html es web_accessible) y se imprime sola:
  // el cuadro de impresión de Chrome imprime solo el iframe. Al imprimir o cancelar, el
  // iframe avisa con postMessage y el recuadro se cierra.

  const ID_RECUADRO = "civa-tirilla-recuadro"
  document.getElementById(ID_RECUADRO)?.remove()

  const ID_AVISO = "civa-tirilla-aviso"
  document.getElementById(ID_AVISO)?.remove()
  let plazo = null

  /** Aviso chico mientras se arma la tirilla (el recuadro queda oculto). */
  function aviso(texto) {
    document.getElementById(ID_AVISO)?.remove()
    if (!texto) return
    const a = document.createElement("div")
    a.id = ID_AVISO
    a.textContent = texto
    Object.assign(a.style, {
      position: "fixed",
      left: "50%",
      bottom: "24px",
      transform: "translateX(-50%)",
      zIndex: "2147483002",
      padding: "10px 16px",
      borderRadius: "8px",
      background: "#1e293b",
      color: "#fff",
      font: "600 13px system-ui, -apple-system, 'Segoe UI', sans-serif",
      boxShadow: "0 6px 18px rgb(0 0 0 / .25)",
    })
    document.body.append(a)
  }

  /** Muestra el recuadro (solo cuando la tirilla tiene un aviso o tarda demasiado). */
  function mostrarRecuadro() {
    const fondo = document.getElementById(ID_RECUADRO)
    if (!fondo) return
    aviso("")
    clearTimeout(plazo)
    Object.assign(fondo.style, { left: "0", top: "0", opacity: "1", pointerEvents: "auto" })
  }

  function cerrarRecuadro() {
    aviso("")
    clearTimeout(plazo)
    document.getElementById(ID_RECUADRO)?.remove()
    window.removeEventListener("message", alMensaje)
    document.removeEventListener("keydown", alTeclado, true)
  }

  function alMensaje(e) {
    const iframe = document.querySelector(`#${ID_RECUADRO} iframe`)
    if (!iframe || e.source !== iframe.contentWindow) return
    if (e.data && e.data.civaTirilla === "cerrar") cerrarRecuadro()
    if (e.data && e.data.civaTirilla === "mostrar") mostrarRecuadro()
    if (e.data && e.data.civaTirilla === "imprimiendo") {
      aviso("")
      clearTimeout(plazo)
    }
  }

  function alTeclado(e) {
    if (e.key === "Escape") cerrarRecuadro()
  }

  function botonRecuadro(texto, primario, alClick) {
    const b = document.createElement("button")
    b.type = "button"
    b.textContent = texto
    Object.assign(b.style, {
      font: "600 13px system-ui, -apple-system, 'Segoe UI', sans-serif",
      padding: "6px 14px",
      borderRadius: "6px",
      cursor: "pointer",
      border: primario ? "0" : "1px solid #64748b",
      background: primario ? "#30aba9" : "transparent",
      color: "#fff",
    })
    b.addEventListener("click", alClick)
    return b
  }

  function abrirTirilla(id, numero) {
    if (!vivo()) {
      alert("La extensión se actualizó. Recargue esta página (F5) y vuelva a intentarlo.")
      return
    }
    cerrarRecuadro()
    const q = new URLSearchParams({ id, numero: numero || "", modal: "1" })

    const fondo = document.createElement("div")
    fondo.id = ID_RECUADRO
    Object.assign(fondo.style, {
      position: "fixed",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483001",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgb(15 23 42 / .45)",
    })
    fondo.addEventListener("click", (e) => e.target === fondo && cerrarRecuadro())

    const panel = document.createElement("div")
    Object.assign(panel.style, {
      display: "flex",
      flexDirection: "column",
      width: "360px",
      maxWidth: "calc(100vw - 32px)",
      height: "min(860px, calc(100vh - 48px))",
      borderRadius: "10px",
      overflow: "hidden",
      background: "#fff",
      boxShadow: "0 20px 50px rgb(0 0 0 / .3)",
    })

    const iframe = document.createElement("iframe")
    iframe.title = "Tirilla"
    iframe.src = chrome.runtime.getURL(`tirilla.html?${q}`)
    Object.assign(iframe.style, { flex: "1", width: "100%", border: "0", background: "#fff" })

    const barra = document.createElement("div")
    Object.assign(barra.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "10px 12px",
      background: "#1e293b",
      color: "#fff",
      font: "600 13px system-ui, -apple-system, 'Segoe UI', sans-serif",
    })
    const titulo = document.createElement("span")
    titulo.textContent = `Tirilla ${numero || ""}`.trim()
    titulo.style.flex = "1"
    barra.append(
      titulo,
      botonRecuadro("Imprimir", true, () => iframe.contentWindow.postMessage({ civaTirilla: "imprimir" }, "*")),
      botonRecuadro("Cerrar", false, cerrarRecuadro),
    )

    panel.append(barra, iframe)
    fondo.append(panel)
    // Oculto (fuera de pantalla, no display:none: así el iframe carga e imprime bien). Solo se
    // ve el cuadro de impresión; el recuadro aparece si la tirilla avisa un problema.
    Object.assign(fondo.style, { left: "-10000px", top: "0", opacity: "0", pointerEvents: "none" })
    document.body.append(fondo)
    aviso("Preparando la tirilla…")
    plazo = setTimeout(mostrarRecuadro, 15000)
    window.addEventListener("message", alMensaje)
    document.addEventListener("keydown", alTeclado, true)
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
