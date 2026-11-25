/* global TIRILLA_CUENTAS */
;(async () => {
  "use strict"

  const $cuentas = document.getElementById("cuentas")
  const $estado = document.getElementById("estado")
  let cuentas = await TIRILLA_CUENTAS.leer()
  let timer = null
  const CREDENCIALES = ["alias", "email", "token"]
  const OBLIGATORIOS = ["razonSocial", "cuit", "domicilio", "condicionIva", "iibb", "inicioActividades"]
  /** Mensaje de «Probar conexión» por cuenta y cuentas donde se marcan los faltantes. */
  const mensajes = new Map()
  const marcarFaltantes = new Set()

  async function guardar(msj = "Guardado") {
    await TIRILLA_CUENTAS.guardar(cuentas)
    $estado.textContent = msj
    clearTimeout(timer)
    timer = setTimeout(() => ($estado.textContent = ""), 1500)
  }

  /** 20123456789 → 20-12345678-9 */
  function formatearCuit(s) {
    const d = String(s || "").replace(/\D/g, "")
    return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(s || "")
  }

  /** El «régimen» de Alegra Argentina → leyenda de condición frente al IVA. */
  function condicionIva(regime) {
    const r = String(regime || "").toLowerCase()
    if (!r) return ""
    if (r.includes("monotribut")) return "Responsable Monotributo"
    if (r.includes("exent")) return "IVA Exento"
    if (r.includes("general") || r.includes("inscript") || r.includes("responsable")) return "IVA Responsable Inscripto"
    return String(regime)
  }

  /**
   * Datos de /company → campos del encabezado. Completa los vacíos y corrige los que una
   * versión anterior cargó en crudo (CUIT sin guiones, «Régimen general»).
   * Ingresos Brutos e inicio de actividades no vienen en la API: se cargan a mano.
   */
  function completarDesdeEmpresa(cuenta, empresa) {
    if (!empresa || typeof empresa !== "object") return
    const dir = empresa.address
    const domicilio =
      typeof dir === "string"
        ? dir
        : dir
          ? [dir.address || dir.description, dir.city, dir.province || dir.department].filter(Boolean).join(", ")
          : ""
    const idObj = empresa.identificationObject || {}
    const cuit = idObj.number ? `${idObj.number}${idObj.dv && String(idObj.number).length === 10 ? idObj.dv : ""}` : empresa.identification
    const sugeridos = {
      razonSocial: empresa.name,
      cuit: cuit ? formatearCuit(cuit) : "",
      domicilio,
      condicionIva: condicionIva(empresa.regime),
    }
    for (const [k, v] of Object.entries(sugeridos)) {
      if (!v) continue
      const actual = cuenta[k] || ""
      const crudo = (k === "condicionIva" && /^r[ée]gimen/i.test(actual)) || (k === "cuit" && /^\d{11}$/.test(actual))
      if (!actual || crudo) cuenta[k] = String(v)
    }
    if (!cuenta.logo && typeof empresa.logo === "string" && /^https:\/\//.test(empresa.logo)) {
      // Se guarda la URL: el CDN de Alegra no permite descargarla (CORS), pero <img> la muestra.
      cuenta.logo = empresa.logo
    }
  }

  function render() {
    $cuentas.replaceChildren(
      ...cuentas.map((cuenta) => {
        const caja = document.createElement("section")
        caja.className = "cuenta"
        const h2 = document.createElement("h2")
        h2.textContent = cuenta.alias || "Cuenta sin nombre"

        const campo = (def) => {
          const label = document.createElement("label")
          if (["domicilio", "token"].includes(def.id)) label.className = "ancho"
          const input = document.createElement("input")
          input.type = def.tipo || "text"
          input.value = cuenta[def.id] || ""
          input.autocomplete = "off"
          if (marcarFaltantes.has(cuenta) && OBLIGATORIOS.includes(def.id) && !cuenta[def.id]) input.classList.add("falta")
          input.addEventListener("change", () => {
            cuenta[def.id] = input.value.trim()
            if (cuenta[def.id]) input.classList.remove("falta")
            if (def.id === "alias") h2.textContent = cuenta.alias || "Cuenta sin nombre"
            guardar()
          })
          label.append(def.titulo, input)
          if (def.ayuda) {
            const a = document.createElement("span")
            a.className = "ayuda"
            a.textContent = def.ayuda
            label.append(a)
          }
          return label
        }

        // 1. Conexión
        const conexion = document.createElement("div")
        conexion.className = "grilla"
        for (const def of TIRILLA_CUENTAS.CAMPOS.filter((c) => CREDENCIALES.includes(c.id))) conexion.append(campo(def))

        const acciones = document.createElement("div")
        acciones.className = "acciones"
        const probar = document.createElement("button")
        probar.type = "button"
        probar.className = "primario"
        probar.textContent = "Probar conexión"
        const res = document.createElement("span")
        const previo = mensajes.get(cuenta)
        res.className = "estado" + (previo && previo.error ? " error" : "")
        res.textContent = previo ? previo.texto : ""
        probar.addEventListener("click", async () => {
          res.className = "estado"
          res.textContent = "Probando…"
          try {
            const { status, datos } = await TIRILLA_CUENTAS.get(cuenta, "/company")
            if (status === 401 || status === 403) throw new Error("El correo o el token no son válidos.")
            if (status !== 200) throw new Error(`Alegra respondió ${status}.`)
            completarDesdeEmpresa(cuenta, datos)
            await guardar("Conexión correcta")
            const faltan = TIRILLA_CUENTAS.CAMPOS.filter((c) => OBLIGATORIOS.includes(c.id) && !cuenta[c.id])
            mensajes.set(cuenta, {
              texto:
                `Conectado a ${datos && datos.name ? datos.name : "Alegra"}.` +
                (faltan.length ? ` Complete a mano (marcados en rojo): ${faltan.map((c) => c.titulo).join(", ")}.` : " Están todos los datos."),
              error: false,
            })
            marcarFaltantes.add(cuenta)
          } catch (e) {
            mensajes.set(cuenta, { texto: e.message || "No se pudo conectar con Alegra.", error: true })
          }
          render()
        })
        acciones.append(probar, res)

        // 2. Encabezado de la tirilla
        const h3 = document.createElement("h3")
        h3.textContent = "Datos del encabezado de la tirilla"
        const encabezado = document.createElement("div")
        encabezado.className = "grilla"
        for (const def of TIRILLA_CUENTAS.CAMPOS.filter((c) => !CREDENCIALES.includes(c.id))) encabezado.append(campo(def))

        // Logo (opcional): data URL si se sube a mano, o la URL del logo de Alegra.
        const logo = document.createElement("div")
        logo.className = "logo ancho"
        const img = document.createElement("img")
        img.alt = "Logo"
        img.hidden = !cuenta.logo
        if (cuenta.logo) img.src = cuenta.logo
        const archivo = document.createElement("input")
        archivo.type = "file"
        archivo.accept = "image/png,image/jpeg,image/svg+xml"
        archivo.addEventListener("change", () => {
          const f = archivo.files && archivo.files[0]
          if (!f) return
          if (f.size > 300_000) {
            $estado.textContent = "El logo no puede pesar más de 300 KB."
            return
          }
          const lector = new FileReader()
          lector.onload = () => {
            cuenta.logo = String(lector.result)
            img.src = cuenta.logo
            img.hidden = false
            guardar()
          }
          lector.readAsDataURL(f)
        })
        const quitarLogo = document.createElement("button")
        quitarLogo.type = "button"
        quitarLogo.textContent = "Quitar logo"
        quitarLogo.addEventListener("click", () => {
          cuenta.logo = ""
          img.hidden = true
          guardar()
        })
        const lLogo = document.createElement("label")
        lLogo.append("Logo (opcional, en blanco y negro se imprime mejor)", archivo)
        logo.append(lLogo, img, quitarLogo)
        encabezado.append(logo)

        const pie = document.createElement("div")
        pie.className = "acciones"
        const borrar = document.createElement("button")
        borrar.type = "button"
        borrar.className = "peligro"
        borrar.textContent = "Eliminar cuenta"
        borrar.addEventListener("click", () => {
          if (!confirm(`¿Eliminar la cuenta «${cuenta.alias || "sin nombre"}» de esta extensión?`)) return
          cuentas = cuentas.filter((c) => c !== cuenta)
          guardar("Cuenta eliminada")
          render()
        })
        pie.append(borrar)

        caja.append(h2, conexion, acciones, h3, encabezado, pie)
        return caja
      }),
    )
  }

  document.getElementById("agregar").addEventListener("click", () => {
    cuentas.push(TIRILLA_CUENTAS.nueva())
    guardar()
    render()
  })

  if (!cuentas.length) cuentas.push(TIRILLA_CUENTAS.nueva())
  render()
})()
