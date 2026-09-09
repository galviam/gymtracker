/* ============================================================
   GymTracker — lógica de la app (vanilla JS, sin frameworks)
   ============================================================ */

// Grupos musculares que existen en la biblioteca de ejercicios (para el
// formulario de creación de ejercicios y para Ajustes > Biblioteca).
const MUSCLE_GROUPS = ["Pecho", "Espalda", "Hombros", "Bíceps", "Tríceps", "Piernas", "Cuádriceps", "Isquiotibiales", "Glúteos", "Gemelos", "Abdominales"];
const EXERCISE_TYPES = ["Barra", "Mancuerna", "Máquina", "Polea", "Peso corporal", "Otro"];
const DEFAULT_REST_SECONDS = 90;

// ============================================================
// 👉 EDITA AQUÍ el flujo "Grupo de trabajo" que se ve al entrenar.
// Cada grupo del flujo puede agrupar varios muscleGroup de la biblioteca.
// Para añadir "Pecho" al flujo (no está incluido por defecto), añade un
// objeto nuevo, por ejemplo:
//   { key: "Pecho", label: "Pecho", icon: "🏋️", groups: ["Pecho"] },
// ============================================================
const FLOW_GROUPS = [
  { key: "Pecho", label: "Pecho", icon: "🏋️", groups: ["Pecho"] },
  { key: "Espalda", label: "Espalda", icon: "🦾", groups: ["Espalda"] },
  { key: "Hombro", label: "Hombro", icon: "🙌", groups: ["Hombros"] },
  { key: "Biceps", label: "Bíceps", icon: "💪", groups: ["Bíceps"] },
  { key: "Triceps", label: "Tríceps", icon: "💥", groups: ["Tríceps"] },
  { key: "Pierna", label: "Pierna", icon: "🦵", groups: ["Piernas", "Cuádriceps", "Isquiotibiales", "Gemelos"] },
  { key: "Gluteo", label: "Glúteo", icon: "🍑", groups: ["Glúteos"] },
  { key: "Abdomen", label: "Abdomen", icon: "🔷", groups: ["Abdominales"] },
];

const state = {
  tab: "home",
  route: "home",
  routeParams: {},
  exercises: [],
  workouts: [],
  templates: [],
  activeWorkoutId: null,
  currentGroupKey: null,
  settings: { defaultRestSeconds: DEFAULT_REST_SECONDS, theme: "pink" },
  restTimer: { active: false, seconds: 0, intervalId: null },
};

async function loadSettings() {
  const saved = await DB.get("settings", "app-settings");
  if (saved) state.settings = { defaultRestSeconds: saved.defaultRestSeconds, theme: saved.theme || "pink" };
  applyTheme();
}

async function saveSettings() {
  await DB.put("settings", { id: "app-settings", ...state.settings });
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.settings.theme);
}

const $view = document.getElementById("view");
const $tabbar = document.getElementById("tabbar");

/* ---------------- Utilidades de fecha ---------------- */
const DateFmt = {
  fullDayMonth(date) {
    return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
      .replace(/^\w/, c => c.toUpperCase());
  },
  dayMonth(date) {
    return date.toLocaleDateString("es-ES", { day: "numeric", month: "long" });
  },
  monthYear(date) {
    return date.toLocaleDateString("es-ES", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
  },
  relative(date) {
    const now = new Date();
    const startOf = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((startOf(now) - startOf(date)) / 86400000);
    if (days === 0) return "Hoy";
    if (days === 1) return "Ayer";
    if (days > 1 && days < 7) return `Hace ${days} días`;
    return this.dayMonth(date);
  },
  duration(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60), m = totalMin % 60;
    return h > 0 ? `${h}h ${m}min` : `${m} min`;
  },
  isToday(date) {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }
};

function fmtWeight(w) {
  return Number.isInteger(w) ? String(w) : String(w).replace(".", ",");
}

/* ---------------- Fotos: helper para redimensionar antes de guardar ---------------- */
// Las fotos se guardan en base64 dentro del propio ejercicio (en IndexedDB).
// No hace falta tocar código para añadirlas: se suben desde el formulario de
// ejercicio (cámara o galería del iPhone). Se redimensionan aquí para no
// hinchar el almacenamiento local.
function fileToResizedDataURL(file, maxWidth = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------------- Carga inicial y seed ---------------- */
async function bootstrap() {
  state.exercises = await DB.getAll("exercises");
  await reloadWorkouts();
  state.templates = await DB.getAll("templates");
  await loadSettings();

  setupTabbar();
  setupRestTimerControls();
  render();
}

async function reloadWorkouts() {
  const all = await DB.getAll("workouts");
  all.sort((a, b) => new Date(b.date) - new Date(a.date));
  state.workouts = all;
}


/* ---------------- Navegación ---------------- */
function setupTabbar() {
  $tabbar.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      state.tab = btn.dataset.tab;
      navigate(state.tab === "planning" ? "planning" : state.tab);
    });
  });
}

// Decide a qué pantalla entrar al tocar la pestaña "Entrenar":
// si hay un entrenamiento de hoy sin terminar, continúa donde lo dejaste.
function trainEntryRoute() {
  const todayWorkout = state.workouts.find(w => DateFmt.isToday(new Date(w.date)) && !w.finishedAt);
  if (todayWorkout) {
    state.activeWorkoutId = todayWorkout.id;
    const pending = todayWorkout.exercises.find(we => we.sets.length === 0);
    if (pending) { state.routeParams = { weId: pending.id }; return "train/log"; }
    return "train/group";
  }
  return "train/start";
}

function navigate(route, params = {}) {
  state.route = route;
  state.routeParams = params;
  render();
  $view.scrollTop = 0;
}

function render() {
  $tabbar.querySelectorAll(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === state.tab);
  });

  const routes = {
    "home": renderHome,
    "train/start": renderStartWorkout,
    "train/group": renderGroupPicker,
    "train/exercise": renderExerciseSelectForGroup,
    "train/log": renderLogExercise,
    "planning": renderTemplateList,
    "history": renderHistory,
    "history/detail": renderWorkoutDetail,
    "progress": renderProgressOverview,
    "progress/detail": renderExerciseProgress,
    "settings": renderSettings,
    "settings/exercises": renderExerciseLibrary,
  };

  const renderFn = routes[state.route] || renderHome;
  $view.innerHTML = "";
  $view.appendChild(renderFn());
  updateRestTimerVisibility();
}

