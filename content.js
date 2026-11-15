// Alegra: columnas de la grilla de ítems — content script.
//
// En presupuestos, remitos y facturas de venta de Alegra permite:
//   - sumar columnas calculadas (Subtotal/Total c/IVA, Precio c/IVA);
//   - ocultar columnas de Alegra;
//   - cambiar el orden de las columnas.
// Solo LEE la pantalla: no toca inputs ni envía nada. La config viene del popup (config.js).
//
// Alegra tiene dos grillas distintas (ver FAMILIAS en config.js):
//   - "nueva" (presupuestos, remitos): un único `.dui-items-group-table__table` con
//     display:grid y todas las celdas planas (header + N celdas por fila);
//   - "factura" (facturas de venta): una <table> en `.items-table` con un <tr> por línea.
// Las dos se llevan al mismo modelo (encabezados + filas de N celdas) y se ubican igual:
//   - NUNCA movemos ni borramos nodos de Alegra; solo les ponemos atributos data-civa-c
//     (columna) y data-civa-r (fila), y una hoja de estilo propia ubica cada celda con
//     grid-column / grid-row explícitos (!important). La <table> de facturas se convierte en
//     grid con sus <tr> en display:contents, solo mientras haya algo personalizado.
//   - Las celdas calculadas son nodos nuestros, agregados como hermanos.
// Si la estructura no es la esperada, la grilla queda exactamente como la dibuja Alegra.
// Limitación conocida: el orden de Tab sigue el orden original de Alegra.

