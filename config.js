// Configuración compartida entre el content script y el popup.
// Se guarda en chrome.storage.sync (viaja con la cuenta de Chrome del usuario).

// eslint-disable-next-line no-unused-vars
var CIVA_CONFIG = (() => {
  "use strict"

  /** Columnas calculadas por la extensión. `ancho` en % del ancho de la grilla. */
  const EXTRAS = {
    "x:subtotalIva": { ancho: 11, ayuda: "Importe de la línea (con descuento) más impuestos" },
    "x:precioIva": { ancho: 11, ayuda: "Precio unitario más impuestos, sin descuento" },
  }

  /**
   * Alegra tiene dos grillas de ítems distintas:
   *  - "nueva": presupuestos y remitos (grilla CSS de Vue);
   *  - "factura": facturas de venta (tabla HTML).
   * Las columnas nativas se identifican por el texto del encabezado. `base` dice de qué
   * columnas se leen el importe de la línea, el impuesto y el precio para las calculadas.
   */
  const FAMILIAS = {
    nueva: {
      titulo: "Presupuestos y remitos",
      nativas: ["Producto o servicios", "Cantidad", "Precio", "Descuento", "Impuesto", "Subtotal"],
      obligatorias: ["Producto o servicios"],
      base: { importe: "Subtotal", impuesto: "Impuesto", precio: "Precio" },
      titulos: { "x:subtotalIva": "Subtotal c/IVA", "x:precioIva": "Precio c/IVA" },
    },
    factura: {
      titulo: "Facturas de venta",
      nativas: ["Producto", "Referencia", "Precio", "Bonif %", "Impuesto", "Descripción", "Cantidad", "Total"],
      obligatorias: ["Producto"],
      base: { importe: "Total", impuesto: "Impuesto", precio: "Precio" },
      titulos: { "x:subtotalIva": "Total c/IVA", "x:precioIva": "Precio c/IVA" },
    },
  }

  /** Pantallas donde se aplica, con la grilla que usa cada una. */
  const DOCS = {
    estimate: { titulo: "Presupuestos", ruta: "^/estimate(/|$)", familia: "nueva" },
    remission: { titulo: "Remitos", ruta: "^/remission(/|$)", familia: "nueva" },
    invoice: { titulo: "Facturas de venta", ruta: "^/invoice(/|$)", familia: "factura" },
  }

  function columnasPorDefecto(familia) {
    return [
      ...FAMILIAS[familia].nativas.map((n) => ({ id: "n:" + n, visible: true })),
      { id: "x:subtotalIva", visible: true },
      { id: "x:precioIva", visible: false },
    ]
  }

  const POR_DEFECTO = {
    docs: { estimate: true, remission: false, invoice: true },
    columnas: Object.fromEntries(Object.keys(FAMILIAS).map((f) => [f, columnasPorDefecto(f)])),
  }

  const titulo = (familia, id) => (id.startsWith("x:") ? FAMILIAS[familia].titulos[id] || id : id.slice(2))

  const esObligatoria = (familia, id) => id.startsWith("n:") && FAMILIAS[familia].obligatorias.includes(id.slice(2))

  function normalizarColumnas(familia, guardadas) {
    const base = columnasPorDefecto(familia)
    const conocidas = new Set(base.map((c) => c.id))
    const vistas = new Set()
    const out = []
    for (const c of Array.isArray(guardadas) ? guardadas : []) {
      if (!c || !conocidas.has(c.id) || vistas.has(c.id)) continue
      vistas.add(c.id)
      out.push({ id: c.id, visible: esObligatoria(familia, c.id) || c.visible !== false })
    }
    for (const c of base) if (!vistas.has(c.id)) out.push(c)
    return out
  }

  /** Completa una config guardada (quizás vieja o parcial) con los valores por defecto. */
  function normalizar(cfg) {
    const docs = { ...POR_DEFECTO.docs }
    if (cfg && cfg.docs) for (const k of Object.keys(docs)) if (typeof cfg.docs[k] === "boolean") docs[k] = cfg.docs[k]
    // la v0.2 guardaba un solo arreglo de columnas: era el de presupuestos y remitos
    const guardadas = cfg && cfg.columnas
    const porFamilia = Array.isArray(guardadas) ? { nueva: guardadas } : guardadas || {}
    const columnas = {}
    for (const f of Object.keys(FAMILIAS)) columnas[f] = normalizarColumnas(f, porFamilia[f])
    return { docs, columnas }
  }

  async function leer() {
    const { config } = await chrome.storage.sync.get("config")
    return normalizar(config)
  }

  function guardar(cfg) {
    return chrome.storage.sync.set({ config: normalizar(cfg) })
  }

  return { EXTRAS, FAMILIAS, DOCS, POR_DEFECTO, titulo, esObligatoria, normalizar, leer, guardar }
})()