function el(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

function exerciseThumbHTML(exercise, size = "small") {
  if (size === "small") {
    if (exercise && exercise.photo) {
      return `<img class="exercise-thumb" src="${exercise.photo}" alt="${exercise.name}" />`;
    }
    return `<div class="exercise-thumb-placeholder">🏋️</div>`;
  }
  // size === "large" -> pantalla de registro de la serie
  if (exercise && exercise.photo) {
    return `<img class="log-photo" src="${exercise.photo}" alt="${exercise.name}" />`;
  }
  return `<div class="log-photo-placeholder"><span class="log-photo-title">${exercise ? exercise.name : "Ejercicio"}</span></div>`;
}

/* ================================================================
   HOME
   ================================================================ */
function renderHome() {
  const todayWorkout = state.workouts.find(w => DateFmt.isToday(new Date(w.date)));
  const lastFinished = state.workouts.find(w => w.finishedAt);
  const recent = state.workouts.filter(w => w.finishedAt).slice(0, 3);

  const container = el(`<div>
    <div class="page-title">Hoy</div>
    <div class="page-subtitle">${DateFmt.fullDayMonth(new Date())}</div>
    ${todayWorkout && todayWorkout.finishedAt ? `<div class="muted" style="color:var(--success); font-weight:700; margin-bottom:14px;">✓ Ya has entrenado hoy</div>` : ""}
    <div id="start-btn"></div>
    ${lastFinished ? `
      <div class="section-title">Último entrenamiento</div>
      <div class="card" id="last-workout-card" style="cursor:pointer;">
        <div style="font-weight:700; font-size:16px;">${lastFinished.name}</div>
        <div class="muted" style="font-size:13px; margin:2px 0 8px;">${DateFmt.relative(new Date(lastFinished.date))}</div>
        <div class="muted" style="font-size:12px;">${totalSets(lastFinished)} series · ${Math.round(totalVolume(lastFinished))} kg volumen</div>
      </div>` : ""}
    ${recent.length ? `<div class="section-title">Recientes</div><div id="recent-list"></div>` : ""}
  </div>`);

  const btnWrap = container.querySelector("#start-btn");
  const isOngoing = todayWorkout && !todayWorkout.finishedAt;
  const btn = el(`<button class="btn-primary">▶ ${isOngoing ? "Continuar entrenamiento" : "Comenzar entrenamiento"}</button>`);
  btn.addEventListener("click", () => {
    state.tab = "train";
    if (isOngoing) {
      state.activeWorkoutId = todayWorkout.id;
      navigate(trainEntryRoute());
    } else {
      navigate("train/start");
    }
  });
  btnWrap.appendChild(btn);

  if (lastFinished) {
    container.querySelector("#last-workout-card").addEventListener("click", () => {
      state.tab = "history";
      navigate("history/detail", { id: lastFinished.id });
    });
  }

  if (recent.length) {
    const list = container.querySelector("#recent-list");
    recent.forEach(w => {
      const row = el(`<div class="list-row" style="cursor:pointer;">
        <div><div class="title">${w.name}</div><div class="subtitle">${DateFmt.dayMonth(new Date(w.date))}</div></div>
        <div class="muted">›</div>
      </div>`);
      row.addEventListener("click", () => { state.tab = "history"; navigate("history/detail", { id: w.id }); });
      list.appendChild(row);
    });
  }

  return container;
}

/* ================================================================
   ENTRENAR — 1) Iniciar
   ================================================================ */
function renderStartWorkout() {
  const container = el(`<div>
    <div class="page-title">Entrenar</div>
    <div class="field-label">Nombre del entrenamiento (opcional)</div>
    <input class="field" id="workout-name" placeholder="Ej. Entrenamiento de hoy" style="margin-bottom:18px;" />
    <div id="start-blank"></div>
    ${state.templates.length ? `<div class="section-title">Empezar desde una plantilla</div><div id="template-list"></div>` : ""}
  </div>`);

  const startBtn = el(`<button class="btn-primary">▶ Empezar entrenamiento</button>`);
  startBtn.addEventListener("click", async () => {
    const nameInput = container.querySelector("#workout-name").value.trim();
    const name = nameInput || `Entrenamiento ${DateFmt.dayMonth(new Date())}`;
    const workout = await createWorkout(name);
    state.activeWorkoutId = workout.id;
    navigate("train/group");
  });
  container.querySelector("#start-blank").appendChild(startBtn);

  if (state.templates.length) {
    const list = container.querySelector("#template-list");
    state.templates.forEach(t => {
      const row = el(`<div class="list-row" style="cursor:pointer;">
        <div><div class="title">${t.name}</div><div class="subtitle">${t.exercises.length} ejercicios</div></div>
        <div class="muted">›</div>
      </div>`);
      row.addEventListener("click", async () => {
        const workout = await createWorkoutFromTemplate(t);
        state.activeWorkoutId = workout.id;
        const first = workout.exercises[0];
        navigate("train/log", { weId: first.id });
      });
      list.appendChild(row);
    });
  }

  return container;
}

async function createWorkout(name) {
  const workout = {
    id: DB.uuid(), name, date: new Date().toISOString(),
    startedAt: new Date().toISOString(), finishedAt: null, notes: null, exercises: []
  };
  await DB.put("workouts", workout);
  await reloadWorkouts();
  return state.workouts.find(w => w.id === workout.id);
}

async function createWorkoutFromTemplate(template) {
  const workout = {
    id: DB.uuid(), name: template.name, date: new Date().toISOString(),
    startedAt: new Date().toISOString(), finishedAt: null, notes: null, isFromTemplate: true,
    exercises: template.exercises.map((te, i) => ({
      id: DB.uuid(), exerciseId: te.exerciseId, order: i, notes: null,
      restSeconds: state.settings.defaultRestSeconds, sets: [], fromTemplate: true
    }))
  };
  await DB.put("workouts", workout);
  await reloadWorkouts();
  return state.workouts.find(w => w.id === workout.id);
}

/* ================================================================
   ENTRENAR — 2) Grupo de trabajo
   ================================================================ */
function getActiveWorkout() { return state.workouts.find(w => w.id === state.activeWorkoutId); }
function getExercise(id) { return state.exercises.find(e => e.id === id); }

function totalVolume(workout) {
  return workout.exercises.reduce((sum, we) => sum + we.sets.reduce((s, set) => s + set.weight * set.repetitions, 0), 0);
}
function totalSets(workout) {
  return workout.exercises.reduce((sum, we) => sum + we.sets.length, 0);
}
async function saveWorkout(workout) {
  await DB.put("workouts", workout);
  await reloadWorkouts();
}

function renderGroupPicker() {
  const workout = getActiveWorkout();
  if (!workout) { navigate("train/start"); return el("<div></div>"); }

  const container = el(`<div>
    <div class="top-row">
      <div>
        <div class="muted" style="font-size:12px;">${workout.name}</div>
        <h1 style="font-size:24px;">Grupo de trabajo</h1>
      </div>
      <button class="icon-btn" id="finish-icon" title="Finalizar">✓</button>
    </div>
    ${workout.exercises.length ? `<div class="muted" style="font-size:13px; margin-bottom:14px;">${workout.exercises.length} ejercicios · ${totalSets(workout)} series</div>` : ""}
    <div class="group-grid" id="group-grid"></div>
    ${workout.exercises.length ? `<button class="btn-primary success" id="finish-btn" style="margin-top:22px;">✓ Finalizar entrenamiento</button>` : ""}
  </div>`);

  const grid = container.querySelector("#group-grid");
  FLOW_GROUPS.forEach(group => {
    const card = el(`<div class="group-card"><span class="icon">${group.icon}</span><span class="label">${group.label}</span></div>`);
    card.addEventListener("click", () => {
      state.currentGroupKey = group.key;
      navigate("train/exercise", { groupKey: group.key });
    });
    grid.appendChild(card);
  });

  const finish = async () => {
    if (!confirm("¿Finalizar entrenamiento?")) return;
    workout.finishedAt = new Date().toISOString();
    await saveWorkout(workout);
    stopRestTimer();
    state.activeWorkoutId = null;
    state.tab = "home";
    navigate("home");
  };
  container.querySelector("#finish-icon").addEventListener("click", finish);
  if (workout.exercises.length) container.querySelector("#finish-btn").addEventListener("click", finish);

  return container;
}

/* ================================================================
   ENTRENAR — 3) Seleccionar ejercicio dentro del grupo
   ================================================================ */
function renderExerciseSelectForGroup() {
  const workout = getActiveWorkout();
  if (!workout) { navigate("train/start"); return el("<div></div>"); }

  const initialKey = state.routeParams.groupKey || state.currentGroupKey;
  let currentGroup = FLOW_GROUPS.find(g => g.key === initialKey) || FLOW_GROUPS[0];
  state.currentGroupKey = currentGroup.key;

  const container = el(`<div>
    <div class="top-row">
      <button class="icon-btn" id="back-btn">‹ Volver</button>
    </div>
    <h1 style="font-size:24px; margin-bottom:2px;">Elige el ejercicio</h1>
    <div class="muted" style="font-size:13px; margin-bottom:14px;">Desliza para ver más, o cambia de grupo</div>
    <div class="group-switch-row" id="group-switch"></div>
    <div class="exercise-carousel" id="exercise-carousel"></div>
    <button class="btn-secondary" id="new-ex-btn" style="margin-top:4px;">＋ Crear ejercicio en este grupo</button>
  </div>`);

  container.querySelector("#back-btn").addEventListener("click", () => navigate("train/group"));

  const switchRow = container.querySelector("#group-switch");
  FLOW_GROUPS.forEach(group => {
    const chip = el(`<span class="group-chip ${group.key === currentGroup.key ? "selected" : ""}">${group.icon} ${group.label}</span>`);
    chip.addEventListener("click", () => {
      currentGroup = group;
      state.currentGroupKey = group.key;
      switchRow.querySelectorAll(".group-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      renderCarousel();
    });
    switchRow.appendChild(chip);
  });

  const carousel = container.querySelector("#exercise-carousel");
  function renderCarousel() {
    carousel.innerHTML = "";
    const options = state.exercises
      .filter(ex => currentGroup.groups.includes(ex.muscleGroup))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!options.length) {
      carousel.appendChild(el(`<div class="muted" style="padding:20px 4px;">Todavía no hay ejercicios en este grupo.</div>`));
      return;
    }
    options.forEach(ex => {
      const thumb = ex.photo
        ? `<img class="thumb" src="${ex.photo}" alt="${ex.name}" />`
        : `<div class="thumb-placeholder"><span class="name">${ex.name}</span></div>`;
      const card = el(`<div class="exercise-card-h">
        ${thumb}
        ${ex.photo ? `<div class="name">${ex.name}</div>` : ""}
        <div class="type">${ex.type}</div>
      </div>`);
      card.addEventListener("click", async () => {
        const we = await addOrResumeExercise(workout, ex.id);
        navigate("train/log", { weId: we.id });
      });
      carousel.appendChild(card);
    });
  }
  renderCarousel();

  container.querySelector("#new-ex-btn").addEventListener("click", () => {
    openExerciseForm(null, async (exercise) => {
      const we = await addOrResumeExercise(workout, exercise.id);
      navigate("train/log", { weId: we.id });
    }, currentGroup.groups[0]);
  });

  return container;
}

// Si el ejercicio ya está en el entrenamiento sin series registradas, lo reutiliza
// en vez de duplicarlo; si no, añade una entrada nueva (permite repetir el mismo
// ejercicio más de una vez, por ejemplo en superseries).
async function addOrResumeExercise(workout, exerciseId) {
  let we = workout.exercises.find(e => e.exerciseId === exerciseId && e.sets.length === 0);
  if (!we) {
    we = { id: DB.uuid(), exerciseId, order: workout.exercises.length, notes: null, restSeconds: state.settings.defaultRestSeconds, sets: [], fromTemplate: false };
    workout.exercises.push(we);
    await saveWorkout(workout);
    we = workout.exercises.find(e => e.id === we.id);
  }
  return we;
}

/* ================================================================
   ENTRENAR — 4) Registrar peso / descanso / series
   ================================================================ */
function lastPerformanceFor(exerciseId, excludeWorkoutId) {
  const past = state.workouts
    .filter(w => w.finishedAt && w.id !== excludeWorkoutId)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  for (const w of past) {
    const we = w.exercises.find(e => e.exerciseId === exerciseId);
    if (we && we.sets.length) return we;
  }
  return null;
}

function renderLogExercise() {
  const workout = getActiveWorkout();
  if (!workout) { navigate("train/start"); return el("<div></div>"); }
  const we = workout.exercises.find(e => e.id === state.routeParams.weId);
  if (!we) { navigate("train/group"); return el("<div></div>"); }
  const exercise = getExercise(we.exerciseId);

  const last = lastPerformanceFor(we.exerciseId, workout.id);
  const lastSet = last ? last.sets[last.sets.length - 1] : null;

  // Peso/reps de trabajo actuales: si aún no hay series registradas, se
  // parten de la última vez (autocompletar); si ya hay alguna, de la última serie.
  const currentSet = we.sets[we.sets.length - 1];
  let workingWeight = currentSet ? currentSet.weight : (lastSet ? lastSet.weight : 20);
  let workingReps = currentSet ? currentSet.repetitions : (lastSet ? lastSet.repetitions : 8);
  if (!we.restSeconds) we.restSeconds = state.settings.defaultRestSeconds;

  const container = el(`<div>
    <div class="top-row">
      <button class="icon-btn" id="back-btn">‹ Cambiar ejercicio</button>
      <button class="icon-btn" id="finish-icon" title="Finalizar">✓</button>
    </div>
    ${exerciseThumbHTML(exercise, "large")}
    <h1 style="font-size:24px; margin-bottom:2px;">${exercise ? exercise.name : "Ejercicio"}</h1>
    <div class="muted" style="font-size:13px; margin-bottom:6px;">${exercise ? exercise.muscleGroup : ""}</div>

    ${last ? `<div class="muted" style="font-size:12px; margin-bottom:10px;">Última vez: ${last.sets.map(s => `${fmtWeight(s.weight)} kg × ${s.repetitions}`).join(" · ")}</div>` : ""}

    <div class="field-label" style="text-align:center;">Peso</div>
    <div class="weight-control">
      <button class="stepper-btn" data-w="-2.5">−</button>
      <div class="stepper-value">
        <input type="number" inputmode="decimal" id="weight-input" value="${workingWeight}" />
        <span class="unit">kg</span>
      </div>
      <button class="stepper-btn" data-w="2.5">+</button>
    </div>

    <div class="field-label" style="text-align:center;">Repeticiones</div>
    <div class="reps-row">
      <button class="stepper-btn" data-r="-1">−</button>
      <div class="stepper-value"><input type="number" inputmode="numeric" id="reps-input" value="${workingReps}" /></div>
      <button class="stepper-btn" data-r="1">+</button>
    </div>

    <div class="field-label" style="text-align:center;">Descanso entre series</div>
    <div class="rest-chip-row" id="rest-chips"></div>

    <div class="series-badge">Serie ${we.sets.length + 1}</div>
    <button class="btn-primary" id="complete-set-btn">✓ Completar serie</button>

    <div style="height:18px;"></div>
    <div id="set-history"></div>

    <button class="btn-secondary" id="next-exercise-btn" style="margin-top:18px;">Siguiente ejercicio →</button>
    <button class="btn-primary success" id="finish-btn" style="margin-top:10px;">✓ Finalizar entrenamiento</button>
  </div>`);

  container.querySelector("#back-btn").addEventListener("click", () => goToExerciseGroupOrList());

  const weightInput = container.querySelector("#weight-input");
  const repsInput = container.querySelector("#reps-input");

  container.querySelectorAll("[data-w]").forEach(btn => {
    btn.addEventListener("click", () => {
      const delta = parseFloat(btn.dataset.w);
      weightInput.value = Math.max(0, (parseFloat(weightInput.value) || 0) + delta);
    });
  });
  container.querySelectorAll("[data-r]").forEach(btn => {
    btn.addEventListener("click", () => {
      const delta = parseInt(btn.dataset.r);
      repsInput.value = Math.max(0, (parseInt(repsInput.value) || 0) + delta);
    });
  });

  const restChips = container.querySelector("#rest-chips");
  [60, 90, 120, 150].forEach(sec => {
    const chip = el(`<span class="chip ${we.restSeconds === sec ? "selected" : ""}">${sec}s</span>`);
    chip.addEventListener("click", async () => {
      we.restSeconds = sec;
      await saveWorkout(workout);
      navigate("train/log", { weId: we.id });
    });
    restChips.appendChild(chip);
  });

  function renderHistory() {
    const hist = container.querySelector("#set-history");
    hist.innerHTML = "";
    we.sets.forEach((s, i) => {
      const row = el(`<div class="set-history-row">
        <span>Serie ${i + 1}</span>
        <span>${fmtWeight(s.weight)} kg × ${s.repetitions}</span>
        <button class="icon-btn" data-del-set="${s.id}">✕</button>
      </div>`);
      row.querySelector("[data-del-set]").addEventListener("click", async () => {
        we.sets = we.sets.filter(x => x.id !== s.id);
        await saveWorkout(workout);
        navigate("train/log", { weId: we.id });
      });
      hist.appendChild(row);
    });
  }
  renderHistory();

  container.querySelector("#complete-set-btn").addEventListener("click", async () => {
    const weight = parseFloat(weightInput.value) || 0;
    const repetitions = parseInt(repsInput.value) || 0;
    we.sets.push({ id: DB.uuid(), order: we.sets.length, weight, repetitions, rir: null, rpe: null, completed: true });
    await saveWorkout(workout);
    startRestTimer(we.restSeconds || state.settings.defaultRestSeconds);
    navigate("train/log", { weId: we.id });
  });

  container.querySelector("#next-exercise-btn").addEventListener("click", () => {
    goToNextExercise(workout, we.id);
  });

  const finish = async () => {
    if (!confirm("¿Finalizar entrenamiento?")) return;
    workout.finishedAt = new Date().toISOString();
    await saveWorkout(workout);
    stopRestTimer();
    state.activeWorkoutId = null;
    state.tab = "home";
    navigate("home");
  };
  container.querySelector("#finish-icon").addEventListener("click", finish);
  container.querySelector("#finish-btn").addEventListener("click", finish);

  return container;
}

// Decide a dónde ir al pulsar "Siguiente ejercicio": si el entrenamiento
// viene de una rutina y quedan ejercicios de esa rutina sin registrar,
// pregunta; si no, va directo al listado del grupo muscular actual.
function goToNextExercise(workout, currentWeId) {
  const pendingTemplateWe = workout.isFromTemplate
    ? workout.exercises.find(e => e.fromTemplate && e.id !== currentWeId && e.sets.length === 0)
    : null;

  if (pendingTemplateWe) {
    openNextExerciseChoiceSheet(pendingTemplateWe);
    return;
  }
  goToExerciseGroupOrList();
}

function goToExerciseGroupOrList() {
  if (state.currentGroupKey) {
    navigate("train/exercise", { groupKey: state.currentGroupKey });
  } else {
    navigate("train/group");
  }
}

function openNextExerciseChoiceSheet(pendingTemplateWe) {
  const exercise = getExercise(pendingTemplateWe.exerciseId);
  const backdrop = el(`<div class="sheet-backdrop">
    <div class="sheet">
      <div class="sheet-header"><h2>Siguiente ejercicio</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-footer" style="border-top:none;">
        <button class="btn-primary" id="continue-routine-btn">▶ Siguiente de la rutina${exercise ? ": " + exercise.name : ""}</button>
        <button class="btn-secondary" id="add-other-btn" style="margin-top:10px;">＋ Añadir otro ejercicio</button>
      </div>
    </div>
  </div>`);
  backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#continue-routine-btn").addEventListener("click", () => {
    backdrop.remove();
    navigate("train/log", { weId: pendingTemplateWe.id });
  });
  backdrop.querySelector("#add-other-btn").addEventListener("click", () => {
    backdrop.remove();
    goToExerciseGroupOrList();
  });
  document.body.appendChild(backdrop);
}

