// --- ESTADO DE LA APLICACIÓN GENERADOR BASE---
// Medidas de la caja: 14 posiciones de fondo por 2 de ancho. Es UN solo hecho físico,
// pero estaba escrito suelto en siete sitios (el tope del escaneo, el grid del CSS, el
// alto de la matriz del Excel, sus cuentas de fila/columna, las tres filas literales de
// dos celdas y el ancho de columnas). Cambiar el tamaño de la caja obligaba a dar con
// todos, y olvidar uno no produce ningún error: el mapa sale mal en silencio.
// La capacidad se deriva porque es consecuencia de las otras dos, no un dato aparte.
const FILAS_TRAILER = 14;
const COLUMNAS_TRAILER = 2;
const MAX_CAPACIDAD = FILAS_TRAILER * COLUMNAS_TRAILER;
const STORAGE_KEY = 'generadorCajaEstado';
let totalTarimas = 0;
let datosTrailer = []; // Array en memoria para exportar a Excel
let editandoIndex = null; // Índice de la tarima que se está editando (null = ninguna)
let lineasEdicionTemp = null; // Copia de trabajo de los materiales de la tarima en edición
// 'editar'  -> lineasEdicionTemp trae TODOS los materiales y los reemplaza al guardar
// 'agregar' -> lineasEdicionTemp trae SÓLO lo nuevo y se suma a los que ya tiene la tarima
let modoEdicion = null;

// Cierra cualquier formulario abierto (edición o alta de material)
function cerrarFormulario() {
    editandoIndex = null;
    lineasEdicionTemp = null;
    modoEdicion = null;
}

// --- REFERENCIAS AL DOM ---
const inputCaja = document.getElementById('inputCaja');
const inputMaterial = document.getElementById('inputMaterial');
const inputCantidad = document.getElementById('inputCantidad');
const inputReferencia = document.getElementById('inputReferencia');
const mapaTrailer = document.getElementById('mapa-trailer');
const contadorTarimas = document.getElementById('contadorTarimas');
const contadorPiezas = document.getElementById('contadorPiezas');
const cuerpoResumen = document.getElementById('cuerpo-resumen');
const contenedorAvisos = document.getElementById('avisos');

// El grid del mapa se dibuja con las medidas de arriba. Se las pasamos al CSS en vez de
// repetir los números allá, para que el layout siga al dato y no al revés. style.css
// declara los mismos valores como respaldo del var(), así que la caja se ve bien aunque
// esta línea no llegue a correr.
document.documentElement.style.setProperty('--filas-trailer', String(FILAS_TRAILER));
document.documentElement.style.setProperty('--columnas-trailer', String(COLUMNAS_TRAILER));

// Escapa el texto que se inserta con innerHTML. Un número de parte con comillas
// o "<" rompería el HTML del formulario de edición y corrompería lo mostrado.
function escaparHtml(texto) {
    return String(texto).replace(/[&<>"']/g, function(caracter) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[caracter];
    });
}

// Suma todas las piezas de todas las tarimas del tráiler
function calcularTotalPiezas() {
    return datosTrailer.reduce(function(total, tarima) {
        return total + tarima.Materiales.reduce(function(suma, m) {
            return suma + m.Cantidad_Piezas;
        }, 0);
    }, 0);
}

// Agrupa por número de parte: cuántas piezas en total y en cuántas tarimas viaja.
// Es lo que se coteja contra el packing list.
function calcularResumenMateriales() {
    const acumulado = new Map();

    datosTrailer.forEach(function(tarima) {
        tarima.Materiales.forEach(function(m) {
            if (!acumulado.has(m.Número_Material)) {
                acumulado.set(m.Número_Material, { piezas: 0, posiciones: new Set() });
            }
            const registro = acumulado.get(m.Número_Material);
            registro.piezas += m.Cantidad_Piezas;
            registro.posiciones.add(tarima.Posición_Tráiler);
        });
    });

    return Array.from(acumulado.entries())
        .map(function(entrada) {
            return {
                material: entrada[0],
                piezas: entrada[1].piezas,
                tarimas: entrada[1].posiciones.size
            };
        })
        .sort(function(a, b) { return a.material.localeCompare(b.material); });
}

// Dibuja el total de piezas y la tabla agrupada por número de parte
function renderizarResumen() {
    animarContador(contadorPiezas, calcularTotalPiezas());

    const resumen = calcularResumenMateriales();

    if (resumen.length === 0) {
        cuerpoResumen.innerHTML = '<tr><td colspan="3" class="resumen-vacio">Aún no hay materiales escaneados</td></tr>';
        return;
    }

    cuerpoResumen.innerHTML = resumen.map(function(r) {
        return `
            <tr>
                <td class="col-material">${escaparHtml(r.material)}</td>
                <td class="col-num">${r.tarimas}</td>
                <td class="col-num">${r.piezas.toLocaleString('es-MX')}</td>
            </tr>
        `;
    }).join('');
}

// Reasigna Posición_Tráiler de 1 a N según el orden real del arreglo.
// Se llama antes de guardar y antes de dibujar para que las posiciones nunca
// queden desfasadas (p. ej. al borrar una tarima intermedia).
function renumerarPosiciones() {
    datosTrailer.forEach(function(tarima, i) {
        tarima.Posición_Tráiler = i + 1;
    });
}

// --- ACCESO AL ALMACENAMIENTO ---
// localStorage puede lanzar: con el disco lleno el navegador devuelve QuotaExceededError,
// y una política que bloquee los datos del sitio hace fallar hasta la lectura.
// Lo grave no es quedarse sin guardar, es que la excepción sube y corta a media función
// a quien llamó, que es el único tramo del programa donde un error se vuelve un dato
// inventado. Sin esto: al escanear, la tarima quedaba en el arreglo pero sin dibujar y
// con los campos llenos, así que el operador la reescaneaba y salían tarimas repetidas
// en el Excel; al cargar, impedía que corriera renderizarTrailer() y la app arrancaba en
// blanco con el avance guardado sin leer; al cancelar, dejaba el mapa mostrando tarimas
// que ya no existían.
let avisoAlmacenDado = false;

