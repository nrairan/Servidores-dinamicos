/* ==========================================================
   Panel de administración de servidores dinámicos
   Consume la API del balanceador con fetch().

   Endpoints utilizados (balanceador.py, sin modificar):
     GET /servidores    -> lista de servidores y su estado
     GET /solicitud     -> envía una solicitud al balanceador
     GET /estadisticas  -> solicitudes atendidas por servidor

   Nota: el enunciado menciona /solicitar, pero la API desarrollada en
   clase expone la ruta /solicitud, y la API no se debe modificar.
   ========================================================== */

"use strict";

/* ---------- Configuración ---------- */

const API_URL = "http://127.0.0.1:8000"; // dirección donde corre el balanceador
const TIEMPO_MAXIMO_MS = 10000;          // el balanceador puede tardar hasta ~6 s si hay servidores caídos
const INTERVALO_AUTOMATICO_MS = 5000;
const MAXIMO_MENSAJES = 60;

/* ---------- Referencias al DOM ---------- */

const $ = (id) => document.getElementById(id);

const ui = {
  conexionLed: $("conexion-led"),
  conexionTexto: $("conexion-texto"),
  totalSolicitudes: $("total-solicitudes"),
  totalServidores: $("total-servidores"),
  detalleServidores: $("detalle-servidores"),
  tablaServidores: $("tabla-servidores"),
  resultado: $("resultado"),
  estadisticas: $("estadisticas"),
  mensajes: $("mensajes"),
  btnActualizar: $("btn-actualizar"),
  btnSolicitud: $("btn-solicitud"),
  btnEstadisticas: $("btn-estadisticas"),
  btnLimpiar: $("btn-limpiar"),
  autoActualizar: $("auto-actualizar"),
};

/* ---------- Estado de la aplicación ---------- */

let servidores = [];          // última lista recibida de /servidores
let firmaServidores = null;   // sirve para avisar solo cuando algo cambia
let temporizador = null;

/* ---------- Utilidades ---------- */

function crear(etiqueta, clase, texto) {
  const nodo = document.createElement(etiqueta);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = texto;
  return nodo;
}

function vaciar(nodo) {
  while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
}

/**
 * Llama a la API y devuelve el JSON. Si algo falla lanza un Error con:
 *   - error.red = true       cuando no hubo conexión o se agotó el tiempo
 *   - error.estado = número  cuando la API respondió con un código HTTP de error
 */
async function pedir(ruta) {
  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), TIEMPO_MAXIMO_MS);

  let respuesta;
  try {
    respuesta = await fetch(API_URL + ruta, { signal: controlador.signal });
  } catch (fallo) {
    const error = new Error(
      fallo.name === "AbortError"
        ? "La API tardó demasiado en responder."
        : "No se pudo conectar con la API en " + API_URL + "."
    );
    error.red = true;
    throw error;
  } finally {
    clearTimeout(reloj);
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch (_) {
    datos = null;
  }

  if (!respuesta.ok) {
    const detalle = datos && typeof datos.detail === "string" ? datos.detail : null;
    const error = new Error(detalle || "La API respondió con el código " + respuesta.status + ".");
    error.estado = respuesta.status;
    throw error;
  }
  return datos;
}

/* ---------- Mensajes del sistema ---------- */

function agregarMensaje(tipo, texto) {
  const hora = new Date().toLocaleTimeString("es-CO", { hour12: false });
  const item = crear("li", "mensaje mensaje--" + tipo);
  item.appendChild(crear("span", "mensaje__hora", hora));
  item.appendChild(crear("span", "mensaje__texto", texto));
  ui.mensajes.prepend(item);

  while (ui.mensajes.children.length > MAXIMO_MENSAJES) {
    ui.mensajes.removeChild(ui.mensajes.lastChild);
  }
}

/* ---------- Indicador de conexión con la API ---------- */

function marcarConexion(conectada) {
  ui.conexionLed.className = "led " + (conectada ? "led--verde" : "led--rojo");
  ui.conexionTexto.textContent = conectada ? "API conectada" : "Sin conexión con la API";
}

/* ==========================================================
   1. Servidores  ->  GET /servidores
   ========================================================== */

function dibujarServidores(lista) {
  vaciar(ui.tablaServidores);

  if (lista.length === 0) {
    const fila = crear("tr");
    const celda = crear("td", "vacio", "La API no tiene servidores configurados.");
    celda.colSpan = 3;
    fila.appendChild(celda);
    ui.tablaServidores.appendChild(fila);
    return;
  }

  lista.forEach((servidor) => {
    const activo = servidor.estado === "activo";
    const fila = crear("tr", activo ? "fila--activo" : "fila--inactivo");

    fila.appendChild(crear("td", null, servidor.nombre));
    fila.appendChild(crear("td", "num", String(servidor.puerto)));

    const celdaEstado = crear("td");
    const etiqueta = crear("span", "estado " + (activo ? "estado--activo" : "estado--inactivo"));
    etiqueta.appendChild(crear("span", "led"));
    etiqueta.appendChild(document.createTextNode(activo ? "Activo" : "Inactivo"));
    celdaEstado.appendChild(etiqueta);
    fila.appendChild(celdaEstado);

    ui.tablaServidores.appendChild(fila);
  });
}

