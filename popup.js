/* global CIVA_CONFIG */
;(async () => {
  "use strict"

  const $docs = document.getElementById("docs")
  const $familias = document.getElementById("familias")
  const $columnas = document.getElementById("columnas")
  const $estado = document.getElementById("estado")

  let cfg = await CIVA_CONFIG.leer()
  let familia = "nueva"
  try {
    familia = localStorage.getItem("civa-familia") || familia
  } catch {}
  if (!CIVA_CONFIG.FAMILIAS[familia]) familia = "nueva"
  let timer = null

  async function guardar() {
    await CIVA_CONFIG.guardar(cfg)
    $estado.textContent = "Guardado"
    clearTimeout(timer)
    timer = setTimeout(() => ($estado.textContent = ""), 1200)
  }

  function check(marcado, alCambiar, deshabilitado) {
    const input = document.createElement("input")
    input.type = "checkbox"
    input.checked = marcado
    input.disabled = !!deshabilitado
    input.addEventListener("change", () => alCambiar(input.checked))
    return input
  }

  function renderDocs() {
    $docs.replaceChildren(
      ...Object.entries(CIVA_CONFIG.DOCS).map(([clave, doc]) => {
        const label = document.createElement("label")
        label.className = "check"
        label.append(
          check(!!cfg.docs[clave], (v) => {
            cfg.docs[clave] = v
            guardar()
          }),
          doc.titulo,
        )
        return label
      }),
    )
  }

  function renderFamilias() {
    $familias.replaceChildren(
      ...Object.entries(CIVA_CONFIG.FAMILIAS).map(([clave, f]) => {
        const b = document.createElement("button")
        b.type = "button"
        b.role = "tab"
        b.textContent = f.titulo
        b.setAttribute("aria-selected", String(clave === familia))
        b.addEventListener("click", () => {
          familia = clave
          try {
            localStorage.setItem("civa-familia", clave)
          } catch {}
          renderFamilias()
          renderColumnas()
        })
        return b
      }),
    )
  }

  function renderColumnas() {
    const lista = cfg.columnas[familia]
    $columnas.replaceChildren(
      ...lista.map((col, i) => {
        const li = document.createElement("li")
        if (!col.visible) li.classList.add("oculta")
        const obligatoria = CIVA_CONFIG.esObligatoria(familia, col.id)
        const nombreTxt = CIVA_CONFIG.titulo(familia, col.id)

        const label = document.createElement("label")
        const nombre = document.createElement("span")
        nombre.className = "nombre"
        nombre.textContent = nombreTxt
        label.append(
          check(
            col.visible,
            (v) => {
              col.visible = v
              guardar()
              renderColumnas()
            },
            obligatoria,
          ),
          nombre,
        )
        if (col.id.startsWith("x:")) {
          const tag = document.createElement("span")
          tag.className = "tag"
          tag.textContent = "calculada"
          label.title = CIVA_CONFIG.EXTRAS[col.id].ayuda
          label.append(tag)
        } else if (obligatoria) {
          label.title = "Esta columna no se puede ocultar"
        }

        const mover = (delta, simbolo, ayuda) => {
          const b = document.createElement("button")
          b.type = "button"
          b.className = "mover"
          b.textContent = simbolo
          b.title = ayuda
          b.setAttribute("aria-label", `${ayuda}: ${nombreTxt}`)
          const j = i + delta
          b.disabled = j < 0 || j >= lista.length
          b.addEventListener("click", () => {
            ;[lista[i], lista[j]] = [lista[j], lista[i]]
            guardar()
            renderColumnas()
          })
          return b
        }

        li.append(label, mover(-1, "↑", "Subir"), mover(1, "↓", "Bajar"))
        return li
      }),
    )
  }

  document.getElementById("restablecer").addEventListener("click", () => {
    cfg.columnas[familia] = CIVA_CONFIG.normalizar(null).columnas[familia]
    guardar()
    renderColumnas()
  })

  renderDocs()
  renderFamilias()
  renderColumnas()
})()