function avisarAlmacenCaido() {
    // Una sola vez por sesión: guardarEstado corre en CADA tecla del campo de título, y
    // sin la bandera el aviso no se iría de la pantalla mientras se escribe.
    if (avisoAlmacenDado) return;
    avisoAlmacenDado = true;
    mostrarAviso('No se pudo guardar el avance en este navegador.\n\nLo capturado sigue en pantalla y puedes exportar, pero si recargas la página se perderá.');
}

function leerAlmacen(llave) {
    try {
        return localStorage.getItem(llave);
    } catch (error) {
        // Arrancar vacío es lo correcto aquí, y no se avisa: no hay nada que el operador
        // pueda hacer al respecto y el primer guardado ya le dirá que no se está guardando.
        console.error('No se pudo leer del almacenamiento:', error);
        return null;
    }
}

// Devuelve si logró escribir. Quien ofrece deshacer un borrado necesita saberlo para no
// prometer una restauración que no va a poder cumplir.
function escribirAlmacen(llave, valor) {
    try {
        localStorage.setItem(llave, valor);
        return true;
    } catch (error) {
        console.error('No se pudo escribir en el almacenamiento:', error);
        avisarAlmacenCaido();
        return false;
    }
}

function borrarAlmacen(llave) {
    try {
        localStorage.removeItem(llave);
    } catch (error) {
        console.error('No se pudo borrar del almacenamiento:', error);
    }
}

// --- PERSISTENCIA (localStorage) ---
// Evita perder el trabajo si se refresca la página o el navegador falla a medio conteo.
function guardarEstado() {
    renumerarPosiciones();
    escribirAlmacen(STORAGE_KEY, JSON.stringify({
        numCaja: inputCaja.value,
        datosTrailer: datosTrailer
    }));
}

// Pasa al formato actual lo que venga del almacén. Migración: versiones anteriores
// guardaban un solo material por tarima (Número_Material/Cantidad_Piezas planos) en vez
// del arreglo Materiales[], y todavía no existía el campo Referencia.
// Está aparte porque lo usan dos caminos: recuperar el avance al abrir y deshacer un
// borrado. Ambos leen texto guardado por una versión que puede no ser la de hoy.
function normalizarTarimas(datosCrudos) {
    if (!Array.isArray(datosCrudos)) return [];

    return datosCrudos.map(function(tarima) {
        const materiales = Array.isArray(tarima.Materiales)
            ? tarima.Materiales
            : [{
                Número_Material: tarima.Número_Material,
                Cantidad_Piezas: tarima.Cantidad_Piezas
            }];

        return {
            Posición_Tráiler: tarima.Posición_Tráiler,
            Materiales: materiales.map(function(m) {
                return {
                    Número_Material: m.Número_Material,
                    Cantidad_Piezas: m.Cantidad_Piezas,
                    Referencia: m.Referencia || ''
                };
            })
        };
    });
}

function cargarEstado() {
    const guardado = leerAlmacen(STORAGE_KEY);
    if (!guardado) return;

    try {
        const estado = JSON.parse(guardado);
        inputCaja.value = estado.numCaja || '';
        datosTrailer = normalizarTarimas(estado.datosTrailer);
    } catch (error) {
        console.error('Error al recuperar el progreso guardado:', error);
        borrarAlmacen(STORAGE_KEY);
    }
}

// Lee los valores actuales (sin validar) de las filas del formulario de edición
function leerFilasEdicionDesdeDOM(contenedor) {
    return Array.from(contenedor.querySelectorAll('.fila-material-edit')).map(function(fila) {
        return {
            Número_Material: fila.querySelector('.edit-material').value,
            Cantidad_Piezas: fila.querySelector('.edit-cantidad').value,
            Referencia: fila.querySelector('.edit-referencia').value
        };
    });
}

// --- MOVIMIENTO, AVISOS Y CONTEO ---
// Duraciones en un solo lugar. El tope es 300 ms a propósito: el operador escanea sin
// levantar la vista del lector y una animación más larga lo hace esperar por adorno.
// MS_SALIDA y MS_DESLIZAMIENTO están duplicados en style.css (.tarima-saliendo y
// .tarima-deslizando): aquí marcan cuándo retirar el nodo o la clase, y si se cambian
// allá hay que cambiarlos acá. La entrada no aparece porque se retira sola con
// 'animationend' y su duración vive únicamente en el CSS.
const MS_SALIDA = 180;
const MS_DESLIZAMIENTO = 200;
const MS_AVISO_SALIDA = 180;
const MS_AVISO_VISIBLE = 3000;
const MS_CONTEO = 300;