/* ---------------- Formulario de ejercicio (con foto) ---------------- */
function openExerciseForm(existing, onSave, defaultGroup) {
  let pendingPhoto = existing ? existing.photo : null;

  const backdrop = el(`<div class="sheet-backdrop">
    <div class="sheet">
      <div class="sheet-header"><h2>${existing ? "Editar ejercicio" : "Nuevo ejercicio"}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-body">
      <div class="field-label">Foto (opcional — máquina o ejercicio)</div>

      <div class="field-label">Foto (opcional — máquina o ejercicio)</div>
      <div class="photo-upload-wrap">
        <img class="photo-upload-preview" id="photo-preview" src="${pendingPhoto || ""}" style="${pendingPhoto ? "" : "display:none;"}" />
        <div class="photo-upload-preview" id="photo-placeholder" style="display:${pendingPhoto ? "none" : "flex"}; align-items:center; justify-content:center; font-size:24px;">🏋️</div>
        <input type="file" accept="image/*" id="photo-input" style="display:none;" />
        <button class="btn-secondary" id="photo-btn" style="flex:1;">📷 Añadir foto</button>
      </div>

      <div class="field-label">Nombre</div>
      <input class="field" id="ex-name" value="${existing ? existing.name : ""}" placeholder="Ej. Press banca" />
      <div class="field-label">Grupo muscular principal</div>
      <select class="field" id="ex-group">
        ${MUSCLE_GROUPS.map(g => `<option ${((existing && existing.muscleGroup === g) || (!existing && defaultGroup === g)) ? "selected" : ""}>${g}</option>`).join("")}
      </select>
      <div class="field-label">Grupo muscular secundario (opcional)</div>
      <select class="field" id="ex-secondary">
        <option value="">Ninguno</option>
        ${MUSCLE_GROUPS.map(g => `<option ${existing && existing.secondaryMuscleGroup === g ? "selected" : ""}>${g}</option>`).join("")}
      </select>
      <div class="field-label">Tipo de ejercicio</div>
      <select class="field" id="ex-type">
        ${EXERCISE_TYPES.map(t => `<option ${existing && existing.type === t ? "selected" : ""}>${t}</option>`).join("")}
      </select>
      <div class="field-label">Notas (opcional)</div>
      <textarea class="field" id="ex-notes" rows="3">${existing && existing.notes ? existing.notes : ""}</textarea>
      </div>
      <div class="sheet-footer">
        <button class="btn-primary" id="ex-save">Guardar</button>
        ${existing ? `<button class="btn-secondary" style="margin-top:8px; color:var(--danger);" id="ex-delete">Eliminar ejercicio</button>` : ""}
      </div>
    </div>
  </div>`);

  const photoInput = backdrop.querySelector("#photo-input");
  const photoPreview = backdrop.querySelector("#photo-preview");
  const photoPlaceholder = backdrop.querySelector("#photo-placeholder");
  backdrop.querySelector("#photo-btn").addEventListener("click", () => photoInput.click());
  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    if (!file) return;
    pendingPhoto = await fileToResizedDataURL(file);
    photoPreview.src = pendingPhoto;
    photoPreview.style.display = "block";
    photoPlaceholder.style.display = "none";
  });

  backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.querySelector("#ex-save").addEventListener("click", async () => {
    const name = backdrop.querySelector("#ex-name").value.trim();
    if (!name) return;
    const exercise = existing || { id: DB.uuid(), createdAt: new Date().toISOString(), custom: true, unit: "kg" };
    exercise.name = name;
    exercise.muscleGroup = backdrop.querySelector("#ex-group").value;
    exercise.secondaryMuscleGroup = backdrop.querySelector("#ex-secondary").value || null;
    exercise.type = backdrop.querySelector("#ex-type").value;
    exercise.notes = backdrop.querySelector("#ex-notes").value.trim() || null;
    exercise.photo = pendingPhoto;
    if (!existing) exercise.custom = true;
    await DB.put("exercises", exercise);
    state.exercises = await DB.getAll("exercises");
    backdrop.remove();
    onSave(exercise);
  });

  if (existing) {
    backdrop.querySelector("#ex-delete").addEventListener("click", async () => {
      if (!confirm("¿Eliminar este ejercicio de la biblioteca?")) return;
      await DB.remove("exercises", existing.id);
      state.exercises = await DB.getAll("exercises");
      backdrop.remove();
      navigate("settings/exercises");
    });
  }

  document.body.appendChild(backdrop);
}

