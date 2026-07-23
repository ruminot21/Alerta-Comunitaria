import { createDataService, defaultSettings } from "./data-service.js";

const $ = id => document.getElementById(id);

const escapeHTML = text =>
  String(text ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));

const ADMIN_SESSION = "ac_admin_session";
const ADMIN_SECRET = "ac_admin_secret";

let service;
let adminSecret = "";
let settings;
let alerts = [];
let users = [];

function toast(message, type = "ok") {
  const element = $("toast");
  element.textContent = message;
  element.className = `toast show ${type}`;

  setTimeout(() => {
    element.className = "toast";
  }, 3400);
}

function statusLabel(status) {
  return {
    active: "Activa",
    resolved: "Resuelta",
    cancelled: "Cancelada"
  }[status] || status;
}

function validateContactUrl(value) {
  if (!value.trim()) return true;

  try {
    const url = new URL(value.trim());
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function enterPanel() {
  $("adminLogin").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");
  refresh();
}

function leavePanel() {
  sessionStorage.removeItem(ADMIN_SESSION);
  sessionStorage.removeItem(ADMIN_SECRET);
  adminSecret = "";
  $("adminPanel").classList.add("hidden");
  $("adminLogin").classList.remove("hidden");
}

async function refresh() {
  try {
    const dashboard = await service.adminGetDashboard(adminSecret);
    settings = { ...defaultSettings, ...dashboard.settings };
    alerts = dashboard.alerts || [];
    users = dashboard.users || [];

    renderSettings();
    renderCategories();
    renderAlerts();
    renderUsers();
    renderStats();
  } catch (error) {
    toast(error.message || "No se pudo cargar el administrador.", "error");

    if (/contraseña|administrativa/i.test(error.message || "")) {
      leavePanel();
    }
  }
}

function renderStats() {
  $("statUsers").textContent = users.length;
  $("statActive").textContent =
    alerts.filter(alert => alert.status === "active").length;
  $("statTotal").textContent = alerts.length;
}

function renderSettings() {
  $("settingName").value = settings.name || defaultSettings.name;
  $("settingColor").value = settings.color || "#c62828";
  $("settingRadius").value = settings.radius || 10;

  $("settingDonationEnabled").checked =
    Boolean(settings.donationEnabled);
  $("settingDonationLabel").value =
    settings.donationLabel || "Donar";
  $("settingDonationUrl").value =
    settings.donationUrl || "";

  $("settingContactEnabled").checked =
    Boolean(settings.contactAdminEnabled);
  $("settingContactLabel").value =
    settings.contactAdminLabel || "Contactar al administrador";
  $("settingContactUrl").value =
    settings.contactAdminUrl || "";
}

function renderCategories() {
  $("categoriesAdmin").innerHTML = settings.categories
    .map((category, index) => `
      <div class="admin-list-row" data-index="${index}">
        <input
          class="cat-icon"
          value="${escapeHTML(category.icon)}"
          maxlength="4"
          aria-label="Ícono"
        >

        <input
          class="cat-name"
          value="${escapeHTML(category.name)}"
          maxlength="60"
          aria-label="Nombre"
        >

        <button class="btn secondary save-cat" type="button">
          Guardar
        </button>

        <button class="btn danger delete-cat" type="button">
          Eliminar
        </button>
      </div>
    `)
    .join("");

  document.querySelectorAll(".save-cat").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest(".admin-list-row");
      const index = Number(row.dataset.index);

      settings.categories[index] = {
        ...settings.categories[index],
        icon: row.querySelector(".cat-icon").value.trim() || "📢",
        name:
          row.querySelector(".cat-name").value.trim() ||
          "Nueva categoría"
      };

      await service.adminSaveSettings(adminSecret, settings);
      toast("Categoría guardada.");
    });
  });

  document.querySelectorAll(".delete-cat").forEach(button => {
    button.addEventListener("click", async () => {
      const index = Number(
        button.closest(".admin-list-row").dataset.index
      );

      if (!confirm("¿Eliminar esta categoría?")) return;

      settings.categories.splice(index, 1);
      await service.adminSaveSettings(adminSecret, settings);
      renderCategories();
      toast("Categoría eliminada.");
    });
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value || Date.now()));
}

function userById(userId) {
  return users.find(user => user.id === userId);
}

