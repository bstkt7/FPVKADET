// ── gamepad.js ────────────────────────────────────────────────────────────────

let infoElement   = null;
let canvasElement = null;
let ctx           = null;

const RADIUS  = 46;
const PADDING = 14;

let leftCenterX  = 0;
let rightCenterX = 0;
let centerY      = 0;

let animFrame = null;

// ── Публичное состояние ───────────────────────────────────────────────────────
export const gamepadState = {
    connected:  false,
    id:         '',
    roll:       0,
    pitch:      0,
    yaw:        0,
    throttle:   0,
    arcadeMode: false,
};

let _controllerType = 'gamepad';

// ── Сглаженные значения для отображения (анимация стиков) ────────────────────
let _dispLX = 0, _dispLY = 0, _dispRX = 0, _dispRY = 0;
const DISP_SMOOTH = 0.18; // коэффициент сглаживания отображения

// ── Сглаженные значения управления (slow/smooth control response) ─────────────
let _sRoll = 0, _sPitch = 0, _sYaw = 0, _sThrottle = 0;
const CTRL_SMOOTH = 0.10; // Плавность управления — чем меньше, тем медленнее реакция

// ── Утилиты ───────────────────────────────────────────────────────────────────
function detectType(id = '') {
    const s = id.toLowerCase();
    if (s.includes('dual') || s.includes('playstation') || s.includes('054c'))
        return 'dualshock';
    if (s.includes('xbox') || s.includes('xinput') || s.includes('045e'))
        return 'xbox';
    return 'generic';
}

// Мёртвая зона с линейным ремаппингом
function dz(v, threshold = 0.12) {
    if (Math.abs(v) < threshold) return 0;
    return (v - Math.sign(v) * threshold) / (1 - threshold);
}

// Expo кривая
function expo(v, e = 0.45) {
    return v * (e * v * v + (1 - e));
}

function dzExpo(v, threshold = 0.12, e = 0.45) {
    return expo(dz(v, threshold), e);
}

// Low-pass / exponential smoothing (one-pole IIR filter)
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Нормализация осей ─────────────────────────────────────────────────────────
function normalizeAxes(gp) {
    const a = gp.axes;
    const b = gp.buttons;
    const type = detectType(gp.id);

    let raw;

    if (_controllerType === 'fpv') {
        raw = {
            roll:     dzExpo(a[0] ?? 0),
            pitch:   -dzExpo(a[1] ?? 0),
            throttle: (-(a[2] ?? 0) + 1) / 2,
            yaw:      dzExpo(a[3] ?? 0),
        };
    } else if (type === 'dualshock' && gamepadState.arcadeMode) {
        const r2 = b[7]?.value ?? 0;
        const l2 = b[6]?.value ?? 0;
        raw = {
            roll:     dzExpo(a[2] ?? 0),
            pitch:   -dzExpo(a[3] ?? 0),
            yaw:      dzExpo(a[0] ?? 0),
            throttle: (r2 - l2 + 1) / 2,
        };
    } else {
        const rt = b[7]?.value ?? 0;
        const lt = b[6]?.value ?? 0;
        const throttle = (rt + lt) > 0.05
            ? (rt - lt + 1) / 2
            : (-dz(a[3] ?? 0) + 1) / 2;
        raw = {
            roll:     dzExpo(a[0] ?? 0),
            pitch:   -dzExpo(a[1] ?? 0),
            yaw:      dzExpo(a[2] ?? 0, 0.12, 0.35),
            throttle,
        };
    }

    // Применяем IIR-фильтр к управляющим осям
    _sRoll     = lerp(_sRoll,     raw.roll,     CTRL_SMOOTH);
    _sPitch    = lerp(_sPitch,    raw.pitch,    CTRL_SMOOTH);
    _sYaw      = lerp(_sYaw,      raw.yaw,      CTRL_SMOOTH);
    _sThrottle = lerp(_sThrottle, raw.throttle, CTRL_SMOOTH);

    return { roll: _sRoll, pitch: _sPitch, yaw: _sYaw, throttle: _sThrottle };
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────
function clearCanvas() {
    if (!ctx || !canvasElement) return;
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
}

// Рисует кружок стика в современном стиле
function drawStick(cx, cy, rawX, rawY, label, accent) {
    const R = RADIUS;

    // Плавно интерполируем позицию точки для отображения
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

    // Внешний глоу-кружок (фон)
    const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R + 6);
    glowGrad.addColorStop(0, accent + '10');
    glowGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = glowGrad;
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();

    // Тёмный фон круга
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    // Внешняя рамка
    ctx.strokeStyle = accent + '55';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // Внутренний кружок (граница мёртвой зоны)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    // Крестик по центру
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.85, cy); ctx.lineTo(cx + R * 0.85, cy);
    ctx.moveTo(cx, cy - R * 0.85); ctx.lineTo(cx, cy + R * 0.85);
    ctx.stroke();

    // Линия от центра к точке
    const dist = Math.hypot(dx, dy);
    if (dist > 0.01) {
        const lineGrad = ctx.createLinearGradient(cx, cy, px, py);
        lineGrad.addColorStop(0, 'rgba(255,255,255,0.05)');
        lineGrad.addColorStop(1, accent + 'cc');
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
    }

    // Трек-кружок (след позиции)
    if (dist > 0.02) {
        const trailGrad = ctx.createRadialGradient(px, py, 0, px, py, 16);
        trailGrad.addColorStop(0, accent + '35');
        trailGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = trailGrad;
        ctx.beginPath(); ctx.arc(px, py, 16, 0, Math.PI * 2); ctx.fill();
    }

    // Точка стика
    const dotGrad = ctx.createRadialGradient(px, py, 0, px, py, 7);
    dotGrad.addColorStop(0, '#fff');
    dotGrad.addColorStop(0.3, accent);
    dotGrad.addColorStop(1, accent + '00');
    ctx.fillStyle = dotGrad;
    ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.fill();

    // Центральная точка (ноль)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();

    // Метка
    ctx.fillStyle = accent + 'bb';
    ctx.font = `bold 9px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + R + 13);

    ctx.restore();
}

function drawThrottleBar(x, y, w, h, value, accent) {
    ctx.save();

    // Фон бара
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.roundRect(x - 1, y - 1, w + 2, h + 2, 4); ctx.fill();

    // Заливка
    const fillH = h * value;
    const color = value > 0.6 ? '#00e664' : value > 0.3 ? '#ffcc00' : '#ff5533';
    const barGrad = ctx.createLinearGradient(x, y + h, x, y);
    barGrad.addColorStop(0, color + '44');
    barGrad.addColorStop(value, color + 'dd');
    barGrad.addColorStop(Math.min(1, value + 0.01), 'transparent');
    ctx.fillStyle = barGrad;
    ctx.beginPath(); ctx.roundRect(x + 1, y + h - fillH, w - 2, fillH, 2); ctx.fill();

    // Рамка
    ctx.strokeStyle = accent + '40';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.stroke();

    // Метки деления
    for (let i = 1; i < 4; i++) {
        const ly = y + h * (1 - i * 0.25);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x + 2, ly); ctx.lineTo(x + w - 2, ly); ctx.stroke();
    }

    // % значение
    ctx.fillStyle = color;
    ctx.font = `bold 8px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(value * 100) + '%', x + w / 2, y - 4);

    // Метка
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `8px "JetBrains Mono", monospace`;
    ctx.fillText('T', x + w / 2, y + h + 13);

    ctx.restore();
}

