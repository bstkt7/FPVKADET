import * as THREE from 'three';

// ── State machine constants ───────────────────────────────────────────────────
const S = { FADE_IN: 0, ACTIVE: 1, COMPLETING: 2, FADE_OUT: 3 };
const FADE_SPEED = 5;    // alpha/s
const COMPLETE_HOLD = 0.55; // seconds to hold completion flash before fade-out

export class TutorialManager {
    constructor(scene, droneState, hudCanvas) {
        this.scene = scene;
        this.droneState = droneState;
        this.hudCanvas = hudCanvas;

        this.currentStep = 0;
        this.steps = this._buildSteps();
        this.state = S.FADE_IN;
        this.alpha = 0;
        this.stepElapsed = 0;   // seconds since this step became ACTIVE
        this.completingT = 0;   // seconds in COMPLETING state
        this.pulseT = 0;
        this.arrowPulseT = 0;
        this.active = true;
        this._raceManager = null;

        // Particle system for step-completion burst
        this.particles = [];
        this.flashAlpha = 0;

        // Key-press tracking for visualizer highlights
        this.pressedKeys = new Set();
        this._onKeyDown = e => {
            this.pressedKeys.add(e.code);
            if (e.code === 'Escape') this._skip();
        };
        this._onKeyUp = e => this.pressedKeys.delete(e.code);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('keyup', this._onKeyUp);

        // 3-D scene arrow pointing toward gate
        this._arrow3D = this._buildArrow3D();
    }

    // ── Step definitions ──────────────────────────────────────────────────────
    _buildSteps() {
        const d = this.droneState;
        return [
            {
                id: 'welcome',
                title: 'ДОБРО ПОЖАЛОВАТЬ',
                text: 'Симулятор FPV-дрона. Пройдите обучение, чтобы освоить базовые манёвры пилотирования.',
                timerOnly: true,
                duration: 4.5,
                showProgress: false,
            },
            {
                id: 'throttle',
                title: 'ГАЗ — ВЗЛЁТ',
                text: 'Удерживайте [W] или поднимите левый стик. Взлетите выше 3 метров.',
                keys: ['W'],
                stick: { side: 'L', x: 0, y: 1 },
                condition: () => d.position.y > 3,
                objective: () => `Высота: ${d.position.y.toFixed(1)} / 3.0 м`,
                progressTarget: () => Math.min(1, d.position.y / 3),
            },
            {
                id: 'hover',
                title: 'ВИСЕНИЕ',
                text: 'Регулируйте газ, чтобы оставаться на месте. Удержитесь 2 секунды.',
                keys: ['W', 'S'],
                stick: { side: 'L', x: 0, y: 0.1 },
                condition: () => d.position.y > 2 && d.position.y < 9 && d.velocity.length() < 2,
                duration: 2,
                objective: () => `Скорость: ${d.velocity.length().toFixed(1)} м/с (нужно < 2)`,
                progressTarget: () => d.velocity.length() < 2 ? 1 : 0,
            },
            {
                id: 'pitch',
                title: 'ТАНГАЖ — ВПЕРЁД/НАЗАД',
                text: 'Нажмите [↑] для полёта вперёд. Разгонитесь до 5 м/с.',
                keys: ['↑', '↓'],
                stick: { side: 'R', x: 0, y: -1 },
                condition: () => Math.abs(d.velocity.z) > 5,
                objective: () => `Скорость Z: ${Math.abs(d.velocity.z).toFixed(1)} / 5.0 м/с`,
                progressTarget: () => Math.min(1, Math.abs(d.velocity.z) / 5),
            },
            {
                id: 'roll',
                title: 'КРЕН — ВПРАВО/ВЛЕВО',
                text: 'Нажмите [←] или [→] для бокового движения. Разгонитесь до 5 м/с.',
                keys: ['←', '→'],
                stick: { side: 'R', x: 1, y: 0 },
                condition: () => Math.abs(d.velocity.x) > 5,
                objective: () => `Скорость X: ${Math.abs(d.velocity.x).toFixed(1)} / 5.0 м/с`,
                progressTarget: () => Math.min(1, Math.abs(d.velocity.x) / 5),
            },
            {
                id: 'yaw',
                title: 'РЫСКАНИЕ — ПОВОРОТ',
                text: 'Нажмите [A] или [D], чтобы повернуться вокруг вертикальной оси.',
                keys: ['A', 'D'],
                stick: { side: 'L', x: 1, y: 0 },
                condition: () => Math.abs(d.angularVelocity?.y ?? 0) > 0.5,
                duration: 1.8,
                objective: () => `Угловая скорость: ${Math.abs(d.angularVelocity?.y ?? 0).toFixed(2)}`,
                progressTarget: () => Math.min(1, Math.abs(d.angularVelocity?.y ?? 0) / 0.5),
            },
            {
                id: 'speed',
                title: 'СВОБОДНЫЙ ПОЛЁТ',
                text: 'Все оси одновременно! Разгонитесь до 10 м/с.',
                keys: ['W', '↑', 'A'],
                condition: () => d.velocity.length() > 10,
                objective: () => `Скорость: ${d.velocity.length().toFixed(1)} / 10.0 м/с`,
                progressTarget: () => Math.min(1, d.velocity.length() / 10),
            },
            {
                id: 'gate',
                title: 'ПЕРВОЕ КОЛЬЦО',
                text: 'Пролетите через подсвеченное кольцо. Стрелка сверху указывает направление.',
                keys: [],
                condition: (rm) => rm?.nextGateIdx > 0,
                showArrow: true,
                objective: () => 'Пролетите сквозь светящееся кольцо',
                progressTarget: () => 0,
            },
            {
                id: 'finish',
                title: 'ОБУЧЕНИЕ ЗАВЕРШЕНО',
                text: 'Превосходно! Вы освоили все базовые манёвры. Попробуйте полноценную трассу в Ангаре.',
                timerOnly: true,
                duration: 6,
                isLast: true,
            },
        ];
    }