/* ---------------- Selector genérico de ejercicios (usado en plantillas) ---------------- */
function openExercisePicker(onSelect) {
  let filterGroup = null;
  let searchText = "";

  const backdrop = el(`<div class="sheet-backdrop">
    <div class="sheet">
      <div class="sheet-header"><h2>Elegir ejercicio</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-fixed-top">
        <input class="field search-input" placeholder="Buscar ejercicio" />
        <div class="muscle-scroll" id="group-chips"></div>
      </div>
      <div class="sheet-body"><div id="exercise-results"></div></div>
      <div class="sheet-footer">
        <button class="btn-secondary" id="new-exercise-btn">＋ Crear ejercicio personalizado</button>
      </div>
    </div>
  </div>`);

  const chipsWrap = backdrop.querySelector("#group-chips");
  const allChip = el(`<span class="chip selected">Todos</span>`);
  allChip.addEventListener("click", () => { filterGroup = null; refreshChips(); refreshResults(); });
  chipsWrap.appendChild(allChip);
  MUSCLE_GROUPS.forEach(g => {
    const chip = el(`<span class="chip">${g}</span>`);
    chip.addEventListener("click", () => { filterGroup = g; refreshChips(); refreshResults(); });
    chipsWrap.appendChild(chip);
  });
  function refreshChips() {
    chipsWrap.querySelectorAll(".chip").forEach((c, i) => {
      c.classList.toggle("selected", (i === 0 && filterGroup === null) || c.textContent === filterGroup);
    });
  }

  const resultsWrap = backdrop.querySelector("#exercise-results");
  function refreshResults() {
    resultsWrap.innerHTML = "";
    const filtered = state.exercises.filter(ex => {
      const matchesGroup = !filterGroup || ex.muscleGroup === filterGroup;
      const matchesSearch = !searchText || ex.name.toLowerCase().includes(searchText.toLowerCase());
      return matchesGroup && matchesSearch;
    }).sort((a, b) => a.name.localeCompare(b.name));

    if (!filtered.length) {
      resultsWrap.appendChild(el(`<div class="muted" style="padding:20px 0; text-align:center;">Sin resultados</div>`));
      return;
    }
    filtered.forEach(ex => {
      const row = el(`<div class="exercise-select-row" style="cursor:pointer;">
        ${exerciseThumbHTML(ex, "small")}
        <div style="flex:1;"><div class="title">${ex.name}</div><div class="subtitle">${ex.muscleGroup}</div></div>
        ${ex.custom ? '<div class="muted" style="font-size:11px;">Personalizado</div>' : ""}
      </div>`);
      row.addEventListener("click", () => { onSelect(ex); backdrop.remove(); });
      resultsWrap.appendChild(row);
    });
  }
  refreshResults();

  backdrop.querySelector(".search-input").addEventListener("input", (e) => { searchText = e.target.value; refreshResults(); });
  backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });
  backdrop.querySelector("#new-exercise-btn").addEventListener("click", () => {
    openExerciseForm(null, async (exercise) => { onSelect(exercise); backdrop.remove(); });
  });

  document.body.appendChild(backdrop);
}