function drawFrame(gp) {
    if (!ctx || !canvasElement) return;
    const W = canvasElement.width;
    clearCanvas();

    const type   = detectType(gp.id);
    const accent = type === 'dualshock' ? '#00aaff'
                 : type === 'xbox'      ? '#00e664'
                 : '#ffcc00';

    const lx = dz(gp.axes[0] ?? 0);
    const ly = -(dz(gp.axes[1] ?? 0));
    const rx = _controllerType === 'fpv' ? dz(gp.axes[0] ?? 0) : dz(gp.axes[2] ?? 0);
    const ry = _controllerType === 'fpv' ? -(dz(gp.axes[1] ?? 0)) : -(dz(gp.axes[3] ?? 0));

    drawStick(leftCenterX,  centerY, lx,  ly,  'L', accent);
    drawStick(rightCenterX, centerY, rx,  ry,  'R', accent);

    const tbW = 9, tbH = RADIUS * 2;
    drawThrottleBar(W / 2 - tbW / 2, centerY - RADIUS, tbW, tbH, gamepadState.throttle, accent);

    // Тип контроллера
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.font = `8px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(gamepadState.arcadeMode ? 'ARCADE' : type.toUpperCase(), W / 2, centerY - RADIUS - 6);
    ctx.restore();
}

// ── Главный loop ──────────────────────────────────────────────────────────────
function loop() {
    animFrame = requestAnimationFrame(loop);

    const pads = navigator.getGamepads();
    let gp = null;
    for (const pad of pads) {
        if (pad && pad.connected) { gp = pad; break; }
    }

    if (!gp) {
        if (gamepadState.connected) {
            gamepadState.connected = false;
            gamepadState.roll = gamepadState.pitch = gamepadState.yaw = 0;
            gamepadState.throttle = 0;
            _sRoll = _sPitch = _sYaw = _sThrottle = 0;
            if (infoElement) infoElement.textContent = 'Геймпад отключён.';
            clearCanvas();
        }
        return;
    }

    gamepadState.connected = true;
    gamepadState.id = gp.id;

    const norm = normalizeAxes(gp);
    gamepadState.roll     = norm.roll;
    gamepadState.pitch    = norm.pitch;
    gamepadState.yaw      = norm.yaw;
    gamepadState.throttle = norm.throttle;

    if (infoElement) {
        const type = detectType(gp.id);
        infoElement.textContent = `${type.toUpperCase()}${gamepadState.arcadeMode ? ' [ARCADE]' : ''}`;
    }

    drawFrame(gp);
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
    infoElement   = infoEl;
    canvasElement = canvasEl;
    if (!canvasElement) return;

    ctx = canvasElement.getContext('2d');
    leftCenterX  = PADDING + RADIUS;
    rightCenterX = canvasElement.width - PADDING - RADIUS;
    centerY      = canvasElement.height / 2 - 6;

    if (animFrame) cancelAnimationFrame(animFrame);
    loop();
}

export function destroyGamepadVisualizer() {
    if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
    }
}