/* global CIVA_CONFIG */
;(() => {
  "use strict"

  const SEL_NUEVA = ".dui-items-group-table__table"
  const SEL_FACTURA = ".items-table table"
  const ATTR_TABLA = "data-civa"
  const ATTR_COL = "data-civa-c"
  const ATTR_FILA = "data-civa-r"
  const CLASE_PROPIA = "civa-propia"
  const STYLE_ID = "civa-style"

  // Si la extensión se recargó con la página abierta, quedan restos de la instancia anterior.
  document.querySelectorAll(`#${STYLE_ID}, .${CLASE_PROPIA}, .civa-cell, .civa-header`).forEach((el) => el.remove())
  document.querySelectorAll(`[${ATTR_TABLA}], [${ATTR_COL}], [${ATTR_FILA}]`).forEach((el) => {
    el.removeAttribute(ATTR_TABLA)
    el.removeAttribute(ATTR_COL)
    el.removeAttribute(ATTR_FILA)
  })

  const style = document.createElement("style")
  style.id = STYLE_ID

  let cfg = null

  /** ancla nativa → Map(idExtra → nodo nuestro) */
  const propiasDe = new WeakMap()
  /** <table> de facturas → anchos medidos en su diseño original, por etiqueta */
  const anchosDe = new WeakMap()

  const esPropia = (el) => el.classList.contains(CLASE_PROPIA)

  // ── Números ──────────────────────────────────────────────────────────────

  /** "$3,229.76" | "$ 3.229,76" | "3229.76" → { valor, decimal, prefijo } o null */
  function parseMonto(texto) {
    const t = (texto || "").trim()
    const iDigito = t.search(/\d/)
    if (iDigito < 0) return null
    const prefijo = t.slice(0, iDigito).replace(/-/g, "").trim()
    const negativo = t.slice(0, iDigito).includes("-")
    const num = t.slice(iDigito).replace(/[^\d.,]/g, "")
    const iSep = Math.max(num.lastIndexOf("."), num.lastIndexOf(","))
    let decimal = null
    let valor
    if (iSep >= 0 && /^\d{1,2}$/.test(num.slice(iSep + 1))) {
      decimal = num[iSep]
      valor = Number(num.slice(0, iSep).replace(/[.,]/g, "") + "." + num.slice(iSep + 1))
    } else {
      valor = Number(num.replace(/[.,]/g, "")) // el separador que haya es de miles
      if (iSep >= 0) decimal = num[iSep] === "," ? "." : ","
    }
    if (!Number.isFinite(valor)) return null
    return { valor: negativo ? -valor : valor, decimal, prefijo }
  }

  function formatMonto(valor, decimal, prefijo) {
    const locale = decimal === "," ? "es-AR" : "en-US"
    const txt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Math.abs(valor),
    )
    return (valor < 0 ? "-" : "") + (prefijo || "$") + txt
  }

  /**
   * "IVA - (21.00%)" → 21 ; "Ninguno" / "" / el placeholder (= título de la columna) → 0 ;
   * texto sin % (p. ej. "2 impuestos") → null
   */
  function tasaImpuesto(texto, placeholder) {
    const t = (texto || "").trim()
    if (!t || /^ningun/i.test(t) || t === placeholder) return 0
    const tasas = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => Number(m[1].replace(",", ".")))
    if (!tasas.length) return null
    return tasas.reduce((a, b) => a + b, 0)
  }

  const textoCelda = (celda) => {
    if (!celda) return ""
    const input = celda.querySelector("input")
    return (input && input.value) || celda.textContent || ""
  }

  const redondear = (n) => Math.round(n * 100) / 100

  /** Valor de una columna calculada para una fila: { texto, ayuda } */
  function calcular(id, fila, idx) {
    if (idx.importe < 0) return { texto: "—", ayuda: "No se encontró la columna del importe" }
    const importe = parseMonto(textoCelda(fila[idx.importe]))
    const tasa = idx.impuesto >= 0 ? tasaImpuesto(textoCelda(fila[idx.impuesto]), idx.etiquetaImpuesto) : null
    if (tasa == null) return { texto: "—", ayuda: "No se pudo leer la tasa del impuesto de la línea" }
    const decimal = (importe && importe.decimal) || "."
    const prefijo = (importe && importe.prefijo) || "$"
    if (id === "x:subtotalIva") {
      if (!importe) return { texto: "—", ayuda: "No se pudo leer el importe de la línea" }
      return {
        texto: formatMonto(redondear(importe.valor * (1 + tasa / 100)), decimal, prefijo),
        ayuda: `Importe + ${tasa}%`,
      }
    }
    if (id === "x:precioIva") {
      const precio = idx.precio >= 0 ? parseMonto(textoCelda(fila[idx.precio])) : null
      if (!precio) return { texto: formatMonto(0, decimal, prefijo), ayuda: "Línea sin precio" }
      return {
        texto: formatMonto(redondear(precio.valor * (1 + tasa / 100)), decimal, prefijo),
        ayuda: `Precio + ${tasa}%`,
      }
    }
    return { texto: "", ayuda: "" }
  }

  // ── Columnas ─────────────────────────────────────────────────────────────

  /** separa "20px 44px minmax(0, 1fr) 7%" respetando paréntesis */
  function tokens(template) {
    const out = []
    let prof = 0
    let actual = ""
    for (const ch of (template || "").trim()) {
      if (ch === "(") prof++
      if (ch === ")") prof--
      if (/\s/.test(ch) && prof === 0) {
        if (actual) out.push(actual)
        actual = ""
      } else actual += ch
    }
    if (actual) out.push(actual)
    return out
  }

  const pct = (t) => (/^[\d.]+%$/.test(t) ? Number(t.slice(0, -1)) : null)

  // ── Lectura de cada grilla al modelo común ───────────────────────────────
  //
  // Modelo: { headers: [celdas], filas: [[celdas]], sueltos: [elementos], etiquetas: [textos],
  //           tracks(final) → grid-template-columns, css(T) → reglas extra }

  function leerNueva(tabla) {
    const esHeader = (el) =>
      el.classList.contains("dui-items-table-header-cell") || el.classList.contains("dui-items-group-table__drag-header")
    const esInicioFila = (el) => el.classList.contains("dui-items-group-table__drag-cell")

    const nativos = [...tabla.children].filter((el) => !esPropia(el))
    const headers = []
    for (const el of nativos) {
      if (!esHeader(el)) break
      headers.push(el)
    }
    const n = headers.length
    const cols = tokens(tabla.style.gridTemplateColumns)
    if (n === 0 || cols.length !== n) return null

    // filas: grupos de n celdas que empiezan con la celda de arrastre; el resto (botón
    // «Agregar línea», etc.) va a filas propias de ancho completo
    const filas = []
    const sueltos = []
    for (let i = n; i < nativos.length; ) {
      if (esInicioFila(nativos[i]) && i + n <= nativos.length) {
        const fila = nativos.slice(i, i + n)
        if (fila.slice(1).some(esInicioFila)) return null // fila incompleta: estructura desconocida
        filas.push(fila)
        i += n
      } else sueltos.push(nativos[i++])
    }

    return {
      headers,
      filas,
      sueltos,
      etiquetas: headers.map((h) => h.textContent.trim()),
      // las columnas en % se reescalan para ocupar el mismo % total que antes
      tracks(final) {
        const pctOriginal = cols.reduce((a, t) => a + (pct(t) ?? 0), 0)
        const ts = final.map((f) => (f.x ? CIVA_CONFIG.EXTRAS[f.x].ancho + "%" : cols[f.nat]))
        const pctNuevo = ts.reduce((a, t) => a + (pct(t) ?? 0), 0)
        const factor = pctNuevo > 0 && pctOriginal > 0 ? pctOriginal / pctNuevo : 1
        return ts.map((t) => (pct(t) == null ? t : (pct(t) * factor).toFixed(2) + "%")).join(" ")
      },
      css: () => [],
    }
  }

  function leerFactura(tabla) {
    const trs = [...tabla.rows]
    if (!trs.length || !trs[0].classList.contains("header")) return null
    const celdas = (tr) => [...tr.cells].filter((c) => !esPropia(c))
    const headers = celdas(trs[0])
    const n = headers.length
    const etiquetas = headers.map((h) => h.textContent.trim())
    const filas = trs.slice(1).map(celdas)
    if (!n || filas.some((f) => f.length !== n)) return null

    // anchos para el modo grilla: se miden mientras la tabla se dibuja como tabla
    let anchos = anchosDe.get(tabla)
    if (getComputedStyle(tabla).display !== "grid" || !anchos) {
      // las columnas ocultas por nosotros miden 0: conservan el ancho medido antes
      const medidos = headers.map((h, i) => h.getBoundingClientRect().width || (anchos && anchos.get(i)) || 0)
      if (!medidos.some((w) => w > 0)) return null // tabla oculta: no hay con qué medir
      const promedio = medidos.reduce((a, b) => a + b, 0) / medidos.filter((w) => w > 0).length
      anchos = new Map(medidos.map((w, i) => [i, w > 0 ? w : promedio]))
      anchosDe.set(tabla, anchos)
    }
    const total = [...anchos.values()].reduce((a, b) => a + b, 0)

    return {
      headers,
      filas,
      sueltos: [],
      etiquetas,
      // Sin reordenar, la <table> queda como tabla (el navegador reparte los anchos y los
      // inputs de Alegra entran); solo al reordenar pasa a grilla con estos anchos.
      soloGrillaAlReordenar: true,
      tracks(final) {
        return final
          .map((f) => {
            const w = f.x ? (total * CIVA_CONFIG.EXTRAS[f.x].ancho) / 100 : anchos.get(f.nat)
            return `minmax(0,${w.toFixed(1)}fr)`
          })
          .join(" ")
      },
      css: (T) => [
        `${T}{display:grid !important}`,
        `${T}>thead,${T}>tbody,${T}>tfoot,${T} tr{display:contents !important}`,
        `${T} [${ATTR_FILA}]{min-width:0;overflow:hidden}`,
        `${T} [${ATTR_FILA}] :is(input,select,textarea){max-width:100%;box-sizing:border-box}`,
      ],
    }
  }

  // ── Nodos propios ────────────────────────────────────────────────────────

  /** copia class y los data-v-* (estilos scoped de Vue) del ancla, sin data-test ni keys de drag */
  function clonarAtributos(desde, hacia) {
    for (const a of desde.attributes) {
      if (a.name === "class" || a.name.startsWith("data-v-")) hacia.setAttribute(a.name, a.value)
    }
  }

  function propia(ancla, id, familia, esCabecera, modelo) {
    let mapa = propiasDe.get(ancla)
    if (!mapa) propiasDe.set(ancla, (mapa = new Map()))
    let el = mapa.get(id)
    if (!el) {
      // En la tabla de facturas la celda es td/th como su ancla y copia el estilo de la celda
      // «Total» (su clase): queda después de la nativa, así que una búsqueda por clase en la fila
      // sigue encontrando primero la de Alegra.
      const esTabla = /^T[DH]$/.test(ancla.tagName)
      el = document.createElement(esTabla ? ancla.tagName.toLowerCase() : "div")
      clonarAtributos(modelo || ancla, el)
      el.classList.add(CLASE_PROPIA)
      if (esCabecera) {
        if (!esTabla) {
          el.classList.add("justify-end")
          el.style.textAlign = "right"
        }
        el.textContent = CIVA_CONFIG.titulo(familia, id)
        el.title = CIVA_CONFIG.EXTRAS[id].ayuda + " (agregado por la extensión)"
      } else if (esTabla) {
        el.style.fontWeight = "600"
      } else {
        const p = document.createElement("p")
        const pModelo = modelo && modelo.querySelector("p")
        p.className = (pModelo && pModelo.className) || "text-right text-sm leading-8 mt-1"
        p.style.fontWeight = "600"
        el.appendChild(p)
      }
      mapa.set(id, el)
    }
    return el
  }

  function setTexto(el, texto, ayuda) {
    const p = el.firstElementChild || el
    if (p.textContent !== texto) p.textContent = texto
    if (el.title !== ayuda) el.title = ayuda
  }

  function setAttr(el, nombre, valor) {
    if (el.getAttribute(nombre) !== valor) el.setAttribute(nombre, valor)
  }

  // ── Sincronización ───────────────────────────────────────────────────────

  function limpiarTabla(tabla) {
    tabla.querySelectorAll(`.${CLASE_PROPIA}`).forEach((el) => el.remove())
    tabla.querySelectorAll(`[${ATTR_COL}], [${ATTR_FILA}]`).forEach((el) => {
      el.removeAttribute(ATTR_COL)
      el.removeAttribute(ATTR_FILA)
    })
    tabla.removeAttribute(ATTR_TABLA)
  }

  function limpiar() {
    document.querySelectorAll(`[${ATTR_TABLA}]`).forEach(limpiarTabla)
    document.querySelectorAll(`.${CLASE_PROPIA}`).forEach((el) => el.remove())
    if (style.isConnected) style.remove()
  }

  /** Arma una grilla según la config. Devuelve el CSS o null (grilla sin tocar). */
  function sincronizarTabla(tabla, nTabla, familia, est) {
    const { headers, filas, sueltos, etiquetas } = est
    const n = headers.length
    const base = CIVA_CONFIG.FAMILIAS[familia].base
    const idx = {
      importe: etiquetas.indexOf(base.importe),
      impuesto: etiquetas.indexOf(base.impuesto),
      precio: etiquetas.indexOf(base.precio),
      etiquetaImpuesto: base.impuesto,
    }

    // columnas fijas de Alegra: sin título a la izquierda (arrastre, checkbox) y a la derecha (menú)
    let izq = 0
    while (izq < n && !etiquetas[izq]) izq++
    let der = n
    while (der > izq && !etiquetas[der - 1]) der--

    // orden final: fijas izq + config (visibles y presentes) + nativas desconocidas + fijas der
    const final = []
    for (let i = 0; i < izq; i++) final.push({ nat: i })
    const usadas = new Set()
    for (const c of cfg.columnas[familia]) {
      if (c.id.startsWith("x:")) {
        if (c.visible && CIVA_CONFIG.EXTRAS[c.id]) final.push({ x: c.id })
        continue
      }
      const i = etiquetas.indexOf(c.id.slice(2))
      if (i < izq || i >= der) continue
      usadas.add(i)
      if (c.visible) final.push({ nat: i })
    }
    for (let i = izq; i < der; i++) if (!usadas.has(i)) final.push({ nat: i })
    for (let i = der; i < n; i++) final.push({ nat: i })

    if (final.length === n && final.every((f, k) => f.nat === k)) return null // sin cambios

    // ¿cambió el orden relativo de las nativas visibles? (agregar u ocultar columnas no cuenta)
    const nats = final.filter((f) => f.nat !== undefined).map((f) => f.nat)
    const reordenado = nats.some((v, k) => k > 0 && v < nats[k - 1])
    const modoGrilla = !est.soloGrillaAlReordenar || reordenado

    const posNat = new Map(final.map((f, k) => [f.nat, k + 1]).filter(([i]) => i !== undefined))
    const deseadas = new Set()

    const ubicarGrupo = (grupo, fila, esCabecera) => {
      grupo.forEach((el, i) => {
        setAttr(el, ATTR_COL, String(posNat.get(i) || 0))
        setAttr(el, ATTR_FILA, String(fila))
      })
      const modelo = idx.importe >= 0 ? grupo[idx.importe] : null
      // Cada calculada va en el DOM justo después de lo que la precede en el orden final: en modo
      // tabla esa es su posición real; en modo grilla da igual (manda grid-column).
      let previo = null
      final.forEach((f, k) => {
        if (f.nat !== undefined) {
          previo = grupo[f.nat]
          return
        }
        const id = f.x
        const pos = k + 1
        const el = propia(grupo[n - 1], id, familia, esCabecera, modelo)
        if (previo ? previo.nextElementSibling !== el : grupo[0].previousElementSibling !== el) {
          if (previo) previo.after(el)
          else grupo[0].before(el)
        }
        previo = el
        setAttr(el, ATTR_COL, String(pos))
        setAttr(el, ATTR_FILA, String(fila))
        deseadas.add(el)
        if (!esCabecera) {
          const { texto, ayuda } = calcular(id, grupo, idx)
          setTexto(el, texto, ayuda)
        }
      })
    }

    ubicarGrupo(headers, 1, true)
    filas.forEach((fila, k) => ubicarGrupo(fila, k + 2, false))
    sueltos.forEach((el, k) => {
      setAttr(el, ATTR_COL, "full")
      setAttr(el, ATTR_FILA, String(filas.length + 2 + k))
    })
    tabla.querySelectorAll(`.${CLASE_PROPIA}`).forEach((el) => {
      if (!deseadas.has(el)) el.remove()
    })

    setAttr(tabla, ATTR_TABLA, String(nTabla))
    const T = `[${ATTR_TABLA}="${nTabla}"]`
    const ocultas = `${T} [${ATTR_COL}="0"]{display:none !important}`
    if (!modoGrilla) return ocultas

    const reglas = [
      ...est.css(T),
      `${T}{grid-template-columns:${est.tracks(final)} !important;grid-auto-flow:row !important}`,
      ocultas,
      `${T} [${ATTR_COL}="full"]{grid-column:1 / -1 !important}`,
    ]
    for (let k = 1; k <= final.length; k++) reglas.push(`${T} [${ATTR_COL}="${k}"]{grid-column:${k} !important}`)
    const totalFilas = filas.length + 1 + sueltos.length
    for (let r = 1; r <= totalFilas; r++) reglas.push(`${T} [${ATTR_FILA}="${r}"]{grid-row:${r} !important}`)
    return reglas.join("\n")
  }

  function docActual() {
    for (const [clave, doc] of Object.entries(CIVA_CONFIG.DOCS)) {
      if (new RegExp(doc.ruta).test(location.pathname)) return clave
    }
    return null
  }

  let corriendo = false
  function sincronizar() {
    if (corriendo || !cfg) return
    corriendo = true
    try {
      const doc = docActual()
      if (!doc || !cfg.docs[doc]) return limpiar()
      const familia = CIVA_CONFIG.DOCS[doc].familia
      const selector = familia === "factura" ? SEL_FACTURA : SEL_NUEVA
      const leer = familia === "factura" ? leerFactura : leerNueva
      const reglas = []
      document.querySelectorAll(selector).forEach((tabla, k) => {
        const est = leer(tabla)
        const css = est && sincronizarTabla(tabla, k, familia, est)
        if (css) reglas.push(css)
        else limpiarTabla(tabla) // config sin cambios o estructura inesperada: grilla original
      })
      const css = reglas.join("\n")
      if (style.textContent !== css) style.textContent = css
      if (!style.isConnected) document.head.appendChild(style)
    } catch (err) {
      console.warn("[Alegra columnas]", err)
      limpiar()
    } finally {
      corriendo = false
    }
  }

  async function cargarConfig() {
    try {
      cfg = await CIVA_CONFIG.leer()
    } catch (err) {
      console.warn("[Alegra columnas] no se pudo leer la configuración", err)
      cfg = CIVA_CONFIG.normalizar(null)
    }
    sincronizar()
  }

  chrome.storage.onChanged.addListener((cambios, area) => {
    if (area === "sync" && cambios.config) cargarConfig()
  })
  new MutationObserver(sincronizar).observe(document.body, { childList: true, subtree: true, characterData: true })
  // Inputs y el select de impuesto cambian .value (propiedad, no DOM): no disparan el observer.
  for (const ev of ["input", "change", "click", "keyup"]) {
    document.addEventListener(ev, () => setTimeout(sincronizar, 60), true)
  }
  setInterval(sincronizar, 1000)
  cargarConfig()
})()
