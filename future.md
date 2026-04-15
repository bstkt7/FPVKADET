# FPV Simulator — Технический аудит проекта
> Дата: 2026-03-20 | Статус: активная разработка
> Аудит проводился с позиции разработчика игрового движка с 20-летним стажем (Three.js, Unity, Unreal, физические движки).

---

## 1. Общая архитектура проекта

### Стек
| Слой | Технология | Оценка |
|---|---|---|
| Frontend | React 19 + Vite 8 + Three.js r183 | ✅ Современно |
| Физика | Cannon-es 0.20 | ⚠️ Частично интегрирован |
| Аудио | Web Audio API (самописный) | ⚠️ Нет пула источников |
| Геймпад | Gamepad API (polling) | ✅ Правильный подход |
| Backend | Node.js + Express + SQLite | ⚠️ Нет производственной конфигурации |
| Desktop | Electron (не запускается из React) | ❌ Конфигурация не закончена |
| Тесты | Отсутствуют | ❌ Критично |

### Структура файлов (текущее состояние)
```
src/
├── engine.js          <- Главный цикл (жирный «god object» после частичного рефакторинга)
├── physics.js         <- Cannon-es интеграция (новая, нестабильная)
├── BombManager.js     <- OK, изолирован
├── RaceManager.js     <- OK, но fetch прямо в логике — антипаттерн
├── hud.js             <- Переписан (static+dynamic), но упрощён — потеряна функциональность
├── audio.js           <- Нет пула, нет остановки при dispose()
├── gamepad.js         <- Solid. Нет утечки animFrame при hotreload
├── environment.js     <- 30КБ мёртвый файл, не удалён после рефакторинга!
├── environment/       <- Модульная версия (gates, hangar, sky, weather...)
├── config/constants.js<- OK
└── components/        <- React UI, частично
```

---

## 2. КРИТИЧЕСКИЕ БАГИ (исправить в первую очередь)

### 🔴 BUG-01: `environment.js` — мёртвый файл с дублированием кода
**Файл:** `src/environment.js` (29 643 байт)
**Проблема:** После рефакторинга на `src/environment/` оригинальный монолит не удалён. Если Vite случайно подтянет не тот импорт — баг будет крайне труден в отладке.
**Исправление:**
```bash
del src\environment.js
```

---

### 🔴 BUG-02: BombManager обращается к `droneState.velocity` / `droneState.angularVelocity` напрямую
**Файл:** `src/BombManager.js`, строки 104-106
**Проблема:** После перехода на Cannon-es `droneState.velocity` — это зеркальные THREE.Vector3, они обновляются в `syncWithThree()`. Присвоение `addScaledVector` к ним не применит импульс к физическому телу Cannon — эффект взрыва не будет действовать на дрон.
**Исправление:** Применять импульс через `droneState.body.applyImpulse()`:
```js
// BombManager.js -> spawnExplosion()
import * as CANNON from 'cannon-es';
const impulse = new CANNON.Vec3(dir.x * force, dir.y * force, dir.z * force);
this.droneState.body.applyImpulse(impulse, this.droneState.body.position);
```

---

### 🔴 BUG-03: Утечка AnimationFrame в `gamepad.js` при hot-reload
**Файл:** `src/gamepad.js`
**Проблема:** `animFrame` — переменная модуля. При hot-reload Vite модуль переинициализируется, но старый `requestAnimationFrame` не отменяется. Со временем в браузере накапливается несколько параллельных gamepad-loop'ов.
**Исправление:**
```js
export function destroyGamepadVisualizer() {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
}
// И вызывать destroyGamepadVisualizer() в dispose() движка.
```

---

### 🔴 BUG-04: `audio.js` — нет остановки при dispose()
**Файл:** `src/audio.js`, `src/engine.js`
**Проблема:** При выходе из игры AudioContext продолжает работать. Музыка/мотор воспроизводятся после выхода.
**Исправление:**
```js
export function disposeAudio() {
    if (audioSource) { audioSource.stop(); audioSource = null; }
    if (audioCtx) { audioCtx.close(); audioCtx = null; }
    audioStarted = false;
}
```

---

### 🔴 BUG-05: `GRAVITY = -42` — неправильная константа для Cannon-es
**Файл:** `src/config/constants.js`, строка 4
**Проблема:** -42 м/с² это в ~4.3 раза больше земной гравитации. Физика будет вести себя странно. Тяга дронов заданы под старую аркадную физику и не совпадает с Cannon.
**Исправление:**
```js
export const GRAVITY      = -19.6;  // 2g — аркадно, но реалистично
export const GRAVITY_SNOW = -16.0;
// + пересчитать thrustNorm в DRONE_CLASSES
```

---

### 🔴 BUG-06: `RaceManager.js` — `fetch` прямо в игровом цикле (антипаттерн)
**Файл:** `src/RaceManager.js`, строка 79
**Проблема:** Прямой `fetch` в `update()`, при недоступном бэкенде — необработанные rejected promises.
**Исправление:** Вынести в отдельный async-метод с флагом `_isSubmitting` и try/catch.

