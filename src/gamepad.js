// ── gamepad.js ────────────────────────────────────────────────────────────────

let infoElement = null;
let canvasElement = null;
let ctx = null;

const RADIUS = 46;
const PADDING = 14;

let leftCenterX = 0;
let rightCenterX = 0;
let centerY = 0;

if (window.__gamepadAnimFrame__) {
    cancelAnimationFrame(window.__gamepadAnimFrame__);
    window.__gamepadAnimFrame__ = null;
}

// ── Публичное состояние ───────────────────────────────────────────────────────
export const gamepadState = {
    connected: false,     // Есть ли ФИЗИЧЕСКИЙ геймпад
    usingKeyboard: true,   // Используем ли мы плавную клавиатуру
    id: '',
    type: 'keyboard',
    roll: 0,
    pitch: 0,
    yaw: 0,
    throttle: 0,
    arcadeMode: false,
    justPressedSquare: false,
};

let _lastBtn2 = false;

let _controllerType = 'gamepad';

// ── Сглаженные значения для отображения (анимация стиков) ────────────────────
let _dispLX = 0, _dispLY = 0, _dispRX = 0, _dispRY = 0;
const DISP_SMOOTH = 0.18;

// ── Сглаженные значения управления ГЕЙМПАДА ──────────────────────────────────
let _sRoll = 0, _sPitch = 0, _sYaw = 0, _sThrottle = 0;
const CTRL_SMOOTH = 0.10;

// ── КЛАВИАТУРА (Плавные виртуальные стики) ───────────────────────────────────
const keys = new Set();
let _kbRoll = 0, _kbPitch = 0, _kbYaw = 0, _kbThrottle = 0;

// Настройки плавности клавиатуры:
const KB_PRESS = 0.08;  // Скорость наклона стика (чем меньше, тем плавнее)
const KB_RELEASE = 0.15;  // Скорость возврата в центр (чуть быстрее)
const KB_THROTTLE_SPEED = 0.012; // Скорость набора газа (W/S)

// Подключаем слушатели клавы прямо здесь
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup', e => keys.delete(e.code));

// ── Утилиты ───────────────────────────────────────────────────────────────────
function detectType(id = '') {
    const s = id.toLowerCase();
    if (s.includes('dual') || s.includes('playstation') || s.includes('054c')) return 'dualshock';
    if (s.includes('xbox') || s.includes('xinput') || s.includes('045e')) return 'xbox';
    return 'generic';
}

function dz(v, threshold = 0.12) {
    if (Math.abs(v) < threshold) return 0;
    return (v - Math.sign(v) * threshold) / (1 - threshold);
}

function expo(v, e = 0.45) { return v * (e * v * v + (1 - e)); }
function dzExpo(v, threshold = 0.12, e = 0.45) { return expo(dz(v, threshold), e); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Нормализация осей Геймпада ────────────────────────────────────────────────
function normalizeAxes(gp) {
    const a = gp.axes;
    const b = gp.buttons;
    const type = detectType(gp.id);
    let raw;

    if (_controllerType === 'fpv') {
        raw = {
            roll: dzExpo(a[0] ?? 0),
            pitch: -dzExpo(a[1] ?? 0),
            throttle: (-(a[2] ?? 0) + 1) / 2,
            yaw: dzExpo(a[3] ?? 0),
        };
    } else if (type === 'dualshock' && gamepadState.arcadeMode) {
        const r2 = b[7]?.value ?? 0;
        const l2 = b[6]?.value ?? 0;
        raw = {
            roll: dzExpo(a[2] ?? 0),
            pitch: -dzExpo(a[3] ?? 0),
            yaw: dzExpo(a[0] ?? 0),
            throttle: (r2 - l2 + 1) / 2,
        };
    } else {
        // Mode 2: левый стик = газ (LY инв.) + рысканье (LX)
        //          правый стик = pitch (RY инв.) + roll (RX)
        raw = {
            yaw:      dzExpo(a[0] ?? 0, 0.12, 0.35),          // LX → рысканье
            throttle: (-dz(a[1] ?? 0) + 1) / 2,               // LY инв. → газ 0..1
            roll:     dzExpo(a[2] ?? 0),                       // RX → крен
            pitch:    -dzExpo(a[3] ?? 0),                      // RY инв. → тангаж
        };
    }

    _sRoll = lerp(_sRoll, raw.roll, CTRL_SMOOTH);
    _sPitch = lerp(_sPitch, raw.pitch, CTRL_SMOOTH);
    _sYaw = lerp(_sYaw, raw.yaw, CTRL_SMOOTH);
    _sThrottle = lerp(_sThrottle, raw.throttle, CTRL_SMOOTH);

    return { roll: _sRoll, pitch: _sPitch, yaw: _sYaw, throttle: _sThrottle };
}

// ── Обработка Виртуальной Клавиатуры ──────────────────────────────────────────
function processKeyboard() {
    // Газ: плавно растет/падает
    if (keys.has('KeyW')) _kbThrottle += KB_THROTTLE_SPEED;
    if (keys.has('KeyS')) _kbThrottle -= KB_THROTTLE_SPEED;
    _kbThrottle = Math.max(0, Math.min(1, _kbThrottle));

    // Целевые значения для стиков (-1 .. 1)
    const tPitch = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    const tRoll = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0);
    const tYaw = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);

    // Плавное интерполирование (чтобы не было резких дерганий)
    _kbPitch = lerp(_kbPitch, tPitch, tPitch === 0 ? KB_RELEASE : KB_PRESS);
    _kbRoll = lerp(_kbRoll, tRoll, tRoll === 0 ? KB_RELEASE : KB_PRESS);
    _kbYaw = lerp(_kbYaw, tYaw, tYaw === 0 ? KB_RELEASE : KB_PRESS);

    gamepadState.roll = _kbRoll;
    gamepadState.pitch = _kbPitch;
    gamepadState.yaw = _kbYaw;
    gamepadState.throttle = _kbThrottle;
    gamepadState.type = 'keyboard';
    gamepadState.usingKeyboard = true;
}

