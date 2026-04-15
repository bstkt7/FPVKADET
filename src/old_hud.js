import * as THREE from 'three';

let noiseTime = 0;

export function drawHUD(hudCanvas, hudCtx, hudFrame, engineConfig, droneState, gateObjects, nextGateIdx, modeScale) {
    if (!hudCanvas || !hudCtx) return;
    const W = hudCanvas.width, H = hudCanvas.height, cx = W / 2, cy = H / 2;
    hudCtx.clearRect(0, 0, W, H);

    const {
        cameraMode, velocity, position, throttle, rotation,
        altHoldTarget, health, battery, weather
    } = droneState;

    if (cameraMode === 'third') {
        const speed = Math.round(velocity.length() * 150), height = Math.round(position.y), thr = Math.round(throttle * 100);
        hudCtx.save(); hudCtx.globalAlpha = 0.75; hudCtx.fillStyle = 'rgba(0,0,0,0.5)';
        hudCtx.beginPath(); hudCtx.roundRect(10, 10, 150, 110, 4); hudCtx.fill();
        hudCtx.globalAlpha = 1; hudCtx.font = '13px monospace'; hudCtx.fillStyle = '#0af'; hudCtx.textAlign = 'left';
        hudCtx.fillText(`ALT  ${String(height).padStart(5)} m`, 18, 30);
        hudCtx.fillText(`SPD  ${String(speed).padStart(5)} m/s`, 18, 48);
        hudCtx.fillText(`THR  ${String(thr).padStart(5)} %`, 18, 66);
        hudCtx.fillStyle = '#ff6600'; hudCtx.fillText(`GATE ${String(nextGateIdx + 1).padStart(2)}/${gateObjects.length}`, 18, 84);
        hudCtx.fillStyle = health < 30 ? '#ff0000' : '#00ff88';
        hudCtx.fillText(`HLTH ${String(Math.round(health)).padStart(5)} %`, 18, 102);
        hudCtx.restore();

        if (gateObjects.length > 0) {
            const gp = gateObjects[nextGateIdx], dp = position;
            const angle = Math.atan2(gp.position.x - dp.x, gp.position.z - dp.z) - rotation.y + Math.PI;
            const dist = Math.round(dp.distanceTo(gp.position));
            hudCtx.save(); hudCtx.translate(W - 50, 50); hudCtx.rotate(angle);
            hudCtx.fillStyle = '#ff6600'; hudCtx.globalAlpha = 0.85;
            hudCtx.beginPath(); hudCtx.moveTo(0, -20); hudCtx.lineTo(10, 10); hudCtx.lineTo(0, 5); hudCtx.lineTo(-10, 10); hudCtx.closePath(); hudCtx.fill();
            hudCtx.restore();
            hudCtx.save(); hudCtx.fillStyle = '#ff6600'; hudCtx.font = 'bold 11px monospace'; hudCtx.textAlign = 'center';
            hudCtx.fillText(`${dist}m`, W - 50, 80); hudCtx.restore();
        }

        hudCtx.save(); hudCtx.globalAlpha = 0.85; hudCtx.fillStyle = 'rgba(0,0,0,0.5)';
        hudCtx.beginPath(); hudCtx.roundRect(W - 130, H - 38, 120, 28, 4); hudCtx.fill();
        hudCtx.globalAlpha = 1; hudCtx.fillStyle = '#0af'; hudCtx.font = 'bold 12px monospace'; hudCtx.textAlign = 'center';
        hudCtx.fillText('3RD PERSON  [TAB]', W - 70, H - 19); hudCtx.restore();

        const isAng3 = engineConfig.droneMode === 'angle', mc3 = isAng3 ? '#00aaff' : '#ff6600';
        hudCtx.save(); hudCtx.globalAlpha = 0.85; hudCtx.fillStyle = isAng3 ? 'rgba(0,80,180,0.3)' : 'rgba(180,60,0,0.3)';
        hudCtx.strokeStyle = mc3 + '88'; hudCtx.lineWidth = 1;
        hudCtx.beginPath(); hudCtx.roundRect(W - 130, H - 72, 120, 28, 4); hudCtx.fill(); hudCtx.stroke();
        hudCtx.globalAlpha = 1; hudCtx.fillStyle = mc3; hudCtx.font = 'bold 12px monospace'; hudCtx.textAlign = 'center';
        hudCtx.fillText(isAng3 ? (altHoldTarget !== null ? '✦ ANGLE  ALT' : '✦ ANGLE') : '⚡ ACRO', W - 70, H - 53);
        const weatherIcon = weather === 'rain' ? '🌧️' : weather === 'snow' ? '❄️' : '☀️';
        hudCtx.fillStyle = 'rgba(255,255,255,0.4)'; hudCtx.font = '10px monospace'; hudCtx.fillText(`${weatherIcon} ${weather.toUpperCase()}`, W - 70, H - 41);
        hudCtx.restore();

        if (health <= 0) {
            hudCtx.save();
            hudCtx.fillStyle = 'white';
            hudCtx.font = 'bold 36px sans-serif';
            hudCtx.textAlign = 'center';
            hudCtx.fillText('DRONE CRASHED', cx, cy - 20);
            hudCtx.font = '16px sans-serif';
            hudCtx.fillText('Press [R] to Restart', cx, cy + 20);
            hudCtx.restore();
        }

        return;
    }

    // FPV Mode
    noiseTime += 0.016;

    const dmg = Math.max(0, (40 - health) / 40); // 0..1

    // ── Хроматическая аберрация — градиенты по краям, без getImageData ───
    // Красный — левый край
    {
        const s = hudCtx.globalCompositeOperation;
        hudCtx.globalCompositeOperation = 'screen';

        const rg = hudCtx.createLinearGradient(0, 0, W * 0.38, 0);
        rg.addColorStop(0, `rgba(255,0,0,${0.13 + dmg * 0.15})`);
        rg.addColorStop(0.5, `rgba(255,0,0,${0.04 + dmg * 0.06})`);
        rg.addColorStop(1, 'rgba(255,0,0,0)');
        hudCtx.fillStyle = rg; hudCtx.fillRect(0, 0, W, H);

        // Синий — правый край
        const bg = hudCtx.createLinearGradient(W, 0, W * 0.62, 0);
        bg.addColorStop(0, `rgba(0,60,255,${0.13 + dmg * 0.15})`);
        bg.addColorStop(0.5, `rgba(0,60,255,${0.04 + dmg * 0.06})`);
        bg.addColorStop(1, 'rgba(0,60,255,0)');
        hudCtx.fillStyle = bg; hudCtx.fillRect(0, 0, W, H);

        // Зелёный — верхний/нижний (слабо)
        const gg = hudCtx.createLinearGradient(0, 0, 0, H * 0.25);
        gg.addColorStop(0, `rgba(0,255,80,${0.06 + dmg * 0.08})`);
        gg.addColorStop(1, 'rgba(0,255,80,0)');
        hudCtx.fillStyle = gg; hudCtx.fillRect(0, 0, W, H);

        hudCtx.globalCompositeOperation = s;
    }

    // ── Виньетка — основная + 4 угла ─────────────────────────────────────
    {
        const vg = hudCtx.createRadialGradient(cx, cy, H * 0.18, cx, cy, H * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(0.55, 'rgba(0,0,0,0.05)');
        vg.addColorStop(1, 'rgba(0,0,0,0.70)');
        hudCtx.fillStyle = vg; hudCtx.fillRect(0, 0, W, H);

        // Угловые затемнения
        [[0, 0], [W, 0], [0, H], [W, H]].forEach(([ox, oy]) => {
            const cg = hudCtx.createRadialGradient(ox, oy, 0, ox, oy, H * 0.52);
            cg.addColorStop(0, `rgba(0,0,0,${0.38 + dmg * 0.15})`);
            cg.addColorStop(0.4, 'rgba(0,0,0,0.05)');
            cg.addColorStop(1, 'rgba(0,0,0,0)');
            hudCtx.fillStyle = cg; hudCtx.fillRect(0, 0, W, H);
        });

        // Красная виньетка при уроне
        if (dmg > 0) {
            const rv = hudCtx.createRadialGradient(cx, cy, H * 0.22, cx, cy, H * 0.72);
            rv.addColorStop(0, 'rgba(160,0,0,0)');
            rv.addColorStop(1, `rgba(160,0,0,${dmg * 0.38})`);
            hudCtx.fillStyle = rv; hudCtx.fillRect(0, 0, W, H);
        }
    }

    // ── Зерно — редкие пиксели, только каждые 3 кадра ────────────────────
    if (hudFrame % 3 === 0) {
        hudCtx.save();
        const cnt = 80 + dmg * 180;
        for (let i = 0; i < cnt; i++) {
            const v = Math.random() > 0.5 ? 200 : 20;
            hudCtx.globalAlpha = 0.035 + Math.random() * 0.05 + dmg * 0.07;
            hudCtx.fillStyle = `rgb(${v},${v},${v})`;
            hudCtx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random(), 1 + Math.random());
        }
        hudCtx.restore();
    }

    // ── Горизонтальный глитч — тонкая полоска fillRect, без getImageData ─
    if (Math.random() < 0.012 + dmg * 0.05) {
        hudCtx.save();
        const gy = Math.random() * H;
        const gh = 1 + Math.floor(Math.random() * (dmg > 0.3 ? 5 : 2));
        // Имитируем сдвиг: рисуем полупрозрачный блок другого цвета
        hudCtx.globalAlpha = 0.18 + Math.random() * 0.25;
        hudCtx.globalCompositeOperation = 'screen';
        hudCtx.fillStyle = dmg > 0.3
            ? `rgb(${Math.floor(Math.random() * 255)},${Math.floor(Math.random() * 255)},${Math.floor(Math.random() * 255)})`
            : 'rgba(200,220,255,1)';
        hudCtx.fillRect(0, gy, W * (0.3 + Math.random() * 0.7), gh);
        hudCtx.restore();
    }

    // Компас
    {
        const normYaw = ((THREE.MathUtils.radToDeg(-rotation.y) % 360) + 360) % 360;
        const cW = 320, cH = 36, cX = cx - 160, cY = 14, degsPerPx = 90 / (cW / 2);
        hudCtx.save(); hudCtx.globalAlpha = 0.55; hudCtx.fillStyle = 'rgba(0,0,0,0.7)';
        hudCtx.beginPath(); hudCtx.roundRect(cX, cY, cW, cH, 4); hudCtx.fill(); hudCtx.restore();
        hudCtx.save(); hudCtx.beginPath(); hudCtx.roundRect(cX + 1, cY + 1, cW - 2, cH - 2, 3); hudCtx.clip();
        const cardinals = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        for (let d = -180; d <= 180 + 45; d += 45) {
            const absDeg = ((normYaw + d) % 360 + 360) % 360, px = cx + d / degsPerPx;
            if (px < cX - 20 || px > cX + cW + 20) continue;
            const isMain = absDeg % 90 === 0;
            hudCtx.save(); hudCtx.strokeStyle = isMain ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
            hudCtx.lineWidth = isMain ? 1.5 : 0.8; hudCtx.beginPath(); hudCtx.moveTo(px, cY + cH - (isMain ? 14 : 8)); hudCtx.lineTo(px, cY + cH - 1); hudCtx.stroke(); hudCtx.restore();
            hudCtx.save(); hudCtx.fillStyle = isMain ? '#fff' : 'rgba(200,255,180,0.75)';
            hudCtx.font = isMain ? 'bold 12px monospace' : '10px monospace'; hudCtx.textAlign = 'center';
            hudCtx.fillText(cardinals[Math.round(absDeg / 45) % 8], px, cY + 14); hudCtx.restore();
        }
        hudCtx.restore();
        hudCtx.save(); hudCtx.strokeStyle = 'rgba(100,255,100,0.4)'; hudCtx.lineWidth = 1;
        hudCtx.beginPath(); hudCtx.roundRect(cX, cY, cW, cH, 4); hudCtx.stroke(); hudCtx.restore();
        hudCtx.save(); hudCtx.fillStyle = '#0f0'; hudCtx.globalAlpha = 0.9;
        hudCtx.beginPath(); hudCtx.moveTo(cx - 5, cY - 1); hudCtx.lineTo(cx + 5, cY - 1); hudCtx.lineTo(cx, cY + 7); hudCtx.closePath(); hudCtx.fill(); hudCtx.restore();
        hudCtx.save(); hudCtx.fillStyle = '#0f0'; hudCtx.font = 'bold 11px monospace'; hudCtx.textAlign = 'center';
        hudCtx.fillText(Math.round(normYaw) + '°', cx, cY + cH - 2); hudCtx.restore();
    }

    hudCtx.save(); hudCtx.translate(cx, cy - 160); hudCtx.rotate(rotation.z);
    hudCtx.strokeStyle = "rgba(180,255,180,0.7)"; hudCtx.setLineDash([6, 5]); hudCtx.lineWidth = 1.5;
    const pitch = THREE.MathUtils.radToDeg(rotation.x);
    hudCtx.beginPath(); hudCtx.moveTo(-140, pitch); hudCtx.lineTo(-30, pitch); hudCtx.moveTo(30, pitch); hudCtx.lineTo(140, pitch);
    hudCtx.stroke(); hudCtx.restore();

    hudCtx.save(); hudCtx.setLineDash([]); hudCtx.strokeStyle = "rgba(180,255,180,0.85)"; hudCtx.lineWidth = 1.5;
    hudCtx.beginPath(); hudCtx.moveTo(cx - 30, cy); hudCtx.lineTo(cx - 8, cy); hudCtx.moveTo(cx + 8, cy); hudCtx.lineTo(cx + 30, cy);
    hudCtx.moveTo(cx, cy + 8); hudCtx.lineTo(cx, cy + 18); hudCtx.stroke();
    hudCtx.beginPath(); hudCtx.arc(cx, cy, 3, 0, Math.PI * 2); hudCtx.strokeStyle = '#0f0'; hudCtx.stroke(); hudCtx.restore();

    hudCtx.save(); hudCtx.strokeStyle = "rgba(180,255,180,0.3)"; hudCtx.setLineDash([4, 6]); hudCtx.lineWidth = 1;
    hudCtx.beginPath(); hudCtx.moveTo(cx - 200, cy - 60); hudCtx.lineTo(cx - 200, cy + 120); hudCtx.moveTo(cx + 200, cy - 60); hudCtx.lineTo(cx + 200, cy + 120);
    hudCtx.stroke(); hudCtx.restore();

    hudCtx.save(); hudCtx.setLineDash([]);
    const speed = Math.round(velocity.length() * 150), height = Math.round(position.y), thr = Math.round(throttle * 100);
    hudCtx.globalAlpha = 0.6; hudCtx.fillStyle = 'rgba(0,0,0,0.5)';
    hudCtx.beginPath(); hudCtx.roundRect(10, 56, 150, 110, 4); hudCtx.fill();
    hudCtx.globalAlpha = 1; hudCtx.font = '13px monospace'; hudCtx.fillStyle = '#0f0'; hudCtx.textAlign = 'left';
    hudCtx.fillText(`ALT  ${String(height).padStart(5)} m`, 18, 76);
    hudCtx.fillText(`SPD  ${String(speed).padStart(5)} m/s`, 18, 94);
    hudCtx.fillText(`THR  ${String(thr).padStart(5)} %`, 18, 112);
    hudCtx.fillText(`GATE ${String(nextGateIdx + 1).padStart(2)}/${gateObjects.length}`, 18, 130);
    hudCtx.fillStyle = health < 30 ? '#ff0000' : '#0f0';
    hudCtx.fillText(`HLTH ${String(Math.round(health)).padStart(5)} %`, 18, 148);
    hudCtx.restore();

    hudCtx.save();
    hudCtx.fillStyle = '#0f0'; hudCtx.font = 'bold 11px monospace'; hudCtx.textAlign = 'left';
    hudCtx.fillText(`MAP: ${(engineConfig.map || 'hangar').toUpperCase()}`, 18, 42);
    const weatherIcon = weather === 'rain' ? 'RAIN' : weather === 'snow' ? 'SNOW' : 'CLEAR';
    hudCtx.fillText(`ENV: ${weatherIcon}`, 18, 56);
    hudCtx.restore();

    hudCtx.save();
    const batX = W - 80, batY = 20, batW = 52, batH = 18;
    hudCtx.strokeStyle = 'rgba(180,255,180,0.6)'; hudCtx.lineWidth = 1; hudCtx.strokeRect(batX, batY, batW, batH);
    hudCtx.fillStyle = 'rgba(180,255,180,0.6)'; hudCtx.fillRect(batX + batW, batY + 5, 3, 8);
    hudCtx.fillStyle = battery < 20 ? 'rgba(255,80,0,0.7)' : 'rgba(0,255,80,0.7)';
    hudCtx.fillRect(batX + 2, batY + 2, (batW - 4) * (battery / 100), batH - 4);
    hudCtx.fillStyle = 'rgba(180,255,180,0.8)'; hudCtx.font = '10px monospace'; hudCtx.textAlign = 'center';
    const volts = (14.8 + (battery / 100) * 1.8).toFixed(1);
    hudCtx.fillText(`${volts}V`, batX + batW / 2, batY + 12); hudCtx.restore();

    const tbX = W - 22, tbH = 130, tbY = cy - tbH / 2;
    hudCtx.save(); hudCtx.globalAlpha = 0.55; hudCtx.fillStyle = 'rgba(0,0,0,0.5)'; hudCtx.fillRect(tbX - 2, tbY - 2, 12, tbH + 4);
    hudCtx.globalAlpha = 1; hudCtx.strokeStyle = 'rgba(180,255,180,0.4)'; hudCtx.lineWidth = 1; hudCtx.strokeRect(tbX, tbY, 8, tbH);
    hudCtx.fillStyle = throttle > 0.5 ? '#0f0' : '#ffee00'; hudCtx.globalAlpha = 0.8;
    hudCtx.fillRect(tbX, tbY + tbH * (1 - throttle), 8, tbH * throttle);
    hudCtx.globalAlpha = 1; hudCtx.fillStyle = 'rgba(180,255,180,0.6)'; hudCtx.font = '9px monospace'; hudCtx.textAlign = 'center';
    hudCtx.fillText('T', tbX + 4, tbY - 5); hudCtx.restore();

    if (gateObjects.length > 0) {
        const gp = gateObjects[nextGateIdx], dp = position;
        const angle = Math.atan2(gp.position.x - dp.x, gp.position.z - dp.z) - rotation.y + Math.PI;
        const dist = Math.round(dp.distanceTo(gp.position));
        const arX = W - 50, arY = H - 80;
        hudCtx.save(); hudCtx.globalAlpha = 0.7; hudCtx.fillStyle = 'rgba(0,0,0,0.4)';
        hudCtx.beginPath(); hudCtx.arc(arX, arY, 24, 0, Math.PI * 2); hudCtx.fill();
        hudCtx.translate(arX, arY); hudCtx.rotate(angle); hudCtx.fillStyle = '#ff6600';
        hudCtx.beginPath(); hudCtx.moveTo(0, -16); hudCtx.lineTo(8, 8); hudCtx.lineTo(0, 4); hudCtx.lineTo(-8, 8); hudCtx.closePath(); hudCtx.fill();
        hudCtx.restore();
        hudCtx.save(); hudCtx.fillStyle = '#ff6600'; hudCtx.font = 'bold 10px monospace'; hudCtx.textAlign = 'center';
        hudCtx.fillText(`${dist}m`, W - 50, H - 48); hudCtx.restore();
    }

    hudCtx.save(); hudCtx.globalAlpha = 0.85; hudCtx.fillStyle = 'rgba(0,0,0,0.5)';
    hudCtx.beginPath(); hudCtx.roundRect(W - 130, H - 38, 120, 28, 4); hudCtx.fill();
    hudCtx.globalAlpha = 1; hudCtx.fillStyle = '#0f0'; hudCtx.font = 'bold 12px monospace'; hudCtx.textAlign = 'center';
    hudCtx.fillText('FPV  [TAB]', W - 70, H - 19); hudCtx.restore();

    const isAng = engineConfig.droneMode === 'angle', mc = isAng ? '#00aaff' : '#ff6600';
    const ml = isAng ? (altHoldTarget !== null ? '✦ ANGLE  ALT' : '✦ ANGLE') : '⚡ ACRO';
    hudCtx.save(); hudCtx.globalAlpha = 0.92; hudCtx.fillStyle = isAng ? 'rgba(0,100,200,0.25)' : 'rgba(200,80,0,0.25)';
    hudCtx.strokeStyle = mc + '88'; hudCtx.lineWidth = 1;
    hudCtx.beginPath(); hudCtx.roundRect(W - 130, H - 72, 120, 28, 4); hudCtx.fill(); hudCtx.stroke();
    hudCtx.globalAlpha = 1; hudCtx.fillStyle = mc; hudCtx.font = 'bold 12px monospace'; hudCtx.textAlign = 'center';
    hudCtx.fillText(ml, W - 70, H - 53); hudCtx.restore();
    hudCtx.save(); hudCtx.fillStyle = 'rgba(255,255,255,0.2)'; hudCtx.font = '9px monospace'; hudCtx.textAlign = 'center';
    hudCtx.fillText('[M] switch', W - 70, H - 41); hudCtx.restore();

    if (health <= 0 || droneState.turtleMode) {
        hudCtx.save();
        hudCtx.fillStyle = 'rgba(255, 0, 0, 0.4)';
        hudCtx.fillRect(0, 0, W, H);
        hudCtx.fillStyle = 'white';
        hudCtx.font = 'bold 36px monospace';
        hudCtx.textAlign = 'center';
        hudCtx.fillText(health <= 0 ? 'DRONE CRASHED' : 'TURTLE MODE READY', cx, cy - 20);
        hudCtx.font = '16px monospace';
        if (health <= 0) {
            hudCtx.fillText('Press [R] to Restart', cx, cy + 20);
        } else {
            hudCtx.fillText('Use pitch/roll to flip over', cx, cy + 20);
        }
        hudCtx.restore();
    }
}