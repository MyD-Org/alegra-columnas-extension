# Extensión de Chrome: Alegra columnas de ítems

Personaliza la grilla de productos al crear o editar **presupuestos**, **remitos** y **facturas de venta** en Alegra:

- Columnas calculadas: **Subtotal c/IVA** (en facturas, **Total c/IVA**: importe de la línea con
  descuento, más impuestos) y **Precio c/IVA** (precio unitario más impuestos, sin descuento).
- Ocultar columnas de Alegra (salvo «Producto o servicios»).
- Cambiar el orden de las columnas.
- Tooltip con el texto completo al pasar el mouse por un campo cortado (p. ej. el nombre del producto).
- Elegir en qué pantallas se aplica (Presupuestos, Remitos, Facturas de venta).
- Columnas configurables por separado para «Presupuestos y remitos» y para «Facturas de venta»,
  porque Alegra usa dos grillas distintas.

Es solo visual: no modifica el documento ni envía datos. La configuración se guarda en
`chrome.storage.sync` (viaja con la cuenta de Chrome) y se aplica al instante en las pestañas
abiertas.

## Tirilla de facturas (80 mm)

En la vista de una factura de venta (`/invoice/view/id/…`) aparece el botón **Imprimir tirilla**
al lado de «Imprimir», y en la lista de facturas, en el menú de los 3 puntos de cada fila. Abre
un recuadro encima de Alegra con la factura en formato ticket de 80 mm y lanza la impresión
(elija la impresora térmica, por ejemplo `Gadnic_Tickets`, con márgenes «Ninguno» y escala
«Predeterminado»). Al imprimir o cancelar, el recuadro se cierra solo.

- Lee la factura de la **API de Alegra** (solo consultas, nunca crea ni modifica nada).
- Factura **A**: precios netos e IVA discriminado por alícuota. **B**: precios con IVA y la
  leyenda del Régimen de Transparencia Fiscal al Consumidor (Ley 27.743). **X**: se marca como no
  válida como factura.
- Si es electrónica, imprime el **QR de ARCA**, el **CAE** y su vencimiento.

### Configuración (una vez por Chrome)

Ícono de la extensión → **Configurar cuentas de la tirilla** (o clic derecho → Opciones). Cargue
una cuenta por empresa de Alegra (por ejemplo Iguazú y Mar del Plata):

- Correo del usuario y **token de API** (Alegra → Configuración → Integraciones con otros
  sistemas → API). Se guardan solo en este Chrome (`chrome.storage.local`), no se sincronizan.
- Datos fiscales del encabezado (razón social, CUIT, domicilio, condición frente al IVA, Ingresos
  Brutos, inicio de actividades) y un logo opcional. **Probar conexión** completa lo que pueda
  desde Alegra.

Si el mismo número interno de factura existe en las dos empresas, se desempata con el número del
comprobante que se ve en pantalla; si no alcanza, la tirilla pregunta cuál imprimir.

Conviene que el contador revise el primer modelo impreso.

## Instalación (cada Chrome del equipo)

1. Descargue este repo (botón **Code → Download ZIP**) y descomprímalo, o clónelo.
2. En Chrome abra `chrome://extensions` y active **Modo de desarrollador** (arriba a la derecha).
3. Haga clic en **Cargar descomprimida** y seleccione la carpeta.
4. Recargue la pestaña de Alegra.

Para actualizarla: reemplace los archivos de la carpeta y toque el botón de recarga de la
extensión en `chrome://extensions`. Para configurarla: ícono de la extensión en la barra de
Chrome (fíjela con el ícono de pieza de rompecabezas).

## Archivos

- `manifest.json`: Manifest V3, permiso `storage` y content script en `app.alegra.com`.
- `config.js`: catálogo de columnas, pantallas, valores por defecto y lectura/escritura de la config.
- `content.js`: arma la grilla en la página.
- `popup.html` / `popup.js`: panel de opciones.
- `tirilla-boton.js`: botón «Imprimir tirilla» en la factura.
- `tirilla.html` / `tirilla.js`: arma e imprime la tirilla.
- `opciones.html` / `opciones.js` / `cuentas.js`: cuentas de Alegra de la tirilla.
- `vendor/qrcode.js`: generador de QR (qrcode-generator 1.4.4, MIT, Kazuhiko Arase).

## Cómo funciona

- Presupuestos y remitos: la grilla es un único `display: grid` (Vue) con todas las celdas planas.
- Facturas de venta: es una `<table>` con un `<tr>` por línea. Mientras haya algo personalizado,
  la tabla pasa a `display: grid` con sus `<tr>` en `display: contents`, y los anchos salen de
  medir las columnas en el diseño original.
- La extensión **nunca mueve ni borra nodos de Alegra**: marca cada celda con
  `data-civa-c` (columna) y `data-civa-r` (fila) y una hoja de estilo propia las ubica con
  `grid-column` / `grid-row` explícitos (`!important`). Las ocultas van con `display: none`.
- Las columnas calculadas son nodos propios (`.civa-propia`) agregados como hermanos.
- Los anchos en % se reescalan para ocupar el mismo ancho total que la grilla original.
- Si la estructura no es la esperada (cambia la cantidad de columnas, filas incompletas), esa
  tabla queda exactamente como la dibuja Alegra.
- La tasa sale del texto del impuesto (`IVA - (21.00%)`); si hay varios porcentajes, los suma.
  Si no puede leerla, muestra «—».

Limitación: con columnas reordenadas, la tecla Tab sigue el orden original de Alegra.

## Si deja de funcionar

Lo más probable es que Alegra haya cambiado su pantalla. Los puntos de enganche están al
principio de `content.js` (clase `.dui-items-group-table__table` y clases de celdas) y en
`config.js` (textos de los encabezados).
