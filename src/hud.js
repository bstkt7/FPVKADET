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

function calcRelativeAngle(droneRotY, dx, dz) {
    const fX = -Math.sin(droneRotY);
    const fZ = -Math.cos(droneRotY);
    const cross = fX * dz - fZ * dx;
    const dot = fX * dx + fZ * dz;
    return Math.atan2(cross, dot);
}

function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

// ─────────────────────────────────────────────────────────────────────────────
// Элементы интерфейса
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

// ── НОВОЕ: Таймер слева под телеметрией ─────────────────────────────────────
function drawTimerLeft(ctx, x, y, raceTimer) {
    if (!raceTimer) return;
    const hasStarted = raceTimer.running || raceTimer.lapCount > 0;
    const timeMs = raceTimer.running ? raceTimer.elapsed : (raceTimer.lapTime || 0);

    const color = hasStarted ? '#ffee00' : 'rgba(255,255,255,0.2)';
    const status = hasStarted ? 'ВРЕМЯ КРУГА' : 'ОЖИДАНИЕ СТАРТА';

    ctx.save();

    // Иконка и статус
    ctx.fillStyle = color + 'cc';
    ctx.font = `10px "JetBrains Mono", monospace`;
    ctx.fillText('⏱', x, y);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `bold 8px "JetBrains Mono", monospace`;
    ctx.fillText(status, x + 16, y - 2);

    // Само время текущего круга (крупно)
    ctx.shadowColor = color;
    ctx.shadowBlur = hasStarted ? 8 : 0;
    ctx.fillStyle = color;
    ctx.font = `bold 22px "JetBrains Mono", monospace`;
    ctx.fillText(formatTime(timeMs), x + 14, y + 20);

    ctx.shadowBlur = 0;

    // История (прошлый круг и разница)
    if (raceTimer.lapHistory && raceTimer.lapHistory.length > 0) {
        const lastLap = raceTimer.lapHistory[raceTimer.lapHistory.length - 1];
        
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `bold 10px "JetBrains Mono", monospace`;
        ctx.fillText(`ПРОШЛЫЙ: ${formatTime(lastLap.time)}`, x + 14, y + 36);
        
        if (lastLap.delta !== null) {
            const isFaster = lastLap.delta < 0;
            ctx.fillStyle = isFaster ? '#00e664' : '#ff4444';
            const sign = isFaster ? '-' : '+';
            ctx.fillText(`${sign}${formatTime(Math.abs(lastLap.delta))}`, x + 14, y + 48);
        } else {
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(`БАЗОВОЕ ВРЕМЯ`, x + 14, y + 48);
        }
    }

    ctx.restore();
}

// ── НОВОЕ: Красивый минималистичный компас ──────────────────────────────────
function drawMinimalCompass(ctx, cx, cyTop, normYaw, droneState, gateObjects, nextGateIdx) {
    const cW = 400;
    const cH = 30;
    const cX = cx - cW / 2;
    const degsPerPx = 90 / (cW / 2.5);
    const cardinals = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];

    ctx.save();
    ctx.beginPath();
    ctx.rect(cX, cyTop, cW, cH + 20);
    ctx.clip();
    ctx.textBaseline = 'top';

    // ── Итерируемся по ФИКСИРОВАННЫМ градусам (0,15,30…345) ──────────────────
    // и считаем смещение от текущего курса. Так absDeg всегда целый → % 45 надёжен.
    for (let tickDeg = 0; tickDeg < 360; tickDeg += 15) {
        // разница в градусах относительно текущего курса, нормализованная к -180..180
        let diff = tickDeg - normYaw;
        diff = ((diff + 180) % 360 + 360) % 360 - 180;

        const px = cx + diff / degsPerPx;
        if (px < cX || px > cX + cW) continue;

        const isMain = tickDeg % 90 === 0;
        const isSub = tickDeg % 45 === 0;

        const distFromCenter = Math.abs(px - cx);
        const alpha = Math.max(0, 1 - distFromCenter / (cW / 2));

        // Засечки
        ctx.beginPath();
        ctx.moveTo(px, cyTop + 15);
        ctx.lineTo(px, cyTop + 15 - (isMain ? 10 : isSub ? 7 : 4));
        ctx.strokeStyle = `rgba(255,255,255,${(isMain ? 0.9 : isSub ? 0.5 : 0.2) * alpha})`;
        ctx.lineWidth = isMain ? 1.5 : 1;
        ctx.stroke();

        // Буквы
        if (isMain || isSub) {
            ctx.fillStyle = `rgba(255,255,255,${(isMain ? 1.0 : 0.6) * alpha})`;
            ctx.font = isMain
                ? 'bold 12px "JetBrains Mono", monospace'
                : '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText(cardinals[tickDeg / 45], px, cyTop + 18);
        }
    }

    // ── Маркеры колец на компасе ──────────────────────────────────────────────
    if (gateObjects?.length > 0 && droneState) {
        const dp = droneState.position;
        const gatesToShow = [
            { idx: nextGateIdx, alpha: 1.0, size: 3 },
            { idx: (nextGateIdx + 1) % gateObjects.length, alpha: 0.4, size: 1.5 },
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
                const colorHex = gp.baseColor ? '#' + gp.baseColor.toString(16).padStart(6, '0') : '#00e664';
                const distAlpha = Math.max(0, 1 - Math.abs(px - cx) / (cW / 2));
                ctx.fillStyle = colorHex;
                ctx.globalAlpha = gInfo.alpha * distAlpha;
                ctx.beginPath();
                ctx.arc(px, cyTop - 2, gInfo.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
        });
    }

    ctx.restore();

    // Статичный центральный треугольник
    ctx.save();
    ctx.fillStyle = 'rgba(0,230,100,0.9)';
    ctx.beginPath();
    ctx.moveTo(cx, cyTop - 2);
    ctx.lineTo(cx - 4, cyTop + 4);
    ctx.lineTo(cx + 4, cyTop + 4);
    ctx.fill();
    ctx.restore();
}