/* ================================================================
   HISTORIAL
   ================================================================ */
function renderHistory() {
  const finished = state.workouts.filter(w => w.finishedAt);
  if (!finished.length) {
    return el(emptyState("📅", "Sin entrenamientos todavía", "Tus entrenamientos finalizados aparecerán aquí."));
  }

  const groups = {};
  finished.forEach(w => {
    const d = new Date(w.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    (groups[key] = groups[key] || { label: DateFmt.monthYear(d), items: [] }).items.push(w);
  });

  const container = el(`<div><div class="page-title">Historial</div><div id="groups"></div></div>`);
  const groupsWrap = container.querySelector("#groups");
  Object.values(groups).forEach(group => {
    groupsWrap.appendChild(el(`<div class="section-title">${group.label}</div>`));
    const list = el(`<div></div>`);
    group.items.forEach(w => {
      const row = el(`<div class="list-row" style="cursor:pointer;">
        <div><div class="subtitle">${DateFmt.dayMonth(new Date(w.date))}</div><div class="title">${w.name}</div></div>
        <div class="muted">›</div>
      </div>`);
      row.addEventListener("click", () => navigate("history/detail", { id: w.id }));
      list.appendChild(row);
    });
    groupsWrap.appendChild(list);
  });
  return container;
}

function renderWorkoutDetail() {
  const workout = state.workouts.find(w => w.id === state.routeParams.id);
  if (!workout) { navigate("history"); return el("<div></div>"); }

  const container = el(`<div>
    <div class="top-row">
      <button class="icon-btn" id="back-btn">‹ Volver</button>
      <button class="icon-btn" id="delete-btn">🗑</button>
    </div>
    <h1 style="font-size:24px;">${workout.name}</h1>
    <div class="muted" style="font-size:13px; margin-bottom:12px;">${DateFmt.fullDayMonth(new Date(workout.date))}</div>
    <div class="stat-grid" style="margin-bottom:16px;">
      <div class="stat-card"><div class="value">${Math.round(totalVolume(workout))}</div><div class="label">Volumen (kg)</div></div>
      <div class="stat-card"><div class="value">${totalSets(workout)}</div><div class="label">Series</div></div>
      <div class="stat-card"><div class="value">${workout.finishedAt ? DateFmt.duration(new Date(workout.finishedAt) - new Date(workout.startedAt)) : "–"}</div><div class="label">Duración</div></div>
    </div>
    ${workout.notes ? `<div class="card muted">${workout.notes}</div>` : ""}
    <div id="exercise-summaries"></div>
  </div>`);

  container.querySelector("#back-btn").addEventListener("click", () => navigate("history"));
  container.querySelector("#delete-btn").addEventListener("click", async () => {
    if (!confirm("¿Eliminar este entrenamiento?")) return;
    await DB.remove("workouts", workout.id);
    await reloadWorkouts();
    navigate("history");
  });

  const wrap = container.querySelector("#exercise-summaries");
  workout.exercises.sort((a, b) => a.order - b.order).forEach(we => {
    const exercise = getExercise(we.exerciseId);
    const card = el(`<div class="card">
      <div style="font-weight:700; margin-bottom:6px;">${exercise ? exercise.name : "Ejercicio"}</div>
      ${we.sets.map((s, i) => `
        <div style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:14px;">
          <span class="muted" style="width:56px; font-size:12px;">Serie ${i + 1}</span>
          <span>${fmtWeight(s.weight)} kg × ${s.repetitions}</span>
          <span style="flex:1;"></span>
          ${s.completed ? '<span style="color:var(--success);">✓</span>' : ""}
        </div>`).join("")}
    </div>`);
    wrap.appendChild(card);
  });

  return container;
}

function emptyState(icon, title, subtitle) {
  return `<div class="empty-state"><div class="icon">${icon}</div><div style="font-weight:700; color:var(--text); margin-bottom:4px;">${title}</div><div>${subtitle}</div></div>`;
}

/* ================================================================
   PROGRESO
   ================================================================ */
function progressPoints(exerciseId) {
  const points = [];
  [...state.workouts].filter(w => w.finishedAt).sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(w => {
    const we = w.exercises.find(e => e.exerciseId === exerciseId);
    if (!we) return;
    const completed = we.sets.filter(s => s.completed);
    if (!completed.length) return;
    points.push({
      date: new Date(w.date),
      maxWeight: Math.max(...completed.map(s => s.weight)),
      totalVolume: completed.reduce((sum, s) => sum + s.weight * s.repetitions, 0),
    });
  });
  return points;
}

function bestByWeight(exerciseId) {
  let best = null;
  state.workouts.filter(w => w.finishedAt).forEach(w => {
    const we = w.exercises.find(e => e.exerciseId === exerciseId);
    if (!we) return;
    we.sets.filter(s => s.completed).forEach(s => {
      if (!best || s.weight > best.weight) best = { weight: s.weight, repetitions: s.repetitions, date: new Date(w.date) };
    });
  });
  return best;
}

function renderProgressOverview() {
  const withHistory = state.exercises.filter(ex => progressPoints(ex.id).length > 0);
  if (!withHistory.length) {
    return el(emptyState("📈", "Todavía sin datos", "Registra entrenamientos para ver aquí tu progreso."));
  }
  const container = el(`<div><div class="page-title">Progreso</div><div id="ex-list"></div></div>`);
  const list = container.querySelector("#ex-list");
  withHistory.sort((a, b) => a.name.localeCompare(b.name)).forEach(ex => {
    const record = bestByWeight(ex.id);
    const row = el(`<div class="list-row" style="cursor:pointer;">
      <div><div class="title">${ex.name}</div><div class="subtitle">${ex.muscleGroup}</div></div>
      ${record ? `<div style="color:var(--accent); font-weight:700; font-size:13px;">PR ${fmtWeight(record.weight)} kg</div>` : ""}
    </div>`);
    row.addEventListener("click", () => navigate("progress/detail", { id: ex.id }));
    list.appendChild(row);
  });
  return container;
}

function renderExerciseProgress() {
  const exercise = getExercise(state.routeParams.id);
  if (!exercise) { navigate("progress"); return el("<div></div>"); }
  const points = progressPoints(exercise.id);
  const record = bestByWeight(exercise.id);

  const container = el(`<div>
    <div class="top-row"><button class="icon-btn" id="back-btn">‹ Volver</button></div>
    <h1 style="font-size:24px; margin-bottom:12px;">${exercise.name}</h1>
    ${record ? `<div class="record-banner">
        <div class="emoji">🏆</div>
        <div>
          <div class="muted" style="font-size:11px; font-weight:700;">Récord personal</div>
          <div style="font-weight:700; font-size:17px;">${fmtWeight(record.weight)} kg × ${record.repetitions} repeticiones</div>
          <div class="muted" style="font-size:12px;">${DateFmt.dayMonth(record.date)}</div>
        </div>
      </div>` : ""}
    ${points.length >= 2 ? `
      <div class="card">
        <div style="font-weight:700; margin-bottom:8px;">Evolución del peso máximo</div>
        ${Charts.lineChart(points.map(p => ({ x: p.date, y: p.maxWeight })))}
      </div>
      <div class="card">
        <div style="font-weight:700; margin-bottom:8px;">Volumen total por entrenamiento</div>
        ${Charts.lineChart(points.map(p => ({ x: p.date, y: p.totalVolume })), { color: "#FFB020" })}
      </div>` : `<div class="muted card">Registra este ejercicio en al menos dos entrenamientos para ver la evolución en gráficos.</div>`}
    <div class="card">
      <div style="font-weight:700; margin-bottom:8px;">Historial</div>
      ${[...points].reverse().map(p => `
        <div style="display:flex; justify-content:space-between; padding:6px 0; border-top:1px solid var(--border); font-size:14px;">
          <span class="muted" style="font-size:12px;">${DateFmt.dayMonth(p.date)}</span>
          <span>${fmtWeight(p.maxWeight)} kg</span>
          <span class="muted" style="font-size:12px;">${Math.round(p.totalVolume)} kg vol.</span>
        </div>`).join("")}
    </div>
  </div>`);

  container.querySelector("#back-btn").addEventListener("click", () => navigate("progress"));
  return container;
}

/* ================================================================
   AJUSTES
   ================================================================ */
function renderSettings() {
  const finishedCount = state.workouts.filter(w => w.finishedAt).length;
  const container = el(`<div>
    <div class="page-title">Ajustes</div>
    <div class="section-title">Datos</div>
    <div class="list-row" id="go-exercises" style="cursor:pointer;"><div class="title">Biblioteca de ejercicios</div><div class="muted">›</div></div>

    <div class="section-title">Preferencias</div>
    <div class="card">
      <div class="list-row" style="background:none; padding:0 0 12px;">
        <div class="title">Unidad de peso</div>
        <div class="muted">Kilogramos</div>
      </div>
      <div class="title" style="margin-bottom:8px;">Descanso por defecto</div>
      <div class="weight-control" style="margin:0 0 6px;">
        <button class="stepper-btn" data-rest="-15">−</button>
        <div class="stepper-value">
          <input type="number" inputmode="numeric" id="rest-input" value="${state.settings.defaultRestSeconds}" />
          <span class="unit">segundos</span>
        </div>
        <button class="stepper-btn" data-rest="15">+</button>
      </div>
      <div class="rest-chip-row" id="rest-chips" style="margin-bottom:18px;"></div>
      <div class="title" style="margin-bottom:8px;">Color de la app</div>
      <div class="theme-swatch-row" id="theme-swatches"></div>
    </div>

    <div class="section-title">Estadísticas</div>
    <div class="list-row"><div class="title">Entrenamientos registrados</div><div class="muted">${finishedCount}</div></div>
    <div class="list-row"><div class="title">Ejercicios en la biblioteca</div><div class="muted">${state.exercises.length}</div></div>
    <div class="section-title">Acerca de</div>
    <div class="muted" style="font-size:13px; line-height:1.5;">Todos los datos se guardan localmente en este dispositivo (IndexedDB). No hay servidor ni cuenta asociada.</div>
  </div>`);

  container.querySelector("#go-exercises").addEventListener("click", () => navigate("settings/exercises"));

  const restInput = container.querySelector("#rest-input");
  container.querySelectorAll("[data-rest]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const delta = parseInt(btn.dataset.rest);
      const value = Math.max(15, (parseInt(restInput.value) || 0) + delta);
      restInput.value = value;
      state.settings.defaultRestSeconds = value;
      await saveSettings();
    });
  });
  restInput.addEventListener("change", async () => {
    state.settings.defaultRestSeconds = Math.max(15, parseInt(restInput.value) || DEFAULT_REST_SECONDS);
    restInput.value = state.settings.defaultRestSeconds;
    await saveSettings();
  });

  const restChips = container.querySelector("#rest-chips");
  [45, 60, 90, 120, 150].forEach(sec => {
    const chip = el(`<span class="chip ${state.settings.defaultRestSeconds === sec ? "selected" : ""}">${sec}s</span>`);
    chip.addEventListener("click", async () => {
      state.settings.defaultRestSeconds = sec;
      await saveSettings();
      navigate("settings");
    });
    restChips.appendChild(chip);
  });

  const THEMES = [
    { key: "pink", color: "#E0399B" },
    { key: "blue", color: "#2F5FFF" },
    { key: "orange", color: "#FF7A29" },
    { key: "red", color: "#E0293D" },
    { key: "green", color: "#1FA95C" },
  ];
  const swatchWrap = container.querySelector("#theme-swatches");
  THEMES.forEach(t => {
    const swatch = el(`<div class="theme-swatch ${state.settings.theme === t.key ? "selected" : ""}" style="background:${t.color};"></div>`);
    swatch.addEventListener("click", async () => {
      state.settings.theme = t.key;
      await saveSettings();
      navigate("settings");
    });
    swatchWrap.appendChild(swatch);
  });

  return container;
}