---

### 🔴 BUG-07: Файлы `crash.mp3` и `land.mp3` отсутствуют в `public/assets/sounds/`
**Файл:** `src/audio.js`, строки 36-42
**Проблема:** Код пытается fetch эти файлы, получает 404, молча игнорирует. Звука краша/посадки нет.
**Исправление:** Добавить файлы или синтезировать по-другому и убрать мёртвый код.

---

## 3. ТЕХНИЧЕСКИЙ ДОЛГ (высокий приоритет)

### ⚠️ DEBT-01: `droneState` создаётся при загрузке модуля, а не при старте игры
**Файл:** `src/engine.js`, строка 33
**Проблема:** `const droneState = new DronePhysics(...)` выполняется при импорте. Cannon.World создаётся до старта игры. При повторном входе droneState накапливает состояние.
**Исправление:** Перевести в локальную переменную внутри `initEngine()`.

---

### ⚠️ DEBT-02: Cannon-es — `world.step()` вызывается с переменным delta (tunneling!)
**Файл:** `src/physics.js`
**Проблема:** При просадке FPS дрон может пролетать сквозь коллайдеры (classic tunneling bug).
**Исправление:**
```js
const FIXED_STEP = 1 / 120;  // 120Hz физика
const MAX_SUBSTEPS = 3;
this.world.step(FIXED_STEP, delta, MAX_SUBSTEPS);
```

---

### ⚠️ DEBT-03: Коллайдеры среды (ангар, здания) не добавлены в Cannon World
**Проблема:** Дрон проходит сквозь стены! Старая система AABB-коллайдеров ({cx, cy, cz, hw, hh, hd}) не работает с Cannon.
**Исправление:** В каждом строителе среды создавать `CANNON.Body({ mass: 0 })` и добавлять в `world`. Для этого `DronePhysics.world` нужно сделать доступным во `buildTrack()`.

---

### ⚠️ DEBT-04: Полный HUD потерян — восстановить из hud.js (старый)
**Проблема:** В ходе рефакторинга из `hud.js` (606 строк оригинала) выброшены:
- Таблица кругов с дельтами
- Индикатор бомбы (SVG-иконка)
- Прицельная камера бомбы с сеткой перекрестия
- Виньетка + хроматическая аберрация
- Компасная шкала (N/NE/E/SE/...)
- Глитч-эффекты при повреждении
- Информационная плашка режима полёта (ANGLE/SPORT/ACRO)

---

### ⚠️ DEBT-05: Electron-конфигурация неполная
**Проблема:** `electron/main.js` не запускает бэкенд как дочерний процесс. Нет IPC между React и Electron. `npm run dist` скорее всего сломан.
**Что нужно:**
```js
// electron/main.js
const backend = spawn('node', ['backend/server.js'], { cwd: __dirname });
// При выходе: backend.kill()
```

---

## 4. НЕДОСТАЮЩИЕ ФИЧИ (геймплей)

### 🎮 FEATURE-01: Нет системы прогрессивного повреждения
Дым при health < 50%, искры от сломанных пропеллеров, нестабильное управление.

### 🎮 FEATURE-02: Нет ghost-режима (призрак лучшего круга)
Записать позицию + кватернион каждые N мс, воспроизвести как полупрозрачный дрон.
Данные уже в SQLite — нужно добавить таблицу `ghost_frames`.

### 🎮 FEATURE-03: Нет fly-through перед стартом
Автокамера пролетает по воротам трассы → игрок жмёт СТАРТ → таймер и управление включаются.

### 🎮 FEATURE-04: Нет секторного таймера
Разбить круг на 3 сектора, после каждого сектора показывать дельту (зелёный/жёлтый/красный).

### 🎮 FEATURE-05: Нет выбора карты в UI (open_field, city_run)
TRACK_DATA содержит три трассы, но UI позволяет выбрать только hangar.

### 🎮 FEATURE-06: Нет режима тренировки (бесконечная трасса, нет таймера)
Просто полётный режим без гонки для практики управления.

### 🎮 FEATURE-07: Нет настройки чувствительности PID в реальном времени
Было задумано: слайдеры PID в SettingsModal. Нужно завершить и применять на лету без перезапуска движка.

---

## 5. ПРОИЗВОДИТЕЛЬНОСТЬ

### 🚀 PERF-01: Three.js — нет инстансинга для деревьев
30 деревьев = 120 draw calls. Нужен `THREE.InstancedMesh`.

### 🚀 PERF-02: Взрыв — 48 отдельных SphereGeometry
Нужен `THREE.Points` с BufferGeometry для частиц — один draw call вместо 48.

### 🚀 PERF-03: `quad.glb` — 9MB!
Открыть в Blender → Decimate → Draco export. Ожидаемый размер: 200-500KB.
Это КРИТИЧНО для загрузки в web.