function renderAlerts() {
  if (!alerts.length) {
    $("adminAlerts").innerHTML =
      `<p class="muted">No hay alertas registradas.</p>`;
    return;
  }

  $("adminAlerts").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Categoría</th>
          <th>Persona</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>

      <tbody>
        ${alerts
          .map(alert => {
            const category =
              settings.categories.find(
                item => item.id === alert.categoryId
              ) || { name: alert.categoryId };

            const registeredUser = userById(alert.userId);
            const person = registeredUser
              ? `${registeredUser.name} · ${registeredUser.email}`
              : alert.userName || "Usuario eliminado";

            return `
              <tr data-id="${escapeHTML(alert.id)}">
                <td>${formatDate(alert.createdAt)}</td>
                <td>${escapeHTML(category.name)}</td>
                <td>${escapeHTML(person)}</td>
                <td>
                  <span class="status ${escapeHTML(alert.status)}">
                    ${statusLabel(alert.status)}
                  </span>
                </td>
                <td class="table-actions">
                  <select class="admin-alert-status">
                    <option value="active" ${alert.status === "active" ? "selected" : ""}>Activa</option>
                    <option value="resolved" ${alert.status === "resolved" ? "selected" : ""}>Resuelta</option>
                    <option value="cancelled" ${alert.status === "cancelled" ? "selected" : ""}>Cancelada</option>
                  </select>

                  <button class="btn secondary save-alert-status" type="button">
                    Guardar
                  </button>

                  <button class="btn danger remove-alert" type="button">
                    Eliminar
                  </button>
                </td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  document
    .querySelectorAll(".save-alert-status")
    .forEach(button => {
      button.addEventListener("click", async () => {
        const row = button.closest("tr");
        const alertId = row.dataset.id;
        const status =
          row.querySelector(".admin-alert-status").value;

        await service.adminUpdateAlert(
          adminSecret,
          alertId,
          { status }
        );

        await refresh();
        toast("Estado de la alerta actualizado.");
      });
    });

  document.querySelectorAll(".remove-alert").forEach(button => {
    button.addEventListener("click", async () => {
      const alertId = button.closest("tr").dataset.id;

      if (!confirm("¿Eliminar esta alerta y sus mensajes?")) {
        return;
      }

      await service.adminDeleteAlert(adminSecret, alertId);
      await refresh();
      toast("Alerta eliminada.");
    });
  });
}

function renderUsers() {
  if (!users.length) {
    $("adminUsers").innerHTML =
      `<p class="muted">No hay usuarios registrados.</p>`;
    return;
  }

  $("adminUsers").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Teléfono</th>
          <th>Sector</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>

      <tbody>
        ${users
          .map(user => `
            <tr data-id="${escapeHTML(user.id)}">
              <td>${escapeHTML(user.name)}</td>
              <td>${escapeHTML(user.email)}</td>
              <td>${escapeHTML(user.phone || "")}</td>
              <td>${escapeHTML(user.address || "")}</td>
              <td>
                <select class="admin-user-status" aria-label="Estado del usuario">
                  <option value="active" ${user.status !== "blocked" ? "selected" : ""}>Activo</option>
                  <option value="blocked" ${user.status === "blocked" ? "selected" : ""}>Bloqueado</option>
                </select>
              </td>
              <td class="table-actions">
                <button class="btn secondary save-user-status" type="button">
                  Guardar estado
                </button>

                <button class="btn map reset-user-password" type="button">
                  Cambiar clave
                </button>

                <button class="btn danger delete-user" type="button">
                  Eliminar
                </button>
              </td>
            </tr>
          `)
          .join("")}
      </tbody>
    </table>
  `;

  document.querySelectorAll(".save-user-status").forEach(button => {
    button.addEventListener("click", async () => {
      const row = button.closest("tr");
      const userId = row.dataset.id;
      const newStatus = row.querySelector(".admin-user-status").value;

      await service.adminUpdateUserStatus(
        adminSecret,
        userId,
        newStatus
      );

      await refresh();
      toast("Estado del usuario actualizado.");
    });
  });

  document
    .querySelectorAll(".reset-user-password")
    .forEach(button => {
      button.addEventListener("click", async () => {
        const userId = button.closest("tr").dataset.id;
        const registeredUser = users.find(item => item.id === userId);

        const newPassword = prompt(
          `Nueva contraseña para ${registeredUser.name}:`
        );

        if (!newPassword) return;

        if (newPassword.length < 6) {
          toast(
            "La nueva contraseña debe tener al menos 6 caracteres.",
            "error"
          );
          return;
        }

        const confirmation = prompt(
          "Repite la nueva contraseña:"
        );

        if (confirmation !== newPassword) {
          toast("Las contraseñas no coinciden.", "error");
          return;
        }

        await service.adminUpdateUserPassword(
          adminSecret,
          userId,
          newPassword
        );

        toast("Contraseña del usuario modificada.");
      });
    });

  document.querySelectorAll(".delete-user").forEach(button => {
    button.addEventListener("click", async () => {
      const userId = button.closest("tr").dataset.id;
      const registeredUser = users.find(item => item.id === userId);

      if (
        !confirm(
          `¿Eliminar definitivamente la cuenta de ${registeredUser.name}?`
        )
      ) {
        return;
      }

      await service.adminDeleteUser(
        adminSecret,
        userId
      );

      await refresh();
      toast("Usuario eliminado.");
    });
  });
}

function exportCSV() {
  const rows = [
    [
      "Fecha",
      "Categoría",
      "Persona",
      "Correo",
      "Teléfono",
      "Dirección",
      "Descripción",
      "Estado",
      "Latitud",
      "Longitud"
    ],
    ...alerts.map(alert => {
      const category =
        settings.categories.find(
          item => item.id === alert.categoryId
        )?.name || alert.categoryId;

      const registeredUser = userById(alert.userId);

      return [
        alert.createdAt,
        category,
        registeredUser?.name || alert.userName,
        registeredUser?.email || "",
        registeredUser?.phone || "",
        registeredUser?.address || "",
        alert.description,
        alert.status,
        alert.latitude,
        alert.longitude
      ];
    })
  ];

  const csv = rows
    .map(row =>
      row
        .map(value =>
          `"${String(value ?? "").replaceAll('"', '""')}"`
        )
        .join(",")
    )
    .join("\n");

  const blob = new Blob(
    ["\ufeff" + csv],
    { type: "text/csv;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download =
    `alertas-${new Date().toISOString().slice(0, 10)}.csv`;

  link.click();
  URL.revokeObjectURL(url);
}

async function restoreSession() {
  const storedSecret = sessionStorage.getItem(ADMIN_SECRET);

  if (!storedSecret) return;

  try {
    await service.verifyAdminPassword(storedSecret);
    adminSecret = storedSecret;
    sessionStorage.setItem(ADMIN_SESSION, "ok");
    enterPanel();
  } catch {
    leavePanel();
  }
}

async function init() {
  service = await createDataService();
  await restoreSession();
}

$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const password = $("adminPassword").value;

  try {
    await service.verifyAdminPassword(password);
    adminSecret = password;

    sessionStorage.setItem(ADMIN_SESSION, "ok");
    sessionStorage.setItem(ADMIN_SECRET, password);

    $("adminPassword").value = "";
    enterPanel();
  } catch (error) {
    toast(error.message || "Contraseña incorrecta.", "error");
  }
});

$("adminLogout").addEventListener("click", leavePanel);

$("settingsForm").addEventListener("submit", async event => {
  event.preventDefault();

  const donationEnabled =
    $("settingDonationEnabled").checked;
  const donationUrl =
    $("settingDonationUrl").value.trim();

  const contactEnabled =
    $("settingContactEnabled").checked;
  const contactUrl =
    $("settingContactUrl").value.trim();

  if (donationEnabled && !validateContactUrl(donationUrl)) {
    toast("El enlace de donación no es válido.", "error");
    return;
  }

  if (contactEnabled && !validateContactUrl(contactUrl)) {
    toast(
      "El enlace de contacto debe comenzar con https://, mailto: o tel:.",
      "error"
    );
    return;
  }

  settings = {
    ...settings,
    name: $("settingName").value.trim(),
    color: $("settingColor").value,
    radius: Number($("settingRadius").value),
    donationEnabled,
    donationLabel:
      $("settingDonationLabel").value.trim() || "Donar",
    donationUrl,
    contactAdminEnabled: contactEnabled,
    contactAdminLabel:
      $("settingContactLabel").value.trim() ||
      "Contactar al administrador",
    contactAdminUrl: contactUrl
  };

  await service.adminSaveSettings(
    adminSecret,
    settings
  );

  toast("Configuración guardada.");
});

$("passwordForm").addEventListener("submit", async event => {
  event.preventDefault();

  const currentPassword =
    $("currentPassword").value;
  const newPassword =
    $("newPassword").value;
  const repeated =
    $("repeatPassword").value;

  if (newPassword !== repeated) {
    toast("Las contraseñas nuevas no coinciden.", "error");
    return;
  }

  try {
    await service.changeAdminPassword(
      currentPassword,
      newPassword
    );

    adminSecret = newPassword;
    sessionStorage.setItem(ADMIN_SECRET, newPassword);

    event.target.reset();
    toast("Contraseña del administrador cambiada.");
  } catch (error) {
    toast(error.message, "error");
  }
});

$("addCategory").addEventListener("click", async () => {
  settings.categories.push({
    id: `categoria_${Date.now()}`,
    name: "Nueva categoría",
    icon: "📢"
  });

  await service.adminSaveSettings(
    adminSecret,
    settings
  );

  renderCategories();
});

$("exportAlerts").addEventListener(
  "click",
  exportCSV
);

init().catch(error => {
  console.error(error);
  toast("No se pudo iniciar el panel.", "error");
});
