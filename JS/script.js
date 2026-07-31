// --- ESTADO DE LA APLICACIÓN GENERADOR BASE---
const MAX_CAPACIDAD = 28;
const STORAGE_KEY = 'generadorCajaEstado';
let totalTarimas = 0;
let datosTrailer = []; // Array en memoria para exportar a Excel
let editandoIndex = null; // Índice de la tarima que se está editando (null = ninguna)
let lineasEdicionTemp = null; // Copia de trabajo de los materiales de la tarima en edición

// --- REFERENCIAS AL DOM ---
const inputCaja = document.getElementById('inputCaja');
const inputMaterial = document.getElementById('inputMaterial');
const inputCantidad = document.getElementById('inputCantidad');
const mapaTrailer = document.getElementById('mapa-trailer');
const contadorTarimas = document.getElementById('contadorTarimas');

// Reasigna Posición_Tráiler de 1 a N según el orden real del arreglo.
// Se llama antes de guardar y antes de dibujar para que las posiciones nunca
// queden desfasadas (p. ej. al borrar una tarima intermedia).
function renumerarPosiciones() {
    datosTrailer.forEach(function(tarima, i) {
        tarima.Posición_Tráiler = i + 1;
    });
}

// --- PERSISTENCIA (localStorage) ---
// Evita perder el trabajo si se refresca la página o el navegador falla a medio conteo.
function guardarEstado() {
    renumerarPosiciones();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        numCaja: inputCaja.value,
        datosTrailer: datosTrailer
    }));
}

function cargarEstado() {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (!guardado) return;

    try {
        const estado = JSON.parse(guardado);
        inputCaja.value = estado.numCaja || '';
        const datosCrudos = Array.isArray(estado.datosTrailer) ? estado.datosTrailer : [];

        // Migración: versiones anteriores guardaban un solo material por tarima
        // (Número_Material/Cantidad_Piezas planos) en vez del arreglo Materiales[].
        datosTrailer = datosCrudos.map(function(tarima) {
            if (Array.isArray(tarima.Materiales)) return tarima;
            return {
                Posición_Tráiler: tarima.Posición_Tráiler,
                Materiales: [{
                    Número_Material: tarima.Número_Material,
                    Cantidad_Piezas: tarima.Cantidad_Piezas
                }]
            };
        });
    } catch (error) {
        console.error('Error al recuperar el progreso guardado:', error);
        localStorage.removeItem(STORAGE_KEY);
    }
}

// Lee los valores actuales (sin validar) de las filas del formulario de edición
function leerFilasEdicionDesdeDOM(contenedor) {
    return Array.from(contenedor.querySelectorAll('.fila-material-edit')).map(function(fila) {
        return {
            Número_Material: fila.querySelector('.edit-material').value,
            Cantidad_Piezas: fila.querySelector('.edit-cantidad').value
        };
    });
}

