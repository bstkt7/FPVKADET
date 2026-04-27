/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║              DronePhysics — School Simulator Edition             ║
 * ║   Объединяет аркадную точность FPV + реализм квадрокоптера       ║
 * ║                                                                  ║
 * ║   Особенности:                                                   ║
 * ║   • НОВОЕ: Переключение режимов Arcade (резкий) / Realistic      ║
 * ║   • Кватернионная физика вращений (без gimbal lock)              ║
 * ║   • 3 класса дронов с реальными параметрами                      ║
 * ║   • PID-контроллер угла/скорости/удержания высоты                ║
 * ║   • Режимы: Angle, Sport, Acro                                   ║
 * ║   • Режим безопасности для начинающих                            ║
 * ║   • Черепаший режим (Turtle Mode)                                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import * as THREE from 'three';
import { SPAWN_POS, SPAWN_ROT } from './config/constants.js';

// ══════════════════════════════════════════════════════════════════════
// КЛАССЫ ДРОНОВ
// ══════════════════════════════════════════════════════════════════════

export const DRONE_CLASSES = {
    tiny_whoop: {
        label: 'Tiny Whoop',
        desc: '65мм, ~30г — комнатный акробат',
        mass: 0.030,
        thrustNorm: 13.5,
        inertia: 0.65,
        drag: 2.8,
        maxTiltDeg: 55,
        angularDamping: 0.70,
        yawDamping: 0.85,
        speedLimit: 30,
        groundEffMult: 2.0,
        batteryCapacity: 250,
        defaultPID: {
            pP: 0.22, pI: 0.03, pD: 0.60,
            rP: 0.22, rI: 0.03, rD: 0.60,
            yP: 0.20, yI: 0.01, yD: 0.10,
        },
        acroRateScale: 1.4,
    },
    freestyle_5: {
        label: '5" Freestyle',
        desc: '5 дюймов, ~250г — классический FPV',
        mass: 0.250,
        thrustNorm: 16.5,
        inertia: 0.95,
        drag: 1.4,
        maxTiltDeg: 60,
        angularDamping: 0.80,
        yawDamping: 0.88,
        speedLimit: 60,
        groundEffMult: 1.1,
        batteryCapacity: 1300,
        defaultPID: {
            pP: 0.18, pI: 0.02, pD: 0.55,
            rP: 0.18, rI: 0.02, rD: 0.55,
            yP: 0.16, yI: 0.008, yD: 0.08,
        },
        acroRateScale: 1.0,
    },
    heavy_sync: {
        label: 'Heavy Sync',
        desc: '7" синевуп, ~600г — стабильный крейсер',
        mass: 0.600,
        thrustNorm: 15.5,
        inertia: 1.8,
        drag: 0.85,
        maxTiltDeg: 45,
        angularDamping: 0.85,
        yawDamping: 0.90,
        speedLimit: 55,
        groundEffMult: 1.5,
        batteryCapacity: 2200,
        defaultPID: {
            pP: 0.13, pI: 0.012, pD: 0.42,
            rP: 0.13, rI: 0.012, rD: 0.42,
            yP: 0.11, yI: 0.005, yD: 0.06,
        },
        acroRateScale: 0.7,
    },
};

export const DEFAULT_DRONE_CLASS = 'freestyle_5';

export let sharedWorld = null;
export let groundMaterial = null;

// ══════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ СТРУКТУРЫ
// ══════════════════════════════════════════════════════════════════════

class PIDIntegrator {
    constructor(limit = 0.3) {
        this._limit = limit;
        this._x = 0; this._y = 0; this._z = 0;
    }
    add(x, y, z, dt) {
        this._x = THREE.MathUtils.clamp(this._x + x * dt, -this._limit, this._limit);
        this._y = THREE.MathUtils.clamp(this._y + y * dt, -this._limit, this._limit);
        this._z = THREE.MathUtils.clamp(this._z + z * dt, -this._limit, this._limit);
    }
    reset() { this._x = 0; this._y = 0; this._z = 0; }
    get x() { return this._x; }
    get y() { return this._y; }
    get z() { return this._z; }
}

