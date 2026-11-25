// Tirilla de 80 mm de una factura de Alegra.
// Se abre desde el botón «Imprimir tirilla» de la factura (tirilla-boton.js) con
// ?id=<id de la factura>&numero=<número que se ve en pantalla, opcional>.
// Lee la factura de la API de Alegra (solo GET) y arma la representación impresa, con el QR
// y el CAE de ARCA cuando es electrónica.

/* global TIRILLA_CUENTAS, qrcode */
;(async () => {
  "use strict"

  const params = new URLSearchParams(location.search)
  const id = (params.get("id") || "").replace(/\D/g, "")
  const numeroPantalla = (params.get("numero") || "").trim()
  const auto = params.get("auto") !== "0"

  const $mensaje = document.getElementById("mensaje")
  const $ticket = document.getElementById("ticket")
  const $barra = document.getElementById("barra")

  document.getElementById("imprimir").addEventListener("click", () => window.print())
  document.getElementById("cerrar").addEventListener("click", () => window.close())

  const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 })
  const num = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 })
  const $ = (n) => pesos.format(Number(n) || 0)
  const fecha = (s) => (/^\d{4}-\d{2}-\d{2}/.test(s || "") ? s.slice(0, 10).split("-").reverse().join("/") : s || "")
  const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

  function mensaje(texto, ...botones) {
    $mensaje.hidden = false
    $mensaje.replaceChildren(texto, ...botones)
  }

  function el(tag, clase, ...hijos) {
    const e = document.createElement(tag)
    if (clase) e.className = clase
    for (const h of hijos) if (h !== null && h !== undefined && h !== "") e.append(h)
    return e
  }
  const fila = (izq, der, clase = "") => el("div", "fila " + clase, el("span", "", izq), el("span", "", der))
  const sep = () => el("div", "sep")

  const LETRAS = {
    INVOICE_A: { letra: "A", codigo: "001" },
    INVOICE_B: { letra: "B", codigo: "006" },
    INVOICE_C: { letra: "C", codigo: "011" },
    INVOICE_M: { letra: "M", codigo: "051" },
    INVOICE_X: { letra: "X", codigo: "" },
  }

  // ── Buscar la factura en las cuentas configuradas ────────────────────────

  if (!id) return mensaje("Falta el número interno de la factura.")
  const cuentas = (await TIRILLA_CUENTAS.leer()).filter((c) => c.email && c.token)
  const abrirOpciones = el("button", "", "Configurar cuentas")
  abrirOpciones.addEventListener("click", () => chrome.runtime.openOptionsPage())
  if (!cuentas.length) return mensaje("No hay cuentas de Alegra configuradas para la tirilla. ", abrirOpciones)

  const encontradas = []
  const errores = []
  await Promise.all(
    cuentas.map(async (cuenta) => {
      try {
        const { status, datos } = await TIRILLA_CUENTAS.get(cuenta, `/invoices/${id}`)
        if (status === 200 && datos && datos.id) encontradas.push({ cuenta, factura: datos })
        else if (status === 401 || status === 403) errores.push(`${cuenta.alias || cuenta.email}: credenciales inválidas`)
      } catch {
        errores.push(`${cuenta.alias || cuenta.email}: sin conexión con Alegra`)
      }
    }),
  )

  // El mismo id puede existir en las dos empresas: se desempata con el número que se ve en pantalla.
  let candidatas = encontradas
  if (numeroPantalla && candidatas.length > 1) {
    const coinciden = candidatas.filter((x) => x.factura.numberTemplate && x.factura.numberTemplate.fullNumber === numeroPantalla)
    if (coinciden.length) candidatas = coinciden
  }

  if (!candidatas.length) {
    return mensaje(
      `No se encontró la factura en las cuentas configuradas.${errores.length ? " " + errores.join(". ") + "." : ""} `,
      abrirOpciones,
    )
  }
  if (candidatas.length > 1) {
    return mensaje(
      "La factura existe en más de una cuenta. Seleccione cuál imprimir: ",
      ...candidatas.map((x) => {
        const b = el("button", "", `${x.cuenta.alias || x.cuenta.email} (${(x.factura.numberTemplate || {}).fullNumber || x.factura.id})`)
        b.addEventListener("click", () => dibujar(x.cuenta, x.factura))
        return b
      }),
    )
  }
  dibujar(candidatas[0].cuenta, candidatas[0].factura)

  // ── Dibujo ───────────────────────────────────────────────────────────────

  function dibujar(cuenta, f) {
    const nt = f.numberTemplate || {}
    const tipo = LETRAS[nt.subDocumentType] || { letra: "", codigo: "" }
    const esA = tipo.letra === "A" || tipo.letra === "M"
    const esX = tipo.letra === "X"
    const stamp = f.stamp || null
    const autorizada = !!(stamp && stamp.cae)
    const nodos = []

    // Emisor
    if (cuenta.logo) {
      const img = el("img", "logo")
      img.src = cuenta.logo
      img.alt = ""
      nodos.push(img)
    }
    if (cuenta.nombreFantasia) nodos.push(el("div", "c b grande", cuenta.nombreFantasia))
    nodos.push(el("div", "c b", cuenta.razonSocial || cuenta.alias))
    if (cuenta.cuit) nodos.push(el("div", "c", `CUIT: ${cuenta.cuit}`))
    if (cuenta.domicilio) nodos.push(el("div", "c", cuenta.domicilio))
    if (cuenta.condicionIva) nodos.push(el("div", "c", cuenta.condicionIva))
    if (cuenta.iibb) nodos.push(el("div", "c", `Ing. Brutos: ${cuenta.iibb}`))
    if (cuenta.inicioActividades) nodos.push(el("div", "c", `Inicio de actividades: ${cuenta.inicioActividades}`))
    nodos.push(sep())

    // Comprobante
    nodos.push(
      el(
        "div",
        "c",
        el("div", "b grande", esX ? "PRESUPUESTO / NO VÁLIDO COMO FACTURA" : "FACTURA"),
        tipo.letra && !esX ? el("div", "", el("span", "letra", tipo.letra)) : null,
        tipo.codigo ? el("div", "chico", `Cód. ${tipo.codigo}`) : null,
      ),
    )
    nodos.push(fila("N.º", nt.fullNumber || `${nt.prefix || ""}-${nt.number || ""}`, "b"))
    nodos.push(fila("Fecha", fecha(f.date)))
    if (f.dueDate && f.dueDate !== f.date) nodos.push(fila("Vencimiento", fecha(f.dueDate)))
    if (f.term) nodos.push(fila("Condición de venta", f.term))
    nodos.push(sep())

    // Cliente
    const c = f.client || {}
    nodos.push(el("div", "b", c.name || "Consumidor final"))
    if (c.identification) nodos.push(el("div", "", `${c.identificationType || "Doc."}: ${c.identification}`))
    if (c.ivaCondition && c.ivaCondition !== c.name) nodos.push(el("div", "", c.ivaCondition))
    const a = c.address || {}
    const dir = [a.address, a.city, a.province].filter((x) => x && x !== "-").join(", ")
    if (dir) nodos.push(el("div", "", dir))
    nodos.push(sep())

    // Ítems: en la A se muestran netos; en la B/C/X, con IVA incluido.
    const ivaPorTasa = new Map()
    for (const it of f.items || []) {
      const cant = Number(it.quantity) || 0
      const desc = Number(it.discount) || 0
      const neto = (Number(it.price) || 0) * cant * (1 - desc / 100)
      const impuestos = (it.tax || []).reduce((s, t) => s + (Number(t.amount) || 0), 0)
      for (const t of it.tax || []) {
        const tasa = Number(t.percentage) || 0
        ivaPorTasa.set(tasa, (ivaPorTasa.get(tasa) || 0) + (Number(t.amount) || 0))
      }
      const tasaTotal = (it.tax || []).reduce((s, t) => s + (Number(t.percentage) || 0), 0)
      const unit = (Number(it.price) || 0) * (esA ? 1 : 1 + tasaTotal / 100)
      const importe = esA ? neto : neto + impuestos
      const tasas = (it.tax || []).map((t) => `${num.format(Number(t.percentage) || 0)}%`).join(" + ")
      nodos.push(
        el(
          "div",
          "item",
          el("div", "desc", it.name || it.description || ""),
          fila(
            `${num.format(cant)} x ${$(unit)}${desc ? ` (-${num.format(desc)}%)` : ""}${esA && tasas ? ` IVA ${tasas}` : ""}`,
            $(importe),
          ),
        ),
      )
    }
    nodos.push(sep())

    // Totales
    if (esA) {
      nodos.push(fila("Subtotal neto", $(redondear(f.subtotal) - redondear(f.discount))))
      for (const [tasa, monto] of [...ivaPorTasa].sort((x, y) => y[0] - x[0])) nodos.push(fila(`IVA ${num.format(tasa)}%`, $(monto)))
    } else if (f.discount) {
      nodos.push(fila("Descuento", `-${$(f.discount)}`))
    }
    nodos.push(fila("TOTAL", $(f.total), "b grande"))
    if (tipo.letra === "B") {
      // Ley 27.743: Régimen de Transparencia Fiscal al Consumidor.
      nodos.push(sep())
      nodos.push(el("div", "chico b", "Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)"))
      nodos.push(fila("IVA contenido", $(f.tax), "chico"))
      nodos.push(fila("Otros impuestos nacionales indirectos", $(0), "chico"))
    }

    // Pagos
    const pagos = f.payments || []
    if (pagos.length) {
      nodos.push(sep())
      for (const p of pagos) nodos.push(fila(`Pago ${fecha(p.date)}`, $(p.amount), "chico"))
      if (Number(f.balance) > 0) nodos.push(fila("Saldo pendiente", $(f.balance), "chico"))
    }

    if (f.seller && f.seller.name) nodos.push(el("div", "chico", `Vendedor: ${f.seller.name}`))
    if (f.observations) nodos.push(el("div", "chico", f.observations))

    // Autorización de ARCA
    if (autorizada) {
      nodos.push(sep())
      if (stamp.fiscalQrUrl) {
        const qr = qrcode(0, "M")
        qr.addData(stamp.fiscalQrUrl)
        qr.make()
        const caja = el("div", "qr")
        caja.innerHTML = qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true })
        nodos.push(caja)
      }
      nodos.push(fila("CAE", stamp.cae, "b"))
      nodos.push(fila("Vto. CAE", fecha(stamp.caeDueDate)))
      nodos.push(el("div", "c chico", "Comprobante autorizado por ARCA"))
    } else if (!esX && nt.isElectronic) {
      nodos.push(sep())
      nodos.push(el("div", "c b", "COMPROBANTE SIN CAE: NO VÁLIDO"))
    }

    $ticket.replaceChildren(...nodos)
    $ticket.hidden = false
    $mensaje.hidden = true
    $barra.hidden = false
    document.getElementById("titulo").textContent = `${cuenta.alias || ""} · ${nt.fullNumber || f.id}`
    document.title = `Tirilla ${nt.fullNumber || f.id}`
    if (auto) setTimeout(() => window.print(), 300)
  }
})()
