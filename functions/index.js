const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");

admin.initializeApp();

const db = admin.firestore();
const DEFAULT_ADMIN_PASSWORD = "1234";

function hashPassword(value) {
  return crypto
    .createHash("sha256")
    .update(String(value))
    .digest("hex");
}

function jsonDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  return value;
}

function serializeDocument(document) {
  const data = document.data();

  return {
    id: document.id,
    ...Object.fromEntries(
      Object.entries(data).map(([key, value]) => [
        key,
        jsonDate(value)
      ])
    )
  };
}

async function checkAdminPassword(password) {
  const reference = db.doc("system/adminSecurity");
  const snapshot = await reference.get();

  const storedHash = snapshot.exists
    ? snapshot.data().passwordHash
    : hashPassword(DEFAULT_ADMIN_PASSWORD);

  return hashPassword(password || "") === storedHash;
}

async function requireAdmin(password) {
  const valid = await checkAdminPassword(password);

  if (!valid) {
    const error = new Error("Contraseña administrativa incorrecta.");
    error.statusCode = 401;
    throw error;
  }
}

async function deleteAlertAndMessages(alertId) {
  const messages = await db
    .collection("messages")
    .where("alertId", "==", alertId)
    .get();

  let batch = db.batch();
  let count = 0;

  for (const document of messages.docs) {
    batch.delete(document.ref);
    count += 1;

    if (count === 450) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  if (count) {
    await batch.commit();
  }

  await db.doc(`alerts/${alertId}`).delete();
}

exports.adminManage = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 60
  },
  async (request, response) => {
    response.set("Access-Control-Allow-Origin", "*");
    response.set(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );
    response.set(
      "Access-Control-Allow-Methods",
      "POST, OPTIONS"
    );

    if (request.method === "OPTIONS") {
      response.status(204).send("");
      return;
    }

    if (request.method !== "POST") {
      response.status(405).json({
        ok: false,
        error: "Método no permitido."
      });
      return;
    }

    const {
      action,
      password,
      payload = {}
    } = request.body || {};

    try {
      await requireAdmin(password);

      if (action === "verify") {
        response.json({ ok: true, data: true });
        return;
      }

      if (action === "changeAdminPassword") {
        const newPassword = String(
          payload.newPassword || ""
        );

        if (newPassword.length < 4) {
          throw new Error(
            "La contraseña administrativa debe tener al menos 4 caracteres."
          );
        }

        await db.doc("system/adminSecurity").set({
          passwordHash: hashPassword(newPassword),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        response.json({ ok: true, data: true });
        return;
      }

      if (action === "dashboard") {
        const [settingsSnapshot, alertsSnapshot, usersSnapshot] =
          await Promise.all([
            db.doc("settings/general").get(),
            db.collection("alerts")
              .orderBy("createdAt", "desc")
              .limit(300)
              .get(),
            db.collection("users")
              .orderBy("createdAt", "desc")
              .limit(1000)
              .get()
          ]);

        response.json({
          ok: true,
          data: {
            settings: settingsSnapshot.exists
              ? settingsSnapshot.data()
              : {},
            alerts: alertsSnapshot.docs.map(serializeDocument),
            users: usersSnapshot.docs.map(serializeDocument)
          }
        });
        return;
      }

      if (action === "saveSettings") {
        await db.doc("settings/general").set(
          payload.settings || {},
          { merge: true }
        );

        response.json({
          ok: true,
          data: payload.settings || {}
        });
        return;
      }

      if (action === "updateAlert") {
        const alertId = String(payload.alertId || "");
        const status = payload.patch?.status;

        if (!alertId) throw new Error("Falta el ID de la alerta.");

        if (
          status &&
          !["active", "resolved", "cancelled"].includes(status)
        ) {
          throw new Error("Estado de alerta no válido.");
        }

        await db.doc(`alerts/${alertId}`).update({
          ...(payload.patch || {}),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        response.json({ ok: true, data: true });
        return;
      }

      if (action === "deleteAlert") {
        const alertId = String(payload.alertId || "");
        if (!alertId) throw new Error("Falta el ID de la alerta.");

        await deleteAlertAndMessages(alertId);
        response.json({ ok: true, data: true });
        return;
      }

      if (action === "updateUserStatus") {
        const userId = String(payload.userId || "");
        const status = payload.status;

        if (!userId) throw new Error("Falta el ID del usuario.");
        if (!["active", "blocked"].includes(status)) {
          throw new Error("Estado de usuario no válido.");
        }

        await db.doc(`users/${userId}`).update({ status });

        if (status === "blocked") {
          await admin.auth().revokeRefreshTokens(userId);
        }

        response.json({ ok: true, data: true });
        return;
      }

      if (action === "updateUserPassword") {
        const userId = String(payload.userId || "");
        const newPassword = String(payload.newPassword || "");

        if (!userId) throw new Error("Falta el ID del usuario.");
        if (newPassword.length < 6) {
          throw new Error(
            "La contraseña del usuario debe tener al menos 6 caracteres."
          );
        }

        await admin.auth().updateUser(userId, {
          password: newPassword
        });

        await admin.auth().revokeRefreshTokens(userId);

        response.json({ ok: true, data: true });
        return;
      }

      if (action === "deleteUser") {
        const userId = String(payload.userId || "");
        if (!userId) throw new Error("Falta el ID del usuario.");

        await admin.auth().deleteUser(userId).catch(error => {
          if (error.code !== "auth/user-not-found") throw error;
        });

        await db.doc(`users/${userId}`).delete();

        const userAlerts = await db
          .collection("alerts")
          .where("userId", "==", userId)
          .get();

        const batch = db.batch();

        userAlerts.docs.forEach(document => {
          batch.update(document.ref, {
            userName: "Usuario eliminado",
            userDeleted: true
          });
        });

        if (!userAlerts.empty) {
          await batch.commit();
        }

        response.json({ ok: true, data: true });
        return;
      }

      throw new Error("Acción administrativa no reconocida.");
    } catch (error) {
      console.error(error);

      response
        .status(error.statusCode || 400)
        .json({
          ok: false,
          error:
            error.message ||
            "No se pudo completar la operación."
        });
    }
  }
);

exports.notifyNewAlert = onDocumentCreated(
  "alerts/{alertId}",
  async event => {
    const alert = event.data?.data();
    if (!alert) return;

    const devices = await db.collection("devices").get();

    const tokens = devices.docs
      .map(document => document.data().token)
      .filter(Boolean);

    if (!tokens.length) return;

    const message = {
      tokens,
      data: {
        title: "🚨 Nueva alerta comunitaria",
        body:
          `${alert.userName || "Un vecino"}: ` +
          `${alert.description || alert.categoryId || "Nueva alerta"}`,
        alertId: event.params.alertId
      },
      webpush: {
        fcmOptions: { link: "/" }
      }
    };

    const result =
      await admin.messaging().sendEachForMulticast(message);

    const invalidTokens = [];

    result.responses.forEach((item, index) => {
      if (!item.success) invalidTokens.push(tokens[index]);
    });

    await Promise.all(
      invalidTokens.map(token =>
        db.doc(`devices/${token}`).delete().catch(() => null)
      )
    );
  }
);