function renderExerciseLibrary() {
  const container = el(`<div>
    <div class="top-row"><button class="icon-btn" id="back-btn">‹ Volver</button><button class="icon-btn" id="add-btn">＋</button></div>
    <h1 style="font-size:24px; margin-bottom:12px;">Ejercicios</h1>
    <div id="ex-groups"></div>
  </div>`);
  container.querySelector("#back-btn").addEventListener("click", () => navigate("settings"));
  container.querySelector("#add-btn").addEventListener("click", () => {
    openExerciseForm(null, () => navigate("settings/exercises"));
  });

  const groups = {};
  [...state.exercises].sort((a, b) => a.name.localeCompare(b.name)).forEach(ex => {
    (groups[ex.muscleGroup] = groups[ex.muscleGroup] || []).push(ex);
  });
  const wrap = container.querySelector("#ex-groups");
  Object.keys(groups).sort().forEach(group => {
    wrap.appendChild(el(`<div class="section-title" style="margin-top:16px;">${group}</div>`));
    groups[group].forEach(ex => {
      const row = el(`<div class="exercise-select-row" style="cursor:pointer;">
        ${exerciseThumbHTML(ex, "small")}
        <div style="flex:1;"><div class="title">${ex.name}</div><div class="subtitle">${ex.type}</div></div>
        ${ex.custom ? '<div class="muted" style="font-size:11px;">Personalizado</div>' : ""}
      </div>`);
      row.addEventListener("click", () => openExerciseForm(ex, () => navigate("settings/exercises")));
      wrap.appendChild(row);
    });
  });
  return container;
}