// ── Canvas отрисовка ──────────────────────────────────────────────────────────
function clearCanvas() {
    if (!ctx || !canvasElement) return;
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

function drawStick(cx, cy, rawX, rawY, label, accent) {
    const R = RADIUS;
    if (label === 'L') {
        _dispLX = lerp(_dispLX, rawX, DISP_SMOOTH);
        _dispLY = lerp(_dispLY, rawY, DISP_SMOOTH);
    } else {
        _dispRX = lerp(_dispRX, rawX, DISP_SMOOTH);
        _dispRY = lerp(_dispRY, rawY, DISP_SMOOTH);
    }
    const dx = label === 'L' ? _dispLX : _dispRX;
    const dy = label === 'L' ? _dispLY : _dispRY;

    const px = cx + dx * R;
    const py = cy - dy * R;

    ctx.save();
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 6);
    glowGrad.addColorStop(0, accent + '10');
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = accent + '55';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.85, cy); ctx.lineTo(cx + R * 0.85, cy);
    ctx.moveTo(cx, cy - R * 0.85); ctx.lineTo(cx, cy + R * 0.85);
    ctx.stroke();

    const dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
        const lineGrad = ctx.createLinearGradient(cx, cy, px, py);
        lineGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        lineGrad.addColorStop(1, accent + 'cc');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
    }

    if (dist > 0.02) {
        const trailGrad = ctx.createRadialGradient(px, py, 0, px, py, 16);
        trailGrad.addColorStop(0, accent + '35');
        trailGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = trailGrad;
        ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
    }

    const dotGrad = ctx.createRadialGradient(px, py, 0, px, py, 7);
    dotGrad.addColorStop(0, '#fff');
    dotGrad.addColorStop(0.3, accent);
    dotGrad.addColorStop(1, accent + '00');
    ctx.fillStyle = dotGrad;
    ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = accent + 'bb';
    ctx.font = `bold 9px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + R + 13);
    ctx.restore();
}

function drawThrottleBar(x, y, w, h, value, accent) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 4); ctx.fill();

    const fillH = h * value;
    const color = value > 0.6 ? '#00e664' : value > 0.3 ? '#ffcc00' : '#ff5533';
    const barGrad = ctx.createLinearGradient(x, y + h, x, y);
    barGrad.addColorStop(0, color + '44');
    barGrad.addColorStop(value, color + 'dd');
    barGrad.addColorStop(Math.min(1, value + 0.01), 'transparent');
    ctx.fillStyle = barGrad;
    ctx.beginPath(); ctx.roundRect(x + 1, y + h - fillH, w - 2, fillH, 2); ctx.fill();

    ctx.strokeStyle = accent + '40';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.stroke();

    for (let i = 1; i < 4; i++) {
        const ly = y + h * (1 - i * 0.25);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x + 2, ly); ctx.lineTo(x + w - 2, ly); ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.font = `bold 8px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(value * 100) + '%', x + w / 2, y - 4);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `8px "JetBrains Mono", monospace`;
    ctx.fillText('T', x + w / 2, y + h + 13);
    ctx.restore();
}

