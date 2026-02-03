// produccion_nomina_v5_app.js
// Backend V5: Funcionalidades completas con sistema de pagos y gestión avanzada
// Puerto 8080 | Persistencia mejorada con backups automáticos
// Compatible con frontend moderno glassmorphism

const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 8080;


app.use(express.json());

// Servir archivos estáticos si existe la carpeta public
const publicPath = path.join(__dirname, "public");
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
}

// ========================= 
// RUTAS DEL FRONTEND
// =========================

/**
 * Función helper para servir archivos HTML
 */
function servirPagina(nombreArchivo) {
  return (req, res) => {
    const filePath = path.join(__dirname, "public", nombreArchivo);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Archivo no encontrado</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 3rem;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
            h1 { margin: 0 0 1rem 0; }
            a { color: #fbbf24; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Archivo no encontrado</h1>
            <p>No se encontró: <strong>${nombreArchivo}</strong></p>
            <p>Asegúrate de tener la carpeta <strong>/public</strong> con todos los archivos HTML.</p>
            <p><a href="/">← Volver al inicio</a></p>
          </div>
        </body>
        </html>
      `);
    }
  };
}

// Ruta principal: Login
app.get("/", servirPagina("login.html"));
app.get("/login", servirPagina("login.html"));
app.get("/login.html", servirPagina("login.html"));

// Dashboard
app.get("/dashboard", servirPagina("dashboard_mobile.html"));
app.get("/dashboard.html", servirPagina("dashboard_mobile.html"));

// Módulos
app.get("/produccion", servirPagina("produccion.html"));
app.get("/produccion.html", servirPagina("produccion.html"));

// Registrar costura - Página separada para encargada y operarias
app.get("/registrar_costura", servirPagina("registrar_costura.html"));
app.get("/registrar_costura.html", servirPagina("registrar_costura.html"));

app.get("/operarias", servirPagina("operarias.html"));
app.get("/operarias.html", servirPagina("operarias.html"));

app.get("/pedidos", servirPagina("pedidos.html"));
app.get("/pedidos.html", servirPagina("pedidos.html"));

app.get("/reporte_semanal", servirPagina("reporte_semanal.html"));
app.get("/reporte_semanal.html", servirPagina("reporte_semanal.html"));

app.get("/configuracion", servirPagina("configuracion.html"));
app.get("/configuracion.html", servirPagina("configuracion.html"));

const DATA_FILE = path.join(__dirname, "datos_taller.json");

// =========================
// VARIABLES GLOBALES
// =========================
let operarias = [];
let maquinas = [];
let pedidos = [];
let registros = [];
let operariaIdCounter = 1;
let pedidoIdCounter = 1;
let registroIdCounter = 1;

// Array de prendas predeterminadas
let prendas = [
  { id: 1, nombre: "Playera polo" },
  { id: 2, nombre: "Playera deportiva" },
  { id: 3, nombre: "Pants" },
  { id: 4, nombre: "Chamarra" },
  { id: 5, nombre: "Pantalón gala" },
  { id: 6, nombre: "Camisa gala" },
  { id: 7, nombre: "Short deportivo" },
  { id: 8, nombre: "Short gala" },
  { id: 9, nombre: "Falda" },
  { id: 10, nombre: "Short falda" },
  { id: 11, nombre: "Yumper" },
  { id: 12, nombre: "Blusa" },
  { id: 13, nombre: "Bata" }
];

// Usuarios para admin y encargada (para cambio de credenciales)
let usuarios = [
  { id: 1, nombre: "admin", password: "admin123", tipo: "admin" },
  { id: 2, nombre: "encargada", password: "enc2025", tipo: "encargada" }
];

// =========================
// PERSISTENCIA OPTIMIZADA CON CACHÉ
// =========================

// Variables para optimización
let datosEnMemoria = null;
let ultimoCambio = Date.now();
let guardadoPendiente = false;
let timeoutGuardado = null;
let guardadoReintentar = false; // si hay cambios mientras se guarda


/**
 * Carga datos desde el archivo JSON
 * Solo carga 1 vez y mantiene en memoria (caché)
 */
function cargarDatos() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      console.log("📖 Cargando datos desde " + DATA_FILE + "...");
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(raw);

      operarias = data.operarias || [];
      maquinas = data.maquinas || [];
      pedidos = data.pedidos || [];
      registros = data.registros || [];
      prendas = data.prendas || prendas;
      usuarios = data.usuarios || usuarios;

      operariaIdCounter = data.operariaIdCounter || (operarias.length + 1);
      pedidoIdCounter = data.pedidoIdCounter || (pedidos.length + 1);
      registroIdCounter = data.registroIdCounter || (registros.length + 1);

      // Guardar en caché
      datosEnMemoria = data;

      console.log("✅ Datos cargados exitosamente");
      console.log(`   - ${operarias.length} operarias`);
      console.log(`   - ${pedidos.length} pedidos`);
      console.log(`   - ${registros.length} registros`);
      return;
    }
  } catch (err) {
    console.error("❌ Error cargando datos:", err.message);
  }

  // Si no hay archivo o hubo error, iniciamos con datos base
  console.log("📝 Inicializando con datos de ejemplo...");
  
  operarias = [
    { id: 1, nombre: "Ana", password: "1234", usuario: "ana", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 2, nombre: "Lupita", password: "1234", usuario: "lupita", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 3, nombre: "María", password: "1234", usuario: "maria", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 4, nombre: "Claudia", password: "1234", usuario: "claudia", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 5, nombre: "Rosa", password: "1234", usuario: "rosa", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 6, nombre: "Carmen", password: "1234", usuario: "carmen", rol: "operaria", pagoPorPrenda: 0, activa: true }
  ];
  operariaIdCounter = 7;

  maquinas = ["Recta", "Over", "Collareta", "Otra"];

  pedidos = [
    { id: 1, escuela: "Primaria Benito Juárez", folio: "FOL-001", pagoPorPieza: 2.5, estado: "activo", fechaTerminado: null },
    { id: 2, escuela: "Secundaria 20 de Noviembre", folio: "FOL-002", pagoPorPieza: 3.0, estado: "activo", fechaTerminado: null },
    { id: 3, escuela: "Colegio Las Américas", folio: "FOL-003", pagoPorPieza: 2.8, estado: "activo", fechaTerminado: null }
  ];
  pedidoIdCounter = 4;

  registros = [];
  registroIdCounter = 1;

  guardarDatos();
}

/**
 * Guarda datos en JSON con sistema optimizado
 * - Guardado ASÍNCRONO (no bloquea el servidor)
 * - Agrupa múltiples cambios (debouncing)
 * - Crea backup automático
 */
function guardarDatos() {
  // Marcar que hay cambios pendientes
  ultimoCambio = Date.now();
  
  // Si ya hay un guardado programado, cancelarlo
  if (timeoutGuardado) {
    clearTimeout(timeoutGuardado);
  }
  
  // Programar guardado después de 200ms
  // Esto agrupa múltiples cambios en un solo guardado
  timeoutGuardado = setTimeout(() => {
    guardarDatosAhora();
  }, 200);
}

/**
 * Ejecuta el guardado inmediatamente
 */
function guardarDatosAhora() {
  if (guardadoPendiente) {
    // Si llegan más cambios mientras se está guardando, reintentar al finalizar
    guardadoReintentar = true;
    return;
  }

  guardadoPendiente = true;

  const data = {
    operarias,
    maquinas,
    pedidos,
    registros,
    prendas,
    usuarios,
    operariaIdCounter,
    pedidoIdCounter,
    registroIdCounter
  };

  try {
    const json = JSON.stringify(data, null, 2);
    const tempFile = DATA_FILE + ".tmp";
    const backupFile = DATA_FILE + ".bak";

    // Escribir en archivo temporal (ASÍNCRONO)
    fs.writeFile(tempFile, json, "utf8", (err) => {
      if (err) {
        console.error("❌ Error escribiendo temporal:", err.message);
        guardadoPendiente = false;
        if (guardadoReintentar) {
          guardadoReintentar = false;
          setTimeout(() => guardarDatosAhora(), 0);
        }
        return;
      }

      // Hacer backup del archivo anterior
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFile(DATA_FILE, backupFile, (errBackup) => {
          if (errBackup) {
            console.warn("⚠️ No se pudo crear backup:", errBackup.message);
          }
          
          // Reemplazar archivo original
          fs.rename(tempFile, DATA_FILE, (errRename) => {
            if (errRename) {
              console.error("❌ Error renombrando archivo:", errRename.message);
            } else {
              // Actualizar caché
              datosEnMemoria = data;
              console.log("💾 Datos guardados exitosamente");
            }
            guardadoPendiente = false;
            if (guardadoReintentar) {
              guardadoReintentar = false;
              setTimeout(() => guardarDatosAhora(), 0);
            }
          });
        });
      } else {
        // Si no existe archivo anterior, solo renombrar
        fs.rename(tempFile, DATA_FILE, (errRename) => {
          if (errRename) {
            console.error("❌ Error creando archivo:", errRename.message);
          } else {
            datosEnMemoria = data;
            console.log("💾 Datos guardados exitosamente");
          }
          guardadoPendiente = false;
          if (guardadoReintentar) {
            guardadoReintentar = false;
            setTimeout(() => guardarDatosAhora(), 0);
          }
        });
      }
    });
    
  } catch (err) {
    console.error("❌ Error preparando datos:", err.message);
    guardadoPendiente = false;
    if (guardadoReintentar) {
      guardadoReintentar = false;
      setTimeout(() => guardarDatosAhora(), 0);
    }
  }
}

/**
 * Forzar guardado inmediato (usar solo en casos críticos)
 */
function forzarGuardado() {
  if (timeoutGuardado) {
    clearTimeout(timeoutGuardado);
    timeoutGuardado = null;
  }
  guardarDatosAhora();
}

// Guardar automáticamente cada 30 segundos si hay cambios pendientes
setInterval(() => {
  const tiempoSinGuardar = Date.now() - ultimoCambio;
  if (tiempoSinGuardar < 30000 && !guardadoPendiente) {
    console.log("🔄 Auto-guardado periódico...");
    guardarDatosAhora();
  }
}, 30000);

// Guardar al cerrar el servidor
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  console.log('💾 Guardando datos finales...');
  
  // Cancelar timeout y guardar inmediatamente
  if (timeoutGuardado) {
    clearTimeout(timeoutGuardado);
  }
  
  // Guardado SÍNCRONO al cerrar (para garantizar que se guarda)
  const data = {
    operarias,
    maquinas,
    pedidos,
    registros,
    prendas,
    usuarios,
    operariaIdCounter,
    pedidoIdCounter,
    registroIdCounter
  };
  
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, json, "utf8");
    console.log('✅ Datos guardados exitosamente');
  } catch (err) {
    console.error('❌ Error guardando datos finales:', err.message);
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  forzarGuardado();
  setTimeout(() => process.exit(0), 1000);
});

// Cargar datos al iniciar
cargarDatos();

// =========================
// CREDENCIALES (compatibilidad)
// =========================
function getAdminPassword() {
  const admin = usuarios.find(u => u.tipo === "admin");
  return admin ? admin.password : "admin123";
}

function getEncargadaPassword() {
  const encargada = usuarios.find(u => u.tipo === "encargada");
  return encargada ? encargada.password : "enc2025";
}

// =========================
// ENDPOINTS DE LOGIN
// =========================

/**
 * Login de Admin (endpoint original)
 */
app.post("/api/login/admin", (req, res) => {
  const { password } = req.body;
  const admin = usuarios.find(u => u.tipo === "admin");
  if (password === getAdminPassword()) {
    return res.json({ 
      mensaje: "Login admin correcto", 
      ok: true, 
      rol: "admin",
      nombre: admin ? admin.nombre : "admin"
    });
  }
  return res.status(401).json({ error: "Contraseña de admin incorrecta.", ok: false });
});

/**
 * Login de Encargada (endpoint original)
 */
app.post("/api/login/encargada", (req, res) => {
  const { password } = req.body;
  const encargada = usuarios.find(u => u.tipo === "encargada");
  if (password === getEncargadaPassword()) {
    return res.json({ 
      mensaje: "Login encargada correcto", 
      ok: true, 
      rol: "encargada",
      nombre: encargada ? encargada.nombre : "encargada"
    });
  }
  return res.status(401).json({ error: "Contraseña de encargada incorrecta.", ok: false });
});

/**
 * Login de Operaria con validación de contraseña (endpoint original)
 */
app.post("/api/login/operaria", (req, res) => {
  const { operariaId, password } = req.body;
  const id = Number(operariaId);
  const op = operarias.find(o => o.id === id);
  
  if (!op) {
    return res.status(404).json({ error: "Operaria no encontrada.", ok: false });
  }
  if (op.password !== String(password)) {
    return res.status(401).json({ error: "Contraseña incorrecta.", ok: false });
  }
  
  res.json({ 
    mensaje: "Login correcto", 
    ok: true,
    operaria: { id: op.id, nombre: op.nombre } 
  });
});

/**
 * Login unificado (compatible con frontend nuevo)
 * Acepta: usuario + password
 */
app.post("/api/login", (req, res) => {
  const { usuario, password } = req.body || {};
  
  if (!usuario || !password) {
    return res.status(400).json({ ok: false, mensaje: "Faltan usuario o contraseña" });
  }

  // Admin
  if (usuario === "admin") {
    if (password === getAdminPassword()) {
      return res.json({
        ok: true,
        rol: "admin",
        tipo: "admin",
        nombre: "Administrador",
        id: "admin"
      });
    }
    return res.status(401).json({ ok: false, mensaje: "Contraseña incorrecta" });
  }

  // Encargada
  if (usuario === "encargada") {
    if (password === getEncargadaPassword()) {
      return res.json({
        ok: true,
        rol: "encargada",
        tipo: "encargada",
        nombre: "Encargada",
        id: "encargada"
      });
    }
    return res.status(401).json({ ok: false, mensaje: "Contraseña incorrecta" });
  }

  // Operarias: búsqueda flexible por usuario, nombre o id
  const operaria = operarias.find(o =>
    (o.usuario && o.usuario === usuario) ||
    o.nombre.toLowerCase() === usuario.toLowerCase() ||
    String(o.id) === String(usuario)
  );

  if (!operaria) {
    return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
  }

  if (operaria.password !== password) {
    return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
  }

  return res.json({
    ok: true,
    rol: operaria.rol || "operaria",
    tipo: "operaria",
    nombre: operaria.nombre,
    idOperaria: operaria.id,
    id: operaria.id
  });
});

// =========================
// OPERARIAS - CRUD COMPLETO
// =========================

/**
 * GET /api/operarias
 * Lista todas las operarias
 */
app.get("/api/operarias", (req, res) => {
  res.json(operarias);
});

/**
 * POST /api/operarias
 * Crea una nueva operaria
 */
app.post("/api/operarias", (req, res) => {
  const { nombre, password, usuario, rol, pagoPorPrenda, activa } = req.body || {};
  
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la operaria es obligatorio." });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ error: "La contraseña es obligatoria." });
  }

  const nuevoUsuario = (usuario || nombre).trim().toLowerCase();
  
  const nueva = {
    id: operariaIdCounter++,
    nombre: nombre.trim(),
    password: String(password).trim(),
    usuario: nuevoUsuario,
    rol: rol || "operaria",
    pagoPorPrenda: Number(pagoPorPrenda) || 0,
    activa: activa !== undefined ? !!activa : true
  };

  operarias.push(nueva);
  guardarDatos();
  
  res.status(201).json({ 
    mensaje: "Operaria creada correctamente", 
    ok: true,
    operaria: nueva 
  });
});

/**
 * PUT /api/operarias/:id
 * Actualiza una operaria existente
 */
app.put("/api/operarias/:id", (req, res) => {
  const id = Number(req.params.id);
  const op = operarias.find(o => o.id === id);
  
  if (!op) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  const { nombre, password, usuario, rol, pagoPorPrenda, activa } = req.body || {};

  if (nombre && nombre.trim()) {
    op.nombre = nombre.trim();
  }
  if (password && password.trim()) {
    op.password = String(password).trim();
  }
  if (usuario && usuario.trim()) {
    op.usuario = usuario.trim().toLowerCase();
  }
  if (rol) {
    op.rol = rol;
  }
  if (pagoPorPrenda !== undefined) {
    op.pagoPorPrenda = Number(pagoPorPrenda) || 0;
  }
  if (activa !== undefined) {
    op.activa = !!activa;
  }

  guardarDatos();
  
  res.json({ 
    mensaje: "Operaria actualizada correctamente.", 
    ok: true,
    operaria: op 
  });
});

/**
 * DELETE /api/operarias/:id
 * Elimina una operaria (solo si no tiene registros)
 */
app.delete("/api/operarias/:id", (req, res) => {
  const id = Number(req.params.id);
  const op = operarias.find(o => o.id === id);
  
  if (!op) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  // Validar que no tenga registros
  const tieneRegistros = registros.some(r => r.operariaId === id);
  if (tieneRegistros) {
    return res.status(400).json({ 
      error: "No se puede eliminar la operaria porque tiene registros de costuras." 
    });
  }

  operarias = operarias.filter(o => o.id !== id);
  guardarDatos();
  
  res.json({ 
    mensaje: "Operaria eliminada correctamente.", 
    ok: true 
  });
});

/**
 * GET /api/operarias/:id/perfil
 * Obtiene el perfil completo de una operaria con estadísticas
 * Incluye: resumen por fuente (operaria/encargada), total general, registros
 */
app.get("/api/operarias/:id/perfil", (req, res) => {
  const id = Number(req.params.id);
  const operaria = operarias.find(o => o.id === id);
  
  if (!operaria) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  // Filtrar todos los registros de esta operaria (solo pendientes)
  const registrosOperaria = registros.filter(r => 
    r.operariaId === id && 
    (r.estadoPago || "pendiente") === "pendiente"
  );

  // Separar por fuente
  const regOperaria = registrosOperaria.filter(r => (r.fuente || "operaria") === "operaria");
  const regEncargada = registrosOperaria.filter(r => r.fuente === "encargada");

  // Calcular totales por fuente
  const totalPiezasOperaria = regOperaria.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanadoOperaria = regOperaria.reduce((sum, r) => sum + r.totalGanado, 0);

  const totalPiezasEncargada = regEncargada.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanadoEncargada = regEncargada.reduce((sum, r) => sum + r.totalGanado, 0);

  // Totales generales
  const totalPiezas = totalPiezasOperaria + totalPiezasEncargada;
  const totalGanado = totalGanadoOperaria + totalGanadoEncargada;

  // Enriquecer registros con información de pedidos
  const registrosDetallados = registrosOperaria.map(r => {
    const pedido = pedidos.find(p => p.id === r.pedidoId);
    return {
      ...r,
      escuela: pedido ? pedido.escuela : "N/A",
      folio: pedido ? pedido.folio : "N/A"
    };
  });

  res.json({
    operaria: {
      id: operaria.id,
      nombre: operaria.nombre,
      usuario: operaria.usuario,
      rol: operaria.rol,
      activa: operaria.activa
    },
    resumenPorFuente: {
      operaria: {
        piezas: totalPiezasOperaria,
        ganado: totalGanadoOperaria,
        registros: regOperaria.length
      },
      encargada: {
        piezas: totalPiezasEncargada,
        ganado: totalGanadoEncargada,
        registros: regEncargada.length
      }
    },
    totalGeneral: {
      piezas: totalPiezas,
      ganado: totalGanado,
      registros: registrosOperaria.length
    },
    registros: registrosDetallados
  });
});

/**
 * GET /api/operarias/:id/resumen-dia-semana
 * Obtiene resumen de producción del día y la semana para una operaria
 */
app.get("/api/operarias/:id/resumen-dia-semana", (req, res) => {
  const id = Number(req.params.id);
  const operaria = operarias.find(o => o.id === id);
  
  if (!operaria) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  const hoy = new Date();
  const hoyStr = hoy.toISOString().slice(0, 10);

  // Calcular inicio de semana (lunes)
  const day = hoy.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() + offset);
  const inicioSemanaStr = inicioSemana.toISOString().slice(0, 10);

  // Filtrar registros pendientes de esta operaria
  const registrosOperaria = registros.filter(r => 
    r.operariaId === id && 
    (r.estadoPago || "pendiente") === "pendiente"
  );

  // Registros del día (convertir UTC a local)
  const registrosDia = registrosOperaria.filter(r => {
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fechaLocal = `${year}-${month}-${day}`;
    return fechaLocal === hoyStr;
  });
  const piezasDia = registrosDia.reduce((sum, r) => sum + r.cantidad, 0);
  const ganadoDia = registrosDia.reduce((sum, r) => sum + r.totalGanado, 0);

  // Registros de la semana (convertir UTC a local)
  const registrosSemana = registrosOperaria.filter(r => {
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fechaReg = `${year}-${month}-${day}`;
    return fechaReg >= inicioSemanaStr && fechaReg <= hoyStr;
  });
  const piezasSemana = registrosSemana.reduce((sum, r) => sum + r.cantidad, 0);
  const ganadoSemana = registrosSemana.reduce((sum, r) => sum + r.totalGanado, 0);

  res.json({
    operaria: {
      id: operaria.id,
      nombre: operaria.nombre
    },
    dia: {
      fecha: hoyStr,
      piezas: piezasDia,
      ganado: ganadoDia,
      registros: registrosDia.length
    },
    semana: {
      inicio: inicioSemanaStr,
      fin: hoyStr,
      piezas: piezasSemana,
      ganado: ganadoSemana,
      registros: registrosSemana.length
    }
  });
});

// =========================
// MÁQUINAS
// =========================

/**
 * GET /api/maquinas
 * Lista todas las máquinas disponibles
 */
app.get("/api/maquinas", (req, res) => {
  res.json(maquinas);
});

/**
 * POST /api/maquinas
 * Agrega una nueva máquina
 */
app.post("/api/maquinas", (req, res) => {
  const { nombre } = req.body;
  
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la máquina es obligatorio." });
  }

  const nombreTrim = nombre.trim();
  
  if (!maquinas.includes(nombreTrim)) {
    maquinas.push(nombreTrim);
    guardarDatos();
  }

  res.json({ 
    mensaje: "Máquina agregada correctamente.",
    ok: true, 
    maquinas 
  });
});

/**
 * DELETE /api/maquinas/:nombre
 * Elimina una máquina
 */
app.delete("/api/maquinas/:nombre", (req, res) => {
  const nombre = req.params.nombre;
  
  if (!maquinas.includes(nombre)) {
    return res.status(404).json({ error: "Máquina no encontrada." });
  }

  maquinas = maquinas.filter(m => m !== nombre);
  guardarDatos();
  
  res.json({ 
    mensaje: "Máquina eliminada correctamente.",
    ok: true,
    maquinas
  });
});

// =========================
// PEDIDOS - CRUD COMPLETO + ESTADO
// =========================

/**
 * GET /api/pedidos
 * Lista todos los pedidos
 * Query params:
 * - estado: "activo" | "terminado" | "todos" (default: "todos")
 * - conTotales: true para incluir totales de producción
 */
app.get("/api/pedidos", (req, res) => {
  const { estado, conTotales, conPrendas, conDesglose } = req.query;
  
  let pedidosFiltrados = pedidos;
  
  // Filtrar por estado si se especifica
  if (estado && estado !== "todos") {
    pedidosFiltrados = pedidos.filter(p => (p.estado || "activo") === estado);
  }

  // Si se solicitan totales, calcular producción por pedido
  if (conTotales === "true") {
    const pedidosConTotales = pedidosFiltrados.map(pedido => {
      // Filtrar registros de este pedido (TODOS los estados Y solo de operarias)
      const registrosPedido = registros.filter(r => 
        r.pedidoId === pedido.id && 
        (r.fuente || "operaria") !== "encargada"  // EXCLUIR ENCARGADA
        // NO filtrar por estadoPago → cuenta pendientes Y pagados
      );
      
      const totalPiezas = registrosPedido.reduce((sum, r) => sum + r.cantidad, 0);
      const totalPagado = registrosPedido.reduce((sum, r) => sum + r.totalGanado, 0);
      
      // Contar operarias únicas
      const operariasUnicas = [...new Set(registrosPedido.map(r => r.operariaId))];
      
      return {
        ...pedido,
        totalPiezas,
        totalPagado,
        numeroOperarias: operariasUnicas.length
      };
    });
    
    pedidosFiltrados = pedidosConTotales;
  }

  // Si se solicita con nombres de prendas
  if (conPrendas === "true") {
    pedidosFiltrados = pedidosFiltrados.map(pedido => {
      if (pedido.prendas && pedido.prendas.length > 0) {
        const nombresPrendas = pedido.prendas.map(prendaId => {
          const prenda = prendas.find(p => p.id === prendaId);
          return prenda ? prenda.nombre : "Desconocida";
        });
        
        return {
          ...pedido,
          prendasIds: pedido.prendas,
          prendas: nombresPrendas
        };
      }
      return pedido;
    });
  }

  // Si se solicita con desglose por prenda
  if (conDesglose === "true") {
    pedidosFiltrados = pedidosFiltrados.map(pedido => {
      const regsPedido = registros.filter(r => 
        r.pedidoId === pedido.id &&
        (r.fuente || "operaria") !== "encargada"  // EXCLUIR ENCARGADA
        // NO filtrar por estadoPago → cuenta pendientes Y pagados
      );
      
      // Agrupar por prenda
      const desglose = {};
      regsPedido.forEach(reg => {
        if (reg.prendaId) {
          if (!desglose[reg.prendaId]) {
            desglose[reg.prendaId] = 0;
          }
          desglose[reg.prendaId] += reg.totalGanado;
        }
      });

      // Convertir a array con nombres
      const desglosePrendas = Object.keys(desglose).map(prendaId => {
        const prenda = prendas.find(p => p.id === parseInt(prendaId));
        return {
          prenda: prenda ? prenda.nombre : "Desconocida",
          total: desglose[prendaId]
        };
      });

      return {
        ...pedido,
        desglosePrendas
      };
    });
  }
  
  res.json(pedidosFiltrados);
});

/**
 * POST /api/pedidos
 * Crea un nuevo pedido
 */
app.post("/api/pedidos", (req, res) => {
  const { escuela, folio, prendas: prendasSeleccionadas } = req.body;
  
  if (!escuela || !escuela.trim()) {
    return res.status(400).json({ error: "El nombre de la escuela es obligatorio." });
  }
  if (!folio || !folio.trim()) {
    return res.status(400).json({ error: "El folio es obligatorio." });
  }

  const nuevo = {
    id: pedidoIdCounter++,
    escuela: escuela.trim(),
    folio: folio.trim(),
    prendas: prendasSeleccionadas || [],
    estado: "activo",
    fechaTerminado: null
  };
  
  pedidos.push(nuevo);
  guardarDatos();
  
  res.status(201).json({ 
    mensaje: "Pedido creado correctamente.",
    ok: true, 
    pedido: nuevo 
  });
});

/**
 * GET /api/pedidos/:id
 * Obtiene un pedido específico por ID
 */
app.get("/api/pedidos/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }
  
  res.json(pedido);
});

/**
 * PUT /api/pedidos/:id
 * Actualiza un pedido existente
 */
app.put("/api/pedidos/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);

  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }

  const { escuela, folio, pagoPorPieza, prendas } = req.body;

  if (escuela && escuela.trim()) {
    pedido.escuela = escuela.trim();
  }
  if (folio && folio.trim()) {
    pedido.folio = folio.trim();
  }
  if (pagoPorPieza !== undefined) {
    pedido.pagoPorPieza = Number(pagoPorPieza) || 0;
  }

  // ✅ Actualizar prendas (se guardan como IDs en datos_taller.json)
  if (Array.isArray(prendas)) {
    pedido.prendas = prendas
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n > 0);
  }

  guardarDatos();

  res.json({ 
    mensaje: "Pedido actualizado correctamente.",
    ok: true, 
    pedido 
  });
});


/**
 * PUT /api/pedidos/:id/estado
 * Cambia el estado de un pedido (activo/terminado)
 */
app.put("/api/pedidos/:id/estado", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }

  const { estado } = req.body;
  
  if (!estado || !["activo", "terminado"].includes(estado)) {
    return res.status(400).json({ error: "Estado debe ser 'activo' o 'terminado'." });
  }

  pedido.estado = estado;
  
  if (estado === "terminado") {
    pedido.fechaTerminado = new Date().toISOString();
  } else {
    pedido.fechaTerminado = null;
  }

  guardarDatos();
  
  res.json({ 
    mensaje: `Pedido marcado como ${estado}.`,
    ok: true, 
    pedido 
  });
});

/**
 * DELETE /api/pedidos/:id
 * Elimina un pedido (solo si no tiene registros asociados)
 */
app.delete("/api/pedidos/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }

  // Validar que no tenga registros
  const tieneRegistros = registros.some(r => r.pedidoId === id);
  if (tieneRegistros) {
    return res.status(400).json({ 
      error: "No se puede eliminar el pedido porque tiene registros asociados." 
    });
  }

  pedidos = pedidos.filter(p => p.id !== id);
  guardarDatos();
  
  res.json({ 
    mensaje: "Pedido eliminado correctamente.",
    ok: true 
  });
});

// =========================
// REGISTROS DE PRODUCCIÓN + PAGOS
// =========================

/**
 * GET /api/registros
 * Lista registros con filtros opcionales:
 * - fecha: filtra por fecha específica (YYYY-MM-DD)
 * - operariaId: filtra por operaria
 * - fuente: filtra por fuente (operaria/encargada)
 * - estadoPago: "pendiente" | "pagado" | "todos" (default: "pendiente")
 */
app.get("/api/registros", (req, res) => {
  const { fecha, operariaId, fuente, estadoPago } = req.query;
  let data = registros;

  // Filtrar por estado de pago (por defecto solo pendientes)
  const estadoFiltro = estadoPago || "pendiente";
  if (estadoFiltro !== "todos") {
    data = data.filter(r => (r.estadoPago || "pendiente") === estadoFiltro);
  }

  if (fecha) {
    data = data.filter(r => {
      // Convertir fecha UTC a local para comparar
      const fechaUTC = new Date(r.fecha);
      const year = fechaUTC.getFullYear();
      const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
      const day = String(fechaUTC.getDate()).padStart(2, '0');
      const fechaLocal = `${year}-${month}-${day}`;
      return fechaLocal === fecha;
    });
  }
  if (operariaId) {
    data = data.filter(r => r.operariaId === Number(operariaId));
  }
  if (fuente) {
    data = data.filter(r => (r.fuente || "operaria") === fuente);
  }

  // Enriquecer con nombres de operaria, pedido y prenda
  const registrosEnriquecidos = data.map(r => {
    const op = operarias.find(o => o.id === r.operariaId);
    const ped = pedidos.find(p => p.id === r.pedidoId);
    const prenda = prendas.find(p => p.id === r.prendaId);
    return {
      ...r,
      operariaNombre: op ? op.nombre : "N/A",
      escuela: ped ? ped.escuela : "N/A",
      folio: ped ? ped.folio : "N/A",
      pedidoEstado: ped ? (ped.estado || "activo") : "N/A",
      prenda: prenda ? prenda.nombre : "N/A"
    };
  });

  res.json(registrosEnriquecidos);
});

/**
 * POST /api/registros
 * Crea un nuevo registro de producción
 */
app.post("/api/registros", (req, res) => {
  const { operariaId, pedidoId, prendaId, maquina, descripcion, cantidad, pagoPorPieza, fuente } = req.body;

  // Validaciones
  if (!operariaId || !pedidoId || !maquina || !descripcion || !cantidad) {
    return res.status(400).json({ error: "Datos incompletos. Todos los campos son obligatorios." });
  }

  const cant = Number(cantidad);
  const pago = Number(pagoPorPieza) || 0;

  if (cant <= 0) {
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0." });
  }

  const nuevo = {
    id: registroIdCounter++,
    operariaId: Number(operariaId),
    pedidoId: Number(pedidoId),
    prendaId: prendaId ? Number(prendaId) : null,
    maquina,
    descripcion,
    cantidad: cant,
    pagoPorPieza: pago,
    totalGanado: cant * pago,
    fecha: new Date().toISOString(),
    fuente: fuente || "operaria",
    estadoPago: "pendiente",
    semanaPago: null,
    fechaPago: null
  };

  registros.push(nuevo);
  guardarDatos();
  
  res.status(201).json({ 
    mensaje: "Registro guardado correctamente.",
    ok: true, 
    registro: nuevo 
  });
});

/**
 * PUT /api/registros/:id
 * Actualiza un registro de producción existente
 */
app.put("/api/registros/:id", (req, res) => {
  const id = Number(req.params.id);
  const registro = registros.find(r => r.id === id);
  
  if (!registro) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  const { 
    pedidoId,
    prendaId,
    maquina, 
    descripcion, 
    cantidad, 
    pagoPorPieza,
    totalGanado
  } = req.body;

  // Actualizar campos si se proporcionan
  if (pedidoId !== undefined) {
    registro.pedidoId = Number(pedidoId);
  }
  if (prendaId !== undefined) {
    registro.prendaId = prendaId ? Number(prendaId) : null;
  }
  if (maquina !== undefined) {
    registro.maquina = maquina;
  }
  if (descripcion !== undefined) {
    registro.descripcion = descripcion;
  }
  if (cantidad !== undefined) {
    registro.cantidad = Number(cantidad);
  }
  if (pagoPorPieza !== undefined) {
    registro.pagoPorPieza = Number(pagoPorPieza);
  }
  
  // Recalcular total si se proporcionó o si cambió cantidad/precio
  if (totalGanado !== undefined) {
    registro.totalGanado = Number(totalGanado);
  } else {
    registro.totalGanado = registro.cantidad * registro.pagoPorPieza;
  }

  guardarDatos();
  
  res.json({ 
    mensaje: "Registro actualizado correctamente.",
    ok: true, 
    registro 
  });
});

/**
 * DELETE /api/registros/:id
 * Elimina un registro de producción
 */
app.delete("/api/registros/:id", (req, res) => {
  const id = Number(req.params.id);
  const registro = registros.find(r => r.id === id);
  
  if (!registro) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  registros = registros.filter(r => r.id !== id);
  guardarDatos();
  
  res.json({ 
    mensaje: "Registro eliminado correctamente.",
    ok: true 
  });
});

/**
 * POST /api/registros/marcar-semana-pagada
 * Marca todos los registros de una semana como pagados
 * Body: { fecha: "YYYY-MM-DD" } (cualquier día de la semana)
 */
app.post("/api/registros/marcar-semana-pagada", (req, res) => {
  const { fecha, fuente } = req.body;
  
  if (!fecha) {
    return res.status(400).json({ error: "Fecha requerida" });
  }

  // Calcular inicio y fin de semana
  const base = new Date(fecha + "T00:00:00");
  const day = base.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  
  const inicio = new Date(base);
  inicio.setDate(base.getDate() + offset);
  
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 5);
  
  const inicioStr = inicio.toISOString().slice(0, 10);
  const finStr = fin.toISOString().slice(0, 10);
  
  // Calcular número de semana (formato: 2024-W03)
  const anio = inicio.getFullYear();
  const primerDia = new Date(anio, 0, 1);
  const dias = Math.floor((inicio - primerDia) / (24 * 60 * 60 * 1000));
  const numeroSemana = Math.ceil((dias + primerDia.getDay() + 1) / 7);
  const semanaPago = `${anio}-W${numeroSemana.toString().padStart(2, '0')}`;
  
  const fechaPago = new Date().toISOString();
  
  // Filtrar registros de esa semana (pendientes)
  const fuenteFiltro = fuente || "operaria";
  
  let registrosAfectados = 0;
  registros.forEach(r => {
    // Convertir fecha UTC a local para comparar
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fechaReg = `${year}-${month}-${day}`;
    
    if (fechaReg >= inicioStr && 
        fechaReg <= finStr && 
        (r.estadoPago || "pendiente") === "pendiente" &&
        (r.fuente || "operaria") === fuenteFiltro) {
      r.estadoPago = "pagado";
      r.semanaPago = semanaPago;
      r.fechaPago = fechaPago;
      registrosAfectados++;
    }
  });
  
  guardarDatos();
  
  res.json({
    mensaje: `Semana marcada como pagada (${semanaPago})`,
    ok: true,
    registrosAfectados,
    semana: {
      inicio: inicioStr,
      fin: finStr,
      semanaPago,
      fuente: fuenteFiltro
    }
  });
});

// =========================
// REPORTES Y ESTADÍSTICAS
// =========================

/**
 * GET /api/reporte-semanal
 * Genera reporte semanal de producción
 * Query params:
 * - fecha: fecha de referencia (YYYY-MM-DD)
 * - fuente: operaria o encargada
 * - estadoPago: "pendiente" | "pagado" | "todos" (default: "pendiente")
 */
/**
 * GET /api/reporte-semanal
 * Genera reporte semanal de producción (RESUMEN POR OPERARIA)
 * Query params:
 * - semana: "YYYY-WNN" (preferido, viene del frontend)
 * - fecha: "YYYY-MM-DD" (alternativa)
 * - fuente: "operaria" | "encargada" | "todos"
 * - estadoPago / estado: "pendiente" | "pagado" | "todos"
 * - operariaId: filtrar una operaria (admin)
 *
 * RESPUESTA: Array<{operariaId,nombre,piezas,ganado,registros}>
 */
app.get("/api/reporte-semanal", (req, res) => {
  let { fecha, semana, fuente, estadoPago, estado, operariaId } = req.query;

  if (!estadoPago && estado) estadoPago = estado;
  const estadoFiltro = estadoPago || "pendiente";
  const fuenteFiltro = fuente || "operaria"; // operaria | encargada | todos
  const opId = operariaId ? Number(operariaId) : null;

  // Resolver inicio/fin de semana usando la MISMA lógica que /api/semanas (SÁBADO -> VIERNES)
  let inicioStr, finStr;

  try {
    
if (semana) {
      const info = resolverSemanaPorCodigo(String(semana));
      if (!info) return res.status(400).json({ error: "Semana inválida" });
      inicioStr = info.inicio;
      finStr = info.fin;
    } else if (fecha) {
      const info = obtenerSemanaLaboral(fecha);
      inicioStr = info.inicio;
      finStr = info.fin;
    } else {
      return res.status(400).json({ error: "Semana o fecha requerida" });
    }
  } catch (e) {
    return res.status(400).json({ error: "Semana o fecha inválida" });
  }

  const resumen = {};

  registros.forEach(r => {
    // Convertir fecha UTC a local para comparar
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const f = `${year}-${month}-${day}`;
    
    if (f < inicioStr || f > finStr) return;

    const rEstado = (r.estadoPago || "pendiente");
    if (estadoFiltro !== "todos" && rEstado !== estadoFiltro) return;

    const rFuente = (r.fuente || "operaria");
    if (fuenteFiltro !== "todos" && rFuente !== fuenteFiltro) return;

    if (opId && r.operariaId !== opId) return;

    if (!resumen[r.operariaId]) {
      const op = operarias.find(o => o.id === r.operariaId);
      resumen[r.operariaId] = {
        operariaId: r.operariaId,
        nombre: op ? op.nombre : (r.operariaNombre || "N/A"),
        piezas: 0,
        ganado: 0,
        registros: 0
      };
    }

    resumen[r.operariaId].piezas += Number(r.cantidad || 0);
    resumen[r.operariaId].ganado += Number(r.totalGanado || 0);
    resumen[r.operariaId].registros += 1;
  });

  return res.json(Object.values(resumen)); // SIEMPRE ARRAY
});

/**
 * GET /api/estadisticas/general
 * Estadísticas generales del sistema
 */
app.get("/api/estadisticas/general", (req, res) => {
  const totalOperarias = operarias.length;
  const operariasActivas = operarias.filter(o => o.activa).length;
  const totalPedidos = pedidos.length;
  const pedidosActivos = pedidos.filter(p => (p.estado || "activo") === "activo").length;
  
  // Solo registros pendientes para estadísticas activas
  const registrosPendientes = registros.filter(r => (r.estadoPago || "pendiente") === "pendiente");
  const totalRegistros = registrosPendientes.length;
  const totalPiezas = registrosPendientes.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanado = registrosPendientes.reduce((sum, r) => sum + r.totalGanado, 0);

  res.json({
    operarias: {
      total: totalOperarias,
      activas: operariasActivas,
      inactivas: totalOperarias - operariasActivas
    },
    pedidos: {
      total: totalPedidos,
      activos: pedidosActivos,
      terminados: totalPedidos - pedidosActivos
    },
    produccionPendiente: {
      registros: totalRegistros,
      piezasTotales: totalPiezas,
      totalGanado: totalGanado
    },
    produccionTotal: {
      registros: registros.length,
      piezasTotales: registros.reduce((sum, r) => sum + r.cantidad, 0),
      totalGanado: registros.reduce((sum, r) => sum + r.totalGanado, 0)
    }
  });
});

/**
 * GET /api/estadisticas/comparacion-fuentes
 * Comparación entre registros de operarias vs encargada
 */
app.get("/api/estadisticas/comparacion-fuentes", (req, res) => {
  const { estadoPago } = req.query;
  const estadoFiltro = estadoPago || "pendiente";
  
  // Filtrar por estado
  const regsFiltrados = estadoFiltro === "todos" 
    ? registros 
    : registros.filter(r => (r.estadoPago || "pendiente") === estadoFiltro);
  
  const regsOperarias = regsFiltrados.filter(r => (r.fuente || "operaria") === "operaria");
  const regsEncargada = regsFiltrados.filter(r => r.fuente === "encargada");
  
  const operarias = {
    registros: regsOperarias.length,
    piezas: regsOperarias.reduce((sum, r) => sum + r.cantidad, 0),
    ganado: regsOperarias.reduce((sum, r) => sum + r.totalGanado, 0)
  };
  
  const encargada = {
    registros: regsEncargada.length,
    piezas: regsEncargada.reduce((sum, r) => sum + r.cantidad, 0),
    ganado: regsEncargada.reduce((sum, r) => sum + r.totalGanado, 0)
  };
  
  res.json({
    estadoPago: estadoFiltro,
    operarias,
    encargada,
    diferencia: {
      registros: operarias.registros - encargada.registros,
      piezas: operarias.piezas - encargada.piezas,
      ganado: operarias.ganado - encargada.ganado
    }
  });
});

// =========================
// CONFIGURACIÓN DEL SISTEMA
// =========================

/**
 * POST /api/configuracion/cambiar-password
 * Cambia la contraseña de admin o encargada
 */
app.post("/api/configuracion/cambiar-password", (req, res) => {
  const { tipo, passwordActual, passwordNueva } = req.body;
  
  if (!tipo || !passwordActual || !passwordNueva) {
    return res.status(400).json({ error: "Datos incompletos" });
  }
  
  // Por seguridad, esto requeriría variables de entorno
  // Por ahora retornamos mensaje informativo
  res.json({
    mensaje: "Para cambiar contraseñas de admin/encargada, edita las constantes getAdminPassword() y getEncargadaPassword() en el archivo del servidor.",
    ok: false
  });
});

/**
 * POST /api/configuracion/backup
 * Crea un backup manual de los datos
 */
app.post("/api/configuracion/backup", (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(__dirname, `datos_taller_backup_${timestamp}.json`);
    
    fs.copyFileSync(DATA_FILE, backupFile);
    
    res.json({
      mensaje: "Backup creado correctamente",
      ok: true,
      archivo: `datos_taller_backup_${timestamp}.json`
    });
  } catch (err) {
    res.status(500).json({
      error: "Error creando backup: " + err.message,
      ok: false
    });
  }
});

// ============================================
// ENDPOINTS PARA CAMBIAR CREDENCIALES
// ============================================

/**
 * PUT /api/usuarios/admin
 * Actualiza las credenciales del admin
 */
app.put("/api/usuarios/admin", (req, res) => {
  const { nombre, password } = req.body;
  
  if (!nombre && !password) {
    return res.status(400).json({ error: "Debes proporcionar al menos un campo para actualizar" });
  }

  // Buscar el admin en usuarios
  const admin = usuarios.find(u => u.tipo === "admin");
  
  if (!admin) {
    return res.status(404).json({ error: "Usuario admin no encontrado" });
  }

  // Actualizar campos
  if (nombre) {
    admin.nombre = nombre;
  }
  if (password) {
    admin.password = password;
  }

  guardarDatos();

  res.json({
    ok: true,
    mensaje: "Credenciales de admin actualizadas correctamente",
    usuario: {
      id: admin.id,
      nombre: admin.nombre,
      tipo: admin.tipo
    }
  });
});

/**
 * PUT /api/usuarios/encargada
 * Actualiza las credenciales de la encargada
 */
app.put("/api/usuarios/encargada", (req, res) => {
  const { nombre, password } = req.body;
  
  if (!nombre && !password) {
    return res.status(400).json({ error: "Debes proporcionar al menos un campo para actualizar" });
  }

  // Buscar la encargada en usuarios
  const encargada = usuarios.find(u => u.tipo === "encargada");
  
  if (!encargada) {
    return res.status(404).json({ error: "Usuario encargada no encontrado" });
  }

  // Actualizar campos
  if (nombre) {
    encargada.nombre = nombre;
  }
  if (password) {
    encargada.password = password;
  }

  guardarDatos();

  res.json({
    ok: true,
    mensaje: "Credenciales de encargada actualizadas correctamente",
    usuario: {
      id: encargada.id,
      nombre: encargada.nombre,
      tipo: encargada.tipo
    }
  });
});

// ============================================
// ENDPOINTS DE PRENDAS
// ============================================

/**
 * GET /api/prendas
 * Obtener todas las prendas
 */
app.get("/api/prendas", (req, res) => {
  res.json(prendas);
});

/**
 * POST /api/prendas
 * Agregar nueva prenda
 */
app.post("/api/prendas", (req, res) => {
  const { nombre } = req.body;
  
  if (!nombre || nombre.trim() === "") {
    return res.status(400).json({ error: "El nombre de la prenda es requerido" });
  }

  // Verificar si ya existe
  const existe = prendas.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (existe) {
    return res.status(400).json({ error: "Esta prenda ya existe" });
  }

  const nuevaPrenda = {
    id: prendas.length > 0 ? Math.max(...prendas.map(p => p.id)) + 1 : 1,
    nombre: nombre.trim()
  };

  prendas.push(nuevaPrenda);
  guardarDatos();

  res.json(nuevaPrenda);
});

/**
 * DELETE /api/prendas/:id
 * Eliminar prenda
 */
app.delete("/api/prendas/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const index = prendas.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Prenda no encontrada" });
  }

  prendas.splice(index, 1);
  guardarDatos();

  res.json({ ok: true, mensaje: "Prenda eliminada" });
});

// ============================================
// FUNCIONES HELPER PARA SEMANAS (SÁBADO-VIERNES)
// ============================================

/**
 * Calcula la semana laboral (Sábado a Viernes) para una fecha dada
 */
// =========================
// FECHAS (LOCAL / SIN DESFASE UTC)
// =========================
function parseFechaLocal(input) {
  if (input instanceof Date) return new Date(input);
  const s = String(input || "");
  // Si viene como "YYYY-MM-DD" (sin hora), lo interpretamos como fecha LOCAL
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    return new Date(y, mo, d, 0, 0, 0, 0);
  }
  // Si viene como ISO con T o cualquier otro formato, usamos Date normal
  const dt = new Date(s);
  return dt;
}

function formatYMDLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function obtenerSemanaLaboral(fecha) {
  const date = parseFechaLocal(fecha);
  const day = date.getDay(); // 0=Dom, 6=Sáb

  // Semana laboral: SÁBADO -> VIERNES
  let diasDesdeInicio;
  if (day === 6) {
    diasDesdeInicio = 0;      // sábado
  } else if (day === 0) {
    diasDesdeInicio = 1;      // domingo => sábado fue ayer
  } else {
    diasDesdeInicio = day + 1; // lun(1)->2, vie(5)->6
  }

  const inicioSemana = new Date(date);
  inicioSemana.setDate(date.getDate() - diasDesdeInicio);
  inicioSemana.setHours(0, 0, 0, 0);

  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6); // +6 = viernes
  finSemana.setHours(23, 59, 59, 999);

  const year = inicioSemana.getFullYear();
  const weekNum = obtenerNumeroSemana(inicioSemana);

  return {
    codigo: `${year}-W${String(weekNum).padStart(2, "0")}`,
    inicio: formatYMDLocal(inicioSemana),
    fin: formatYMDLocal(finSemana),
    inicioDate: inicioSemana,
    finDate: finSemana
  };
}

/**
 * Dado un código de semana "YYYY-WNN", regresa {codigo,inicio,fin} usando la MISMA lógica de obtenerSemanaLaboral.
 * Esto evita desfases cuando se reconstruye la semana solo por número.
 */
function resolverSemanaPorCodigo(codigo) {
  if (!codigo || !/^[0-9]{4}-W[0-9]{2}$/.test(codigo)) return null;
  const year = Number(codigo.slice(0, 4));

  // Rango de búsqueda: todo el año
  const inicioBusqueda = new Date(year, 0, 1);
  const finBusqueda = new Date(year, 11, 31);

  for (let d = new Date(inicioBusqueda); d <= finBusqueda; d.setDate(d.getDate() + 1)) {
    const info = obtenerSemanaLaboral(d);
    if (info.codigo === codigo) return info;
  }
  return null;
}

function obtenerNumeroSemana(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Obtiene todas las semanas con registros
 */
function obtenerSemanasConRegistros(estadoPago = 'pendiente') {
  const semanas = {};
  
  let registrosFiltrados = registros;
  if (estadoPago !== 'todos') {
    registrosFiltrados = registros.filter(r => (r.estadoPago || 'pendiente') === estadoPago);
  }
  
  // FILTRAR: Solo registros de operarias (excluir encargada del total)
  registrosFiltrados = registrosFiltrados.filter(r => (r.fuente || 'operaria') !== 'encargada');
  
  registrosFiltrados.forEach(reg => {
    const semana = obtenerSemanaLaboral(reg.fecha);
    
    if (!semanas[semana.codigo]) {
      semanas[semana.codigo] = {
        codigo: semana.codigo,
        inicio: semana.inicio,
        fin: semana.fin,
        registros: 0,
        totalPagar: 0
      };
    }
    
    semanas[semana.codigo].registros++;
    semanas[semana.codigo].totalPagar += reg.totalGanado;
  });
  
  return Object.values(semanas).sort((a, b) => b.codigo.localeCompare(a.codigo));
}

// ============================================
// ENDPOINTS DE CORTE SEMANAL
// ============================================

/**
 * GET /api/semanas
 * Obtiene las semanas con registros
 */
app.get("/api/semanas", (req, res) => {
  const { estado } = req.query;
  const semanas = obtenerSemanasConRegistros(estado || 'pendiente');
  res.json(semanas);
});

/**
 * GET /api/reporte-semanal/detalle
 * Obtiene el detalle completo de una operaria en una semana
 */
app.get("/api/reporte-semanal/detalle", (req, res) => {
  const { semana, operariaId, estadoPago, fuente } = req.query;
  
  // Validar parámetros requeridos con mensajes específicos
  if (!semana) {
    return res.status(400).json({ error: "Falta el parámetro 'semana'" });
  }
  
  if (!operariaId) {
    return res.status(400).json({ error: "Falta el parámetro 'operariaId'" });
  }
  
  const opId = Number(operariaId);
  if (isNaN(opId)) {
    return res.status(400).json({ error: "El parámetro 'operariaId' debe ser un número" });
  }
  
  const operaria = operarias.find(o => o.id === opId);
  
  if (!operaria) {
    return res.status(404).json({ error: "Operaria no encontrada" });
  }
  
  // Parsear código de semana (misma lógica que /api/semanas)
  const semanaInfo = resolverSemanaPorCodigo(String(semana));
  if (!semanaInfo) {
    return res.status(400).json({ 
      error: `Código de semana inválido: "${semana}". Formato esperado: YYYY-WNN (ej: 2025-W50)` 
    });
  }
  
  // Filtrar registros de la operaria en esa semana
  const registrosSemana = registros.filter(r => {
    // Convertir fecha UTC a fecha local para comparar correctamente
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const f = `${year}-${month}-${day}`;
    
    const estadoMatch = estadoPago ? (r.estadoPago || 'pendiente') === estadoPago : true;
    
    // SIEMPRE excluir registros de encargada (solo mostrar operaria)
    const fuenteMatch = (r.fuente || 'operaria') !== 'encargada';

    return r.operariaId === opId &&
           f >= semanaInfo.inicio &&
           f <= semanaInfo.fin &&
           estadoMatch &&
           fuenteMatch;
  });
  
  // Extraer el número de semana del código (ej: "2025-W50" -> "W50")
  const weekStr = String(semana).includes('-W') ? String(semana).split('-W')[1] : semana;
  
  // Agrupar por día
  const registrosPorDia = {};
  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  registrosSemana.forEach(reg => {
    // Convertir fecha UTC a fecha local antes de extraer el día
    const fechaUTC = new Date(reg.fecha);
    // Obtener fecha en formato local (YYYY-MM-DD)
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fecha = `${year}-${month}-${day}`;
    
    if (!registrosPorDia[fecha]) {
      const d = parseFechaLocal(fecha); // Usar parseFechaLocal para evitar problemas de zona horaria
      registrosPorDia[fecha] = {
        fecha,
        dia: diasSemana[d.getDay()],
        registros: [],
        subtotal: 0
      };
    }
    
    const pedido = pedidos.find(p => p.id === reg.pedidoId);
    const prenda = prendas.find(p => p.id === reg.prendaId);
    
    registrosPorDia[fecha].registros.push({
      id: reg.id,
      escuela: pedido ? pedido.escuela : 'N/A',
      prenda: prenda ? prenda.nombre : 'N/A',
      descripcion: reg.descripcion,
      cantidad: reg.cantidad,
      maquina: reg.maquina,
      pagoPorPieza: reg.pagoPorPieza || 0,
      totalGanado: reg.totalGanado || (reg.cantidad * (reg.pagoPorPieza || 0))
    });
    
    registrosPorDia[fecha].subtotal += reg.totalGanado;
  });
  
  // Convertir a array y ordenar por fecha
  const registrosPorDiaArray = Object.values(registrosPorDia).sort((a, b) => 
    a.fecha.localeCompare(b.fecha)
  );
  
  // Calcular resumen
  const totalPiezas = registrosSemana.reduce((sum, r) => sum + r.cantidad, 0);
  const totalPagar = registrosSemana.reduce((sum, r) => sum + r.totalGanado, 0);
  const diasTrabajados = Object.keys(registrosPorDia).length;
  
  res.json({
    operaria: {
      id: operaria.id,
      nombre: operaria.nombre
    },
    semana: {
      codigo: semana,
      inicio: semanaInfo.inicio,
      fin: semanaInfo.fin,
      label: `Semana ${weekStr} (${formatearFechaCorta(semanaInfo.inicio)} - ${formatearFechaCorta(semanaInfo.fin)})`
    },
    fechaPago: new Date().toISOString().split('T')[0],
    registrosPorDia: registrosPorDiaArray,
    resumen: {
      totalPiezas,
      totalRegistros: registrosSemana.length,
      diasTrabajados,
      totalPagar
    }
  });
});

/**
 * GET /api/reporte-semanal
 * Obtiene el resumen de todas las operarias en una semana
 */
app.get("/api/reporte-semanal", (req, res) => {
  const { semana, estado, operariaId, fuente } = req.query;
  
  if (!semana) {
    return res.status(400).json({ error: "Código de semana es requerido" });
  }
  
  // Parsear código de semana (misma lógica que /api/semanas)
  const semanaInfo = resolverSemanaPorCodigo(String(semana));
  if (!semanaInfo) {
    return res.status(400).json({ error: "Código de semana inválido" });
  }
  
  // Filtrar registros de esa semana
  const registrosSemana = registros.filter(r => {
    const fechaReg = new Date(r.fecha);
    const enSemana = fechaReg >= new Date(semanaInfo.inicio) && 
                     fechaReg <= new Date(semanaInfo.fin + 'T23:59:59');
    const estadoMatch = estado ? (r.estadoPago || 'pendiente') === estado : true;
    
    // Filtro de operaria
    const operariaMatch = operariaId ? r.operariaId === Number(operariaId) : true;
    
    // Filtro de fuente (base de datos)
    const fuenteMatch = fuente ? (r.fuente || 'operaria') === fuente : true;
    
    return enSemana && estadoMatch && operariaMatch && fuenteMatch;
  });
  
  // Agrupar por operaria
  const porOperaria = {};
  
  registrosSemana.forEach(reg => {
    if (!porOperaria[reg.operariaId]) {
      const operaria = operarias.find(o => o.id === reg.operariaId);
      porOperaria[reg.operariaId] = {
        operariaId: reg.operariaId,
        nombre: operaria ? operaria.nombre : 'N/A',
        piezas: 0,
        ganado: 0,
        registros: 0
      };
    }
    
    porOperaria[reg.operariaId].piezas += reg.cantidad;
    porOperaria[reg.operariaId].ganado += reg.totalGanado;
    porOperaria[reg.operariaId].registros++;
  });
  
  res.json(Object.values(porOperaria));
});

/**
 * POST /api/pagos/marcar-semana
 * Marca una semana como pagada
 */
app.post("/api/pagos/marcar-semana", (req, res) => {
  const { semanaCodigo, operariaId } = req.body;
  
  if (!semanaCodigo) {
    return res.status(400).json({ error: "Código de semana es requerido" });
  }
  
  // Parsear código de semana
  const semanaInfo = resolverSemanaPorCodigo(String(semanaCodigo));
  if (!semanaInfo) {
    return res.status(400).json({ error: "Código de semana inválido" });
  }
  
  // Filtrar registros de esa semana
  let registrosAMarcar = registros.filter(r => {
    const fechaReg = new Date(r.fecha);
    const enSemana = fechaReg >= new Date(semanaInfo.inicio) && 
                     fechaReg <= new Date(semanaInfo.fin + 'T23:59:59');
    const pendiente = (r.estadoPago || 'pendiente') === 'pendiente';
    
    if (operariaId) {
      return enSemana && pendiente && r.operariaId === Number(operariaId);
    }
    
    return enSemana && pendiente;
  });
  
  if (registrosAMarcar.length === 0) {
    return res.status(400).json({ error: "No hay registros pendientes en esta semana" });
  }
  
  // Marcar como pagados
  const fechaPago = new Date().toISOString().split('T')[0];
  let totalPagado = 0;
  
  registrosAMarcar.forEach(reg => {
    reg.estadoPago = 'pagado';
    reg.semanaPago = semanaCodigo;
    reg.fechaPago = fechaPago;
    totalPagado += reg.totalGanado;
  });
  
  guardarDatos();
  
  res.json({
    ok: true,
    registrosActualizados: registrosAMarcar.length,
    totalPagado,
    semanaCodigo,
    fechaPago
  });
});

/**
 * Función helper para formatear fechas
 */
function formatearFechaCorta(fechaStr) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const fecha = new Date(fechaStr);
  return `${fecha.getDate()} ${meses[fecha.getMonth()]}`;
}

// =========================
// INICIAR SERVIDOR
// =========================

const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

app.listen(PORT, () => {
console.log(`📍 Puerto: ${PORT}`);
console.log("🌐 URL:", BASE_URL);

});