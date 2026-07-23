# Alerta Comunitaria

Primera versión funcional del sistema solicitado.

## Funciona desde el primer momento

Sin configurar Firebase, abre el proyecto mediante un servidor local y usa el modo demostración:

- Registro e inicio de sesión.
- Categorías de alerta.
- Botón de alarma con sirena y vibración.
- Captura de ubicación GPS.
- Lista de alertas.
- Google Maps.
- Mensajes y respuestas.
- Panel independiente `/admin/`.
- Botón de donación configurable desde el administrador.
- Contraseña inicial del administrador: `1234`.
- Cambio de contraseña desde el panel.
- Gestión de categorías, usuarios y alertas.
- Exportación CSV.
- Instalación PWA.

En modo demostración, los datos se guardan en el navegador y se sincronizan entre pestañas del mismo navegador.

## Abrir correctamente

No abras `index.html` directamente con doble clic porque los módulos y el service worker necesitan un servidor.

### Opción sencilla con Python

Desde la carpeta del proyecto:

```bash
python -m http.server 8000
```

Luego abre:

- Usuarios: `http://localhost:8000/`
- Administrador: `http://localhost:8000/admin/`

## Activar Firebase para varios equipos

1. Crea un proyecto en Firebase.
2. Registra una aplicación web.
3. Activa **Authentication > Email/Password**.
4. Crea **Cloud Firestore**.
5. Copia la configuración web en `assets/firebase-config.js`.
6. Copia la misma configuración en `firebase-messaging-sw.js`.
7. Publica las reglas de `firestore.rules`.
8. Para notificaciones en segundo plano, genera una clave VAPID y pégala en `assets/firebase-config.js`.
9. Despliega las Cloud Functions de la carpeta `functions`.

Una vez configurado Firebase, usuarios, alertas y mensajes se sincronizan entre equipos.

## Comandos de despliegue con Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

## Seguridad importante

La contraseña `1234` y el panel oculto sirven para esta primera versión y para pruebas. Ocultar `/admin` no es seguridad suficiente para producción. Antes de usarlo en una comunidad real, el administrador debe gestionarse con Firebase Authentication y permisos de administrador mediante Custom Claims o un backend seguro. También conviene limitar quién puede eliminar alertas y cambiar configuraciones en las reglas de Firestore.

## Notificaciones y sirena

- Mientras la aplicación está abierta, Firestore actualiza las alertas en tiempo real y el navegador reproduce la sirena.
- Para notificaciones con la app cerrada o en segundo plano necesitas HTTPS, Firebase Cloud Messaging, clave VAPID y la Cloud Function incluida.
- Los navegadores exigen que cada usuario acepte el permiso de notificaciones y, en algunos equipos, que haya interactuado con la página antes de permitir sonido.


## Configurar el botón de donación

1. Entra en `/admin/`.
2. Inicia sesión con la contraseña del administrador.
3. En **Configuración visual**, activa **Mostrar botón de donación**.
4. Escribe el texto del botón.
5. Pega un enlace completo que comience con `https://`.
6. Guarda la configuración.

El botón aparecerá en la pantalla principal y abrirá el enlace directamente en una nueva pestaña.


## Cambios de la Parte 3

- Los usuarios comunes ya no ven teléfono, correo ni dirección de otras personas.
- Cada alerta pública guarda solamente el primer nombre y la ubicación necesaria.
- El perfil completo solo lo ve su propietario y el administrador.
- Botón configurable para contactar al administrador.
- El administrador puede bloquear, eliminar o cambiar la contraseña de un usuario.
- El dueño de una alerta puede marcarla como resuelta o cancelarla.
- Recuperación de contraseña por correo mediante Firebase Authentication.
- Reglas de Firestore más privadas.
- Función segura para operaciones administrativas con Firebase Admin SDK.

## Recuperación de contraseña

Para que funcione el correo:

1. Configura `assets/firebase-config.js`.
2. Activa Authentication > Correo electrónico/contraseña.
3. En Firebase Authentication, revisa la plantilla **Restablecimiento de contraseña**.
4. Publica el sistema en HTTPS o pruébalo desde `localhost`.

## Funciones administrativas de Firebase

Las acciones de eliminar usuarios, cambiar contraseñas y administrar datos usan:

```text
functions/index.js
```

Debes desplegar las funciones:

```bash
cd AlertaComunitaria
firebase deploy --only functions,firestore:rules,hosting
```

La función se publica en `us-central1`, que debe coincidir con:

```javascript
export const functionsRegion = "us-central1";
```

La contraseña inicial del administrador sigue siendo `1234`. En Firebase, al cambiarla desde `/admin`, se guarda un hash en `system/adminSecurity`.

## Nota de privacidad

Las alertas siguen mostrando la ubicación GPS porque es necesaria para atender la emergencia. Los demás datos personales quedan fuera del documento público de la alerta.


## Cambios de la Parte 4

- En **Usuarios registrados**, el administrador ahora puede seleccionar el estado:
  - Activo.
  - Bloqueado.
- Después debe pulsar **Guardar estado**.
- La sirena se reproduce durante aproximadamente 15 segundos cuando se envía o recibe una alerta con la aplicación abierta.

Algunos navegadores pueden limitar el sonido si la pestaña está en segundo plano o si el usuario todavía no interactuó con la página.
