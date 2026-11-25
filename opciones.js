/* global TIRILLA_CUENTAS */
;(async () => {
  "use strict"

  const $cuentas = document.getElementById("cuentas")
  const $estado = document.getElementById("estado")
  let cuentas = await TIRILLA_CUENTAS.leer()
  let timer = null

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

  /** Logo de Alegra (URL) → data URL. Si no se puede bajar, se ignora. */
  async function logoComoDataUrl(url) {
    try {
      const r = await fetch(url)
      if (!r.ok) return ""
      const blob = await r.blob()
      if (!blob.type.startsWith("image/") || blob.size > 300_000) return ""
      return await new Promise((ok) => {
        const lector = new FileReader()
        lector.onload = () => ok(String(lector.result))
        lector.onerror = () => ok("")
        lector.readAsDataURL(blob)
      })
    } catch {
      return ""
    }
  }

  /**
   * Datos de /company → campos del encabezado. Completa los vacíos y corrige los que una
   * versión anterior cargó en crudo (CUIT sin guiones, «Régimen general»).
   * Ingresos Brutos e inicio de actividades no vienen en la API: se cargan a mano.
   */
  async function completarDesdeEmpresa(cuenta, empresa) {
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
      cuenta.logo = await logoComoDataUrl(empresa.logo)
    }
  }

  function render() {
    $cuentas.replaceChildren(
      ...cuentas.map((cuenta) => {
        const caja = document.createElement("section")
        caja.className = "cuenta"
        const h2 = document.createElement("h2")
        h2.textContent = cuenta.alias || "Cuenta sin nombre"
        const grilla = document.createElement("div")
        grilla.className = "grilla"

        for (const campo of TIRILLA_CUENTAS.CAMPOS) {
          const label = document.createElement("label")
          if (["domicilio", "token"].includes(campo.id)) label.className = "ancho"
          const input = document.createElement("input")
          input.type = campo.tipo || "text"
          input.value = cuenta[campo.id] || ""
          input.autocomplete = "off"
          input.addEventListener("change", () => {
            cuenta[campo.id] = input.value.trim()
            if (campo.id === "alias") h2.textContent = cuenta.alias || "Cuenta sin nombre"
            guardar()
          })
          label.append(campo.titulo, input)
          if (campo.ayuda) {
            const a = document.createElement("span")
            a.className = "ayuda"
            a.textContent = campo.ayuda
            label.append(a)
          }
          grilla.append(label)
        }

        // Logo (opcional): se guarda como data URL.
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
        grilla.append(logo)

        const acciones = document.createElement("div")
        acciones.className = "acciones"
        const probar = document.createElement("button")
        probar.type = "button"
        probar.className = "primario"
        probar.textContent = "Probar conexión"
        const res = document.createElement("span")
        res.className = "estado"
        probar.addEventListener("click", async () => {
          res.className = "estado"
          res.textContent = "Probando…"
          try {
            const { status, datos } = await TIRILLA_CUENTAS.get(cuenta, "/company")
            if (status === 401 || status === 403) throw new Error("El correo o el token no son válidos.")
            if (status !== 200) throw new Error(`Alegra respondió ${status}.`)
            await completarDesdeEmpresa(cuenta, datos)
            await guardar("Conexión correcta")
            render()
            const faltan = TIRILLA_CUENTAS.CAMPOS.filter((c) => !["alias", "nombreFantasia"].includes(c.id) && !cuenta[c.id])
            const $res = document.querySelectorAll(".cuenta")[cuentas.indexOf(cuenta)]?.querySelector(".acciones .estado")
            if ($res) {
              $res.textContent =
                `Conectado a ${datos && datos.name ? datos.name : "Alegra"}.` +
                (faltan.length ? ` Complete a mano: ${faltan.map((c) => c.titulo).join(", ")}.` : "")
            }
          } catch (e) {
            res.className = "estado error"
            res.textContent = e.message || "No se pudo conectar con Alegra."
          }
        })
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
        acciones.append(probar, borrar, res)

        caja.append(h2, grilla, acciones)
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