// --- NUEVA FUNCIÓN: ENCARGADA DE DIBUJAR TODO EL TRÁILER ---
function renderizarTrailer() {
    // 1. Limpiar por completo el contenedor visual para volverlo a armar
    mapaTrailer.innerHTML = '';

    // 2. Corregir las posiciones (por si borramos una intermedia, se reajustan de 1 a N)
    renumerarPosiciones();

    // 3. Sincronizar el contador global con el tamaño real del arreglo
    totalTarimas = datosTrailer.length;
    contadorTarimas.innerText = totalTarimas;

    // 4. Recorrer el arreglo de datos y fabricar los cuadritos en el Grid
    datosTrailer.forEach((tarima, index) => {
        // Crear el elemento visual
        const nuevaTarima = document.createElement('div');
        nuevaTarima.className = 'tarima';

        if (index === editandoIndex) {
            // --- MODO EDICIÓN: mini-formulario con una fila por material ---
            nuevaTarima.classList.add('tarima-editando');

            const filasHtml = lineasEdicionTemp.map(function(linea) {
                return `
                    <div class="fila-material-edit">
                        <input type="text" class="edit-material" value="${linea.Número_Material}">
                        <input type="number" class="edit-cantidad" value="${linea.Cantidad_Piezas}">
                        <button class="btn-quitar-linea" title="Quitar este material">×</button>
                    </div>
                `;
            }).join('');

            nuevaTarima.innerHTML = `
                <div class="lineas-edicion">${filasHtml}</div>
                <button class="btn-agregar-linea" type="button">+ Agregar material</button>
                <div class="edit-acciones">
                    <button class="btn-guardar-edicion" title="Guardar cambios">✓</button>
                    <button class="btn-cancelar-edicion" title="Cancelar edición">×</button>
                </div>
            `;

            const guardarEdicion = function() {
                const filas = leerFilasEdicionDesdeDOM(nuevaTarima);
                const materialesValidados = [];

                for (const fila of filas) {
                    const matRaw = fila.Número_Material.trim();
                    const cantRaw = String(fila.Cantidad_Piezas).trim();

                    if (!matRaw && !cantRaw) continue; // fila vacía sin usar, se ignora

                    const mat = matRaw.toUpperCase();
                    const cant = parseInt(cantRaw);

                    if (!mat || isNaN(cant) || cant <= 0) {
                        alert('Revisa los materiales: cada línea necesita número de material y una cantidad válida (mayor a 0).');
                        return;
                    }
                    materialesValidados.push({ Número_Material: mat, Cantidad_Piezas: cant });
                }

                if (materialesValidados.length === 0) {
                    alert('La tarima debe tener al menos un material válido.');
                    return;
                }

                tarima.Materiales = materialesValidados;
                editandoIndex = null;
                lineasEdicionTemp = null;
                guardarEstado();
                renderizarTrailer();
            };

            nuevaTarima.querySelector('.btn-guardar-edicion').addEventListener('click', guardarEdicion);
            nuevaTarima.querySelector('.btn-cancelar-edicion').addEventListener('click', function() {
                editandoIndex = null;
                lineasEdicionTemp = null;
                renderizarTrailer();
            });

            nuevaTarima.querySelector('.btn-agregar-linea').addEventListener('click', function() {
                lineasEdicionTemp = leerFilasEdicionDesdeDOM(nuevaTarima);
                lineasEdicionTemp.push({ Número_Material: '', Cantidad_Piezas: '' });
                renderizarTrailer();
            });

            nuevaTarima.querySelectorAll('.btn-quitar-linea').forEach(function(btn, i) {
                btn.addEventListener('click', function() {
                    lineasEdicionTemp = leerFilasEdicionDesdeDOM(nuevaTarima);
                    if (lineasEdicionTemp.length <= 1) {
                        alert('Una tarima debe tener al menos un material. Para quitarla por completo usa la "×" de la tarima.');
                        return;
                    }
                    lineasEdicionTemp.splice(i, 1);
                    renderizarTrailer();
                });
            });

            const filasInputs = nuevaTarima.querySelectorAll('.fila-material-edit');
            filasInputs.forEach(function(fila, i) {
                const campoMaterial = fila.querySelector('.edit-material');
                const campoCantidad = fila.querySelector('.edit-cantidad');

                campoMaterial.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        campoCantidad.focus();
                    }
                });

                campoCantidad.addEventListener('keypress', function(e) {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();

                    const esUltima = i === filasInputs.length - 1;
                    if (esUltima) {
                        // Enter en la última línea: agrega otra fila lista para escanear
                        lineasEdicionTemp = leerFilasEdicionDesdeDOM(nuevaTarima);
                        lineasEdicionTemp.push({ Número_Material: '', Cantidad_Piezas: '' });
                        renderizarTrailer();
                    } else {
                        filasInputs[i + 1].querySelector('.edit-material').focus();
                    }
                });
            });

            mapaTrailer.appendChild(nuevaTarima);

            // Enfocar la primera fila vacía si existe (recién agregada); si no, la primera fila
            const indiceVacio = lineasEdicionTemp.findIndex(function(l) { return !l.Número_Material; });
            const inputAEnfocar = filasInputs[indiceVacio >= 0 ? indiceVacio : 0].querySelector('.edit-material');
            inputAEnfocar.focus();
            inputAEnfocar.select();
            return;
        }

        const lineasHtml = tarima.Materiales.map(function(m) {
            return `
                <div class="linea-material">
                    <strong>${m.Número_Material}</strong>
                    <span>${m.Cantidad_Piezas} pcs</span>
                </div>
            `;
        }).join('');

        nuevaTarima.innerHTML = `
            <button class="btn-editar-tarima" title="Editar esta tarima">✎</button>
            <button class="btn-agregar-material" title="Agregar otro material a esta tarima">+</button>
            <button class="btn-eliminar-tarima" title="Eliminar esta tarima">×</button>
            <div class="lineas-material">${lineasHtml}</div>
        `;

        // ASIGNAR EVENTO DE ELIMINACIÓN A LA "X"
        const btnEliminar = nuevaTarima.querySelector('.btn-eliminar-tarima');
        btnEliminar.addEventListener('click', function() {
            // Confirmar antes de borrar, mostrando el detalle de lo que se va a perder.
            // La "×" queda a unos pocos píxeles del "✎" y del "+", así que un clic
            // accidental podría tirar una tarima con varios materiales.
            const detalle = tarima.Materiales
                .map(function(m) { return `  • ${m.Número_Material} — ${m.Cantidad_Piezas} pcs`; })
                .join('\n');

            if (!confirm(`¿Eliminar la tarima T-${tarima.Posición_Tráiler}?\n\n${detalle}`)) {
                return;
            }

            // Borramos el elemento del arreglo usando su índice actual
            datosTrailer.splice(index, 1);

            // Al quitar una tarima, todas las de atrás recorren su índice una posición.
            // Si había otra tarima abierta en modo edición hay que reajustar el puntero,
            // porque si no terminaríamos guardando esos materiales en la tarima equivocada.
            if (editandoIndex !== null) {
                if (index === editandoIndex) {
                    // Se borró justamente la que se estaba editando: cerramos el formulario
                    editandoIndex = null;
                    lineasEdicionTemp = null;
                } else if (index < editandoIndex) {
                    editandoIndex--;
                }
            }

            guardarEstado();

            // ¡Magia! Volvemos a renderizar para que la pantalla se actualice sola
            renderizarTrailer();
        });

        // ASIGNAR EVENTO DE EDICIÓN AL LÁPIZ
        nuevaTarima.querySelector('.btn-editar-tarima').addEventListener('click', function() {
            editandoIndex = index;
            lineasEdicionTemp = tarima.Materiales.map(function(m) {
                return { Número_Material: m.Número_Material, Cantidad_Piezas: String(m.Cantidad_Piezas) };
            });
            renderizarTrailer();
        });

        // ASIGNAR EVENTO AL "+": entra en modo edición con una línea nueva lista para llenar
        nuevaTarima.querySelector('.btn-agregar-material').addEventListener('click', function() {
            editandoIndex = index;
            lineasEdicionTemp = tarima.Materiales.map(function(m) {
                return { Número_Material: m.Número_Material, Cantidad_Piezas: String(m.Cantidad_Piezas) };
            });
            lineasEdicionTemp.push({ Número_Material: '', Cantidad_Piezas: '' });
            renderizarTrailer();
        });

        // Agregar al mapa del tráiler
        mapaTrailer.appendChild(nuevaTarima);
    });
}