function drawVisualizer(lx, ly, rx, ry, throttleVal, labelStr, accent) {
    if (!ctx || !canvasElement) return;
    const W = canvasElement.width;
    clearCanvas();

    drawStick(leftCenterX, centerY, lx, ly, 'L', accent);
    drawStick(rightCenterX, centerY, rx, ry, 'R', accent);

    const tbW = 9, tbH = RADIUS * 2;
    drawThrottleBar(W / 2 - tbW / 2, centerY - RADIUS, tbW, tbH, throttleVal, accent);

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.font = `bold 8px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(labelStr, W / 2, centerY - RADIUS - 6);
    ctx.restore();
}

// ── Поиск активного геймпада ──────────────────────────────────────────────────
function getActiveGamepad() {
    const pads = navigator.getGamepads();
    for (const pad of pads) if (pad && pad.connected) return pad;
    return null;
}

// ── Обновление состояния ──────────────────────────────────────────────────────
function updateStateOnly() {
    const gp = getActiveGamepad();

    if (!gp) {
        // ЕСЛИ НЕТ ГЕЙМПАДА -> ПЛАВНАЯ КЛАВИАТУРА
        gamepadState.connected = false;
        processKeyboard();

        if (infoElement) infoElement.textContent = 'КЛАВИАТУРА [WASD + СТРЕЛКИ]';

        // Рисуем виртуальные стики
        const lx = _kbYaw;
        const ly = (_kbThrottle * 2) - 1; // визуальный стик газа (-1..1)
        const rx = _kbRoll;
        const ry = -_kbPitch; // Инверсия для визуала

        drawVisualizer(lx, ly, rx, ry, _kbThrottle, 'КЛАВИАТУРА', '#ff00aa'); // Розовый цвет для клавы
        return;
    }

    // ЕСЛИ ЕСТЬ ГЕЙМПАД
    gamepadState.connected = true;
    gamepadState.usingKeyboard = false;
    gamepadState.id = gp.id;
    gamepadState.type = detectType(gp.id);

    const norm = normalizeAxes(gp);
    gamepadState.roll = norm.roll;
    gamepadState.pitch = norm.pitch;
    gamepadState.yaw = norm.yaw;
    gamepadState.throttle = norm.throttle;

    const btn2 = gp.buttons[2]?.pressed || false;
    gamepadState.justPressedSquare = btn2 && !_lastBtn2;
    _lastBtn2 = btn2;

    if (infoElement) {
        infoElement.textContent = `${gamepadState.type.toUpperCase()}${gamepadState.arcadeMode ? ' [ARCADE]' : ''}`;
    }

    const type = gamepadState.type;
    const accent = type === 'dualshock' ? '#00aaff' : type === 'xbox' ? '#00e664' : '#ffcc00';

    // Визуализация: левый стик = yaw(X)/throttle(Y), правый = roll(X)/pitch(Y)
    const lx = _controllerType === 'fpv' ? dz(gp.axes[2] ?? 0) : dz(gp.axes[0] ?? 0);
    const ly = _controllerType === 'fpv' ? -(dz(gp.axes[3] ?? 0)) : -(dz(gp.axes[1] ?? 0));
    const rx = _controllerType === 'fpv' ? dz(gp.axes[0] ?? 0) : dz(gp.axes[2] ?? 0);
    const ry = _controllerType === 'fpv' ? -(dz(gp.axes[1] ?? 0)) : -(dz(gp.axes[3] ?? 0));

    drawVisualizer(lx, ly, rx, ry, gamepadState.throttle,
        gamepadState.arcadeMode ? 'ARCADE' : type.toUpperCase(), accent);
}

function loop() {
    window.__gamepadAnimFrame__ = requestAnimationFrame(loop);
    updateStateOnly();
}

// ── Публичное API ─────────────────────────────────────────────────────────────
export function toggleArcadeMode() {
    gamepadState.arcadeMode = !gamepadState.arcadeMode;
    return gamepadState.arcadeMode;
}

export function setControllerType(type) {
    _controllerType = type;
}

export function initGamepadVisualizer(infoEl, canvasEl) {
    infoElement = infoEl;
    canvasElement = canvasEl;
    if (!canvasElement) return;

    ctx = canvasElement.getContext('2d');
    leftCenterX = PADDING + RADIUS;
    rightCenterX = canvasElement.width - PADDING - RADIUS;
    centerY = canvasElement.height / 2 - 6;

    updateStateOnly();
}

export function destroyGamepadVisualizer() {
    infoElement = null;
    canvasElement = null;
    ctx = null;
}

window.addEventListener('gamepadconnected', (e) => updateStateOnly());
window.addEventListener('gamepaddisconnected', (e) => updateStateOnly());
if (!window.__gamepadAnimFrame__) {
    loop();
}