// Un solo punto donde se consulta la preferencia del sistema. El CSS ya apaga sus
// propias animaciones con @media, pero el FLIP y el conteo de cifras se calculan en JS
// y no se enterarían: por eso también se pregunta aquí.
function prefiereMenosMovimiento() {
    return !!(window.matchMedia
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

// --- AVISOS (TOASTS) ---
// Sustituyen a los alert(). Un alert() congela el hilo y se traga el siguiente Enter
// del lector, así que a media captura llegaba a costar un escaneo. Los confirm() de
// borrado siguen bloqueando: ahí sí queremos que el operador se detenga.

function cerrarAviso(aviso) {
    clearTimeout(Number(aviso.dataset.temporizador));

    if (prefiereMenosMovimiento()) {
        aviso.remove();
        return;
    }

    aviso.classList.add('aviso-saliendo');
    setTimeout(function() { aviso.remove(); }, MS_AVISO_SALIDA);
}

function programarCierre(aviso) {
    clearTimeout(Number(aviso.dataset.temporizador));
    aviso.dataset.temporizador = setTimeout(function() {
        cerrarAviso(aviso);
    }, MS_AVISO_VISIBLE);
}

function mostrarAviso(texto) {
    // Si el mismo mensaje ya está en pantalla se le reinicia el reloj en vez de apilar
    // copias: al insistir con un escaneo inválido se llenaba la esquina de duplicados.
    // Los que ya se están desvaneciendo no cuentan: su retiro está programado, así que
    // reiniciarles el reloj dejaría el mensaje yéndose igual y sin toast de repuesto.
    const repetido = Array.from(contenedorAvisos.children).find(function(aviso) {
        return aviso.dataset.texto === texto
            && !aviso.classList.contains('aviso-saliendo');
    });

    if (repetido) {
        programarCierre(repetido);
        return;
    }

    const aviso = document.createElement('div');
    aviso.className = 'aviso';
    aviso.dataset.texto = texto;
    aviso.innerText = texto;

    // Poder cerrarlo de un clic: 3 s tapando la pantalla estorban si ya se leyó
    aviso.addEventListener('click', function() { cerrarAviso(aviso); });

    contenedorAvisos.appendChild(aviso);
    programarCierre(aviso);
}

// --- CONTEO DE LAS CIFRAS ---
// Guardadas por elemento y no en variables sueltas para poder cancelar la animación en
// curso: al escanear rápido llegan varios cambios antes de que termine la anterior.
const conteosEnCurso = new WeakMap();

// Lleva el número de su valor actual al nuevo en vez de saltar de golpe. Con el salto
// seco cuesta ver de reojo que la cifra cambió; el recorrido lo vuelve evidente sin
// obligar a mirar de frente.
function animarContador(elemento, valorFinal) {
    const enCurso = conteosEnCurso.get(elemento);
    if (enCurso) cancelAnimationFrame(enCurso.frame);

    // De dónde arranca: lo que se esté mostrando ahora mismo si veníamos a medio
    // recorrido, o el último valor confirmado si el contador estaba quieto.
    const valorInicial = enCurso
        ? enCurso.valor
        : Number(elemento.dataset.valor || 0);

    if (valorInicial === valorFinal || prefiereMenosMovimiento()) {
        conteosEnCurso.delete(elemento);
        elemento.dataset.valor = valorFinal;
        elemento.innerText = valorFinal.toLocaleString('es-MX');
        return;
    }

    const inicio = performance.now();

    function paso(ahora) {
        const avance = Math.min((ahora - inicio) / MS_CONTEO, 1);
        // Frena al final en vez de cortarse en seco
        const suavizado = 1 - Math.pow(1 - avance, 3);
        const valor = Math.round(valorInicial + (valorFinal - valorInicial) * suavizado);

        elemento.innerText = valor.toLocaleString('es-MX');

        if (avance < 1) {
            conteosEnCurso.set(elemento, { frame: requestAnimationFrame(paso), valor: valor });
            return;
        }

        // El valor definitivo sólo se sella al terminar: si se cancela a medio camino,
        // el siguiente conteo tiene que arrancar de lo que se está viendo.
        conteosEnCurso.delete(elemento);
        elemento.dataset.valor = valorFinal;
    }

    conteosEnCurso.set(elemento, {
        frame: requestAnimationFrame(paso),
        valor: valorInicial
    });
}

// --- ENTRADA, SALIDA Y DESLIZAMIENTO DE LAS TARIMAS ---

// Dónde está cada tarima en pantalla ahora mismo. Se toma ANTES de modificar los datos:
// es el "antes" que necesita el FLIP para saber cuánto se movió cada una.
function capturarGeometria() {
    const geometria = new Map();
    nodosTarima.forEach(function(entrada, posicion) {
        geometria.set(posicion, entrada.nodo.getBoundingClientRect());
    });
    return geometria;
}

// Saca la tarima del flujo del grid dejándola clavada donde estaba, y la desvanece
// encima. Es lo que permite que las siguientes se recorran de inmediato: si se quedara
// ocupando su celda, el hueco no aparecería hasta terminar la animación.
function animarSalida(nodo) {
    const contenedor = mapaTrailer.getBoundingClientRect();
    const propio = nodo.getBoundingClientRect();
    const estilos = getComputedStyle(mapaTrailer);

    // position:absolute se mide desde el borde interior del contenedor; el grid tiene
    // bordes laterales de 4px y sin descontarlos la tarima se recorre al desvanecerse.
    const bordeIzquierdo = parseFloat(estilos.borderLeftWidth) || 0;
    const bordeSuperior = parseFloat(estilos.borderTopWidth) || 0;

    nodo.style.position = 'absolute';
    nodo.style.left = (propio.left - contenedor.left - bordeIzquierdo) + 'px';
    nodo.style.top = (propio.top - contenedor.top - bordeSuperior) + 'px';
    nodo.style.width = propio.width + 'px';
    nodo.style.height = propio.height + 'px';
    nodo.style.pointerEvents = 'none';
    nodo.classList.add('tarima-saliendo');

    setTimeout(function() { nodo.remove(); }, MS_SALIDA);
}

// FLIP para las tarimas que se recorren al borrar una. Los nodos ya están dibujados en
// su lugar definitivo: se les aplica el desplazamiento inverso y se deja que la
// transición los traiga de vuelta a cero.
// El desfase de una posición es porque lo que hoy se ve en la posición P estaba en la
// P+1 antes de borrar; el nodo puede incluso ser otro, lo que se mueve es el contenido.
function deslizarTrasBorrado(geometriaPrevia, desdePosicion) {
    const enMovimiento = [];

    nodosTarima.forEach(function(entrada, posicion) {
        if (posicion < desdePosicion) return;

        const antes = geometriaPrevia.get(posicion + 1);
        if (!antes) return;

        const ahora = entrada.nodo.getBoundingClientRect();
        const dx = antes.left - ahora.left;
        const dy = antes.top - ahora.top;
        if (!dx && !dy) return;

        entrada.nodo.style.transform = `translate(${dx}px, ${dy}px)`;
        enMovimiento.push(entrada.nodo);
    });

    if (enMovimiento.length === 0) return;

    // Dos frames: el primero pinta las tarimas desplazadas y todavía sin transición. Si
    // se quitara el transform en el mismo frame, el navegador uniría ambos estados en
    // uno solo y no habría nada que animar.
    requestAnimationFrame(function() {
        requestAnimationFrame(function() {
            enMovimiento.forEach(function(nodo) {
                nodo.classList.add('tarima-deslizando');
                nodo.style.transform = '';
            });
        });
    });

    // La clase se retira al terminar para no dejar una transición colgada en un nodo
    // que después se reutiliza (el render conserva los que no cambiaron).
    setTimeout(function() {
        enMovimiento.forEach(function(nodo) {
            nodo.classList.remove('tarima-deslizando');
        });
    }, MS_DESLIZAMIENTO + 20);
}

// --- DIBUJO DEL TRÁILER (RENDER INCREMENTAL) ---
// Antes se hacía mapaTrailer.innerHTML = '' y se reconstruían todas las tarimas en cada
// cambio. Ahora se conserva el nodo de cada posición y sólo se rehace el que cambió: al
// escanear la tarima 12, las once anteriores ni se tocan (y no pierden su estado en
// pantalla ni una animación a medio correr).
// Clave = Posición_Tráiler (1..N); valor = { nodo, firma }.
const nodosTarima = new Map();

// Resume en un texto todo lo que se dibuja de una tarima. Si la firma no cambió, el nodo
// que ya está en pantalla sigue siendo válido y no se vuelve a construir.
// Se serializan arreglos (y no los objetos tal cual) por dos razones: el orden de las
// llaves difiere entre los datos migrados de versiones viejas y los recién capturados,
// y así cada campo queda delimitado, sin que un número de parte pueda "juntarse" con la
// cantidad y producir dos firmas iguales para tarimas distintas.
function firmaTarima(tarima) {
    return JSON.stringify(tarima.Materiales.map(function(m) {
        return [m.Número_Material, m.Cantidad_Piezas, m.Referencia || ''];
    }));
}

// --- CONSTRUCCIÓN DE UNA TARIMA ---

// Tarima normal: los materiales y los tres botones de la esquina
function construirVistaTarima(tarima) {
    const nodo = document.createElement('div');
    nodo.className = 'tarima';

    const lineasHtml = tarima.Materiales.map(function(m) {
        // La referencia sólo se dibuja si existe (los datos migrados no la traen)
        const refHtml = m.Referencia
            ? `<div class="linea-ref">Ref: ${escaparHtml(m.Referencia)}</div>`
            : '';

        return `
            <div class="linea-material">
                <div class="linea-encabezado">
                    <strong>${escaparHtml(m.Número_Material)}</strong>
                    <span>${m.Cantidad_Piezas} pcs</span>
                </div>
                ${refHtml}
            </div>
        `;
    }).join('');

    nodo.innerHTML = `
        <button class="btn-editar-tarima" title="Editar esta tarima">✎</button>
        <button class="btn-agregar-material" title="Agregar otro material a esta tarima">+</button>
        <button class="btn-eliminar-tarima" title="Eliminar esta tarima">×</button>
        <div class="lineas-material">${lineasHtml}</div>
    `;

    return nodo;
}

// Tarima abierta en formulario: editar sus materiales o agregar uno nuevo
function construirFormularioTarima(tarima) {
    const nodo = document.createElement('div');
    nodo.className = 'tarima';
    nodo.classList.add('tarima-editando');

    const esAlta = modoEdicion === 'agregar';

    // Al agregar, los materiales que ya tiene la tarima se muestran sólo de
    // referencia (no editables), para no repetir el formulario de edición.
    const existentesHtml = esAlta
        ? `<div class="lineas-existentes">` + tarima.Materiales.map(function(m) {
                return `
                    <div class="linea-existente">
                        <strong>${escaparHtml(m.Número_Material)}</strong>
                        <span>${m.Cantidad_Piezas} pcs</span>
                    </div>
                `;
            }).join('') + `</div>
            <div class="rotulo-alta">Nuevo material</div>`
        : '';

    const filasHtml = lineasEdicionTemp.map(function(linea) {
        return `
            <div class="fila-material-edit">
                <div class="fila-edit-top">
                    <input type="text" class="edit-material" value="${escaparHtml(linea.Número_Material)}" title="Material">
                    <input type="number" class="edit-cantidad" value="${escaparHtml(linea.Cantidad_Piezas)}" title="Cantidad">
                    <button class="btn-quitar-linea" title="Quitar este material">×</button>
                </div>
                <input type="text" class="edit-referencia" value="${escaparHtml(linea.Referencia || '')}" placeholder="Referencia" title="Referencia">
            </div>
        `;
    }).join('');

    nodo.innerHTML = `
        ${existentesHtml}
        <div class="lineas-edicion">${filasHtml}</div>
        <button class="btn-agregar-linea" type="button">+ Otro material</button>
        <div class="edit-acciones">
            <button class="btn-guardar-edicion" title="${esAlta ? 'Agregar a la tarima' : 'Guardar cambios'}">✓</button>
            <button class="btn-cancelar-edicion" title="Cancelar">×</button>
        </div>
    `;

    return nodo;
}

// Deja listo para escanear el primer material vacío del formulario (el recién agregado);
// si no hay ninguno, la primera fila.
function enfocarPrimeraFilaVacia(nodo) {
    const filas = nodo.querySelectorAll('.fila-material-edit');
    const indiceVacio = lineasEdicionTemp.findIndex(function(l) { return !l.Número_Material; });
    const inputAEnfocar = filas[indiceVacio >= 0 ? indiceVacio : 0].querySelector('.edit-material');
    inputAEnfocar.focus();
    inputAEnfocar.select();
}

// El primer nodo que sigue en el DOM después de una posición dada. Sirve para insertar
// una tarima nueva en su celda y no al final: al borrar, la posición liberada se vuelve
// a construir con el contenido de la siguiente y tiene que caer en su sitio.
function nodoDespuesDe(posicion) {
    for (let p = posicion + 1; p <= datosTrailer.length; p++) {
        const entrada = nodosTarima.get(p);
        if (entrada) return entrada.nodo;
    }
    return null;
}

// --- RENDER: SÓLO SE REHACE LO QUE CAMBIÓ ---
// opciones.entradaEn: posición que debe entrar animada (la tarima recién escaneada).
// Va como parámetro y no como "toda tarima nueva" porque al borrar también se crean
// nodos, y ahí lo que corresponde es deslizarse, no aparecer de golpe.
function renderizarTrailer(opciones) {
    const entradaEn = (opciones && opciones.entradaEn) || null;
    // 1. Corregir las posiciones (por si borramos una intermedia, se reajustan de 1 a N)
    renumerarPosiciones();

    // 2. Sincronizar el contador global con el tamaño real del arreglo
    totalTarimas = datosTrailer.length;
    animarContador(contadorTarimas, totalTarimas);

    // Actualizar totales y el agrupado por número de parte
    renderizarResumen();

    // 3. Sacar del mapa (y del DOM) las posiciones que ya no existen
    nodosTarima.forEach(function(entrada, posicion) {
        if (posicion > datosTrailer.length) {
            entrada.nodo.remove();
            nodosTarima.delete(posicion);
        }
    });

    let nodoEnEdicion = null;

    // 4. Recorrer los datos y fabricar sólo los cuadritos que cambiaron
    datosTrailer.forEach(function(tarima, index) {
        const posicion = index + 1;
        const esEdicion = index === editandoIndex;

        // El formulario siempre se rehace: lo que muestra vive en lineasEdicionTemp y no
        // en la tarima, así que la firma de los datos no alcanza para representarlo.
        // Guardar null también obliga a rehacerlo al cerrarlo, aunque los materiales
        // hayan quedado idénticos (cancelar una edición sin cambios).
        const firma = esEdicion ? null : firmaTarima(tarima);
        const previo = nodosTarima.get(posicion);

        // Nodo intacto: se conserva tal cual, con lo que tenga en curso
        if (previo && firma !== null && previo.firma === firma) return;

        const nodo = esEdicion
            ? construirFormularioTarima(tarima)
            : construirVistaTarima(tarima);

        // De aquí salen el índice y los datos al hacer clic (ver delegación)
        nodo.dataset.posicion = posicion;

        if (previo) {
            previo.nodo.replaceWith(nodo);
        } else {
            // insertBefore con null equivale a agregar al final
            mapaTrailer.insertBefore(nodo, nodoDespuesDe(posicion));

            if (posicion === entradaEn && !prefiereMenosMovimiento()) {
                nodo.classList.add('tarima-entrando');
                nodo.addEventListener('animationend', function() {
                    nodo.classList.remove('tarima-entrando');
                }, { once: true });
            }
        }

        nodosTarima.set(posicion, { nodo: nodo, firma: firma });

        if (esEdicion) nodoEnEdicion = nodo;
    });

    // 5. El formulario recién dibujado se lleva el foco, igual que antes
    if (nodoEnEdicion) enfocarPrimeraFilaVacia(nodoEnEdicion);
}

// --- ACCIONES SOBRE UNA TARIMA ---

// Del elemento donde ocurrió el evento a la tarima que lo contiene. La posición viaja en
// el dataset del nodo y se reescribe en cada render, así que siempre apunta al dato real.
function tarimaDesdeEvento(elemento) {
    const nodo = elemento.closest('.tarima');
    if (!nodo) return null;

    const index = Number(nodo.dataset.posicion) - 1;
    const tarima = datosTrailer[index];
    if (!tarima) return null;

    return { nodo: nodo, index: index, tarima: tarima };
}

function eliminarTarima(objetivo) {
    // Confirmar antes de borrar, mostrando el detalle de lo que se va a perder.
    // La "×" queda a unos pocos píxeles del "✎" y del "+", así que un clic
    // accidental podría tirar una tarima con varios materiales.
    const detalle = objetivo.tarima.Materiales
        .map(function(m) {
            const ref = m.Referencia ? ` — Ref: ${m.Referencia}` : '';
            return `  • ${m.Número_Material} — ${m.Cantidad_Piezas} pcs${ref}`;
        })
        .join('\n');

    if (!confirm(`¿Eliminar la tarima T-${objetivo.tarima.Posición_Tráiler}?\n\n${detalle}`)) {
        return;
    }

    const animar = !prefiereMenosMovimiento();

    // La foto de "dónde estaba cada tarima" se toma antes de tocar los datos: es el
    // punto de partida del deslizamiento de las que se recorren.
    const geometriaPrevia = animar ? capturarGeometria() : null;

    if (animar) {
        // El mapa suelta el nodo antes de sacarlo del flujo, para que el render no
        // intente reutilizarlo ni reemplazarlo a media animación de salida.
        nodosTarima.delete(objetivo.index + 1);
        animarSalida(objetivo.nodo);
    }

    // Borramos el elemento del arreglo usando su índice actual
    datosTrailer.splice(objetivo.index, 1);

    // Al quitar una tarima, todas las de atrás recorren su índice una posición.
    // Si había otra tarima abierta en modo edición hay que reajustar el puntero,
    // porque si no terminaríamos guardando esos materiales en la tarima equivocada.
    if (editandoIndex !== null) {
        if (objetivo.index === editandoIndex) {
            // Se borró justamente la que se estaba editando: cerramos el formulario
            cerrarFormulario();
        } else if (objetivo.index < editandoIndex) {
            editandoIndex--;
        }
    }

    guardarEstado();
    renderizarTrailer();

    // Ya con todo dibujado en su lugar definitivo, se manda a las tarimas de atrás
    // desde donde estaban hasta donde quedaron.
    if (animar) deslizarTrasBorrado(geometriaPrevia, objetivo.index + 1);
}

function guardarEdicion(objetivo) {
    const esAlta = modoEdicion === 'agregar';
    const filas = leerFilasEdicionDesdeDOM(objetivo.nodo);
    const materialesValidados = [];

    for (const fila of filas) {
        const matRaw = fila.Número_Material.trim();
        const cantRaw = String(fila.Cantidad_Piezas).trim();
        const refRaw = String(fila.Referencia || '').trim();

        // fila vacía sin usar, se ignora
        if (!matRaw && !cantRaw && !refRaw) continue;

        const mat = matRaw.toUpperCase();
        const cant = parseInt(cantRaw);
        const ref = refRaw.toUpperCase();

        if (!mat || isNaN(cant) || cant <= 0 || !ref) {
            mostrarAviso('Revisa los materiales: cada línea necesita número de material, una cantidad válida (mayor a 0) y referencia.');
            return;
        }
        materialesValidados.push({
            Número_Material: mat,
            Cantidad_Piezas: cant,
            Referencia: ref
        });
    }

    if (materialesValidados.length === 0) {
        mostrarAviso(esAlta
            ? 'Captura el material que quieres agregar, o cierra con la "×".'
            : 'La tarima debe tener al menos un material válido.');
        return;
    }

    // Al agregar sumamos a lo que ya traía; al editar reemplazamos todo
    objetivo.tarima.Materiales = esAlta
        ? objetivo.tarima.Materiales.concat(materialesValidados)
        : materialesValidados;

    cerrarFormulario();
    guardarEstado();
    renderizarTrailer();
}

function quitarLineaEdicion(objetivo, boton) {
    const filas = Array.from(objetivo.nodo.querySelectorAll('.fila-material-edit'));
    const i = filas.indexOf(boton.closest('.fila-material-edit'));
    if (i < 0) return;

    lineasEdicionTemp = leerFilasEdicionDesdeDOM(objetivo.nodo);

    if (lineasEdicionTemp.length <= 1) {
        if (modoEdicion === 'agregar') {
            // Quitar la única línea nueva equivale a cancelar el alta
            cerrarFormulario();
            renderizarTrailer();
            return;
        }
        mostrarAviso('Una tarima debe tener al menos un material. Para quitarla por completo usa la "×" de la tarima.');
        return;
    }

    lineasEdicionTemp.splice(i, 1);
    renderizarTrailer();
}

// Agrega una fila en blanco al formulario, conservando lo ya capturado en pantalla
function agregarLineaEdicion(objetivo) {
    lineasEdicionTemp = leerFilasEdicionDesdeDOM(objetivo.nodo);
    lineasEdicionTemp.push({ Número_Material: '', Cantidad_Piezas: '', Referencia: '' });
    renderizarTrailer();
}

// --- DELEGACIÓN DE EVENTOS ---
// Un solo par de listeners en el contenedor, montados una vez. Antes se reasignaban a
// cada tarima en cada render; ahora los nodos se reutilizan, así que enganchar por nodo
// duplicaría listeners en unos casos y los dejaría sin montar en otros.

mapaTrailer.addEventListener('click', function(e) {
    const boton = e.target.closest('button');
    if (!boton) return;

    const objetivo = tarimaDesdeEvento(boton);
    if (!objetivo) return;

    if (boton.classList.contains('btn-eliminar-tarima')) {
        eliminarTarima(objetivo);

    } else if (boton.classList.contains('btn-editar-tarima')) {
        // El lápiz trae todos los materiales para modificarlos
        editandoIndex = objetivo.index;
        modoEdicion = 'editar';
        lineasEdicionTemp = objetivo.tarima.Materiales.map(function(m) {
            return {
                Número_Material: m.Número_Material,
                Cantidad_Piezas: String(m.Cantidad_Piezas),
                Referencia: m.Referencia || ''
            };
        });
        renderizarTrailer();

    } else if (boton.classList.contains('btn-agregar-material')) {
        // El "+" va DIRECTO al alta, con una sola línea en blanco. Los materiales que
        // ya trae la tarima no se vuelven a abrir para editar.
        editandoIndex = objetivo.index;
        modoEdicion = 'agregar';
        lineasEdicionTemp = [{ Número_Material: '', Cantidad_Piezas: '', Referencia: '' }];
        renderizarTrailer();

    } else if (boton.classList.contains('btn-guardar-edicion')) {
        guardarEdicion(objetivo);

    } else if (boton.classList.contains('btn-cancelar-edicion')) {
        cerrarFormulario();
        renderizarTrailer();

    } else if (boton.classList.contains('btn-agregar-linea')) {
        agregarLineaEdicion(objetivo);

    } else if (boton.classList.contains('btn-quitar-linea')) {
        quitarLineaEdicion(objetivo, boton);
    }
});

// Misma cadena que el panel de captura: material -> cantidad -> referencia
mapaTrailer.addEventListener('keypress', function(e) {
    if (e.key !== 'Enter') return;

    const campo = e.target;
    const fila = campo.closest ? campo.closest('.fila-material-edit') : null;
    if (!fila) return;

    if (campo.classList.contains('edit-material')) {
        e.preventDefault();
        fila.querySelector('.edit-cantidad').focus();
        return;
    }

    if (campo.classList.contains('edit-cantidad')) {
        e.preventDefault();
        fila.querySelector('.edit-referencia').focus();
        return;
    }

    if (!campo.classList.contains('edit-referencia')) return;
    e.preventDefault();

    const objetivo = tarimaDesdeEvento(campo);
    if (!objetivo) return;

    const filas = Array.from(objetivo.nodo.querySelectorAll('.fila-material-edit'));
    const i = filas.indexOf(fila);

    if (i === filas.length - 1) {
        // Enter en la última línea: agrega otra fila lista para escanear
        agregarLineaEdicion(objetivo);
    } else {
        filas[i + 1].querySelector('.edit-material').focus();
    }
});

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



// Escanear Cantidad: valida y pasa a Referencia
inputCantidad.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();

        const cantidad = parseInt(inputCantidad.value.trim());

        if (isNaN(cantidad) || cantidad <= 0) {
            mostrarAviso("Cantidad inválida");
            inputCantidad.focus();
            return;
        }

        inputReferencia.focus();
    }
});

