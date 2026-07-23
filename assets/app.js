import { createDataService } from "./data-service.js";

const $ = id => document.getElementById(id);

const escapeHTML = text =>
  String(text ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

let service;
let user;
let settings;
let selectedCategory = null;
let alerts = [];
let activeAlertId = null;
let seenAlerts = new Set();
let audioContext = null;
let alertsInitialized = false;

function toast(message, type = "ok") {
  const element = $("toast");
  element.textContent = message;
  element.className = `toast show ${type}`;
  setTimeout(() => {
    element.className = "toast";
  }, 3600);
}

function publicName(name) {
  const firstName = String(name || "Usuario").trim().split(/\s+/)[0];
  return firstName || "Usuario";
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function setExternalButton(buttonId, textId, enabled, value, label) {
  const button = $(buttonId);
  if (!button) return;

  const url = safeExternalUrl(value);
  const visible = Boolean(enabled && url);

  button.classList.toggle("hidden", !visible);
  button.href = visible ? url : "#";
  $(textId).textContent = label?.trim() || "Abrir";

  if (url.startsWith("http")) {
    button.target = "_blank";
  } else {
    button.removeAttribute("target");
  }
}

function setTheme() {
  document.documentElement.style.setProperty(
    "--primary",
    settings.color || "#c62828"
  );

  $("siteName").textContent = settings.name;
  document.title = settings.name;

  setExternalButton(
    "donationButton",
    "donationButtonText",
    settings.donationEnabled,
    settings.donationUrl,
    settings.donationLabel || "Donar"
  );

  setExternalButton(
    "contactAdminButton",
    "contactAdminButtonText",
    settings.contactAdminEnabled,
    settings.contactAdminUrl,
    settings.contactAdminLabel || "Contactar al administrador"
  );
}

function switchTab(tab) {
  const login = tab === "login";
  $("loginForm").classList.toggle("hidden", !login);
  $("registerForm").classList.toggle("hidden", login);
  $("tabLogin").classList.toggle("active", login);
  $("tabRegister").classList.toggle("active", !login);
}

function showApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");

  $("connectionMode").textContent =
    service.mode === "firebase"
      ? "En línea · sincronización entre equipos"
      : "Modo demostración · este navegador";

  renderCategories();
  renderProfile();
  refreshAlerts();
}

function showAuth() {
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");

  $("modeNote").textContent =
    service.mode === "firebase"
      ? "Sistema conectado a Firebase."
      : "Modo demostración: los datos quedan en este navegador. La recuperación por correo funciona al conectar Firebase.";
}

function renderCategories() {
  $("categoryGrid").innerHTML = settings.categories
    .map(category => `
      <button
        class="category ${selectedCategory === category.id ? "selected" : ""}"
        type="button"
        data-id="${escapeHTML(category.id)}"
      >
        <span>${escapeHTML(category.icon)}</span>
        <strong>${escapeHTML(category.name)}</strong>
      </button>
    `)
    .join("");

  document.querySelectorAll(".category").forEach(button => {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.id;
      $("alarmBtn").disabled = false;
      renderCategories();
    });
  });
}

function categoryById(id) {
  return (
    settings.categories.find(category => category.id === id) || {
      name: id || "Alerta",
      icon: "📢"
    }
  );
}

function statusLabel(status) {
  return {
    active: "Activa",
    resolved: "Resuelta",
    cancelled: "Cancelada"
  }[status] || "Activa";
}

