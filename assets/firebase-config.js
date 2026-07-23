// Pega aquí la configuración de tu aplicación web de Firebase.
// Mientras estos valores estén vacíos, el sistema funcionará en modo demostración.
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Región usada por la función administrativa incluida en /functions.
export const functionsRegion = "us-central1";

// Clave pública Web Push de Firebase Cloud Messaging (VAPID).
export const vapidKey = "";

export function firebaseIsConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.appId
  );
}