// Escanear Referencia: cierra el ciclo -> Procesa, Dibuja y Regresa a Material
inputReferencia.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();

        const material = inputMaterial.value.trim().toUpperCase();
        const cantidad = parseInt(inputCantidad.value.trim());
        const referencia = inputReferencia.value.trim().toUpperCase();

        // Validar campos vacíos
        if (!material || isNaN(cantidad) || cantidad <= 0 || !referencia) {
            mostrarAviso("Faltan datos: se necesita material, cantidad válida y referencia.");
            if (!material) {
                inputMaterial.focus();
            } else if (isNaN(cantidad) || cantidad <= 0) {
                inputCantidad.focus();
            } else {
                inputReferencia.focus();
            }
            return;
        }

       // Validar límite físico usando el tamaño real del array
        if (datosTrailer.length >= MAX_CAPACIDAD) {
            mostrarAviso(`¡ALTO! La caja del tráiler está llena (${MAX_CAPACIDAD} tarimas máximo).`);
            inputMaterial.value = '';
            inputCantidad.value = '';
            inputReferencia.value = '';
            inputMaterial.focus();
            return;
        }

        // Guardar los datos limpios
        datosTrailer.push({
            "Posición_Tráiler": datosTrailer.length + 1,
            "Materiales": [
                {
                    "Número_Material": material,
                    "Cantidad_Piezas": cantidad,
                    "Referencia": referencia
                }
            ]
        });

        // Guardar progreso y llamar a nuestra función de dibujo. La posición recién
        // ocupada es la última, y es la única que debe entrar animada.
        guardarEstado();
        renderizarTrailer({ entradaEn: datosTrailer.length });

        // Limpiar para el siguiente ciclo del escáner
        inputMaterial.value = '';
        inputCantidad.value = '';
        inputReferencia.value = '';
        inputMaterial.focus();
    }
});

