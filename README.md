# Generador de Caja

![image Main](Screenshot.png)
![image Main](Screenshot-2.png)

Herramienta web para mapear la carga de un tráiler de exportación a **DSV**.

Permite registrar con lector de código de barras qué material va en cada tarima y en qué
posición del tráiler, y genera un archivo de Excel con el mapa de la caja, un resumen por
número de parte y el detalle tabular.

Sustituye el mapeo manual en papel o en hojas de cálculo hechas a mano.

---

## Características

- **Captura con escáner.** Todo el flujo se hace con el lector: cada Enter salta al
  siguiente campo y al cerrar el ciclo la tarima se dibuja sola.
- **Mapa visual del tráiler.** Rejilla de 14 filas × 2 columnas (28 posiciones), del
  frente hacia las puertas.
- **Varios materiales por tarima.** Una misma posición puede llevar más de un número de
  parte, cada uno con su cantidad y referencia.
- **No se pierde el avance.** Todo se guarda en el navegador conforme se escanea; si se
  refresca la página o se cierra por accidente, al volver a abrir sigue ahí.
- **Totales en vivo.** Total de tarimas, total de piezas y un resumen agrupado por número
  de parte para cotejar contra el packing list.
- **Funciona sin internet.** La exportación a Excel usa una copia local de la librería si
  no hay conexión.

---

## Cómo se usa

### Capturar

1. Escanea o escribe el **número de caja** del tráiler y presiona Enter.
2. Escanea el **material** (número de parte) → Enter.
3. Escanea o escribe la **cantidad** de piezas → Enter.
4. Escanea o escribe la **referencia** → Enter.

La tarima aparece en el mapa y el cursor regresa a *Material*, listo para la siguiente.
Repite hasta terminar la caja.

> Los tres campos son obligatorios. Si algo falta o la cantidad es cero, avisa y deja el
> cursor en el campo que hay que corregir.

### Corregir una tarima

Al pasar el mouse sobre una tarima aparecen tres botones:

| Botón | Qué hace |
|:---:|---|
| **✎** | Abre todos los materiales de la tarima para modificarlos |
| **+** | Agrega otro material a esa tarima, sin tocar los que ya tiene |
| **×** | Elimina la tarima completa (pide confirmación y muestra qué se va a perder) |

Al eliminar una tarima intermedia, las siguientes se renumeran solas para que las
posiciones queden siempre de 1 a N.

### Exportar

El botón **Exportar** descarga el archivo con el nombre:

```
Caja-{NÚMERO DE CAJA}-{AAAA}-{MM}-{DD}.xlsx
```

El botón **Cancelar** borra todo el progreso (pide confirmación) para empezar otra caja.

---

## El archivo de Excel

Se generan tres hojas:

### `Mapa_Visual`

Reproduce la rejilla del tráiler tal como se ve en pantalla, del frente a las puertas.
Cada celda ocupada muestra la posición y sus materiales:

```
[T-1] MAT-01 | 10 pcs  +  MAT-EXTRA | 5 pcs
```

Es la hoja para imprimir o para ubicar una tarima de un vistazo. No incluye la referencia,
a propósito, para que el mapa se mantenga legible.

### `Resumen`

Agrupado por número de parte, listo para cotejar contra el packing list:

| Número_Material | Tarimas | Total_Piezas |
|---|---|---|
| P-1 | 3 | 1450 |
| PACCAR | 1 | 25 |
| **TOTAL GENERAL** | **4** | **1475** |

### `Datos_ETL`

El detalle completo, **una fila por material**. Si una tarima lleva tres números de parte,
genera tres filas con el mismo número de tarima:

| Tarima | Número_Material | Cantidad_Piezas | Referencia |
|---|---|---|---|
| 1 | MAT-01 | 10 | REF-A1 |
| 1 | MAT-EXTRA | 5 | REF-C3 |
| 2 | MAT-02 | 20 | REF-B2 |

La columna `Tarima` es **numérica**, para que se pueda ordenar y filtrar correctamente en
Excel.

---

## Cómo ejecutarlo

No requiere instalación, compilación ni servidor.

### En línea

Publicado con GitHub Pages desde este mismo repositorio.

### En local

Descarga el repositorio y abre `index.html` con doble clic:

```bash
git clone https://github.com/arthyssj/generadorCaja.git
```

O desde GitHub: **Code → Download ZIP**, descomprimir y abrir `index.html`.

Funciona igual sin conexión a internet: la captura, el respaldo y la exportación a Excel
operan por completo dentro del navegador.

> **Importante:** el navegador guarda el avance por separado en la versión en línea y en la
> local. No conviene alternar entre las dos a media captura, porque cada una lleva su propio
> respaldo. Elige una y termina la caja ahí.

---

## Notas técnicas

- HTML, CSS y JavaScript sin frameworks ni proceso de compilación.
- El avance se guarda en `localStorage` bajo la llave `generadorCajaEstado`. El botón
  *Cancelar* lo borra.
- El Excel se genera con [SheetJS](https://sheetjs.com/). Se intenta cargar desde su CDN y,
  si no está disponible, se usa la copia local incluida en `JS/xlsx.full.min.js`.
- La capacidad del tráiler está en la constante `MAX_CAPACIDAD` (28) al inicio de
  `JS/script.js`. Si se cambia, hay que ajustar también `grid-template-rows` en
  `CSS/style.css` y el número de filas del mapa en la exportación.

### Estructura

```
generadorCaja/
├── index.html              # Interfaz
├── CSS/style.css           # Estilos
├── JS/
│   ├── script.js           # Toda la lógica
│   └── xlsx.full.min.js    # SheetJS (respaldo sin internet)
└── IMG/icon.png            # Favicon
```

### Modelo de datos

```js
{
  "Posición_Tráiler": 1,
  "Materiales": [
    { "Número_Material": "MAT-01", "Cantidad_Piezas": 10, "Referencia": "REF-A1" }
  ]
}
```