function dibujarServidoresSinDatos(texto) {
  vaciar(ui.tablaServidores);
  const fila = crear("tr");
  const celda = crear("td", "vacio", texto);
  celda.colSpan = 3;
  fila.appendChild(celda);
  ui.tablaServidores.appendChild(fila);
}

async function cargarServidores(manual) {
  try {
    const datos = await pedir("/servidores");
    servidores = Array.isArray(datos.servidores) ? datos.servidores : [];

    const activos = servidores.filter((s) => s.estado === "activo").length;
    const inactivos = servidores.length - activos;

    dibujarServidores(servidores);
    ui.totalServidores.textContent = String(datos.total_servidores);
    ui.detalleServidores.textContent =
      activos + (activos === 1 ? " activo" : " activos") + " y " +
      inactivos + (inactivos === 1 ? " inactivo" : " inactivos");
    marcarConexion(true);

    // Para no llenar el registro con la actualización automática,
    // solo se informa cuando el usuario actualiza o cuando algo cambió.
    const firma = servidores.map((s) => s.nombre + ":" + s.estado).join("|");
    const cambio = firma !== firmaServidores;
    firmaServidores = firma;

    if (activos === 0 && servidores.length > 0) {
      if (manual || cambio) {
        agregarMensaje(
          "aviso",
          "No hay servidores disponibles: los " + servidores.length +
          " servidores configurados están inactivos. Inícielos y pulse Actualizar servidores."
        );
      }
    } else if (manual || cambio) {
      agregarMensaje(
        inactivos > 0 ? "aviso" : "ok",
        "Servidores consultados: " + activos + " activos de " + servidores.length +
        (inactivos > 0 ? " (hay servidores inactivos)." : ".")
      );
    }
  } catch (error) {
    marcarConexion(false);
    firmaServidores = null;
    ui.totalServidores.textContent = "—";
    ui.detalleServidores.textContent = "no se pudo consultar la API";
    dibujarServidoresSinDatos("No se pudo obtener la lista de servidores.");
    agregarMensaje(
      "error",
      error.red
        ? error.message + " Compruebe que el balanceador está en ejecución."
        : "No se pudieron consultar los servidores. " + error.message
    );
  }
}

/* ==========================================================
   2. Enviar solicitud  ->  GET /solicitud
   ========================================================== */

function mostrarRespuesta(titulo, filas, esError) {
  vaciar(ui.resultado);
  const caja = crear("div", "respuesta" + (esError ? " respuesta--error" : ""));
  caja.appendChild(crear("p", "respuesta__titulo", titulo));

  if (filas.length > 0) {
    const lista = crear("dl", "respuesta__lista");
    filas.forEach(([clave, valor]) => {
      lista.appendChild(crear("dt", null, clave));
      lista.appendChild(crear("dd", null, valor));
    });
    caja.appendChild(lista);
  }
  ui.resultado.appendChild(caja);
}

async function enviarSolicitud() {
  ui.btnSolicitud.disabled = true;
  ui.btnSolicitud.textContent = "Enviando…";

  try {
    const datos = await pedir("/solicitud");

    mostrarRespuesta("Solicitud atendida", [
      ["Servidor", String(datos.servidor)],
      ["Puerto", String(datos.puerto)],
      ["Solicitudes de este servidor", String(datos.solicitudes_atendidas)],
      ["Resultado", String(datos.resultado)],
    ], false);

    agregarMensaje(
      "ok",
      "Solicitud atendida por " + datos.servidor + " (puerto " + datos.puerto + "): " + datos.resultado + "."
    );
    marcarConexion(true);
  } catch (error) {
    if (error.estado === 503) {
      mostrarRespuesta("No hay servidores disponibles", [
        ["Qué pasó", "El balanceador no encontró ningún servidor que pudiera atender la solicitud."],
        ["Qué hacer", "Inicie al menos un servidor y pulse Actualizar servidores."],
      ], true);
      agregarMensaje("error", "La solicitud no se pudo procesar: no hay servidores disponibles.");
    } else if (error.red) {
      marcarConexion(false);
      mostrarRespuesta("La solicitud no se pudo enviar", [
        ["Qué pasó", error.message],
        ["Qué hacer", "Compruebe que el balanceador está en ejecución."],
      ], true);
      agregarMensaje("error", "La solicitud no se pudo enviar. " + error.message);
    } else {
      mostrarRespuesta("La solicitud no se pudo procesar", [["Detalle", error.message]], true);
      agregarMensaje("error", "Ocurrió un error durante la solicitud. " + error.message);
    }
  } finally {
    ui.btnSolicitud.disabled = false;
    ui.btnSolicitud.textContent = "Enviar solicitud";
  }

  // Tras cada solicitud se actualizan las estadísticas y el estado de los servidores.
  await Promise.all([cargarEstadisticas(), cargarServidores(false)]);
}

