import {
  firebaseConfig,
  firebaseIsConfigured,
  functionsRegion,
  vapidKey
} from "./firebase-config.js";

const LS = {
  users: "ac_users",
  alerts: "ac_alerts",
  messages: "ac_messages",
  session: "ac_session",
  settings: "ac_settings",
  adminPassword: "ac_admin_password"
};

const defaultSettings = {
  name: "Alerta Comunitaria",
  color: "#c62828",
  radius: 10,
  donationEnabled: false,
  donationLabel: "Donar",
  donationUrl: "",
  contactAdminEnabled: true,
  contactAdminLabel: "Contactar al administrador",
  contactAdminUrl: "",
  categories: [
    { id: "incendio", name: "Incendio", icon: "🔥" },
    { id: "anegamiento", name: "Anegamiento", icon: "🌊" },
    { id: "mascota", name: "Pérdida de mascotas", icon: "🐶" },
    { id: "medica", name: "Emergencia médica", icon: "🚑" },
    { id: "robo", name: "Robo o inseguridad", icon: "🚔" },
    { id: "accidente", name: "Accidente", icon: "🚗" },
    { id: "energia", name: "Corte de energía", icon: "⚡" },
    { id: "otra", name: "Otra alerta", icon: "📢" }
  ]
};

function parse(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function id(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function cleanUser(user) {
  if (!user) return null;
  const { password, ...safe } = user;
  return safe;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") return value;
  if (value.toDate) return value.toDate().toISOString();
  if (value._seconds) return new Date(value._seconds * 1000).toISOString();
  return new Date(value).toISOString();
}

class DemoService {
  constructor() {
    this.mode = "demo";
    this.channel = "BroadcastChannel" in window
      ? new BroadcastChannel("alerta-comunitaria")
      : null;
  }

  async init() {
    if (!localStorage.getItem(LS.settings)) {
      save(LS.settings, defaultSettings);
    }
    return this;
  }

  onChange(callback) {
    const storageHandler = () => callback();
    const channelHandler = () => callback();
    window.addEventListener("storage", storageHandler);
    this.channel?.addEventListener("message", channelHandler);

    return () => {
      window.removeEventListener("storage", storageHandler);
      this.channel?.removeEventListener("message", channelHandler);
    };
  }

  emit(type, payload = {}) {
    this.channel?.postMessage({ type, payload, at: Date.now() });
    window.dispatchEvent(
      new CustomEvent("ac-change", { detail: { type, payload } })
    );
  }

  currentUser() {
    const session = parse(LS.session, null);
    if (!session?.id) return null;
    const user = parse(LS.users, []).find(item => item.id === session.id);
    return cleanUser(user);
  }

  async register(profile, password) {
    const users = parse(LS.users, []);
    const email = profile.email.trim().toLowerCase();

    if (users.some(item => item.email === email)) {
      throw new Error("Ese correo ya está registrado.");
    }

    const user = {
      id: id("usr"),
      name: profile.name.trim(),
      email,
      phone: profile.phone.trim(),
      address: profile.address.trim(),
      password,
      createdAt: new Date().toISOString(),
      status: "active"
    };

    users.push(user);
    save(LS.users, users);
    save(LS.session, { id: user.id });
    this.emit("user-created", cleanUser(user));
    return cleanUser(user);
  }

  async login(email, password) {
    const user = parse(LS.users, []).find(
      item =>
        item.email === email.trim().toLowerCase() &&
        item.password === password
    );

    if (!user) throw new Error("Correo o contraseña incorrectos.");
    if (user.status === "blocked") {
      throw new Error("Esta cuenta está bloqueada.");
    }

    save(LS.session, { id: user.id });
    return cleanUser(user);
  }

  async logout() {
    localStorage.removeItem(LS.session);
  }

  async requestPasswordReset(email) {
    const exists = parse(LS.users, []).some(
      user => user.email === email.trim().toLowerCase()
    );

    if (!exists) {
      throw new Error("No existe una cuenta con ese correo.");
    }

    return {
      demo: true,
      message:
        "El modo demostración no puede enviar correos. Al conectar Firebase, se enviará un enlace real de recuperación."
    };
  }

  async createAlert(data) {
    const alert = {
      id: id("alt"),
      ...data,
      status: "active",
      createdAt: new Date().toISOString()
    };

    const alerts = parse(LS.alerts, []);
    alerts.push(alert);
    save(LS.alerts, alerts);
    this.emit("alert-created", alert);
    return alert;
  }

  async getAlerts() {
    return parse(LS.alerts, []).sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  async updateAlert(alertId, patch) {
    const alerts = parse(LS.alerts, []);
    const index = alerts.findIndex(alert => alert.id === alertId);

    if (index < 0) throw new Error("Alerta no encontrada.");

    alerts[index] = {
      ...alerts[index],
      ...patch,
      updatedAt: new Date().toISOString()
    };

    save(LS.alerts, alerts);
    this.emit("alert-updated", alerts[index]);
    return alerts[index];
  }

  async sendMessage(data) {
    const message = {
      id: id("msg"),
      ...data,
      createdAt: new Date().toISOString()
    };

    const messages = parse(LS.messages, []);
    messages.push(message);
    save(LS.messages, messages);
    this.emit("message-created", message);
    return message;
  }

  async getMessages(alertId) {
    return parse(LS.messages, [])
      .filter(message => message.alertId === alertId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  async getSettings() {
    return {
      ...defaultSettings,
      ...parse(LS.settings, defaultSettings)
    };
  }

  async registerPushToken() {
    return null;
  }

  getAdminPassword() {
    return localStorage.getItem(LS.adminPassword) || "1234";
  }

  assertAdmin(password) {
    if (password !== this.getAdminPassword()) {
      throw new Error("Contraseña administrativa incorrecta.");
    }
  }

  async verifyAdminPassword(password) {
    this.assertAdmin(password);
    return true;
  }

  async changeAdminPassword(currentPassword, newPassword) {
    this.assertAdmin(currentPassword);
    localStorage.setItem(LS.adminPassword, newPassword);
    return true;
  }

  async adminGetDashboard(password) {
    this.assertAdmin(password);
    return {
      settings: await this.getSettings(),
      alerts: await this.getAlerts(),
      users: parse(LS.users, []).map(cleanUser)
    };
  }

  async adminSaveSettings(password, settings) {
    this.assertAdmin(password);
    const merged = { ...defaultSettings, ...settings };
    save(LS.settings, merged);
    this.emit("settings-updated", merged);
    return merged;
  }

  async adminUpdateAlert(password, alertId, patch) {
    this.assertAdmin(password);
    return this.updateAlert(alertId, patch);
  }

  async adminDeleteAlert(password, alertId) {
    this.assertAdmin(password);
    save(
      LS.alerts,
      parse(LS.alerts, []).filter(alert => alert.id !== alertId)
    );
    save(
      LS.messages,
      parse(LS.messages, []).filter(message => message.alertId !== alertId)
    );
    this.emit("alert-deleted", { id: alertId });
  }

  async adminUpdateUserStatus(password, userId, status) {
    this.assertAdmin(password);
    const users = parse(LS.users, []);
    const index = users.findIndex(user => user.id === userId);

    if (index < 0) throw new Error("Usuario no encontrado.");

    users[index].status = status;
    save(LS.users, users);
    this.emit("user-updated", cleanUser(users[index]));
  }

  async adminUpdateUserPassword(password, userId, newPassword) {
    this.assertAdmin(password);
    const users = parse(LS.users, []);
    const index = users.findIndex(user => user.id === userId);

    if (index < 0) throw new Error("Usuario no encontrado.");

    users[index].password = newPassword;
    save(LS.users, users);
    this.emit("user-password-updated", { id: userId });
  }

  async adminDeleteUser(password, userId) {
    this.assertAdmin(password);

    save(
      LS.users,
      parse(LS.users, []).filter(user => user.id !== userId)
    );

    const alerts = parse(LS.alerts, []).map(alert =>
      alert.userId === userId
        ? { ...alert, userName: "Usuario eliminado", userDeleted: true }
        : alert
    );

    save(LS.alerts, alerts);

    const session = parse(LS.session, null);
    if (session?.id === userId) {
      localStorage.removeItem(LS.session);
    }

    this.emit("user-deleted", { id: userId });
  }
}

class FirebaseService {
  constructor(modules) {
    this.mode = "firebase";
    Object.assign(this, modules);
    this.current = null;
    this.changeCallbacks = new Set();
    this.alertUnsubscribe = null;
  }

  async init() {
    this.app = this.initializeApp(firebaseConfig);
    this.auth = this.getAuth(this.app);
    this.db = this.getFirestore(this.app);

    try {
      await this.setPersistence(this.auth, this.browserLocalPersistence);
    } catch {}

    await new Promise(resolve => {
      const unsubscribe = this.onAuthStateChanged(
        this.auth,
        async firebaseUser => {
          if (firebaseUser) {
            const snapshot = await this.getDoc(
              this.doc(this.db, "users", firebaseUser.uid)
            );

            this.current = snapshot.exists()
              ? { id: firebaseUser.uid, ...snapshot.data() }
              : { id: firebaseUser.uid, email: firebaseUser.email };
          } else {
            this.current = null;
          }

          resolve();
          unsubscribe();
        }
      );
    });

    return this;
  }

  currentUser() {
    return this.current;
  }

  startAlertListener() {
    if (!this.auth.currentUser || this.alertUnsubscribe) return;

    this.alertUnsubscribe = this.onSnapshot(
      this.collection(this.db, "alerts"),
      () => this.changeCallbacks.forEach(callback => callback()),
      error => console.warn("Escucha de alertas:", error.message)
    );
  }

  onChange(callback) {
    this.changeCallbacks.add(callback);

    const settingsUnsubscribe = this.onSnapshot(
      this.doc(this.db, "settings", "general"),
      () => callback(),
      error => console.warn("Escucha de configuración:", error.message)
    );

    this.startAlertListener();

    return () => {
      this.changeCallbacks.delete(callback);
      settingsUnsubscribe();
      if (!this.changeCallbacks.size && this.alertUnsubscribe) {
        this.alertUnsubscribe();
        this.alertUnsubscribe = null;
      }
    };
  }

  async register(profile, password) {
    const credential = await this.createUserWithEmailAndPassword(
      this.auth,
      profile.email,
      password
    );

    const user = {
      name: profile.name.trim(),
      email: profile.email.trim().toLowerCase(),
      phone: profile.phone.trim(),
      address: profile.address.trim(),
      status: "active",
      createdAt: this.serverTimestamp()
    };

    await this.setDoc(
      this.doc(this.db, "users", credential.user.uid),
      user
    );

    this.current = { id: credential.user.uid, ...user };
    this.startAlertListener();
    return this.current;
  }

  async login(email, password) {
    const credential = await this.signInWithEmailAndPassword(
      this.auth,
      email,
      password
    );

    const snapshot = await this.getDoc(
      this.doc(this.db, "users", credential.user.uid)
    );

    this.current = {
      id: credential.user.uid,
      ...(snapshot.exists() ? snapshot.data() : { email })
    };

    if (this.current.status === "blocked") {
      await this.signOut(this.auth);
      this.current = null;
      throw new Error("Esta cuenta está bloqueada.");
    }

    this.startAlertListener();
    return this.current;
  }

  async logout() {
    await this.signOut(this.auth);
    this.current = null;

    if (this.alertUnsubscribe) {
      this.alertUnsubscribe();
      this.alertUnsubscribe = null;
    }
  }

  async requestPasswordReset(email) {
    await this.sendPasswordResetEmail(this.auth, email.trim());
    return { demo: false };
  }

  async createAlert(data) {
    const reference = await this.addDoc(
      this.collection(this.db, "alerts"),
      {
        ...data,
        status: "active",
        createdAt: this.serverTimestamp()
      }
    );

    return {
      id: reference.id,
      ...data,
      status: "active",
      createdAt: new Date().toISOString()
    };
  }

  async getAlerts() {
    const request = this.query(
      this.collection(this.db, "alerts"),
      this.orderBy("createdAt", "desc"),
      this.limit(100)
    );

    const snapshot = await this.getDocs(request);

    return snapshot.docs.map(document => ({
      id: document.id,
      ...document.data(),
      createdAt: normalizeDate(document.data().createdAt)
    }));
  }

  async updateAlert(alertId, patch) {
    await this.updateDoc(
      this.doc(this.db, "alerts", alertId),
      {
        ...patch,
        updatedAt: this.serverTimestamp()
      }
    );
  }

  async sendMessage(data) {
    await this.addDoc(
      this.collection(this.db, "messages"),
      {
        ...data,
        createdAt: this.serverTimestamp()
      }
    );
  }

  async getMessages(alertId) {
    const request = this.query(
      this.collection(this.db, "messages"),
      this.where("alertId", "==", alertId),
      this.orderBy("createdAt", "asc"),
      this.limit(200)
    );

    const snapshot = await this.getDocs(request);

    return snapshot.docs.map(document => ({
      id: document.id,
      ...document.data(),
      createdAt: normalizeDate(document.data().createdAt)
    }));
  }

  async getSettings() {
    const snapshot = await this.getDoc(
      this.doc(this.db, "settings", "general")
    );

    return snapshot.exists()
      ? { ...defaultSettings, ...snapshot.data() }
      : defaultSettings;
  }

  async registerPushToken(user) {
    if (
      !vapidKey ||
      !("serviceWorker" in navigator) ||
      !("Notification" in window)
    ) {
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;

    const { getMessaging, getToken } = await import(
      "https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging.js"
    );

    const registration = await navigator.serviceWorker.register(
      "./firebase-messaging-sw.js"
    );

    const token = await getToken(getMessaging(this.app), {
      vapidKey,
      serviceWorkerRegistration: registration
    });

    if (token) {
      await this.setDoc(
        this.doc(this.db, "devices", token),
        {
          token,
          userId: user.id,
          updatedAt: this.serverTimestamp()
        }
      );
    }

    return token;
  }

  async adminRequest(action, payload, password) {
    const endpoint =
      `https://${functionsRegion}-${firebaseConfig.projectId}` +
      `.cloudfunctions.net/adminManage`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        password,
        payload
      })
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(
        result.error || "No se pudo completar la operación administrativa."
      );
    }

    return result.data;
  }

  async verifyAdminPassword(password) {
    await this.adminRequest("verify", {}, password);
    return true;
  }

  async changeAdminPassword(currentPassword, newPassword) {
    await this.adminRequest(
      "changeAdminPassword",
      { newPassword },
      currentPassword
    );
    return true;
  }

  async adminGetDashboard(password) {
    return this.adminRequest("dashboard", {}, password);
  }

  async adminSaveSettings(password, settings) {
    return this.adminRequest(
      "saveSettings",
      { settings },
      password
    );
  }

  async adminUpdateAlert(password, alertId, patch) {
    return this.adminRequest(
      "updateAlert",
      { alertId, patch },
      password
    );
  }

  async adminDeleteAlert(password, alertId) {
    return this.adminRequest(
      "deleteAlert",
      { alertId },
      password
    );
  }

  async adminUpdateUserStatus(password, userId, status) {
    return this.adminRequest(
      "updateUserStatus",
      { userId, status },
      password
    );
  }

  async adminUpdateUserPassword(password, userId, newPassword) {
    return this.adminRequest(
      "updateUserPassword",
      { userId, newPassword },
      password
    );
  }

  async adminDeleteUser(password, userId) {
    return this.adminRequest(
      "deleteUser",
      { userId },
      password
    );
  }
}

export async function createDataService() {
  if (!firebaseIsConfigured()) {
    return new DemoService().init();
  }

  const [app, auth, firestore] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js")
  ]);

  return new FirebaseService({
    initializeApp: app.initializeApp,
    getAuth: auth.getAuth,
    setPersistence: auth.setPersistence,
    browserLocalPersistence: auth.browserLocalPersistence,
    onAuthStateChanged: auth.onAuthStateChanged,
    createUserWithEmailAndPassword: auth.createUserWithEmailAndPassword,
    signInWithEmailAndPassword: auth.signInWithEmailAndPassword,
    sendPasswordResetEmail: auth.sendPasswordResetEmail,
    signOut: auth.signOut,
    getFirestore: firestore.getFirestore,
    collection: firestore.collection,
    doc: firestore.doc,
    addDoc: firestore.addDoc,
    setDoc: firestore.setDoc,
    getDoc: firestore.getDoc,
    getDocs: firestore.getDocs,
    updateDoc: firestore.updateDoc,
    onSnapshot: firestore.onSnapshot,
    query: firestore.query,
    where: firestore.where,
    orderBy: firestore.orderBy,
    limit: firestore.limit,
    serverTimestamp: firestore.serverTimestamp
  }).init();
}

export { defaultSettings };