    // ── 3-D arrow mesh (points along +Z so lookAt works naturally) ────────────
    _buildArrow3D() {
        const g = new THREE.Group();
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.85 });

        // Cylinder body along +Z
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 8), mat.clone());
        body.rotation.x = Math.PI / 2;
        body.position.z = 1.1;
        g.add(body);

        // Cone head tip toward +Z
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.85, 8), mat.clone());
        head.rotation.x = -Math.PI / 2;
        head.position.z = 2.62;
        g.add(head);

        g.visible = false;
        this.scene.add(g);
        return g;
    }

    // ── Public API ────────────────────────────────────────────────────────────
    _skip() {
        const s = this.steps[this.currentStep];
        if (!s || s.isLast) return;
        if (this.state === S.ACTIVE || this.state === S.FADE_IN) this._complete();
    }

    _complete() {
        if (this.state === S.COMPLETING || this.state === S.FADE_OUT) return;
        this.state = S.COMPLETING;
        this.completingT = 0;
        this.flashAlpha = 1.0;
        this._spawnParticles();
    }

    _spawnParticles() {
        if (!this.hudCanvas) return;
        const cx = this.hudCanvas.width / 2;
        const cy = this.hudCanvas.height - 190;
        const colors = ['#00e664', '#00ccff', '#ffcc00', '#ff6622', '#ffffff'];
        for (let i = 0; i < 48; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 80 + Math.random() * 220;
            this.particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: (Math.sin(angle) - 0.4) * speed,
                life: 1,
                decay: 0.45 + Math.random() * 0.55,
                r: 2 + Math.random() * 5,
                color: colors[Math.floor(Math.random() * colors.length)],
            });
        }
    }

    _advanceStep() {
        this.currentStep++;
        if (this.currentStep >= this.steps.length) {
            this.active = false;
            this._cleanup();
            return;
        }
        this.state = S.FADE_IN;
        this.alpha = 0;
        this.stepElapsed = 0;
        this.completingT = 0;
    }

    // ── Update loop ───────────────────────────────────────────────────────────
    update(delta, raceManager) {
        if (!this.active) return;
        this._raceManager = raceManager;

        this.pulseT += delta;
        this.arrowPulseT += delta;
        this.stepElapsed += delta;

        const s = this.steps[this.currentStep];
        if (!s) { this.active = false; return; }

        // Particles
        for (const p of this.particles) {
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.vy += 220 * delta;
            p.life -= p.decay * delta;
        }
        this.particles = this.particles.filter(p => p.life > 0);
        if (this.flashAlpha > 0) this.flashAlpha -= delta * 2.5;

        // FSM
        switch (this.state) {
            case S.FADE_IN:
                this.alpha = Math.min(1, this.alpha + delta * FADE_SPEED);
                if (this.alpha >= 1) {
                    this.alpha = 1;
                    this.state = S.ACTIVE;
                    this.stepElapsed = 0;
                }
                break;

            case S.ACTIVE:
                if (s.timerOnly) {
                    if (this.stepElapsed >= s.duration) {
                        if (s.isLast) { this.active = false; this._cleanup(); return; }
                        this._complete();
                    }
                } else {
                    const done = s.id === 'gate'
                        ? s.condition(raceManager)
                        : (s.condition ? s.condition() : false);
                    if (done && this.stepElapsed >= (s.duration ?? 0)) {
                        this._complete();
                    }
                }
                break;

            case S.COMPLETING:
                this.completingT += delta;
                if (this.completingT >= COMPLETE_HOLD) {
                    this.state = S.FADE_OUT;
                }
                break;

            case S.FADE_OUT:
                this.alpha = Math.max(0, this.alpha - delta * FADE_SPEED);
                if (this.alpha <= 0) this._advanceStep();
                break;
        }

        this._updateArrow3D(raceManager);
    }

    _updateArrow3D(raceManager) {
        const s = this.steps[this.currentStep];
        if (!s?.showArrow || !raceManager || !this._arrow3D) {
            if (this._arrow3D) this._arrow3D.visible = false;
            return;
        }
        const gate = raceManager.gates?.[raceManager.nextGateIdx];
        if (!gate) { this._arrow3D.visible = false; return; }

        const dronePos = this.droneState.position;
        const gatePos = gate.position;

        // Float 2 m above drone
        this._arrow3D.position.set(dronePos.x, dronePos.y + 2.2, dronePos.z);

        // LookAt flattened to XZ so arrow doesn't tip up/down
        const flatTarget = new THREE.Vector3(gatePos.x, dronePos.y + 2.2, gatePos.z);
        this._arrow3D.lookAt(flatTarget);

        // Pulse opacity
        const pulse = 0.55 + 0.45 * Math.sin(this.arrowPulseT * 3.5);
        this._arrow3D.children.forEach(c => { if (c.material) c.material.opacity = pulse; });
        this._arrow3D.visible = this.state !== S.FADE_OUT && this.active;
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────
    _cleanup() {
        if (this._arrow3D) { this.scene.remove(this._arrow3D); this._arrow3D = null; }
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('keyup', this._onKeyUp);
    }

    // ── HUD draw ──────────────────────────────────────────────────────────────
    draw(ctx, W, H) {
        if (!this.active && this.particles.length === 0) return;

        ctx.save();

        // Particles (drawn at full opacity regardless of panel alpha)
        for (const p of this.particles) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }

        if (!this.active) { ctx.restore(); return; }

        const s = this.steps[this.currentStep];
        if (!s) { ctx.restore(); return; }

        // Screen flash on completion
        if (this.flashAlpha > 0) {
            ctx.globalAlpha = this.flashAlpha * 0.22;
            ctx.fillStyle = '#00ff88';
            ctx.fillRect(0, 0, W, H);
        }

        ctx.globalAlpha = this.alpha;

        // Compass arrow (gate direction)
        if (s.showArrow && this._raceManager) {
            this._drawCompass(ctx, W, H, this._raceManager);
        }

        // ── Panel ─────────────────────────────────────────────────────────────
        const PW = 500, PH = 170;
        const px = (W - PW) / 2;
        const py = H - PH - 160;
        const isCompleting = this.state === S.COMPLETING;

        const pulse = 0.6 + 0.4 * Math.sin(this.pulseT * 2.2);

        // Outer glow
        ctx.shadowColor = isCompleting ? '#00ff88' : '#00e664';
        ctx.shadowBlur = (isCompleting ? 40 : 18) * pulse;
        ctx.fillStyle = isCompleting ? 'rgba(0,30,15,0.92)' : 'rgba(0,8,20,0.90)';
        ctx.beginPath();
        ctx.roundRect(px, py, PW, PH, 12);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = isCompleting
            ? `rgba(0,255,136,${pulse})`
            : `rgba(0,220,90,${0.55 + 0.35 * Math.sin(this.pulseT * 1.8)})`;
        ctx.lineWidth = isCompleting ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.roundRect(px, py, PW, PH, 12);
        ctx.stroke();

        // Top accent gradient bar
        const accentGrad = ctx.createLinearGradient(px, 0, px + PW, 0);
        accentGrad.addColorStop(0, 'rgba(0,230,100,0)');
        accentGrad.addColorStop(0.5, isCompleting ? 'rgba(0,255,136,1)' : 'rgba(0,230,100,0.7)');
        accentGrad.addColorStop(1, 'rgba(0,230,100,0)');
        ctx.fillStyle = accentGrad;
        ctx.fillRect(px, py, PW, 2);

        // Progress dots row
        this._drawDots(ctx, px, py - 18, PW);

        // Step badge
        this._drawBadge(ctx, px + 12, py + 12, this.currentStep + 1, this.steps.length, isCompleting);

        // Title
        ctx.fillStyle = isCompleting ? '#00ff88' : '#00e664';
        ctx.font = `bold 15px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(isCompleting ? '✓ ' + s.title : s.title, W / 2, py + 34);

        // Body text (left section, max ~310px wide)
        ctx.fillStyle = 'rgba(190,230,210,0.90)';
        ctx.font = '12.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        const textCX = px + 175;
        this._wrapText(ctx, s.text, textCX, py + 60, 320, 17);

        // Objective / live feedback
        if (s.objective && this.state === S.ACTIVE) {
            const obj = s.objective();
            const objGrad = ctx.createLinearGradient(px, 0, px + PW, 0);
            objGrad.addColorStop(0, 'rgba(255,204,0,0)');
            objGrad.addColorStop(0.15, 'rgba(255,204,0,0.9)');
            objGrad.addColorStop(0.85, 'rgba(255,204,0,0.9)');
            objGrad.addColorStop(1, 'rgba(255,204,0,0)');
            ctx.fillStyle = objGrad;
            ctx.font = '11.5px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('▶ ' + obj, textCX, py + 116);
        }

        // Progress bar (condition-based fill)
        if (s.progressTarget && this.state === S.ACTIVE) {
            const prog = s.progressTarget();
            const bx = px + 12, bw = 310, bh = 5, bY = py + PH - 20;
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath(); ctx.roundRect(bx, bY, bw, bh, 3); ctx.fill();
            if (prog > 0) {
                const pg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
                pg.addColorStop(0, '#00e664'); pg.addColorStop(1, '#00ccff');
                ctx.fillStyle = pg;
                ctx.beginPath(); ctx.roundRect(bx, bY, bw * prog, bh, 3); ctx.fill();
            }
        }

        // Timer bar (for timed steps)
        if (s.timerOnly && s.duration && this.state === S.ACTIVE) {
            const prog = Math.min(1, this.stepElapsed / s.duration);
            const bx = px + 12, bw = 330, bh = 4, bY = py + PH - 20;
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath(); ctx.roundRect(bx, bY, bw, bh, 3); ctx.fill();
            const tg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
            tg.addColorStop(0, '#00ccff'); tg.addColorStop(1, '#00e664');
            ctx.fillStyle = tg;
            ctx.beginPath(); ctx.roundRect(bx, bY, bw * prog, bh, 3); ctx.fill();
        }

        // Controls panel (right section)
        if (s.keys?.length > 0 || s.stick) {
            this._drawControls(ctx, px + 345, py + 10, s);
        }

        // Skip hint
        if (!s.isLast && this.currentStep > 0) {
            ctx.fillStyle = 'rgba(100,130,115,0.5)';
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText('[ESC] пропустить', px + PW - 10, py + PH - 8);
        }

        ctx.restore();
    }

    // ── Sub-draw helpers ──────────────────────────────────────────────────────

    _drawDots(ctx, px, py, PW) {
        const total = this.steps.length;
        const gap = 13;
        const startX = px + (PW - (total - 1) * gap) / 2;
        for (let i = 0; i < total; i++) {
            const x = startX + i * gap;
            ctx.beginPath();
            if (i === this.currentStep) {
                ctx.fillStyle = '#00e664';
                ctx.arc(x, py, 4, 0, Math.PI * 2);
            } else if (i < this.currentStep) {
                ctx.fillStyle = 'rgba(0,230,100,0.55)';
                ctx.arc(x, py, 3, 0, Math.PI * 2);
            } else {
                ctx.fillStyle = 'rgba(255,255,255,0.18)';
                ctx.arc(x, py, 3, 0, Math.PI * 2);
            }
            ctx.fill();
        }
    }

    _drawBadge(ctx, x, y, current, total, isCompleting) {
        const bw = 38, bh = 18;
        ctx.fillStyle = isCompleting ? 'rgba(0,255,136,0.25)' : 'rgba(0,230,100,0.12)';
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 4); ctx.fill();
        ctx.fillStyle = isCompleting ? '#00ff88' : '#00e664';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${current}/${total}`, x + bw / 2, y + 13);
    }

    _drawControls(ctx, startX, startY, step) {
        // Key hints
        if (step.keys?.length > 0) {
            const keys = step.keys.slice(0, 4);
            const kW = 30, kH = 26, kGap = 4;
            const cols = Math.min(keys.length, 3);
            for (let i = 0; i < keys.length; i++) {
                const col = i % cols, row = Math.floor(i / cols);
                const kx = startX + col * (kW + kGap);
                const ky = startY + row * (kH + kGap);
                const pressed = this._isPressed(keys[i]);

                ctx.fillStyle = pressed ? '#00e664' : 'rgba(0,180,70,0.14)';
                ctx.strokeStyle = pressed ? '#00ff88' : 'rgba(0,200,80,0.45)';
                ctx.lineWidth = pressed ? 1.5 : 1;
                ctx.beginPath(); ctx.roundRect(kx, ky, kW, kH, 5); ctx.fill(); ctx.stroke();

                ctx.fillStyle = pressed ? '#001a08' : '#00e664';
                ctx.font = `bold 10px "JetBrains Mono", monospace`;
                ctx.textAlign = 'center';
                ctx.fillText(keys[i], kx + kW / 2, ky + kH / 2 + 4);
            }
        }

        // Stick diagram
        if (step.stick) {
            const { side, x, y } = step.stick;
            const cx = startX + (step.keys?.length >= 3 ? 45 : 15);
            const cy = startY + 75;
            this._drawStick(ctx, cx, cy, x, y, side);
        }
    }

    _drawStick(ctx, cx, cy, sx, sy, label) {
        const R = 22;
        // Outer ring
        ctx.strokeStyle = 'rgba(0,200,80,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

        // Cross hairs
        ctx.strokeStyle = 'rgba(0,180,70,0.2)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
        ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
        ctx.stroke();

        // Stick dot position
        const dx = cx + sx * R * 0.58;
        const dy = cy - sy * R * 0.58;
        const pulse = 0.7 + 0.3 * Math.sin(this.pulseT * 3);

        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 6 * pulse;
        ctx.fillStyle = '#00e664';
        ctx.beginPath(); ctx.arc(dx, dy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = 'rgba(0,200,80,0.55)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, cx, cy + R + 11);
    }

    _drawCompass(ctx, W, H, raceManager) {
        const gate = raceManager.gates?.[raceManager.nextGateIdx];
        if (!gate) return;

        const dp = this.droneState.position;
        const gp = gate.position;
        const dx = gp.x - dp.x;
        const dz = gp.z - dp.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        // Three.js: rotation.y = θ → локальная -Z дрона в мире = (-sinθ, 0, -cosθ)
        const ry = this.droneState.rotation.y;
        const fX = -Math.sin(ry), fZ = -Math.cos(ry);
        const relAngle = Math.atan2(fX * dz - fZ * dx, fX * dx + fZ * dz);

        const cx = W / 2;
        const cy = 88;
        const R = 36;
        const pulse = 0.65 + 0.35 * Math.sin(this.pulseT * 3.5);

        // BG circle
        ctx.fillStyle = 'rgba(0,8,20,0.78)';
        ctx.strokeStyle = `rgba(0,230,100,${0.45 + 0.25 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, R + 10, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();

        // Tick marks
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const r1 = R + 3, r2 = R + 8;
            ctx.strokeStyle = 'rgba(0,200,80,0.28)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
            ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
            ctx.stroke();
        }

        // Arrow
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(relAngle);
        ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 10 * pulse;
        ctx.fillStyle = '#00e664';
        ctx.beginPath();
        ctx.moveTo(0, -(R - 4));
        ctx.lineTo(7, 4);
        ctx.lineTo(0, -2);
        ctx.lineTo(-7, 4);
        ctx.closePath();
        ctx.fill();
        // Tail
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,200,80,0.35)';
        ctx.beginPath();
        ctx.moveTo(0, R - 8);
        ctx.lineTo(4, 0); ctx.lineTo(-4, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();

        // Distance text below compass
        ctx.fillStyle = '#00e664';
        ctx.font = `bold 11px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${dist.toFixed(0)} м`, cx, cy + R + 22);

        ctx.fillStyle = 'rgba(0,200,80,0.6)';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText('КОЛЬЦО', cx, cy + R + 34);
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    _isPressed(label) {
        const map = {
            W: 'KeyW', S: 'KeyS', A: 'KeyA', D: 'KeyD',
            '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight',
        };
        return this.pressedKeys.has(map[label] ?? label);
    }

    _wrapText(ctx, text, cx, y, maxW, lh) {
        const words = text.split(' ');
        let line = '';
        for (const w of words) {
            const test = line + w + ' ';
            if (ctx.measureText(test).width > maxW && line) {
                ctx.fillText(line.trim(), cx, y);
                line = w + ' ';
                y += lh;
            } else {
                line = test;
            }
        }
        ctx.fillText(line.trim(), cx, y);
    }
}