/* ==========================================================
   3. Estadísticas  ->  GET /estadisticas
   ========================================================== */

function dibujarEstadisticas(total, porServidor) {
  vaciar(ui.estadisticas);

  // Primero los servidores conocidos (aunque tengan 0 solicitudes), luego cualquier otro que aparezca.
  const nombres = servidores.map((s) => s.nombre);
  Object.keys(porServidor).forEach((nombre) => {
    if (!nombres.includes(nombre)) nombres.push(nombre);
  });

  if (nombres.length === 0) {
    ui.estadisticas.appendChild(crear("p", "vacio", "Todavía no hay solicitudes registradas."));
    return;
  }

  nombres.forEach((nombre) => {
    const cantidad = porServidor[nombre] || 0;
    const porcentaje = total > 0 ? (cantidad / total) * 100 : 0;

    const fila = crear("div", "barra__fila");
    fila.appendChild(crear("span", "barra__nombre", nombre));

    const pista = crear("div", "barra__pista");
    pista.setAttribute("role", "progressbar");
    pista.setAttribute("aria-label", "Solicitudes de " + nombre);
    pista.setAttribute("aria-valuemin", "0");
    pista.setAttribute("aria-valuemax", "100");
    pista.setAttribute("aria-valuenow", String(Math.round(porcentaje)));
    const relleno = crear("div", "barra__relleno");
    relleno.style.width = porcentaje + "%";
    pista.appendChild(relleno);
    fila.appendChild(pista);

    const valor = crear("span", "barra__valor", String(cantidad));
    valor.appendChild(crear("small", null, " (" + Math.round(porcentaje) + " %)"));
    fila.appendChild(valor);

    ui.estadisticas.appendChild(fila);
  });
}

async function cargarEstadisticas(manual) {
  try {
    const datos = await pedir("/estadisticas");
    const total = Number(datos.total_solicitudes) || 0;

    ui.totalSolicitudes.textContent = String(total);
    dibujarEstadisticas(total, datos.solicitudes_por_servidor || {});
    marcarConexion(true);

    if (manual) agregarMensaje("info", "Estadísticas actualizadas: " + total + " solicitudes atendidas en total.");
  } catch (error) {
    marcarConexion(false);
    ui.totalSolicitudes.textContent = "—";
    vaciar(ui.estadisticas);
    ui.estadisticas.appendChild(crear("p", "vacio", "No se pudieron cargar las estadísticas."));
    agregarMensaje("error", "No se pudieron consultar las estadísticas. " + error.message);
  }
}

/* ==========================================================
   Actualización automática y eventos
   ========================================================== */

function alternarActualizacionAutomatica() {
  if (ui.autoActualizar.checked) {
    temporizador = setInterval(() => {
      cargarServidores(false);
      cargarEstadisticas(false);
    }, INTERVALO_AUTOMATICO_MS);
    agregarMensaje("info", "Actualización automática activada (cada " + INTERVALO_AUTOMATICO_MS / 1000 + " s).");
  } else {
    clearInterval(temporizador);
    temporizador = null;
    agregarMensaje("info", "Actualización automática desactivada.");
  }
}

ui.btnActualizar.addEventListener("click", async () => {
  ui.btnActualizar.disabled = true;
  await cargarServidores(true);
  ui.btnActualizar.disabled = false;
});

ui.btnSolicitud.addEventListener("click", enviarSolicitud);

ui.btnEstadisticas.addEventListener("click", async () => {
  ui.btnEstadisticas.disabled = true;
  await cargarEstadisticas(true);
  ui.btnEstadisticas.disabled = false;
});

ui.btnLimpiar.addEventListener("click", () => vaciar(ui.mensajes));
ui.autoActualizar.addEventListener("change", alternarActualizacionAutomatica);

/* ---------- Carga inicial ---------- */

(async function iniciar() {
  agregarMensaje("info", "Panel iniciado. Consultando la API en " + API_URL + ".");
  await cargarServidores(true);   // primero los servidores, para que las estadísticas incluyan los que tienen 0
  await cargarEstadisticas(false);
})();
