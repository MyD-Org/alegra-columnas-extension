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

  /** Datos de /company → campos del encabezado que estén vacíos. */
  function completarDesdeEmpresa(cuenta, empresa) {
    if (!empresa || typeof empresa !== "object") return
    const dir = empresa.address
    const domicilio =
      typeof dir === "string" ? dir : dir ? [dir.address, dir.city, dir.province || dir.department].filter(Boolean).join(", ") : ""
    const sugeridos = {
      razonSocial: empresa.name,
      cuit: empresa.identification,
      domicilio,
      condicionIva: typeof empresa.regime === "string" ? empresa.regime : "",
    }
    for (const [k, v] of Object.entries(sugeridos)) if (!cuenta[k] && v) cuenta[k] = String(v)
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
            completarDesdeEmpresa(cuenta, datos)
            await guardar("Conexión correcta")
            res.textContent = `Conectado a ${datos && datos.name ? datos.name : "Alegra"}.`
            render()
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
