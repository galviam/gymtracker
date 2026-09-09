# GymTracker Web — instalación en tu iPhone

Es una web app instalable (PWA): una vez la abras desde Safari y la añadas a la
pantalla de inicio, funciona como una app normal (icono propio, pantalla completa,
sin conexión) — pero sin pasar por Xcode, Mac ni App Store.

## Paso 1 — Publicarla en internet (gratis, 5 minutos)

Tiene que servirse por **https** para poder instalarse (no vale abrir el archivo
directamente desde el Finder). La forma más rápida, sin registrar dominio ni tarjeta:

### Opción A: Netlify Drop (la más simple)
1. Entra en https://app.netlify.com/drop desde el ordenador.
2. Arrastra la carpeta `gymtracker-web` completa (la que contiene `index.html`) sobre la página.
3. En segundos te da una URL tipo `https://algo-al-azar.netlify.app`. Ábrela en tu iPhone.

### Opción B: GitHub Pages
1. Crea un repositorio nuevo en GitHub y sube el contenido de `gymtracker-web`
   (que `index.html` quede en la raíz del repo, no dentro de una subcarpeta).
2. Settings → Pages → Source: rama `main`, carpeta `/root`.
3. En un par de minutos tendrás la URL en `https://tu-usuario.github.io/tu-repo/`.

### Opción C: Vercel
1. https://vercel.com → "Add New Project" → sube la carpeta o conéctala a un repo.
2. Framework preset: "Other" (no necesita build). Deploy.

## Paso 2 — Instalarla en tu iPhone

1. Abre la URL en **Safari** (tiene que ser Safari, no Chrome — es el único que
   permite instalar PWAs en iOS).
2. Toca el icono de **Compartir** (el cuadrado con la flecha hacia arriba).
3. Baja y toca **"Añadir a pantalla de inicio"**.
4. Confirma el nombre ("GymTracker") y toca **Añadir**.

Ya tienes el icono en tu pantalla de inicio. Al abrirlo, se abre a pantalla completa,
sin la barra de Safari, y funciona sin conexión después de la primera carga.

## Cómo funciona la persistencia de datos

Todo se guarda en el propio iPhone mediante **IndexedDB** (una base de datos del
navegador). No hay servidor, no hay cuenta, nada sale de tu teléfono.

⚠️ Importante: si algún día borras la app de la pantalla de inicio o borras los
datos de navegación de Safari para ese sitio, los datos de esa PWA se pierden
(no hay copia en la nube). Es el mismo comportamiento que tendría cualquier app
100% local. Si más adelante quieres respaldo automático, la vía más simple es
añadir una función de "Exportar copia" que descargue un JSON con tus entrenamientos.

## Qué incluye esta versión

- Inicio con el entrenamiento de hoy, botón de inicio rápido y resumen del último.
- Entrenar: crear entrenamiento en blanco o desde plantilla, añadir ejercicios y
  series, autocompletar con "última vez", temporizador de descanso automático,
  duplicar/eliminar series, notas del entrenamiento, finalizar.
- Historial agrupado por mes, con detalle y borrado.
- Progreso: gráfico de peso máximo y volumen por ejercicio, récord personal (PR).
- Ajustes: biblioteca de ejercicios (crear/editar/eliminar) y plantillas.
- Modo oscuro / claro automático según el sistema.
- Funciona completamente offline tras la primera visita (service worker).

## Probarla ahora mismo sin publicar nada

Si solo quieres verla funcionar ya, desde el ordenador:

```
cd gymtracker-web
python3 -m http.server 8080
```

Y abre `http://localhost:8080` en el navegador. (La instalación como PWA en el
iPhone sí requiere el paso de publicarla en una URL https real, como en el Paso 1).
