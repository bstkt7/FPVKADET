import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Утилиты
// ─────────────────────────────────────────────────────────────────────────────
function formatTime(ms) {
    if (!ms || ms < 0) return '00:00.00';
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m > 0 ? m + ':' : ''}${String(s).padStart(m > 0 ? 2 : 1, '0')}.${String(cs).padStart(2, '0')}`;
}

const _smooth = {};
function smoothVal(key, target, alpha = 0.12) {
    if (_smooth[key] === undefined) _smooth[key] = target;
    _smooth[key] += (target - _smooth[key]) * alpha;
    return _smooth[key];
}

// ─────────────────────────────────────────────────────────────────────────────
// Правильный расчёт относительного угла к цели
// Three.js: rotation.y = θ → локальная ось -Z дрона в мире = (-sinθ, 0, -cosθ)
// Возвращает угол в радианах: > 0 = цель правее (поворот по часовой), < 0 = левее
// ─────────────────────────────────────────────────────────────────────────────
function calcRelativeAngle(droneRotY, dx, dz) {
    const fX = -Math.sin(droneRotY);  // компонент X вектора "вперёд" дрона в мире
    const fZ = -Math.cos(droneRotY);  // компонент Z
    const cross = fX * dz - fZ * dx; // > 0 → цель правее
    const dot = fX * dx + fZ * dz; // > 0 → цель впереди
    return Math.atan2(cross, dot);
}

// ─────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции рисования HUD
// ─────────────────────────────────────────────────────────────────────────────

function drawTelRow(ctx, x, y, icon, label, rawValue, maxValue, displayText, color, barW = 150) {
    const ROW_H = 22, barH = 3;
    const ratio = Math.min(1, Math.max(0, rawValue / maxValue));

    ctx.fillStyle = color + 'cc';
    ctx.font = `10px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(icon, x, y + 11);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `bold 8px "JetBrains Mono", monospace`;
    ctx.fillText(label, x + 16, y + 7);

    ctx.fillStyle = color;
    ctx.font = `bold 11px "JetBrains Mono", monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(displayText, x + barW, y + 12);
    ctx.textAlign = 'left';

    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(x + 16, y + ROW_H - barH - 2, barW - 16, barH, 2); ctx.fill();

    if (ratio > 0) {
        const barGrad = ctx.createLinearGradient(x + 16, 0, x + 16 + (barW - 16) * ratio, 0);
        barGrad.addColorStop(0, color + '55');
        barGrad.addColorStop(1, color + 'dd');
        ctx.fillStyle = barGrad;
        ctx.beginPath(); ctx.roundRect(x + 16, y + ROW_H - barH - 2, (barW - 16) * ratio, barH, 2); ctx.fill();
    }
}

function drawCompassCenter(ctx, cx, cyTop, normYaw, droneState, gateObjects, nextGateIdx) {
    const cW = 320, cH = 32, cX = cx - cW / 2, cY = cyTop;
    const degsPerPx = 90 / (cW / 2);
    const cardinals = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

    ctx.save();
    const bgGrad = ctx.createLinearGradient(cX, 0, cX + cW, 0);
    bgGrad.addColorStop(0, 'rgba(0,0,0,0)');
    bgGrad.addColorStop(0.12, 'rgba(0,0,0,0.65)');
    bgGrad.addColorStop(0.88, 'rgba(0,0,0,0.65)');
    bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bgGrad;
    ctx.beginPath(); ctx.roundRect(cX, cY, cW, cH, 6); ctx.fill();

    ctx.strokeStyle = 'rgba(0,230,100,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cX, cY, cW, cH, 6); ctx.stroke();

    ctx.beginPath(); ctx.roundRect(cX + 1, cY + 1, cW - 2, cH - 2, 5); ctx.clip();

    for (let d = -180; d <= 180; d += 15) {
        const absDeg = ((normYaw + d) % 360 + 360) % 360;
        const px = cx + d / degsPerPx;
        if (px < cX - 20 || px > cX + cW + 20) continue;

        const isMain = absDeg % 90 === 0;
        const isSub = absDeg % 45 === 0;
        const fade = Math.max(0, 1 - Math.abs(px - cx) / (cW * 0.45));

        ctx.globalAlpha = (isMain ? 0.95 : isSub ? 0.6 : 0.2) * fade;
        ctx.strokeStyle = isMain ? '#00e664' : '#ffffff';
        ctx.lineWidth = isMain ? 1.5 : 0.8;
        ctx.beginPath();
        ctx.moveTo(px, cY + cH - 2);
        ctx.lineTo(px, cY + cH - (isMain ? 12 : 8));
        ctx.stroke();

        if (isMain || isSub) {
            ctx.fillStyle = isMain ? '#00e664' : '#ffffff';
            ctx.font = isMain ? 'bold 11px monospace' : '9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(cardinals[Math.round(absDeg / 45) % 8], px, cY + 14);
        }
    }

    // Маркеры колец на компасе
    if (gateObjects?.length > 0 && droneState) {
        const dp = droneState.position;
        const gatesToShow = [
            { idx: nextGateIdx, alpha: 1.0, size: 4 },
            { idx: (nextGateIdx + 1) % gateObjects.length, alpha: 0.4, size: 2 },
        ];
        gatesToShow.forEach(gInfo => {
            if (gInfo.idx >= gateObjects.length) return;
            const gp = gateObjects[gInfo.idx];
            const angleToGateRad = Math.atan2(gp.position.x - dp.x, -(gp.position.z - dp.z));
            const angleToGateDeg = ((THREE.MathUtils.radToDeg(angleToGateRad) % 360) + 360) % 360;
            let diff = angleToGateDeg - normYaw;
            diff = ((diff + 180) % 360 + 360) % 360 - 180;
            const px = cx + diff / degsPerPx;
            if (px >= cX && px <= cX + cW) {
                const colorHex = gp.baseColor ? '#' + gp.baseColor.toString(16).padStart(6, '0') : '#ff8833';
                ctx.fillStyle = colorHex;
                ctx.globalAlpha = gInfo.alpha;
                ctx.beginPath();
                ctx.arc(px, cY + cH - 14, gInfo.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
    }

    ctx.restore();

    // Маркер центра компаса
    ctx.fillStyle = '#00e664';
    ctx.beginPath();
    ctx.moveTo(cx, cY + cH - 3);
    ctx.lineTo(cx - 5, cY + cH + 5);
    ctx.lineTo(cx + 5, cY + cH + 5);
    ctx.fill();
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(normYaw)}°`, cx, cY + cH + 14);
}