function formatDate(value) {
  const date = new Date(value || Date.now());

  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function mapLink(alert) {
  if (alert.latitude == null || alert.longitude == null) return "";

  return `https://www.google.com/maps?q=${encodeURIComponent(
    `${alert.latitude},${alert.longitude}`
  )}`;
}

function renderAlerts() {
  const filter = $("alertFilter").value;
  const visibleAlerts = alerts.filter(
    alert => filter === "all" || alert.status === filter
  );

  if (!visibleAlerts.length) {
    $("alertsList").innerHTML =
      `<div class="empty card">Todavía no hay alertas para mostrar.</div>`;
    return;
  }

  $("alertsList").innerHTML = visibleAlerts
    .map(alert => {
      const category = categoryById(alert.categoryId);
      const link = mapLink(alert);
      const ownerBadge =
        alert.userId === user?.id
          ? `<span class="owner-badge">Tu alerta</span>`
          : "";

      return `
        <article
          class="alert-card ${escapeHTML(alert.status)}"
          data-id="${escapeHTML(alert.id)}"
        >
          <div class="alert-icon">${escapeHTML(category.icon)}</div>

          <div class="alert-main">
            <div class="alert-heading">
              <h3>${escapeHTML(category.name)} ${ownerBadge}</h3>
              <span class="status ${escapeHTML(alert.status)}">
                ${statusLabel(alert.status)}
              </span>
            </div>

            <p>${escapeHTML(
              alert.description || "Sin descripción adicional."
            )}</p>

            <div class="alert-meta">
              <span>👤 ${escapeHTML(publicName(alert.userName))}</span>
              <span>🕒 ${formatDate(alert.createdAt)}</span>
              <span>📍 Ubicación disponible en el mapa</span>
            </div>

            <div class="card-actions">
              <button class="btn secondary open-alert" type="button">
                Ver y responder
              </button>

              ${
                link
                  ? `<a class="btn map" href="${link}" target="_blank" rel="noopener">Abrir mapa</a>`
                  : ""
              }
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  document.querySelectorAll(".open-alert").forEach(button => {
    button.addEventListener("click", () => {
      openAlert(button.closest(".alert-card").dataset.id);
    });
  });
}

async function refreshAlerts(checkIncoming = false) {
  const previousIds = new Set(alerts.map(alert => alert.id));
  alerts = await service.getAlerts();
  renderAlerts();

  if (checkIncoming && alertsInitialized) {
    const incoming = alerts.find(
      alert =>
        !previousIds.has(alert.id) &&
        alert.userId !== user?.id &&
        alert.status === "active"
    );

    if (incoming && !seenAlerts.has(incoming.id)) {
      seenAlerts.add(incoming.id);
      playSiren();
      showBrowserNotification(incoming);
      toast(
        `Nueva alerta: ${categoryById(incoming.categoryId).name}`,
        "danger"
      );
    }
  }

  alertsInitialized = true;
}

async function getLocation() {
  $("locationStatus").textContent = "📍 Obteniendo ubicación…";

  if (!navigator.geolocation) {
    $("locationStatus").textContent =
      "⚠️ Este equipo no permite obtener ubicación.";
    return {};
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => {
        const location = {
          latitude: Number(position.coords.latitude.toFixed(6)),
          longitude: Number(position.coords.longitude.toFixed(6)),
          accuracy: Math.round(position.coords.accuracy)
        };

        $("locationStatus").textContent =
          `✅ Ubicación obtenida (precisión aproximada: ${location.accuracy} m).`;

        resolve(location);
      },
      error => {
        $("locationStatus").textContent =
          "⚠️ No se pudo obtener la ubicación. Revisa el permiso GPS.";

        resolve({ locationError: error.message });
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000
      }
    );
  });
}

async function sendAlert() {
  if (!selectedCategory || !user) return;

  const category = categoryById(selectedCategory);
  const description = $("alertDescription").value.trim();

  const confirmed = confirm(
    `Se enviará una alarma de "${category.name}" a la comunidad. ¿Confirmas que la alerta es real?`
  );

  if (!confirmed) return;

  $("alarmBtn").disabled = true;
  $("alarmBtn").classList.add("sending");

  const location = await getLocation();

  try {
    const alert = await service.createAlert({
      categoryId: selectedCategory,
      description,
      userId: user.id,
      userName: publicName(user.name),
      ...location
    });

    seenAlerts.add(alert.id);
    playSiren(15000);

    $("alertDescription").value = "";
    selectedCategory = null;

    renderCategories();
    await refreshAlerts();

    toast("Alerta enviada correctamente.", "danger");
  } catch (error) {
    console.error(error);
    toast(
      error.message || "No se pudo enviar la alerta.",
      "error"
    );
  } finally {
    $("alarmBtn").classList.remove("sending");
    $("alarmBtn").disabled = !selectedCategory;
  }
}

function playSiren(duration = 15000) {
  try {
    audioContext ||= new (
      window.AudioContext || window.webkitAudioContext
    )();

    const context = audioContext;
    const gain = context.createGain();
    const oscillator = context.createOscillator();

    oscillator.type = "sawtooth";
    oscillator.connect(gain);
    gain.connect(context.destination);

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.22,
      context.currentTime + 0.05
    );

    const start = context.currentTime;
    const end = start + duration / 1000;

    for (let time = start; time < end; time += 0.5) {
      oscillator.frequency.setValueAtTime(650, time);
      oscillator.frequency.linearRampToValueAtTime(
        1150,
        Math.min(time + 0.25, end)
      );
      oscillator.frequency.linearRampToValueAtTime(
        650,
        Math.min(time + 0.5, end)
      );
    }

    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.start(start);
    oscillator.stop(end + 0.05);

    navigator.vibrate?.([300, 150, 300, 150, 500]);
  } catch (error) {
    console.warn("No se pudo reproducir la sirena:", error);
  }
}

async function enableNotifications() {
  if (!("Notification" in window)) {
    toast("Este navegador no admite notificaciones.", "error");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    await service.registerPushToken(user).catch(console.warn);
    toast("Notificaciones activadas.");
  } else {
    toast(
      "El permiso de notificaciones no fue concedido.",
      "error"
    );
  }
}

function showBrowserNotification(alert) {
  if (
    !("Notification" in window) ||
    Notification.permission !== "granted"
  ) {
    return;
  }

  const category = categoryById(alert.categoryId);

  new Notification(`${category.icon} ${category.name}`, {
    body:
      `${publicName(alert.userName)}: ` +
      `${alert.description || "Nueva alerta comunitaria"}`,
    icon: "./assets/icon-192.png",
    tag: alert.id
  });
}

async function updateOwnAlertStatus(status) {
  const alert = alerts.find(item => item.id === activeAlertId);

  if (!alert || alert.userId !== user.id) {
    toast("Solo puedes modificar tus propias alertas.", "error");
    return;
  }

  const question =
    status === "resolved"
      ? "¿Confirmas que la alerta ya fue resuelta?"
      : "¿Confirmas que deseas cancelar esta alerta?";

  if (!confirm(question)) return;

  try {
    await service.updateAlert(alert.id, { status });
    await refreshAlerts();
    $("alertDialog").close();
    toast(
      status === "resolved"
        ? "Alerta marcada como resuelta."
        : "Alerta cancelada."
    );
  } catch (error) {
    toast(error.message || "No se pudo actualizar la alerta.", "error");
  }
}

async function openAlert(alertId) {
  const alert = alerts.find(item => item.id === alertId);
  if (!alert) return;

  activeAlertId = alertId;

  const category = categoryById(alert.categoryId);
  const link = mapLink(alert);
  const isOwner = alert.userId === user.id;
  const ownerActions =
    isOwner && alert.status === "active"
      ? `
        <div class="owner-actions">
          <button id="resolveOwnAlert" class="btn map" type="button">
            ✓ Marcar como resuelta
          </button>
          <button id="cancelOwnAlert" class="btn danger" type="button">
            Cancelar alerta
          </button>
        </div>
      `
      : "";

  $("alertDetail").innerHTML = `
    <div class="detail-icon">${escapeHTML(category.icon)}</div>
    <h2>${escapeHTML(category.name)}</h2>
    <p>${escapeHTML(
      alert.description || "Sin descripción adicional."
    )}</p>

    <dl class="detail-list">
      <div>
        <dt>Persona</dt>
        <dd>${escapeHTML(publicName(alert.userName))}</dd>
      </div>
      <div>
        <dt>Privacidad</dt>
        <dd>El teléfono, correo y dirección personal no se muestran.</dd>
      </div>
      <div>
        <dt>Fecha</dt>
        <dd>${formatDate(alert.createdAt)}</dd>
      </div>
      <div>
        <dt>Estado</dt>
        <dd>${statusLabel(alert.status)}</dd>
      </div>
    </dl>

    ${
      link
        ? `<a class="btn map full-btn" href="${link}" target="_blank" rel="noopener">📍 Ver ubicación en Google Maps</a>`
        : ""
    }

    ${ownerActions}
  `;

  $("resolveOwnAlert")?.addEventListener(
    "click",
    () => updateOwnAlertStatus("resolved")
  );

  $("cancelOwnAlert")?.addEventListener(
    "click",
    () => updateOwnAlertStatus("cancelled")
  );

  await renderMessages();
  $("alertDialog").showModal();
}

async function renderMessages() {
  const messages = await service.getMessages(activeAlertId);

  $("messagesList").innerHTML = messages.length
    ? messages
        .map(message => `
          <div class="message ${message.userId === user.id ? "mine" : ""}">
            <strong>${escapeHTML(publicName(message.userName))}</strong>
            <p>${escapeHTML(message.text)}</p>
            <small>${formatDate(message.createdAt)}</small>
          </div>
        `)
        .join("")
    : `<p class="muted">Todavía no hay respuestas.</p>`;

  $("messagesList").scrollTop =
    $("messagesList").scrollHeight;
}

function renderProfile() {
  $("profileContent").innerHTML = user
    ? `
      <div class="profile-card">
        <div class="avatar">
          ${escapeHTML(user.name?.charAt(0).toUpperCase() || "U")}
        </div>
        <h3>${escapeHTML(user.name)}</h3>
        <p>${escapeHTML(user.email)}</p>
        <p>📞 ${escapeHTML(user.phone || "Sin teléfono")}</p>
        <p>📍 ${escapeHTML(user.address || "Sin dirección")}</p>
        <small class="muted">
          Estos datos solo son visibles en tu perfil y en el administrador.
        </small>
      </div>
    `
    : "";
}

async function recoverPassword() {
  const email =
    $("loginEmail").value.trim() ||
    prompt("Escribe el correo de la cuenta:");

  if (!email) return;

  try {
    const result = await service.requestPasswordReset(email);

    if (result.demo) {
      toast(result.message, "error");
    } else {
      toast(
        "Se envió un enlace de recuperación al correo indicado."
      );
    }
  } catch (error) {
    toast(
      error.message ||
        "No se pudo enviar el correo de recuperación.",
      "error"
    );
  }
}

async function init() {
  service = await createDataService();
  settings = await service.getSettings();
  setTheme();

  user = service.currentUser();

  if (user) {
    showApp();
  } else {
    showAuth();
  }

  service.onChange(async () => {
    settings = await service.getSettings();
    setTheme();
    renderCategories();

    if (user) {
      await refreshAlerts(true);

      if (activeAlertId && $("alertDialog").open) {
        await renderMessages();
      }
    }
  });

  window.addEventListener("ac-change", async event => {
    if (!user) return;

    if (
      event.detail?.type === "alert-created" &&
      event.detail.payload?.userId !== user.id
    ) {
      await refreshAlerts(true);
    } else {
      await refreshAlerts();
    }

    if (activeAlertId && $("alertDialog").open) {
      await renderMessages();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(console.warn);
  }
}

$("tabLogin").addEventListener(
  "click",
  () => switchTab("login")
);

$("tabRegister").addEventListener(
  "click",
  () => switchTab("register")
);

$("forgotPasswordBtn").addEventListener(
  "click",
  recoverPassword
);

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    user = await service.login(
      $("loginEmail").value,
      $("loginPassword").value
    );

    settings = await service.getSettings();
    setTheme();
    showApp();

    toast(`Bienvenido, ${publicName(user.name)}.`);
  } catch (error) {
    toast(error.message, "error");
  }
});

$("registerForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    user = await service.register(
      {
        name: $("regName").value,
        email: $("regEmail").value,
        phone: $("regPhone").value,
        address: $("regAddress").value
      },
      $("regPassword").value
    );

    showApp();
    toast("Cuenta creada correctamente.");
  } catch (error) {
    toast(error.message, "error");
  }
});

$("alarmBtn").addEventListener("click", sendAlert);
$("alertFilter").addEventListener("change", renderAlerts);
$("enableNotifications").addEventListener(
  "click",
  enableNotifications
);

$("logoutBtn").addEventListener("click", async () => {
  await service.logout();
  user = null;
  alerts = [];
  showAuth();
});

$("closeDialog").addEventListener(
  "click",
  () => $("alertDialog").close()
);

$("profileBtn").addEventListener(
  "click",
  () => $("profileDialog").showModal()
);

$("closeProfile").addEventListener(
  "click",
  () => $("profileDialog").close()
);

$("messageForm").addEventListener("submit", async event => {
  event.preventDefault();

  const text = $("messageInput").value.trim();
  if (!text || !activeAlertId) return;

  try {
    await service.sendMessage({
      alertId: activeAlertId,
      text,
      userId: user.id,
      userName: publicName(user.name)
    });

    $("messageInput").value = "";
    await renderMessages();
  } catch (error) {
    toast(
      error.message || "No se pudo enviar el mensaje.",
      "error"
    );
  }
});

init().catch(error => {
  console.error(error);
  toast(
    "No se pudo iniciar el sistema. Revisa la configuración.",
    "error"
  );
});
