// Botón «Imprimir tirilla» en la vista de una factura de venta de Alegra
// (app.alegra.com/invoice/view/id/<id>). Abre tirilla.html en una pestaña nueva.
// No toca nada de Alegra: solo agrega un botón flotante propio.

;(() => {
  "use strict"

  const ID = "civa-tirilla-boton"
  document.getElementById(ID)?.remove()

  const RUTA = /^\/invoice\/view\/id\/(\d+)/

  /** Número del comprobante visible en pantalla (p. ej. 00006-00000006), si lo hay. */
  function numeroEnPantalla() {
    const m = (document.querySelector("main") || document.body).innerText.match(/\b\d{4,5}-\d{8}\b/)
    return m ? m[0] : ""
  }

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
      if (!m) return
      const q = new URLSearchParams({ id: m[1], numero: numeroEnPantalla() })
      window.open(chrome.runtime.getURL(`tirilla.html?${q}`), "_blank")
    })
    return b
  }

  function sincronizar() {
    const enFactura = RUTA.test(location.pathname)
    const actual = document.getElementById(ID)
    if (enFactura && !actual) document.body.append(boton())
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