// --- LÓGICA DE ESCÁNER (AUTO-FOCUS) ---

// Escanear Caja de trailer o ingresar
inputCaja.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if(inputCaja.value.trim() !== '') {
            inputMaterial.focus();
        }
    }
});

// Escanear Material 
inputMaterial.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        if(inputMaterial.value.trim() !== '') {
            inputCantidad.focus();
        }
    }
});



// Escanear Cantidad: Procesa, Dibuja y Regresa a Material
inputCantidad.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();

        const material = inputMaterial.value.trim().toUpperCase();
        const cantidad = parseInt(inputCantidad.value.trim());
        

        // Validar campos vacíos
        if (!material || isNaN(cantidad) || cantidad <= 0){
            alert("Cantidad invalida")
            inputCantidad.focus;
            return;

        } ;

       // Validar límite físico usando el tamaño real del array
        if (datosTrailer.length >= MAX_CAPACIDAD) {
            alert(`¡ALTO! La caja del tráiler está llena (${MAX_CAPACIDAD} tarimas máximo).`);
            inputMaterial.value = '';
            inputCantidad.value = '';
            inputMaterial.focus();
            return;
        }

        // Guardar los datos limpios
        datosTrailer.push({
            "Posición_Tráiler": datosTrailer.length + 1,
            "Materiales": [
                { "Número_Material": material, "Cantidad_Piezas": parseInt(cantidad) }
            ]
        });

        // Guardar progreso y llamar a nuestra función de dibujo
        guardarEstado();
        renderizarTrailer();

        // Limpiar para el siguiente ciclo del escáner
        inputMaterial.value = '';
        inputCantidad.value = '';
        inputMaterial.focus();
    }
});

// Guardar el número de caja a medida que se escribe/escanea
inputCaja.addEventListener('input', guardarEstado);

// --- CARGA DEL GENERADOR DE EXCEL (SheetJS) CON RESPALDO LOCAL ---
// index.html intenta bajar SheetJS del CDN. Si no hay internet o el firewall lo bloquea,
// aquí se carga la copia local del repo para que exportar siga funcionando sin conexión.
let cargaXlsxEnCurso = null;

function asegurarXLSX() {
    // El CDN ya cargó: no hay nada que hacer
    if (typeof XLSX !== 'undefined') return Promise.resolve();

    // Ya se está cargando la copia local: reutilizamos la misma promesa
    if (cargaXlsxEnCurso) return cargaXlsxEnCurso;

    cargaXlsxEnCurso = new Promise(function(resolve, reject) {
        const etiqueta = document.createElement('script');
        etiqueta.src = './JS/xlsx.full.min.js';
        etiqueta.onload = function() {
            if (typeof XLSX !== 'undefined') {
                resolve();
            } else {
                reject(new Error('La copia local de SheetJS no definió XLSX.'));
            }
        };
        etiqueta.onerror = function() {
            reject(new Error('No se pudo cargar la copia local de SheetJS.'));
        };
        document.head.appendChild(etiqueta);
    });

    return cargaXlsxEnCurso;
}

