/* Configura los mismos datos de Firebase usados en assets/firebase-config.js.
   Este archivo se usa para notificaciones cuando la aplicación está en segundo plano. */
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

if (firebaseConfig.apiKey) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(payload => {
    const data = payload.data || {};
    self.registration.showNotification(data.title || "🚨 Nueva alerta comunitaria", {
      body: data.body || "Abre la aplicación para ver la alerta.",
      icon: "./assets/icon-192.png",
      tag: data.alertId || "alerta"
    });
  });
}