// ══════════════════════════════════════════════════════════════════════
// ОСНОВНОЙ КЛАСС ФИЗИКИ
// ══════════════════════════════════════════════════════════════════════

export class DronePhysics {
    constructor({ onCrash, onLand, scene } = {}) {
        this._onCrash = onCrash || (() => { });
        this._onLand = onLand || (() => { });
        this._scene = scene || null;

        this.quaternion = new THREE.Quaternion();
        this._qDelta = new THREE.Quaternion();
        this._eulerLocal = new THREE.Euler(0, 0, 0, 'YXZ');

        this.upWorld = new THREE.Vector3(0, 1, 0);
        this.forwardWorld = new THREE.Vector3(0, 0, -1);
        this.rightWorld = new THREE.Vector3(1, 0, 0);

        this.position = new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z);
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();

        this.health = 100;
        this.battery = 100;
        this.isCrashed = false;
        this.turtleMode = false;
        this.propDamage = [0, 0, 0, 0];

        this.droneClass = DEFAULT_DRONE_CLASS;
        this.flightMode = 'angle'; // 'angle' | 'sport' | 'acro'
        this.safetyMode = false;

        // НОВОЕ: Переключатель физики
        this.physicsMode = 'arcade'; // 'arcade' | 'realistic'

        this._altHoldActive = false;
        this._altHoldTarget = 0;
        this._altHoldSmoothT = 0;
        this._altHoldPID = new PIDIntegrator(0.6);

        this._pidAngle = new PIDIntegrator(0.3);
        this._pidYaw = new PIDIntegrator(0.2);

        this._windVec = new THREE.Vector3();
        this._turbVec = new THREE.Vector3();
        this._windTime = 0;

        this._thrustVec = new THREE.Vector3();
        this._accVec = new THREE.Vector3();
        this._tmpVec = new THREE.Vector3();
        this._axisVec = new THREE.Vector3();

        this.body = {
            position: this.position,
            velocity: this.velocity,
            angularVelocity: this.angularVelocity,
            quaternion: { set: () => { } },
            applyImpulse: (impulse) => {
                const inv = 1 / (this.classData.mass || 0.25);
                this.velocity.x += impulse.x * inv;
                this.velocity.y += impulse.y * inv;
                this.velocity.z += impulse.z * inv;
            },
        };

