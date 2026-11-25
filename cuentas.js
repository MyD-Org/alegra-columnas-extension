// Cuentas de Alegra para la tirilla: credenciales de API y datos fiscales del encabezado.
// Se guardan en chrome.storage.local (NO en sync: el token no viaja con la cuenta de Chrome).

// eslint-disable-next-line no-unused-vars
var TIRILLA_CUENTAS = (() => {
  "use strict"

  const CLAVE = "tirillaCuentas"
  const API = "https://api.alegra.com/api/v1"

  const CAMPOS = [
    { id: "alias", titulo: "Nombre de la cuenta", ayuda: "Por ejemplo: Iguazú" },
    { id: "email", titulo: "Correo del usuario de Alegra", tipo: "email" },
    { id: "token", titulo: "Token de API", tipo: "password", ayuda: "Alegra → Configuración → Integraciones con otros sistemas → API" },
    { id: "razonSocial", titulo: "Razón social" },
    { id: "nombreFantasia", titulo: "Nombre de fantasía" },
    { id: "cuit", titulo: "CUIT" },
    { id: "domicilio", titulo: "Domicilio comercial" },
    { id: "condicionIva", titulo: "Condición frente al IVA", ayuda: "Por ejemplo: IVA Responsable Inscripto" },
    { id: "iibb", titulo: "Ingresos Brutos" },
    { id: "inicioActividades", titulo: "Inicio de actividades", ayuda: "dd/mm/aaaa" },
  ]

  const nueva = () => ({ id: String(Date.now()), ...Object.fromEntries(CAMPOS.map((c) => [c.id, ""])), logo: "" })

  async function leer() {
    const { [CLAVE]: cuentas } = await chrome.storage.local.get(CLAVE)
    return Array.isArray(cuentas) ? cuentas : []
  }

  function guardar(cuentas) {
    return chrome.storage.local.set({ [CLAVE]: cuentas })
  }

  /** GET a la API de Alegra con las credenciales de la cuenta. Devuelve { status, datos }. */
  async function get(cuenta, ruta) {
    const auth = btoa(`${cuenta.email.trim()}:${cuenta.token.trim()}`)
    const r = await fetch(API + ruta, { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } })
    let datos = null
    try {
      datos = await r.json()
    } catch {}
    return { status: r.status, datos }
  }

  return { CAMPOS, nueva, leer, guardar, get }
})()