// Guardar el número de caja a medida que se escribe/escanea
inputCaja.addEventListener('input', guardarEstado);

// --- CARGA DEL GENERADOR DE EXCEL (SheetJS) ---
// index.html ya carga ./JS/xlsx.full.min.js con "defer", así que al pulsar Exportar la
// librería normalmente está lista. Esta función es la red por si no lo está: la etiqueta
// pudo fallar porque el archivo se movió o se perdió al copiar la carpeta. Reintenta una
// sola vez y, si tampoco, devuelve un error que dice exactamente qué falta.
let cargaXlsxEnCurso = null;

function asegurarXLSX() {
    // Ya está cargada: no hay nada que hacer
    if (typeof XLSX !== 'undefined') return Promise.resolve();

    // Ya se está reintentando: reutilizamos la misma promesa
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
    // 1. Generar nombre de archivo dinámico: sólo lo capturado en el primer campo
    //    más la fecha, sin ningún texto fijo antepuesto.
    const titulo = inputCaja.value.trim().toUpperCase() || 'SIN-TITULO';
    const hoy = new Date();
    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const dia = String(hoy.getDate()).padStart(2, '0');
    const nombreSugerido = `${titulo}-${mes}-${dia}-${anio}.xlsx`;

    try {
        // --- HOJA 1: MAPA VISUAL ---
        // Construimos una matriz de filas y columnas
        const matrizMapa = [];

        // Los rótulos ocupan la caja entera a lo ancho. Devuelve una fila nueva cada vez
        // para que las filas de la matriz no compartan el mismo arreglo.
        const filaCompleta = function(texto) {
            return Array(COLUMNAS_TRAILER).fill(texto);
        };

        // Cabecera visual
        matrizMapa.push(filaCompleta("=== FRENTE DEL TRÁILER ==="));

        // Crear la estructura vacía: una fila por posición de fondo
        for (let i = 0; i < FILAS_TRAILER; i++) {
            matrizMapa.push(filaCompleta("(Vacío)"));
        }

        // Llenar las coordenadas exactas con los datos escaneados
        datosTrailer.forEach(tarima => {
            const index = tarima.Posición_Tráiler - 1; // Índice de 0 a MAX_CAPACIDAD - 1

            // Cálculos matemáticos simples para saber la celda exacta
            const filaExcel = Math.floor(index / COLUMNAS_TRAILER) + 1; // +1 porque la fila 0 es el Frente
            const columnaExcel = index % COLUMNAS_TRAILER; // 0 (Izquierda) o 1 (Derecha)

            // Si hay varios materiales en la misma tarima, se listan uno tras otro.
            // La referencia no se incluye aquí a propósito: el mapa es para ubicar la
            // tarima de un vistazo, y el detalle completo vive en la hoja Datos_ETL.
            const detalleMateriales = tarima.Materiales
                .map(m => `${m.Número_Material} | ${m.Cantidad_Piezas} pcs`)
                .join('  +  ');

            // Formatear el texto de cada cuadrito en el Excel
            matrizMapa[filaExcel][columnaExcel] = `[T-${tarima.Posición_Tráiler}] ${detalleMateriales}`;
        });

        // Puertas
        matrizMapa.push(filaCompleta("=== PUERTAS ==="));

        // Convertir la matriz a hoja de Excel
        const hojaMapa = XLSX.utils.aoa_to_sheet(matrizMapa);

        // Ajustar el ancho de las columnas para que el texto no se corte. Un objeto
        // distinto por columna: SheetJS los trata como suyos y compartir uno solo
        // dejaría que un ajuste interno afectara a todas.
        hojaMapa['!cols'] = Array.from({ length: COLUMNAS_TRAILER }, function() {
            return { wch: 35 };
        });


        // --- HOJA 2: DATOS TABULARES ---
        // Una fila por material: si una tarima tiene 2+ materiales, se generan 2+ filas
        // con la misma tarima, para que el ETL no pierda ninguno.
        // El número va como valor numérico (no como texto "Tarima 1") para que en Excel
        // se pueda ordenar y filtrar correctamente; la etiqueta va en el encabezado.
        const filasDatos = [];
        datosTrailer.forEach(tarima => {
            tarima.Materiales.forEach(m => {
                filasDatos.push({
                    "Tarima": tarima.Posición_Tráiler,
                    "Número_Material": m.Número_Material,
                    "Cantidad_Piezas": m.Cantidad_Piezas,
                    "Referencia": m.Referencia || ''
                });
            });
        });
        const hojaDatos = XLSX.utils.json_to_sheet(filasDatos);
        hojaDatos['!cols'] = [{ wch: 10 }, { wch: 28 }, { wch: 16 }, { wch: 22 }];


        // --- HOJA 3: RESUMEN POR NÚMERO DE PARTE ---
        // Agrupado listo para cotejar contra el packing list, con gran total al final.
        const filasResumen = calcularResumenMateriales().map(function(r) {
            return {
                "Número_Material": r.material,
                "Tarimas": r.tarimas,
                "Total_Piezas": r.piezas
            };
        });

        filasResumen.push({
            "Número_Material": "TOTAL GENERAL",
            "Tarimas": datosTrailer.length,
            "Total_Piezas": calcularTotalPiezas()
        });

        const hojaResumen = XLSX.utils.json_to_sheet(filasResumen);
        hojaResumen['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 14 }];


        // --- ARMAR EL LIBRO DE EXCEL CON LAS TRES HOJAS ---
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hojaMapa, "Mapa_Visual");
        XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");
        XLSX.utils.book_append_sheet(libro, hojaDatos, "Datos_ETL");

        // --- DESCARGAR EL ARCHIVO NATIVAMENTE ---
        XLSX.writeFile(libro, nombreSugerido);

    } catch (error) {
        console.error("Error crítico al generar Excel:", error);
        mostrarAviso("Hubo un problema al generar el archivo. Presiona F12 para ver el error.");
    }
}