// ── НОВОЕ: Элегантный указатель следующего кольца ───────────────────────────
function drawSleekGatePointer(ctx, cx, cy, relAngle, dist, gateColor, gateIdx, totalGates) {
    const col = gateColor || '#00e664';

    ctx.save();
    ctx.translate(cx, cy);

    // Центральный текст (Дистанция)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${dist}m`, 0, 0);

    // Маленький текст над дистанцией (Номер кольца)
    ctx.fillStyle = col;
    ctx.font = '7px "JetBrains Mono", monospace';
    ctx.fillText(`GATE ${gateIdx + 1}`, 0, -12);

    // Вращающаяся стрелка (Шеврон) по орбите
    const orbitRadius = 24;
    ctx.rotate(relAngle);

    ctx.shadowColor = col;
    ctx.shadowBlur = 8;
    ctx.fillStyle = col;

    // Рисуем стилизованный шеврон
    ctx.beginPath();
    ctx.moveTo(0, -orbitRadius - 6);  // Острие (смотрит "вверх" относительно вращения)
    ctx.lineTo(5, -orbitRadius + 2);  // Правое крыло
    ctx.lineTo(0, -orbitRadius - 1);  // Внутренний вырез
    ctx.lineTo(-5, -orbitRadius + 2); // Левое крыло
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawAttitudeHUD(ctx, cx, cy, rotation, velocity) {
    ctx.save();

    const fovScale = 4.5;
    const clipSize = 350;
    const colorLine = 'rgba(255, 255, 255, 0.65)';
    const colorText = 'rgba(255, 255, 255, 0.8)';
    const colorDir = 'rgba(0, 230, 100, 0.9)';

    const pitch = rotation.x;
    const roll = rotation.z;
    const yaw = rotation.y;

    ctx.beginPath();
    ctx.rect(cx - clipSize / 2, cy - clipSize / 2, clipSize, clipSize);
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.rotate(roll);

    const pitchDeg = THREE.MathUtils.radToDeg(pitch);
    ctx.translate(0, pitchDeg * fovScale);

    ctx.lineWidth = 0.8;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = -80; i <= 80; i += 10) {
        if (i === 0) continue;

        const yOffset = -i * fovScale;
        const width = (i % 20 === 0) ? 60 : 30;
        const tickDir = i > 0 ? 4 : -4;

        ctx.beginPath();
        if (i < 0) {
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = 'rgba(255, 100, 50, 0.5)';
        } else {
            ctx.setLineDash([]);
            ctx.strokeStyle = colorLine;
        }

        ctx.moveTo(-width / 2, yOffset);
        ctx.lineTo(width / 2, yOffset);

        ctx.moveTo(-width / 2, yOffset); ctx.lineTo(-width / 2, yOffset + tickDir);
        ctx.moveTo(width / 2, yOffset); ctx.lineTo(width / 2, yOffset + tickDir);
        ctx.stroke();

        if (i % 20 === 0) {
            ctx.setLineDash([]);
            ctx.fillStyle = i < 0 ? 'rgba(255, 150, 100, 0.7)' : colorText;
            ctx.fillText(Math.abs(i), -width / 2 - 12, yOffset);
            ctx.fillText(Math.abs(i), width / 2 + 12, yOffset);
        }
    }

    ctx.setLineDash([]);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = colorLine;
    ctx.beginPath();
    ctx.moveTo(-120, 0); ctx.lineTo(-30, 0);
    ctx.moveTo(30, 0); ctx.lineTo(120, 0);
    ctx.stroke();

    ctx.restore();
    ctx.save();

    const speedTotal = velocity.length();

    if (speedTotal > 2.0) {
        const flightYaw = Math.atan2(velocity.x, velocity.z);
        let slipYaw = normalizeAngle(yaw - flightYaw + Math.PI);

        const flightPitch = Math.atan2(velocity.y, Math.hypot(velocity.x, velocity.z));
        let slipPitch = normalizeAngle(pitch + flightPitch);

        const targetDirX = -slipYaw * fovScale * 50;
        const targetDirY = slipPitch * fovScale * 50;

        const dirX = smoothVal('dirX', targetDirX, 0.15);
        const dirY = smoothVal('dirY', targetDirY, 0.15);

        const clampLimit = 120;
        const drawX = cx + Math.max(-clampLimit, Math.min(clampLimit, dirX));
        const drawY = cy + Math.max(-clampLimit, Math.min(clampLimit, dirY));

        ctx.translate(drawX, drawY);
        ctx.rotate(-roll);

        ctx.strokeStyle = colorDir;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.moveTo(-15, 0); ctx.lineTo(-5, 0);
        ctx.moveTo(15, 0); ctx.lineTo(5, 0);
        ctx.moveTo(0, -15); ctx.lineTo(0, -5);
        ctx.stroke();
    }

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
    ctx.strokeStyle = 'rgba(180,255,180,0.6)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 15, cy);
    ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 15);
    ctx.stroke();

    ctx.beginPath(); ctx.arc(cx, cy, 1, 0, Math.PI * 2);
    ctx.fillStyle = '#00e664'; ctx.fill();
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
        raceTimer, altHoldTarget, fps,
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

    // Таймер теперь слева, под телеметрией
    drawTimerLeft(ctx, tx, ty + gap * 5 + 16, raceTimer);
    ctx.restore();

    // ── Авиагоризонт (в центре экрана) ────────────────────────────────────────
    if (!isCrashed) {
        drawAttitudeHUD(ctx, cx, cy, rotation, velocity);
    }

    // ── Компас (верх-центр) ───────────────────────────────────────────────────
    const normYaw = ((THREE.MathUtils.radToDeg(rotation.y) % 360) + 360) % 360;
    drawMinimalCompass(ctx, cx, 15, normYaw, droneState, gateObjects, nextGateIdx);

    // ── Указатель на следующее кольцо (под компасом) ──────────────────────────
    if (gateObjects.length > 0) {
        const gp = gateObjects[nextGateIdx], dp = position;
        const dx = gp.position.x - dp.x;
        const dz = gp.position.z - dp.z;

        const relativeAngle = calcRelativeAngle(rotation.y, dx, dz);
        const dist = Math.round(dp.distanceTo(gp.position));
        const gc = gp.baseColor ? '#' + gp.baseColor.toString(16).padStart(6, '0') : '#00e664';

        // Рисуем стильный индикатор прямо под компасом (y = 75)
        drawSleekGatePointer(ctx, cx, 75, relativeAngle, dist, gc, nextGateIdx, gateObjects.length);
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

    // ── FPS (правый верхний угол) ───────────────────────────────────────────
    if (typeof fps === 'number') {
        const fpsVal = Math.round(fps);
        const fpsColor = fpsVal >= 55 ? '#00e664' : fpsVal >= 35 ? '#ffcc00' : '#ff4444';
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.beginPath();
        ctx.roundRect(W - 98, 10, 66, 22, 4);
        ctx.fill();
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = fpsColor;
        ctx.fillText(`${fpsVal} FPS`, W - 40, 25);
        ctx.restore();
    }

    // ── Краш ─────────────────────────────────────────────────────────────────
    if (isCrashed && !turtleMode) {
        ctx.save();
        ctx.fillStyle = 'rgba(200,0,0,0.25)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#ff4'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
        ctx.fillText('СИСТЕМНЫЙ СБОЙ', cx, cy - 20);
        ctx.font = '14px monospace'; ctx.fillStyle = '#fff';
        ctx.fillText('НАЖМИТЕ [R] ДЛЯ ВОССТАНОВЛЕНИЯ', cx, cy + 10);
        ctx.restore();
    }
}