// ─────────────────────────────────────────────────────────────────────────────
// Стрелка к кольцу — переработана для наглядности
// relAngle > 0 → поворот ВПРАВО (по часовой)
// relAngle < 0 → поворот ВЛЕВО
// relAngle ≈ 0 → прямо
// ─────────────────────────────────────────────────────────────────────────────
function drawGateArrow(ctx, cx, cyTop, relAngle, dist, gateColor, gateIdx, totalGates) {
    const col = gateColor || '#ff8833';
    const bY = cyTop + 48;
    const bW = 200, bH = 64;
    const bX = cx - bW / 2;

    ctx.save();

    // Панель
    ctx.fillStyle = 'rgba(0,0,0,0.68)';
    ctx.strokeStyle = col + '50';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(bX, bY, bW, bH, 8); ctx.fill(); ctx.stroke();

    // ── Большой круг со стрелкой (левая часть) ──────────────────────────────
    const R = 26;
    const ax = bX + 42, ay = bY + bH / 2;

    // Фоновый круг
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(ax, ay, R, 0, Math.PI * 2); ctx.stroke();

    // Крест-прицел
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(ax - R, ay); ctx.lineTo(ax + R, ay);
    ctx.moveTo(ax, ay - R); ctx.lineTo(ax, ay + R);
    ctx.stroke();
    ctx.setLineDash([]);

    // Сама стрелка (вращается на relAngle)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(relAngle);
    ctx.shadowColor = col; ctx.shadowBlur = 12;
    ctx.fillStyle = col;
    // Тело стрелки
    ctx.beginPath();
    ctx.moveTo(0, -(R - 3));          // острие
    ctx.lineTo(8, 8);
    ctx.lineTo(2, 4);
    ctx.lineTo(2, R - 6);             // хвост правый
    ctx.lineTo(-2, R - 6);            // хвост левый
    ctx.lineTo(-2, 4);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // Центральный кружок
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = col + 'aa'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ax, ay, 4, 0, Math.PI * 2); ctx.stroke();

    // ── Текст (правая часть) ─────────────────────────────────────────────────
    const tx = bX + 80;

    // Бейдж «КОЛЬЦО N/M»
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.font = 'bold 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(totalGates > 0 ? `КОЛЬЦО ${gateIdx + 1}/${totalGates}` : 'СЛЕДУЮЩЕЕ КОЛЬЦО', tx, bY + 14);

    // Направление словом + иконка
    const absA = Math.abs(relAngle);
    let dirLabel, dirIcon;
    if (absA < 0.22) {                     // < ~13°
        dirLabel = 'ПРЯМО'; dirIcon = '↑';
    } else if (absA > Math.PI - 0.22) {    // > ~167°
        dirLabel = 'СЗАДИ'; dirIcon = '↓';
    } else if (relAngle > 0) {
        dirLabel = 'ВПРАВО'; dirIcon = '→';
    } else {
        dirLabel = 'ВЛЕВО'; dirIcon = '←';
    }

    ctx.fillStyle = col;
    ctx.font = `bold 18px "JetBrains Mono", monospace`;
    ctx.fillText(`${dirIcon} ${dirLabel}`, tx, bY + 36);

    // Дистанция
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(`${dist} м`, tx, bY + 54);

    // Угловая полоска (насколько надо повернуть — дуга вокруг круга)
    if (absA > 0.15 && absA < Math.PI - 0.15) {
        const arcStart = -Math.PI / 2;
        const arcEnd = arcStart + relAngle;
        ctx.strokeStyle = col + '70';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(ax, ay, R + 5, arcStart, arcEnd, relAngle < 0);
        ctx.stroke();
        ctx.lineCap = 'butt';
    }

    ctx.restore();
}