document.getElementById('btnExportar').addEventListener('click', function() {
    if (datosTrailer.length === 0) {
        mostrarAviso("No hay datos para exportar. Escanea al menos una tarima.");
        return;
    }

    // Nos aseguramos de tener SheetJS (CDN o copia local) antes de armar el archivo
    asegurarXLSX()
        .then(generarExcel)
        .catch(function(error) {
            console.error('No se pudo cargar SheetJS:', error);
            mostrarAviso('No se pudo cargar el generador de Excel.\n\nRevisa que exista el archivo JS/xlsx.full.min.js junto a la página.');
        });
});

// --- BOTÓN CANCELAR / LIMPIAR ---
document.getElementById('btnCancelar').addEventListener('click', function() {
    if(confirm("¿Estás seguro de que quieres borrar todo el progreso actual?")) {
        // Reiniciar el estado en memoria
        datosTrailer = [];
        cerrarFormulario();

        // Borrar también el progreso guardado
        borrarAlmacen(STORAGE_KEY);

        // Limpiar los campos de captura
        inputCaja.value = '';
        inputMaterial.value = '';
        inputCantidad.value = '';
        inputReferencia.value = '';

        // Redibujar desde el estado ya vacío: esto limpia de una sola vez el mapa,
        // el contador de tarimas, el total de piezas y la tabla de resumen.
        // (Antes se limpiaba a mano y se olvidaban los elementos nuevos.)
        renderizarTrailer();

        inputCaja.focus();
    }
});