        this._eulerLocal.set(SPAWN_ROT.x, SPAWN_ROT.y, SPAWN_ROT.z);
        this.quaternion.setFromEuler(this._eulerLocal);
        this._updateWorldVectors();
    }

    get classData() {
        return DRONE_CLASSES[this.droneClass] || DRONE_CLASSES[DEFAULT_DRONE_CLASS];
    }

    get rotation() {
        this._eulerLocal.setFromQuaternion(this.quaternion, 'YXZ');
        return this._eulerLocal;
    }

    // ── Управление режимами ───────────────────────────────────────────

    togglePhysicsMode() {
        this.physicsMode = this.physicsMode === 'realistic' ? 'arcade' : 'realistic';
        return this.physicsMode;
    }

    enableAltHold() {
        this._altHoldActive = true;
        this._altHoldTarget = this.position.y;
        this._altHoldSmoothT = this.position.y;
        this._altHoldPID.reset();
    }

    disableAltHold() {
        this._altHoldActive = false;
        this._altHoldPID.reset();
    }

    toggleAltHold() {
        this._altHoldActive ? this.disableAltHold() : this.enableAltHold();
        return this._altHoldActive;
    }

    toggleSafetyMode() {
        this.safetyMode = !this.safetyMode;
        return this.safetyMode;
    }

    // ── Сброс ─────────────────────────────────────────────────────────

    resetAt(pos, rot) {
        this.position.set(pos?.x ?? SPAWN_POS.x, pos?.y ?? SPAWN_POS.y, pos?.z ?? SPAWN_POS.z);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);

        if (rot instanceof THREE.Quaternion) {
            this.quaternion.copy(rot);
        } else if (rot instanceof THREE.Euler) {
            this.quaternion.setFromEuler(rot);
        } else if (rot) {
            this._eulerLocal.set(rot.x || 0, rot.y || 0, rot.z || 0, 'YXZ');
            this.quaternion.setFromEuler(this._eulerLocal);
        } else {
            this.quaternion.identity();
        }
        this._updateWorldVectors();

        this.health = 100;
        this.battery = 100;
        this.isCrashed = false;
        this.turtleMode = false;
        this.propDamage = [0, 0, 0, 0];
        this._pidAngle.reset();
        this._pidYaw.reset();
        this._altHoldActive = false;
        this._altHoldPID.reset();

        this._syncBody();
    }

    reset() {
        this.resetAt(
            { x: SPAWN_POS.x, y: SPAWN_POS.y, z: SPAWN_POS.z },
            new THREE.Euler(SPAWN_ROT.x, SPAWN_ROT.y, SPAWN_ROT.z, 'YXZ'),
        );
    }

    dispose() { }

    // ── Внутренние методы ─────────────────────────────────────────────

    _updateWorldVectors() {
        this.upWorld.set(0, 1, 0).applyQuaternion(this.quaternion);
        this.forwardWorld.set(0, 0, -1).applyQuaternion(this.quaternion);
        this.rightWorld.set(1, 0, 0).applyQuaternion(this.quaternion);
    }

    _integrateRotation(dt) {
        const { x: wx, y: wy, z: wz } = this.angularVelocity;
        const angle = Math.sqrt(wx * wx + wy * wy + wz * wz);
        if (angle < 1e-8) return;

        const half = angle * dt * 0.5;
        const s = Math.sin(half) / angle;
        this._qDelta.set(wx * s, wy * s, wz * s, Math.cos(half));
        this.quaternion.multiplyQuaternions(this.quaternion, this._qDelta).normalize();
    }

    _updateWind(dt, weather) {
        this._windTime += dt;
        const t = this._windTime;

        const windStrength = weather === 'rain' ? 5.5 : weather === 'snow' ? 7.5 : weather === 'storm' ? 12.0 : 2.5;

        const wx = Math.sin(t * 0.13) * 0.7 + Math.sin(t * 0.07 + 1.3) * 0.3;
        const wz = Math.cos(t * 0.11) * 0.7 + Math.cos(t * 0.09 + 0.7) * 0.3;
        this._windVec.set(wx, 0, wz).normalize().multiplyScalar(windStrength);

        const turbStrength = weather === 'snow' ? 2.0 : weather === 'rain' ? 1.3 : weather === 'storm' ? 3.5 : 0.55;
        const f = 4.8;
        this._turbVec.set(
            (Math.sin(t * f + 1.1) + Math.sin(t * f * 2.3)) * 0.5,
            Math.sin(t * f * 1.7 + 2.0) * 0.3,
            (Math.cos(t * f + 0.3) + Math.cos(t * f * 1.9)) * 0.5,
        ).multiplyScalar(turbStrength);
    }

    _thrustFactor() {
        return this.propDamage.filter(d => d === 0).length / 4;
    }

    _propAsymmetry() {
        const d = this.propDamage;
        return {
            pitchBias: ((d[0] + d[1]) - (d[2] + d[3])) * 0.25,
            rollBias: ((d[0] + d[2]) - (d[1] + d[3])) * 0.25,
        };
    }

    _syncBody() {
        this.body.position = this.position;
        this.body.velocity = this.velocity;
        this.body.angularVelocity = this.angularVelocity;
    }

    // ── Коллизии ──────────────────────────────────────────────────────

    resolveCollisions(colliders) {
        if (this.isCrashed && !this.turtleMode) return;

        const p = this.position;
        const R = 0.6;

        for (const c of colliders) {
            const cos = Math.cos(-c.rotY), sin = Math.sin(-c.rotY);
            const dx = p.x - c.cx, dz = p.z - c.cz;

            const lx = cos * dx - sin * dz;
            const lz = sin * dx + cos * dz;
            const ly = p.y - c.cy;

            const ex = c.hw + R, ey = c.hh + R, ez = c.hd + R;
            if (Math.abs(lx) > ex || Math.abs(ly) > ey || Math.abs(lz) > ez) continue;

            const ox = ex - Math.abs(lx);
            const oy = ey - Math.abs(ly);
            const oz = ez - Math.abs(lz);
            let nx = 0, ny = 0, nz = 0;
            if (ox < oy && ox < oz) nx = Math.sign(lx) * ox;
            else if (oy < ox && oy < oz) ny = Math.sign(ly) * oy;
            else nz = Math.sign(lz) * oz;

            const cosF = Math.cos(c.rotY), sinF = Math.sin(c.rotY);
            p.x += cosF * nx - sinF * nz;
            p.y += ny;
            p.z += sinF * nx + cosF * nz;

            const impactSpeed = Math.abs(ny) > 0
                ? Math.abs(this.velocity.y)
                : Math.hypot(this.velocity.x, this.velocity.z);

            if (impactSpeed > 2 && !this.turtleMode) {
                this.health -= impactSpeed * 0.55;
                this._onCrash();
                if (impactSpeed > 3.5) {
                    const idx = Math.floor(Math.random() * 4);
                    if (this.propDamage[idx] === 0 && Math.random() < impactSpeed * 0.07)
                        this.propDamage[idx] = 1;
                }
            }

            if (Math.abs(ny) > 0) {
                this.velocity.y *= -0.12;
            } else {
                this.velocity.x *= 0.30;
                this.velocity.z *= 0.30;
            }
        }

        if (this.health <= 0 && !this.isCrashed) {
            this._triggerCrash();
        }
    }

    _resolveSceneColliders(prevY, dt) {
        if (!this._scene) return;

        this._scene.children.forEach(obj => {
            if (!obj.userData?.isCollider || obj.userData.type !== 'landingPad') return;

            const padY = obj.position.y;
            const padR = obj.userData.radius ?? 2;
            const dx = this.position.x - obj.position.x;
            const dz = this.position.z - obj.position.z;

            if (dx * dx + dz * dz >= padR * padR) return;

            if (prevY > padY && this.position.y < padY) {
                this.position.y = padY + 0.05;
                if (Math.abs(this.velocity.y) > 2) this._onLand(Math.abs(this.velocity.y));
                this.velocity.y = 0;
                this.velocity.x *= 0.6;
                this.velocity.z *= 0.6;
                return;
            }

            if (this.position.y <= padY + 0.12 && this.position.y >= padY - 0.12) {
                this.position.y = padY + 0.05;
                this.velocity.y = 0;
                this.velocity.x *= 0.6;
                this.velocity.z *= 0.6;
            }
        });
    }

    _triggerCrash() {
        this.isCrashed = true;
        this.health = 0;
        this.propDamage = [1, 1, 1, 1];
        this.angularVelocity.set(0, 0, 0);
        this._altHoldPID.reset();
        this._onCrash();
    }

    // ── РЕЖИМ ANGLE / SPORT ───────────────────────────────────────────

    _updateAngleMode(input, config, dt) {
        const cls = this.classData;
        const pid = config.pid ?? cls.defaultPID;
        const isSport = this.flightMode === 'sport';
        const pitchSign = config.invertPitch ? -1 : 1;
        const curEuler = this._eulerLocal.setFromQuaternion(this.quaternion, 'YXZ');

        // ==== АРКАДНЫЙ РЕЖИМ ====
        if (this.physicsMode === 'arcade') {
            const arcadeMaxTilt = THREE.MathUtils.degToRad(80); // Почти 90 градусов для лютой скорости
            const targetPitch = -input.pitchInput * arcadeMaxTilt * pitchSign;
            const targetRoll = input.rollInput * arcadeMaxTilt;

            // Разница между тем, где мы есть, и куда хотим смотреть
            const errP = targetPitch - curEuler.x;
            const errR = targetRoll - curEuler.z;

            // Мгновенная установка угловой скорости (никакой инерции, резкий рывок)
            this.angularVelocity.x = errP * 15.0;
            this.angularVelocity.z = errR * 15.0;

            // Очень быстрый поворот вокруг своей оси
            this.angularVelocity.y = -input.yawInput * 8.0;
            return;
        }

        // ==== РЕАЛИСТИЧНЫЙ РЕЖИМ ====
        // Увеличиваем лимиты: в Angle — 45 градусов, в Sport — 95 градусов
        const tiltBase = cls.maxTiltDeg || 60;
        const maxTilt = THREE.MathUtils.degToRad(tiltBase * (isSport ? 1.6 : 0.55)); // Angle: ~33° вместо 45°

        const { pitchBias, rollBias } = this._propAsymmetry();

        const targetPitch = -input.pitchInput * maxTilt * pitchSign + pitchBias * 0.12;
        const targetRoll = input.rollInput * maxTilt + rollBias * 0.12;

        const errP = targetPitch - curEuler.x;
        const errR = targetRoll - curEuler.z;

        this._pidAngle.add(errP, 0, errR, dt);

        // Усиливаем P-терм для резкости (в 10-15 раз выше предыдущих значений)
        const kpAngle = isSport ? 14.0 : 8.5;
        const avxCmd = errP * kpAngle + this._pidAngle.x * pid.pI * 2.0 - this.angularVelocity.x * pid.pD * 35;
        const avzCmd = errR * kpAngle + this._pidAngle.z * pid.rI * 2.0 - this.angularVelocity.z * pid.rD * 35;

        // Поворот по Yaw тоже ускоряем
        const yawSpeed = isSport ? 6.5 : 3.5;
        const yawCmd = -input.yawInput * yawSpeed;

        const response = 0.85 / cls.inertia;
        this.angularVelocity.x += (avxCmd - this.angularVelocity.x) * response * 0.18;
        this.angularVelocity.z += (avzCmd - this.angularVelocity.z) * response * 0.18;
        this.angularVelocity.y += (yawCmd - this.angularVelocity.y) * response * 0.12;

        // Смягчаем демпфирование для более живого поведения
        const damping = 1.0 - (1.0 - cls.angularDamping) * 0.35;
        this.angularVelocity.x *= damping;
        this.angularVelocity.z *= damping;
        this.angularVelocity.y *= (1.0 - (1.0 - (cls.yawDamping ?? 0.88)) * 0.35);

        if (this.safetyMode) {
            const limit = THREE.MathUtils.degToRad(tiltBase * 0.5);
            curEuler.x = THREE.MathUtils.clamp(curEuler.x, -limit, limit);
            curEuler.z = THREE.MathUtils.clamp(curEuler.z, -limit, limit);
            this.quaternion.setFromEuler(curEuler);
        }
    }

    // ── РЕЖИМ ACRO ────────────────────────────────────────────────────

    _updateAcroMode(input, config, dt) {
        const cls = this.classData;
        const pid = config.pid ?? cls.defaultPID;
        const pitchSign = config.invertPitch ? -1 : 1;

        // ==== АРКАДНЫЙ РЕЖИМ ====
        if (this.physicsMode === 'arcade') {
            const arcadeRate = 14.0; // Бешеная скорость вращения в Acro (флипы за доли секунды)
            this.angularVelocity.x = input.pitchInput * arcadeRate * pitchSign;
            this.angularVelocity.z = -input.rollInput * arcadeRate;
            this.angularVelocity.y = -input.yawInput * (arcadeRate * 0.7);
            return;
        }

        // ==== РЕАЛИСТИЧНЫЙ РЕЖИМ ====
        // Рейты: теперь это честные ~800 град/сек для фристайл-дрона
        const maxRate = 13.5 * (cls.acroRateScale ?? 1.0);
        const targetPitchRate = input.pitchInput * maxRate * pitchSign;
        const targetRollRate = -input.rollInput * maxRate;
        const targetYawRate = -input.yawInput * maxRate * 0.75;

        // Отзывчивость (P-term для угловой скорости)
        const response = 0.5 / cls.inertia;
        this.angularVelocity.x += (targetPitchRate - this.angularVelocity.x) * response * 0.25;
        this.angularVelocity.z += (targetRollRate - this.angularVelocity.z) * response * 0.25;
        this.angularVelocity.y += (targetYawRate - this.angularVelocity.y) * response * 0.20;

        // Минимальное демпфирование в Acro для естественного вращения
        this.angularVelocity.multiplyScalar(0.99);

        this.angularVelocity.x *= (1.0 - (1.0 - cls.angularDamping) * 0.2);
        this.angularVelocity.z *= (1.0 - (1.0 - cls.angularDamping) * 0.2);
        this.angularVelocity.y *= (1.0 - (1.0 - (cls.yawDamping ?? 0.88)) * 0.2);

        if (!this.safetyMode && Math.abs(input.rollInput) > 0.7 && input.throttle > 0.65) {
            const rollRate = Math.abs(this.angularVelocity.z);
            const liftBoost = rollRate * 0.8 * dt;
            this.velocity.y += liftBoost;
        }
    }

    // ── Ускорение, Драг, Экранный эффект ──────────────────────────────

    _applyThrust(input, config, dt) {
        const cls = this.classData;
        const GRAVITY = config.weather === 'snow' ? -35 : -42;
        const thrFact = this._thrustFactor();
        const isSport = this.flightMode === 'sport';
        const isAngle = this.flightMode === 'angle' || isSport;

        let thrustScalar;
        if (isAngle && this._altHoldActive) {
            const inDB = Math.abs(input.throttle - 0.5) < 0.06;
            if (!inDB) {
                this._altHoldSmoothT += (input.throttle - 0.5) * 4.0 * dt;
                this._altHoldTarget = this.position.y + this._altHoldSmoothT;
                this._altHoldSmoothT *= 0.92;
            }

            const hErr = this._altHoldTarget - this.position.y;
            const vErr = -this.velocity.y;
            this._altHoldPID.add(hErr, 0, 0, dt);

            const pT = hErr * 6.0;
            const dT = vErr * 3.5;
            const iT = this._altHoldPID.x * 1.2;
            const gravComp = -GRAVITY * (cls.thrustNorm / 22.0);
            thrustScalar = (pT + dT + iT + gravComp) * thrFact;
        } else {
            thrustScalar = (input.throttle / 0.5) * (-GRAVITY) * (cls.thrustNorm / 22.0) * thrFact;

            if (isAngle) {
                const inDB = Math.abs(input.throttle - 0.5) < 0.06;
                if (inDB) {
                    if (!this._altHoldTarget) this._altHoldTarget = this.position.y;
                    const hErr = this._altHoldTarget - this.position.y;
                    thrustScalar += hErr * 5.0 - this.velocity.y * 2.5;
                } else {
                    this._altHoldTarget = null;
                }
            }
        }

        // В аркаде можно добавить больше дури
        if (this.physicsMode === 'arcade') {
            thrustScalar *= 1.3;
        }

        this._thrustVec.copy(this.upWorld).multiplyScalar(thrustScalar);

        const speed = this.velocity.length();
        const dmgDrag = (100 - this.health) * 0.004;
        const wetDrag = config.weather === 'rain' ? 0.20 : 0;

        // В аркаде уменьшаем сопротивление воздуха для быстрого набора скорости
        const dragMult = this.physicsMode === 'arcade' ? 0.3 : 1.0;
        const dragMag = (cls.drag + speed * 0.08 + dmgDrag + wetDrag) * dragMult;

        this._accVec.set(0, GRAVITY, 0)
            .add(this._thrustVec)
            .addScaledVector(this.velocity, -dragMag);

        if (this.position.y < 2.8 && input.throttle > 0.05) {
            const gef = Math.max(0, (2.8 - this.position.y) / 2.8);
            this._accVec.y += gef * gef * cls.groundEffMult * input.throttle * 18;
        }

        this.velocity.addScaledVector(this._accVec, dt);
    }

    // ── Черепаший режим ───────────────────────────────────────────────

    _updateTurtle(input, dt) {
        const { pitchInput, rollInput, throttle } = input;

        if (Math.abs(rollInput) > 0.5 || Math.abs(pitchInput) > 0.5) {
            this.angularVelocity.x += pitchInput * 0.12;
            this.angularVelocity.z -= rollInput * 0.12;
        }
        this.angularVelocity.multiplyScalar(0.88);
        this._integrateRotation(dt);
        this._updateWorldVectors();

        const curEuler = this._eulerLocal.setFromQuaternion(this.quaternion, 'YXZ');
        const isUpright = Math.abs(curEuler.x) < 0.22 && Math.abs(curEuler.z) < 0.22;

        if (isUpright && throttle < 0.1) {
            this.turtleMode = false;
            this.isCrashed = false;
            this.health = 30;
            this.propDamage = [0, 0, 0, 0];
            this._pidAngle.reset();
            this._pidYaw.reset();
        }
    }

    // ══════════════════════════════════════════════════════════════════
    // ГЛАВНЫЙ UPDATE
    // ══════════════════════════════════════════════════════════════════

    update(dt, input, config, colliders = [], altHoldTarget = null) {
        const cls = this.classData;

        const newClass = config.droneClass || DEFAULT_DRONE_CLASS;
        if (newClass !== this.droneClass) {
            this.droneClass = newClass;
        }

        if (config.droneMode) this.flightMode = config.droneMode;
        if (config.physicsMode) this.physicsMode = config.physicsMode; // Обновляем режим извне

        if (this.isCrashed && !this.turtleMode) {
            this.velocity.y -= 42 * dt;
            this.position.addScaledVector(this.velocity, dt);
            if (this.position.y < 0.1) {
                this.position.y = 0.1;
                this.velocity.set(0, 0, 0);
            }
            this.resolveCollisions(colliders);
            this._syncBody();
            return null;
        }

        if (this.turtleMode) {
            this._updateTurtle(input, dt);
            this._syncBody();
            return null;
        }

        this._updateWind(dt, config.weather);

        const brokenCount = this.propDamage.filter(d => d > 0).length;
        const instability = (100 - this.health) * 0.00009
            + brokenCount * (Math.random() - 0.5) * 0.010
            + (this.health < 40 ? (Math.random() - 0.5) * 0.005 : 0);

        if (this.flightMode === 'acro') {
            this._updateAcroMode(input, config, dt);
        } else {
            this._updateAngleMode(input, config, dt);
        }

        this.angularVelocity.x += instability;
        this.angularVelocity.z += instability;

        this._integrateRotation(dt);
        this._updateWorldVectors();

        if (this.safetyMode && this.flightMode !== 'acro') {
            const safeLimit = THREE.MathUtils.degToRad(cls.maxTiltDeg * 0.52);
            const curEuler = this._eulerLocal.setFromQuaternion(this.quaternion, 'YXZ');
            curEuler.x = THREE.MathUtils.clamp(curEuler.x, -safeLimit, safeLimit);
            curEuler.z = THREE.MathUtils.clamp(curEuler.z, -safeLimit, safeLimit);
            this.quaternion.setFromEuler(curEuler);
            this._updateWorldVectors();
        }

        this._applyThrust(input, config, dt);

        if (this.flightMode !== 'acro') {
            if (Math.abs(input.pitchInput) < 0.05 && Math.abs(input.rollInput) < 0.05) {
                // В аркадном режиме дрон тормозит горизонтально очень резко, как машина
                const damp = this.physicsMode === 'arcade' ? 0.85 : 0.965;
                this.velocity.x *= damp;
                this.velocity.z *= damp;
            }
        }

        this.velocity.addScaledVector(this._windVec, dt);
        this.velocity.addScaledVector(this._turbVec, dt);

        const sportMult = this.flightMode === 'sport' ? 1.6 : this.flightMode === 'acro' ? 2.2 : 1.0;
        // В аркаде увеличиваем лимит скорости в 1.5 раза
        const arcadeMult = this.physicsMode === 'arcade' ? 1.5 : 1.0;
        const maxSpeed = cls.speedLimit * sportMult * arcadeMult;

        if (this.velocity.length() > maxSpeed)
            this.velocity.setLength(maxSpeed);

        const prevY = this.position.y;
        this.position.addScaledVector(this.velocity, dt);

        if (this.position.y < 0.1) {
            this.position.y = 0.1;
            if (this.velocity.y < -4 && !this.isCrashed) {
                const dmg = Math.abs(this.velocity.y) * 1.6;
                this.health -= dmg;
                if (this.health <= 0) {
                    this._triggerCrash();
                }
            }
            if (this.velocity.y < 0) {
                if (Math.abs(this.velocity.y) > 2) this._onLand(Math.abs(this.velocity.y));
                this.velocity.y = 0;
            }
            const fric = config.weather === 'snow' ? 0.98 : config.weather === 'rain' ? 0.95 : 0.82;
            this.velocity.x *= fric;
            this.velocity.z *= fric;

            if (this.flightMode !== 'acro') altHoldTarget = 0.1;
        }

        this.resolveCollisions(colliders);
        this._resolveSceneColliders(prevY, dt);

        // ── Батарея ───────────────────────────────────────────────────
        // Простой жрёт совсем чуть-чуть (хватит на ~30 минут простоя)
        const idleDrain = 0.05 * dt;

        // Моторы жрут больше (хватит на ~10-15 минут полёта в зависимости от газа)
        // Коэффициент (1300 / cls.batteryCapacity) делает так, что 
        // TinyWhoop с батареей 250mAh садится так же, как Freestyle 5" с 1300mAh
        const motorDrain = input.throttle * dt * (1300 / cls.batteryCapacity) * 0.10;

        this.battery = Math.max(0, this.battery - (idleDrain + motorDrain));

        // Если батарея села — дрон камнем падает вниз
        if (this.battery === 0 && !this.isCrashed) {
            this.isCrashed = true;
            this.health = 0;
            this.angularVelocity.set(0, 0, 0);
            altHoldTarget = null;
        }

        this._syncBody();

        return altHoldTarget;
    }

    // ── Телеметрия ────────────────────────────────────────────────────

    getTelemetry() {
        const euler = this._eulerLocal.setFromQuaternion(this.quaternion, 'YXZ');
        return {
            posX: this.position.x,
            posY: this.position.y,
            posZ: this.position.z,
            velX: this.velocity.x,
            velY: this.velocity.y,
            velZ: this.velocity.z,
            speed: this.velocity.length(),
            pitch: THREE.MathUtils.radToDeg(euler.x),
            yaw: THREE.MathUtils.radToDeg(euler.y),
            roll: THREE.MathUtils.radToDeg(euler.z),
            health: this.health,
            battery: this.battery,
            crashed: this.isCrashed,
            turtle: this.turtleMode,
            propDmg: [...this.propDamage],
            altHold: this._altHoldActive,
            safety: this.safetyMode,
            mode: this.flightMode,
            physicsMode: this.physicsMode, // Передаем состояние физики в UI
            class: this.droneClass,
            windX: this._windVec.x,
            windZ: this._windVec.z,
        };
    }
}