// --- LÓGICA DE EXPORTACIÓN Excel ---
function generarExcel() {
    // 1. Generar nombre de archivo dinámico
    const numCaja = inputCaja.value.trim().toUpperCase() || 'SINNUM';
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const nombreSugerido = `Caja-${numCaja}-${anio}-${mes}-${dia}.xlsx`;

    try {
        // --- HOJA 1: MAPA VISUAL ---
        // Construimos una matriz de filas y columnas
        const matrizMapa = [];
        
        // Cabecera visual
        matrizMapa.push(["=== FRENTE DEL TRÁILER ===", "=== FRENTE DEL TRÁILER ==="]);

        // Crear la estructura vacía de 14 filas x 2 columnas
        for (let i = 0; i < 14; i++) {
            matrizMapa.push([`(Vacío)`, `(Vacío)`]);
        }

        // Llenar las coordenadas exactas con los datos escaneados
        datosTrailer.forEach(tarima => {
            const index = tarima.Posición_Tráiler - 1; // Índice de 0 a 27

            // Cálculos matemáticos simples para saber la celda exacta
            const filaExcel = Math.floor(index / 2) + 1; // +1 porque la fila 0 es el Frente
            const columnaExcel = index % 2; // 0 (Izquierda) o 1 (Derecha)

            // Si hay varios materiales en la misma tarima, se listan uno tras otro
            const detalleMateriales = tarima.Materiales
                .map(m => `${m.Número_Material} | ${m.Cantidad_Piezas} pcs`)
                .join('  +  ');

            // Formatear el texto de cada cuadrito en el Excel
            matrizMapa[filaExcel][columnaExcel] = `[T-${tarima.Posición_Tráiler}] ${detalleMateriales}`;
        });

        // Puertas
        matrizMapa.push(["=== PUERTAS ===", "=== PUERTAS ==="]);

        // Convertir la matriz a hoja de Excel
        const hojaMapa = XLSX.utils.aoa_to_sheet(matrizMapa);

        // Ajustar el ancho de las 2 columnas para que el texto no se corte
        hojaMapa['!cols'] = [{ wch: 35 }, { wch: 35 }];


        // --- HOJA 2: DATOS TABULARES ---
        // Una fila por material: si una tarima tiene 2+ materiales, se generan 2+ filas
        // con la misma Posición_Tráiler, para que el ETL no pierda ninguno.
        const filasDatos = [];
        datosTrailer.forEach(tarima => {
            tarima.Materiales.forEach(m => {
                filasDatos.push({
                    "Posición_Tráiler": tarima.Posición_Tráiler,
                    "Número_Material": m.Número_Material,
                    "Cantidad_Piezas": m.Cantidad_Piezas
                });
            });
        });
        const hojaDatos = XLSX.utils.json_to_sheet(filasDatos);


        // --- ARMAR EL LIBRO DE EXCEL CON LAS DOS HOJAS ---
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hojaMapa, "Mapa_Visual");
        XLSX.utils.book_append_sheet(libro, hojaDatos, "Datos_ETL");

        // --- DESCARGAR EL ARCHIVO NATIVAMENTE ---
        XLSX.writeFile(libro, nombreSugerido);

    } catch (error) {
        console.error("Error crítico al generar Excel:", error);
        alert("Hubo un problema al generar el archivo. Presiona F12 para ver el error.");
    }
}

document.getElementById('btnExportar').addEventListener('click', function() {
    if (datosTrailer.length === 0) {
        alert("No hay datos para exportar. Escanea al menos una tarima.");
        return;
    }

    // Nos aseguramos de tener SheetJS (CDN o copia local) antes de armar el archivo
    asegurarXLSX()
        .then(generarExcel)
        .catch(function(error) {
            console.error('No se pudo cargar SheetJS:', error);
            alert('No se pudo cargar el generador de Excel.\n\nRevisa que exista el archivo JS/xlsx.full.min.js junto a la página.');
        });
});

// --- BOTÓN CANCELAR / LIMPIAR ---
document.getElementById('btnCancelar').addEventListener('click', function() {
    if(confirm("¿Estás seguro de que quieres borrar todo el progreso actual?")) {
        // Reiniciar variables
        totalTarimas = 0;
        datosTrailer = [];
        editandoIndex = null;

        // Borrar también el progreso guardado
        localStorage.removeItem(STORAGE_KEY);

        // Limpiar UI
        contadorTarimas.innerText = '0';
        mapaTrailer.innerHTML = ''; // Borra todos los cuadritos
        inputCaja.value = '';
        inputMaterial.value = '';
        inputCantidad.value = '';

        inputCaja.focus();
    }
});

// --- RECUPERAR PROGRESO GUARDADO AL CARGAR LA PÁGINA ---
cargarEstado();
renderizarTrailer();