function renderTemplateList() {
  const container = el(`<div>
    <div class="top-row">
      <div class="page-title" style="font-size:28px;">Planning</div>
      <button class="icon-btn" id="add-btn">＋</button>
    </div>
    <div class="page-subtitle">Tus rutinas guardadas</div>
    <div id="tpl-list"></div>
  </div>`);

  if (!state.templates.length) {
    container.querySelector("#tpl-list").innerHTML = emptyState("📋", "Sin planning todavía", "Guarda una rutina como plantilla para empezarla en un toque cualquier día.");
  } else {
    state.templates.forEach(t => {
      const row = el(`<div class="list-row" style="cursor:pointer;"><div><div class="title">${t.name}</div><div class="subtitle">${t.exercises.length} ejercicios</div></div><button class="icon-btn" data-del>🗑</button></div>`);
      row.addEventListener("click", () => openTemplateForm(t));
      row.querySelector("[data-del]").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm("¿Eliminar esta plantilla?")) return;
        await DB.remove("templates", t.id);
        state.templates = await DB.getAll("templates");
        navigate("planning");
      });
      container.querySelector("#tpl-list").appendChild(row);
    });
  }

  container.querySelector("#add-btn").addEventListener("click", () => openTemplateForm());
  return container;
}

function openTemplateForm(existing) {
  let selected = existing
    ? existing.exercises.map(te => getExercise(te.exerciseId)).filter(Boolean)
    : [];

  const backdrop = el(`<div class="sheet-backdrop">
    <div class="sheet">
      <div class="sheet-header"><h2>${existing ? "Editar rutina" : "Nueva rutina"}</h2><button class="icon-btn" data-close>✕</button></div>
      <div class="sheet-fixed-top">
        <div class="field-label" style="margin-top:0;">Nombre</div>
        <input class="field" id="tpl-name" placeholder="Ej. Pecho + Tríceps" value="${existing ? existing.name : ""}" />
        <div class="field-label">Ejercicios</div>
      </div>
      <div class="sheet-body"><div id="tpl-exercises"></div></div>
      <div class="sheet-footer">
        <button class="btn-secondary" id="tpl-add-ex">＋ Añadir ejercicio</button>
        <button class="btn-primary" id="tpl-save" style="margin-top:10px;">${existing ? "Guardar cambios" : "Guardar rutina"}</button>
        ${existing ? `<button class="btn-secondary" style="margin-top:8px; color:var(--danger);" id="tpl-delete">Eliminar rutina</button>` : ""}
      </div>
    </div>
  </div>`);

  const listWrap = backdrop.querySelector("#tpl-exercises");
  function refreshList() {
    listWrap.innerHTML = "";
    if (!selected.length) {
      listWrap.appendChild(el(`<div class="muted" style="padding:8px 0;">Todavía no has añadido ejercicios.</div>`));
    }
    selected.forEach((ex, i) => {
      const row = el(`<div class="list-row"><div class="title">${ex.name}</div><button class="icon-btn" data-del>✕</button></div>`);
      row.querySelector("[data-del]").addEventListener("click", () => { selected.splice(i, 1); refreshList(); });
      listWrap.appendChild(row);
    });
  }
  refreshList();

  backdrop.querySelector("#tpl-add-ex").addEventListener("click", () => {
    openExercisePicker((ex) => { selected.push(ex); refreshList(); });
  });

  backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.querySelector("#tpl-save").addEventListener("click", async () => {
    const name = backdrop.querySelector("#tpl-name").value.trim();
    if (!name || !selected.length) return;
    const template = existing || { id: DB.uuid(), createdAt: new Date().toISOString() };
    template.name = name;
    template.exercises = selected.map((ex, i) => ({ exerciseId: ex.id, order: i }));
    await DB.put("templates", template);
    state.templates = await DB.getAll("templates");
    backdrop.remove();
    navigate("planning");
  });

  if (existing) {
    backdrop.querySelector("#tpl-delete").addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta rutina?")) return;
      await DB.remove("templates", existing.id);
      state.templates = await DB.getAll("templates");
      backdrop.remove();
      navigate("planning");
    });
  }

  document.body.appendChild(backdrop);
}

