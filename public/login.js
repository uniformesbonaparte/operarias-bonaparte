// login.js
// Lógica de autenticación para el frontend moderno

document.addEventListener("DOMContentLoaded", async () => {
  const listaAdmin = document.getElementById("lista-admin");
  const listaOperarias = document.getElementById("lista-operarias");
  const passwordUser = document.getElementById("password-user");
  const inputPassword = document.getElementById("input-password");
  const btnEntrar = document.getElementById("btn-entrar");
  const passwordError = document.getElementById("password-error");

  let perfilSeleccionado = null;
  let operariasDisponibles = [];

  // Función para crear tarjeta de perfil
  function crearPerfilCard(perfil, esOperaria = false) {
    const card = document.createElement("div");
    card.className = "perfil-card";
    
    if (perfil.id && perfilSeleccionado && perfilSeleccionado.id === perfil.id) {
      card.classList.add("selected");
    }

    const avatarClass = esOperaria ? "avatar-operaria" : 
                       (perfil.tipo === "admin" ? "avatar-admin" : "avatar-encargada");
    
    const inicial = perfil.nombre ? perfil.nombre.charAt(0).toUpperCase() : "?";
    const emoji = esOperaria ? "👤" : (perfil.tipo === "admin" ? "👑" : "📋");

    card.innerHTML = `
      <div class="perfil-avatar ${avatarClass}">${emoji}</div>
      <div class="perfil-main">
        <div class="perfil-nombre">${perfil.nombre}</div>
        <div class="perfil-sub">
          ${perfil.usuario ? `<span>@${perfil.usuario}</span>` : ""}
          ${perfil.tipo ? `<span class="perfil-tag ${perfil.tipo === 'admin' ? 'pill-admin' : perfil.tipo === 'encargada' ? 'pill-encargada' : ''}">${perfil.tipo}</span>` : ""}
        </div>
      </div>
    `;

    card.addEventListener("click", () => seleccionarPerfil(perfil, card));
    return card;
  }

  // Función para seleccionar perfil
  function seleccionarPerfil(perfil, cardElement) {
    perfilSeleccionado = perfil;
    passwordUser.textContent = perfil.nombre;
    inputPassword.value = "";
    inputPassword.disabled = false;
    btnEntrar.disabled = false;
    passwordError.textContent = "";

    // Actualizar selección visual
    document.querySelectorAll(".perfil-card").forEach(c => c.classList.remove("selected"));
    cardElement.classList.add("selected");

    // Focus en el input
    setTimeout(() => inputPassword.focus(), 100);
  }

  // Cargar perfiles de administración
  function cargarPerfilesAdmin() {
    listaAdmin.innerHTML = "";
    
    const perfilesAdmin = [
      { tipo: "admin", nombre: "Administrador", usuario: "admin" },
      { tipo: "encargada", nombre: "Encargada", usuario: "encargada" }
    ];

    perfilesAdmin.forEach(perfil => {
      const card = crearPerfilCard(perfil, false);
      listaAdmin.appendChild(card);
    });
  }

  // Cargar operarias desde el backend
  async function cargarOperarias() {
    try {
      const res = await fetch("/api/operarias");
      if (!res.ok) throw new Error("Error al cargar operarias");
      
      const operarias = await res.json();
      operariasDisponibles = operarias;
      
      listaOperarias.innerHTML = "";
      
      if (operarias.length === 0) {
        listaOperarias.innerHTML = `
          <div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">
            No hay operarias registradas
          </div>
        `;
        return;
      }

      // Filtrar solo operarias activas
      const operariasActivas = operarias.filter(op => op.activa !== false);
      
      operariasActivas.forEach(operaria => {
        const perfil = {
          id: operaria.id,
          tipo: "operaria",
          nombre: operaria.nombre,
          usuario: operaria.usuario || operaria.nombre.toLowerCase()
        };
        const card = crearPerfilCard(perfil, true);
        listaOperarias.appendChild(card);
      });

    } catch (err) {
      console.error("Error cargando operarias:", err);
      listaOperarias.innerHTML = `
        <div style="padding: 16px; text-align: center; color: var(--danger); font-size: 13px;">
          ⚠️ Error al cargar operarias
        </div>
      `;
    }
  }

  // Función de login
  async function intentarLogin() {
    if (!perfilSeleccionado) {
      passwordError.textContent = "Selecciona un perfil primero";
      return;
    }

    const password = inputPassword.value.trim();
    if (!password) {
      passwordError.textContent = "Escribe tu contraseña";
      inputPassword.focus();
      return;
    }

    btnEntrar.disabled = true;
    btnEntrar.textContent = "Verificando...";
    passwordError.textContent = "";

    try {
      // Determinar el usuario para el login
      let usuario;
      if (perfilSeleccionado.tipo === "admin") {
        usuario = "admin";
      } else if (perfilSeleccionado.tipo === "encargada") {
        usuario = "encargada";
      } else {
        // Para operarias, usar el usuario o ID
        usuario = perfilSeleccionado.usuario || String(perfilSeleccionado.id);
      }

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password })
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.mensaje || "Contraseña incorrecta");
      }

      // Guardar sesión
      const usuarioActual = {
        tipo: data.tipo || data.rol,
        rol: data.rol,
        nombre: data.nombre,
        id: data.id,
        idOperaria: data.idOperaria
      };

      localStorage.setItem("usuarioActual", JSON.stringify(usuarioActual));

      // Redirigir al dashboard
      window.location.href = "/dashboard";

    } catch (err) {
      console.error("Error de login:", err);
      passwordError.textContent = err.message || "Error al iniciar sesión";
      btnEntrar.disabled = false;
      btnEntrar.textContent = "Entrar →";
      inputPassword.value = "";
      inputPassword.focus();
    }
  }

  // Event listeners
  if (btnEntrar) {
    btnEntrar.addEventListener("click", intentarLogin);
  }

  if (inputPassword) {
    inputPassword.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !btnEntrar.disabled) {
        intentarLogin();
      }
    });
  }

  // Inicializar
  cargarPerfilesAdmin();
  await cargarOperarias();

  // Limpiar cualquier sesión previa
  localStorage.removeItem("usuarioActual");
});