### 🚀 PERF-04: Нет LOD (Level of Detail) для объектов среды
Использовать `THREE.LOD` для ангара и зданий на дистанции > 100м.

### 🚀 PERF-05: HUD-статика перерисовывается при каждом ресайзе — нужно debounce
```js
const onResize = debounce(() => { ... drawHUDStatic(); }, 200);
```

---

## 6. БЕЗОПАСНОСТЬ И BACKEND

### 🔒 SEC-01: CORS открыт для всех доменов
```js
// Исправить:
app.use(cors({ origin: 'http://localhost:5173' }));
```

### 🔒 SEC-02: Нет rate-limiting на POST /api/leaderboard
Установить `express-rate-limit`: 20 запросов/минуту.

### 🔒 SEC-03: Нет валидации lapTimeMs (можно записать 0ms рекорд)
```js
if (lapTimeMs < 5000 || lapTimeMs > 3600000)
    return res.status(400).json({ error: 'Некорректное время' });
```

### 🔒 SEC-04: playerName не санитизируется (XSS-потенциал в LeaderboardModal)
При рендере в React — безопасно (JSX экранирует). Но при выводе в Canvas — тоже OK.
Тем не менее, добавить trim + maxlength=30 на бэкенде.

---

## 7. DEVOPS

### 🐳 DEVOPS-01: Нет Docker/docker-compose
```yaml
# docker-compose.yml
services:
  backend:
    build: ./backend
    ports: ["5000:5000"]
    volumes: ["./backend/data:/app/data"]
  frontend:
    build: .
    ports: ["80:80"]
```

### 🐳 DEVOPS-02: Нет единого скрипта запуска
`concurrently` уже установлен в devDependencies! Просто исправить скрипт:
```json
"dev": "concurrently \"vite\" \"node backend/server.js\""
```

### 🐳 DEVOPS-03: Нет тестов — ни юниты, ни e2e
Рекомендую: **Vitest** для юнит-тестов (RaceManager, DronePhysics), **Playwright** для e2e.

---

## 8. ПЛАН РАБОТ (приоритизированный)

### Sprint 1 — Стабилизация (1-2 дня) 🔥
- [ ] Удалить `src/environment.js`
- [ ] Исправить BombManager → impulse через `body.applyImpulse()` (BUG-02)
- [ ] Добавить `disposeAudio()` и вызвать в `dispose()` (BUG-04)
- [ ] Восстановить полный HUD из оригинала (DEBT-04)
- [ ] Исправить GRAVITY → -19.6 и перекалибровать тягу (BUG-05)
- [ ] Заменить `world.step(delta)` на `world.step(1/120, delta, 3)` (DEBT-02)
- [ ] Добавить единый `npm run dev` с concurrently (DEVOPS-02)

### Sprint 2 — Коллизии среды (2-3 дня) 🏗️
- [ ] Интегрировать Cannon.Body в `environment/hangar.js` и `buildings.js`
- [ ] Передать `DronePhysics.world` в `buildTrack()`
- [ ] Тест: дрон не проходит сквозь стены ангара

### Sprint 3 — Геймплей (5-7 дней) 🎮
- [ ] Ghost-режим: запись траектории + воспроизведение
- [ ] Секторный таймер (3 сектора + цветовая дельта)
- [ ] Визуальное повреждение: дым + искры
- [ ] Fly-through камера перед стартом
- [ ] Добавить звуки crash.mp3 / land.mp3
- [ ] UI для выбора open_field / city_run

### Sprint 4 — Оптимизация и DevOps (2-3 дня) ⚡
- [ ] InstancedMesh для деревьев
- [ ] Points/BufferGeometry для частиц взрыва  
- [ ] Draco-сжатие quad.glb (9MB → ~300KB)
- [ ] Docker + docker-compose
- [ ] Rate-limiting + валидация на бэкенде
- [ ] Vitest unit-тесты для RaceManager, BombManager

---

## 9. ЧТО СДЕЛАНО ПРАВИЛЬНО ✅

| Компонент | Почему хорошо |
|---|---|
| Gamepad API polling | События ненадёжны — polling правильный подход |
| Deadzone + expo кривые | Профессиональная реализация, как в betaflight |
| BombManager / RaceManager | Хорошее разделение ответственности |
| Двухслойный HUD (static + dynamic canvas) | Правильная оптимизация, нужно развить |
| SQLite для рекордов | Правильный выбор для desktop/local |
| Cannon-es | Правильный выбор Web-физики (WASM) |
| DRONE_CLASSES — единый источник данных | Верный паттерн "single source of truth" |
| dispose() в движке | Грамотная очистка WebGL ресурсов |
| FPV + Third-person через scene.attach | Элегантное решение смены камеры |
| Turtle Mode концепция | Отличная FPV-фишка, логически верна |
| Expo + deadzone с линейным ремаппингом | Это делает управление плавным — топ решение |