/* ================================================================
   TEMPORIZADOR DE DESCANSO
   ================================================================ */
const $restTimer = document.getElementById("rest-timer");
const $restTimerValue = document.getElementById("rest-timer-value");

function setupRestTimerControls() {
  document.querySelectorAll("[data-rest-adjust]").forEach(btn => {
    btn.addEventListener("click", () => adjustRestTimer(parseInt(btn.dataset.restAdjust)));
  });
  document.getElementById("rest-timer-close").addEventListener("click", stopRestTimer);
}

function startRestTimer(seconds) {
  clearInterval(state.restTimer.intervalId);
  state.restTimer.active = true;
  state.restTimer.seconds = seconds;
  updateRestTimerDisplay();
  state.restTimer.intervalId = setInterval(() => {
    state.restTimer.seconds -= 1;
    if (state.restTimer.seconds <= 0) { stopRestTimer(); return; }
    updateRestTimerDisplay();
  }, 1000);
  updateRestTimerVisibility();
}

function adjustRestTimer(delta) {
  state.restTimer.seconds = Math.max(0, state.restTimer.seconds + delta);
  updateRestTimerDisplay();
}

function stopRestTimer() {
  clearInterval(state.restTimer.intervalId);
  state.restTimer.active = false;
  state.restTimer.seconds = 0;
  updateRestTimerVisibility();
}

function updateRestTimerDisplay() {
  const m = Math.floor(state.restTimer.seconds / 60);
  const s = state.restTimer.seconds % 60;
  $restTimerValue.textContent = `${m}:${String(s).padStart(2, "0")}`;
}

function updateRestTimerVisibility() {
  $restTimer.classList.toggle("hidden", !state.restTimer.active);
}

/* ---------------- Arranque ---------------- */
window.addEventListener("DOMContentLoaded", bootstrap);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