// --- TEMA CLARO / OSCURO ---
// La preferencia se guarda con su propia llave, aparte del avance de la caja, para que
// el botón "Cancelar" no la borre. El tema inicial ya lo aplicó el script de index.html.
const TEMA_KEY = 'generadorCajaTema';
const btnTema = document.getElementById('btnTema');

function temaActual() {
    return document.documentElement.getAttribute('data-theme') === 'claro' ? 'claro' : 'oscuro';
}

function aplicarTema(tema) {
    document.documentElement.setAttribute('data-theme', tema);

    // El icono muestra hacia dónde se cambia, no el estado actual
    const esOscuro = tema === 'oscuro';
    btnTema.innerText = esOscuro ? '☀' : '☾';
    btnTema.title = esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
}

btnTema.addEventListener('click', function() {
    const nuevo = temaActual() === 'oscuro' ? 'claro' : 'oscuro';
    try {
        localStorage.setItem(TEMA_KEY, nuevo);
    } catch (error) {
        console.error('No se pudo guardar la preferencia de tema:', error);
    }
    aplicarTema(nuevo);
});

// Sincronizar el icono con el tema que ya venía aplicado
aplicarTema(temaActual());

// --- RECUPERAR PROGRESO GUARDADO AL CARGAR LA PÁGINA ---
cargarEstado();
renderizarTrailer();