# Tirar la Cuerda

Juego educativo multijugador para sala de clases. Incluye modo relevos, modo tirar la cuerda, banco local de preguntas por asignatura y conexión entre pantalla principal y equipos mediante PeerJS.

## Ejecutar localmente

La app es estática. Puedes abrir `index.html` directamente o levantar un servidor local desde la carpeta del proyecto:

```powershell
python -m http.server 8080
```

Luego entra a `http://localhost:8080`.

## Verificación rápida

Antes de publicar, revisa que los scripts sigan siendo válidos:

```powershell
node --check app.js
node --check 3d_scene.js
node --check gas_connector.js
node --check questions/matematicas.js
node --check questions/lenguaje.js
node --check questions/ciencias.js
node --check questions/historia.js
node --check questions/ingles.js
```

## Notas de uso

- La clave de OpenAI es opcional y queda guardada en `localStorage` del navegador.
- Al usar el modo IA, la clave se envía desde el navegador a la API de OpenAI para generar preguntas.
- Para una clase real, prueba el host y al menos dos equipos desde dispositivos distintos en la misma red antes de iniciar.