function drawTimerTop(ctx, cx, raceTimer, nextGateIdx) {
    if (!raceTimer) return;
    const hasStarted = nextGateIdx > 0 || raceTimer.finished;
    const timeMs = hasStarted ? (raceTimer.running ? raceTimer.elapsed : raceTimer.lapTime) : 0;
    const color = raceTimer.finished ? '#00ff88' : hasStarted ? '#ffee00' : 'rgba(255,255,255,0.2)';

    ctx.save();
    const tW = 180, tH = 36;
    const tx = cx - tW / 2, ty = 8;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(tx, ty, tW, tH, 8); ctx.fill();
    ctx.strokeStyle = color + '40'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(tx, ty, tW, tH, 8); ctx.stroke();

    ctx.shadowColor = color; ctx.shadowBlur = hasStarted ? 10 : 0;
    ctx.fillStyle = color;
    ctx.font = `bold 22px "JetBrains Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(formatTime(timeMs), cx, ty + 20);
    ctx.shadowBlur = 0;

    const status = raceTimer.finished ? 'КРУГ ЗАВЕРШЕН' : hasStarted ? 'ГОНКА НАЧАТА' : 'ОЖИДАНИЕ СТАРТА';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.fillText(status, cx, ty + 31);
    ctx.restore();
}

function drawBatteryBox(ctx, x, y, battery) {
    const color = battery < 20 ? '#ff4444' : battery < 50 ? '#ffcc00' : '#00e664';
    const batW = 72, batH = 18;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); ctx.roundRect(x - 4, y - 4, batW + 12, batH + 8, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(x, y, batW, batH, 3); ctx.fill();
    const fill = Math.max(0, (battery / 100) * (batW - 4));
    if (fill > 0) {
        const g = ctx.createLinearGradient(x + 2, 0, x + 2 + fill, 0);
        g.addColorStop(0, color + '55'); g.addColorStop(1, color + 'ee');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(x + 2, y + 2, fill, batH - 4, 2); ctx.fill();
    }
    ctx.strokeStyle = color + '80'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, batW, batH, 3); ctx.stroke();
    const volt = (14.8 + (battery / 100) * 1.8).toFixed(1);
    ctx.fillStyle = '#fff'; ctx.font = `bold 9px "JetBrains Mono", monospace`; ctx.textAlign = 'center';
    ctx.fillText(`${volt}V`, x + batW / 2, y + batH / 2 + 4);
    ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// СТАТИЧЕСКИЙ СЛОЙ
// ═════════════════════════════════════════════════════════════════════════════
export function drawHUDStatic(canvas, ctx, engineConfig, droneClassLabel) {
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(cx, cy, H * 0.18, cx, cy, H * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.55, 'rgba(0,0,0,0.05)');
    vg.addColorStop(1, 'rgba(0,0,0,0.70)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.strokeStyle = 'rgba(180,255,180,0.85)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 8, cy);
    ctx.moveTo(cx + 8, cy); ctx.lineTo(cx + 30, cy);
    ctx.moveTo(cx, cy + 8); ctx.lineTo(cx, cy + 18);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#00e664'; ctx.stroke();
    ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════════════
// ДИНАМИЧЕСКИЙ СЛОЙ
// ═════════════════════════════════════════════════════════════════════════════
export function drawHUDDynamic(canvas, ctx, frame, engineConfig, droneState, gateObjects, nextGateIdx) {
    if (!canvas || !ctx) return;
    const W = canvas.width, H = canvas.height, cx = W / 2, cy = H / 2;
    ctx.clearRect(0, 0, W, H);

    const {
        cameraMode, velocity, position, throttle, rotation,
        health, battery, turtleMode, isCrashed,
        raceTimer, altHoldTarget,
    } = droneState;

    if (cameraMode === 'third') {
        const speed = Math.round(velocity.length() * 3.6);
        const alt = Math.round(position.y);
        ctx.save();
        ctx.font = '13px monospace'; ctx.fillStyle = '#0af'; ctx.textAlign = 'left';
        ctx.fillText(`ALT  ${alt} m`, 18, 50);
        ctx.fillText(`SPD  ${speed} km/h`, 18, 68);
        ctx.fillStyle = health < 30 ? '#f44' : '#0f8';
        ctx.fillText(`HLTH ${Math.round(health)} %`, 18, 86);
        ctx.restore();
        return;
    }

    const speed = Math.round(velocity.length() * 3.6);
    const alt = Math.round(Math.max(0, position.y));
    const thr = Math.round((throttle || 0) * 100);
    const gStr = gateObjects.length > 0 ? `${nextGateIdx + 1}/${gateObjects.length}` : '--';
    const sAlt = smoothVal('alt', alt, 0.10);
    const sSpd = smoothVal('spd', speed, 0.10);
    const sThr = smoothVal('thr', thr, 0.15);
    const sHlth = smoothVal('hlth', health || 0, 0.08);

    // ── Телеметрия (лево-верх) ────────────────────────────────────────────────
    ctx.save();
    const tx = 14, ty = 14, gap = 24;
    drawTelRow(ctx, tx, ty + gap * 0, '▲', 'ВЫСОТА', sAlt, 150, `${alt}м`, '#38b6ff');
    drawTelRow(ctx, tx, ty + gap * 1, '⚡', 'СКОРОСТЬ', sSpd, 200, `${speed}км/ч`, '#38b6ff');
    drawTelRow(ctx, tx, ty + gap * 2, '◉', 'ГАЗ', sThr, 100, `${thr}%`, '#ffcc00');
    const gRatio = gateObjects.length > 0 ? (nextGateIdx + 1) / gateObjects.length : 0;
    drawTelRow(ctx, tx, ty + gap * 3, '◎', 'КОЛЬЦО', gRatio, 1, gStr, '#ff8833');
    const hCol = health < 30 ? '#ff4444' : health < 65 ? '#ffee00' : '#00e664';
    drawTelRow(ctx, tx, ty + gap * 4, '❤', 'СИСТЕМЫ', sHlth, 100, `${Math.round(health)}%`, hCol);
    ctx.restore();

    // ── Центральный блок (верх-центр) ─────────────────────────────────────────
    const normYaw = ((THREE.MathUtils.radToDeg(rotation.y) % 360) + 360) % 360;
    drawTimerTop(ctx, cx, raceTimer, nextGateIdx);
    drawCompassCenter(ctx, cx, 52, normYaw, droneState, gateObjects, nextGateIdx);

    if (gateObjects.length > 0) {
        const gp = gateObjects[nextGateIdx], dp = position;
        const dx = gp.position.x - dp.x;
        const dz = gp.position.z - dp.z;

        // ✅ Правильный расчёт: учитывает локальную ось -Z дрона в мировом пространстве
        const relativeAngle = calcRelativeAngle(rotation.y, dx, dz);

        const dist = Math.round(dp.distanceTo(gp.position));
        const gc = gp.baseColor ? '#' + gp.baseColor.toString(16).padStart(6, '0') : '#ff8833';
        drawGateArrow(ctx, cx, 52, relativeAngle, dist, gc, nextGateIdx, gateObjects.length);
    }

    // ── Режим полёта (право-низ) ──────────────────────────────────────────────
    {
        const mode = (engineConfig.droneMode || 'angle').toUpperCase();
        const mc = mode === 'ACRO' ? '#ff6600' : mode === 'SPORT' ? '#ffee00' : '#38b6ff';
        const label = altHoldTarget != null ? '✦ ANGLE+ALT'
            : mode === 'ACRO' ? '⚡ ACRO'
                : mode === 'ANGLE' ? '◈ ANGLE'
                    : `◈ ${mode}`;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath(); ctx.roundRect(W - 132, H - 32, 120, 22, 6); ctx.fill();
        ctx.strokeStyle = mc + '66'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.roundRect(W - 132, H - 32, 120, 22, 6); ctx.stroke();
        ctx.fillStyle = mc; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
        ctx.fillText(label, W - 72, H - 17);
        ctx.restore();
    }

    // ── Батарейка (лево-низ) ──────────────────────────────────────────────────
    drawBatteryBox(ctx, 12, H - 32, battery || 0);

    // ── Дроссель вертикальный (право-центр) ──────────────────────────────────
    {
        const tbX = W - 22, tbH = 130, tbY = cy - 65;
        const tc = (throttle || 0) > 0.5 ? '#00e664' : '#ffcc00';
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath(); ctx.roundRect(tbX - 2, tbY - 2, 12, tbH + 4, 3); ctx.fill();
        const fill = tbH * (throttle || 0);
        ctx.fillStyle = tc + 'cc';
        ctx.beginPath(); ctx.roundRect(tbX, tbY + tbH - fill, 8, fill, 2); ctx.fill();
        ctx.restore();
    }

    // ── Краш ─────────────────────────────────────────────────────────────────
    if (isCrashed && !turtleMode) {
        ctx.save();
        ctx.fillStyle = 'rgba(200,0,0,0.1)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff4'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
        ctx.fillText('СИСТЕМНЫЙ СБОЙ', cx, cy - 20);
        ctx.font = '14px monospace'; ctx.fillStyle = '#fff';
        ctx.fillText('НАЖМИТЕ [R] ДЛЯ ВОССТАНОВЛЕНИЯ', cx, cy + 10);
        ctx.restore();
    }
}