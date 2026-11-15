# Extensión de Chrome: Alegra columnas de ítems

Personaliza la grilla de productos al crear o editar **presupuestos**, **remitos** y **facturas de venta** en Alegra:

- Columnas calculadas: **Subtotal c/IVA** (en facturas, **Total c/IVA**: importe de la línea con
  descuento, más impuestos) y **Precio c/IVA** (precio unitario más impuestos, sin descuento).
- Ocultar columnas de Alegra (salvo «Producto o servicios»).
- Cambiar el orden de las columnas.
- Elegir en qué pantallas se aplica (Presupuestos, Remitos, Facturas de venta).
- Columnas configurables por separado para «Presupuestos y remitos» y para «Facturas de venta»,
  porque Alegra usa dos grillas distintas.

Es solo visual: no modifica el documento ni envía datos. La configuración se guarda en
`chrome.storage.sync` (viaja con la cuenta de Chrome) y se aplica al instante en las pestañas
abiertas.

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
