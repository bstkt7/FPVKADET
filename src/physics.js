import * as THREE from 'three';
import { playCrash, playLand } from './audio.js';
import { SPAWN_POS, SPAWN_ROT } from './config/constants.js';

// ── Классы дронов ─────────────────────────────────────────────────────────────
export const DRONE_CLASSES = {
    tiny_whoop: {
        label: 'Tiny Whoop',
        desc: '65мм, ~30г — квартирный акробат',
        mass: 0.030,
        thrustNorm: 10.0,
        inertia: 0.55,
        drag: 1.6,
        maxTiltDeg: 55,
        angularDamping: 0.72,
        speedLimit: 28,
        groundEffectMult: 2.4,
        batteryCapacity: 250,
        defaultPID: { pP: 0.22, pI: 0.03, pD: 0.60, rP: 0.22, rD: 0.60, yP: 0.20 },
        acroRateScale: 1.4,
    },
    freestyle_5: {
        label: '5" Freestyle',
        desc: '5 дюймов, ~250г — классический FPV',
        mass: 0.250,
        thrustNorm: 22.0,
        inertia: 1.0,
        drag: 0.9,
        maxTiltDeg: 60,
        angularDamping: 0.82,
        speedLimit: 65,
        groundEffectMult: 1.0,
        batteryCapacity: 1300,
        defaultPID: { pP: 0.18, pI: 0.02, pD: 0.55, rP: 0.18, rD: 0.55, yP: 0.16 },
        acroRateScale: 1.0,
    },
    heavy_sync: {
        label: 'Heavy Sync',
        desc: '7" синевуп, ~600г — стабильный крейсер',
        mass: 0.600,
        thrustNorm: 38.0,
        inertia: 2.2,
        drag: 0.55,
        maxTiltDeg: 40,
        angularDamping: 0.89,
        speedLimit: 50,
        groundEffectMult: 1.5,
        batteryCapacity: 2200,
        defaultPID: { pP: 0.13, pI: 0.012, pD: 0.42, rP: 0.13, rD: 0.42, yP: 0.11 },
        acroRateScale: 0.65,
    },
};

export const DEFAULT_DRONE_CLASS = 'freestyle_5';

// Заглушки для совместимости с engine.js (Cannon-es не используется в этой версии)
export let sharedWorld = null;
export let groundMaterial = null;

export class DronePhysics {
    constructor({ onCrash, onLand } = {}) {
        this._onCrash = onCrash || (() => {});
        this._onLand  = onLand  || (() => {});

        this.position        = new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z);
        this.velocity        = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();
        this.rotation        = new THREE.Euler(SPAWN_ROT.x, SPAWN_ROT.y, SPAWN_ROT.z, 'YXZ');
        this.maxTilt         = THREE.MathUtils.degToRad(65);

        this.health     = 100;
        this.battery    = 100;
        this.turtleMode = false;
        this.isCrashed  = false;
        this.propDamage = [0, 0, 0, 0];

        this.droneClass = DEFAULT_DRONE_CLASS;

        // PID интеграторы
        this._pidIntX = 0;
        this._pidIntZ = 0;

        // Ветер
        this._windVec       = new THREE.Vector3();
        this._turbulenceVec = new THREE.Vector3();
        this._windTime      = 0;

        // Temp vectors (без аллокаций в hot-path)
        this._up     = new THREE.Vector3();
        this._acc    = new THREE.Vector3();
        this._tmpVec = new THREE.Vector3();

        // Фиктивное body для совместимости с BombManager (applyImpulse)
        this.body = {
            position:        this.position,
            velocity:        this.velocity,
            angularVelocity: this.angularVelocity,
            quaternion:      { set: () => {} },
            applyImpulse: (impulse) => {
                // Переводим Cannon-вектор в THREE-скорость
                this.velocity.x += impulse.x / (this.classData.mass || 0.25);
                this.velocity.y += impulse.y / (this.classData.mass || 0.25);
                this.velocity.z += impulse.z / (this.classData.mass || 0.25);
            },
        };
    }

    get classData() {
        return DRONE_CLASSES[this.droneClass] || DRONE_CLASSES[DEFAULT_DRONE_CLASS];
    }

    // ── Сброс в произвольную точку (вызывается из engine.js) ──────────────
    resetAt(pos, rot) {
        this.position.set(pos.x ?? SPAWN_POS.x, pos.y ?? SPAWN_POS.y, pos.z ?? SPAWN_POS.z);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);

        if (rot) {
            const euler = rot instanceof THREE.Euler
                ? rot
                : new THREE.Euler(rot.x || 0, rot.y || 0, rot.z || 0);
            this.rotation.copy(euler);
        } else {
            this.rotation.set(0, 0, 0);
        }

        this.health     = 100;
        this.battery    = 100;
        this.isCrashed  = false;
        this.turtleMode = false;
        this.propDamage = [0, 0, 0, 0];
        this._pidIntX   = 0;
        this._pidIntZ   = 0;

        // Синхронизируем фиктивное body
        this.body.position        = this.position;
        this.body.velocity        = this.velocity;
        this.body.angularVelocity = this.angularVelocity;
    }

    reset() {
        this.resetAt(
            { x: SPAWN_POS.x, y: SPAWN_POS.y, z: SPAWN_POS.z },
            new THREE.Euler(SPAWN_ROT.x, SPAWN_ROT.y, SPAWN_ROT.z)
        );
    }

    dispose() {
        // Аркадная физика — нечего чистить
    }

    // ── Ветер ──────────────────────────────────────────────────────────────
    _updateWind(delta, config) {
        this._windTime += delta;
        const t = this._windTime;

        const wp = config.weather === 'rain' ? 5.5
                 : config.weather === 'snow' ? 7.5
                 : 2.5;

        const wx = Math.sin(t * 0.13) * 0.7 + Math.sin(t * 0.07 + 1.3) * 0.3;
        const wz = Math.cos(t * 0.11) * 0.7 + Math.cos(t * 0.09 + 0.7) * 0.3;
        this._windVec.set(wx, 0, wz).normalize().multiplyScalar(wp);

        // Турбулентность
        const ts = config.weather === 'snow' ? 2.0 : config.weather === 'rain' ? 1.3 : 0.55;
        const f  = 4.8;
        this._turbulenceVec.set(
            (Math.sin(t * f + 1.1) + Math.sin(t * f * 2.3)) * 0.5,
             Math.sin(t * f * 1.7 + 2.0) * 0.3,
            (Math.cos(t * f + 0.3) + Math.cos(t * f * 1.9)) * 0.5,
        ).multiplyScalar(ts);
    }

    _getThrustFactor() {
        return this.propDamage.filter(d => d === 0).length / 4;
    }

    _getPropAsymmetry() {
        const d = this.propDamage;
        return {
            rollBias:  ((d[0] + d[2]) - (d[1] + d[3])) * 0.25,
            pitchBias: ((d[0] + d[1]) - (d[2] + d[3])) * 0.25,
        };
    }

    // ── Коллизии (аркадный AABB) ───────────────────────────────────────────
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
            if (ox < oy && ox < oz)      nx = Math.sign(lx) * ox;
            else if (oy < ox && oy < oz) ny = Math.sign(ly) * oy;
            else                         nz = Math.sign(lz) * oz;

            const cosF = Math.cos(c.rotY), sinF = Math.sin(c.rotY);
            p.x += cosF * nx - sinF * nz;
            p.y += ny;
            p.z += sinF * nx + cosF * nz;

            let impactSpeed = 0;
            if (Math.abs(ny) > 0)
                impactSpeed = Math.abs(this.velocity.y);
            if (Math.abs(nx) > 0 || Math.abs(nz) > 0)
                impactSpeed = Math.hypot(this.velocity.x, this.velocity.z);

            if (impactSpeed > 2 && !this.turtleMode) {
                this.health -= impactSpeed * 0.5;
                this._onCrash();

                if (impactSpeed > 3.5) {
                    const idx = Math.floor(Math.random() * 4);
                    if (this.propDamage[idx] === 0 && Math.random() < impactSpeed * 0.07)
                        this.propDamage[idx] = 1;
                }
            }

            if (Math.abs(ny) > 0) {
                this.velocity.y *= -0.15;
            }
            if (Math.abs(nx) > 0 || Math.abs(nz) > 0) {
                this.velocity.x *= 0.3;
                this.velocity.z *= 0.3;
            }
        }

        if (this.health <= 0 && !this.isCrashed) {
            this.isCrashed = true;
            this.health = 0;
            this.propDamage = [1, 1, 1, 1];
            this.angularVelocity.set(0, 0, 0);
            const isUpsideDown = Math.abs(this.rotation.x) > Math.PI / 2
                              || Math.abs(this.rotation.z) > Math.PI / 2;
            if (isUpsideDown) this.turtleMode = true;
        }
    }

    // ── Главный update ─────────────────────────────────────────────────────
    update(delta, input, config, colliders, altHoldTarget) {
        const cls = this.classData;

        // Смена класса дрона на лету
        if ((config.droneClass || DEFAULT_DRONE_CLASS) !== this.droneClass) {
            this.droneClass = config.droneClass || DEFAULT_DRONE_CLASS;
        }

        // ── Краш без черепашьего режима ────────────────────────────────────
        if (this.isCrashed && !this.turtleMode) {
            this.velocity.y -= 42 * delta;
            this.position.addScaledVector(this.velocity, delta);
            if (this.position.y < 0.1) {
                this.position.y = 0.1;
                this.velocity.set(0, 0, 0);
            }
            this.resolveCollisions(colliders);
            return null;
        }

        let { yawInput, pitchInput, rollInput, throttle, gamepadConnected } = input;

        // ── Turtle Mode ────────────────────────────────────────────────────
        if (this.turtleMode) {
            if (Math.abs(rollInput) > 0.5 || Math.abs(pitchInput) > 0.5) {
                this.angularVelocity.x += pitchInput * 0.1;
                this.angularVelocity.z -= rollInput  * 0.1;
            }
            this.angularVelocity.multiplyScalar(0.9);
            this.rotation.x += this.angularVelocity.x;
            this.rotation.z += this.angularVelocity.z;

            const isUpright = Math.abs(this.rotation.x) < 0.2 && Math.abs(this.rotation.z) < 0.2;
            if (isUpright && throttle < 0.1) {
                this.turtleMode = false;
                this.isCrashed  = false;
                this.health     = 30;
                this.propDamage = [0, 0, 0, 0];
                this._pidIntX   = 0;
                this._pidIntZ   = 0;
            }
            return null;
        }

        const GRAVITY   = config.weather === 'snow' ? -35 : -42;
        const isAngle   = config.droneMode === 'angle' || config.droneMode === 'sport';
        const pitchSign = config.invertPitch ? -1 : 1;
        const gpScale   = gamepadConnected ? 0.5 : 1.0;
        const sensScale = config.flightMode === 'heavy' ? 0.6
                        : config.flightMode === 'light' ? 1.15
                        : 0.88;

        const pid = (config.pid && config.pid._fromClass === this.droneClass)
            ? config.pid
            : cls.defaultPID;

        const thrustFactor = this._getThrustFactor();
        const { rollBias, pitchBias } = this._getPropAsymmetry();

        // Нестабильность от урона
        const brokenCount = this.propDamage.filter(d => d > 0).length;
        let instability = (100 - this.health) * 0.00008
            + brokenCount * (Math.random() - 0.5) * 0.009;
        if (this.health < 40) instability += (Math.random() - 0.5) * 0.004;

        this._updateWind(delta, config);

        let newAltHoldTarget = altHoldTarget;

        if (isAngle) {
            // ── ANGLE / SPORT ──────────────────────────────────────────────
            const sportMult = config.droneMode === 'sport' ? 1.8 : 1.0;
            const maxA = THREE.MathUtils.degToRad(cls.maxTiltDeg * 0.6 * sportMult);

            const targetPitch = -pitchInput * maxA * sensScale * pitchSign + pitchBias * 0.15;
            const targetRoll  =  rollInput  * maxA * sensScale             + rollBias  * 0.15;

            const errP = targetPitch - this.rotation.x;
            const errR = targetRoll  - this.rotation.z;

            this._pidIntX = THREE.MathUtils.clamp(this._pidIntX + errP * delta, -0.25, 0.25);
            this._pidIntZ = THREE.MathUtils.clamp(this._pidIntZ + errR * delta, -0.25, 0.25);

            const avxCmd = errP * pid.pP + this._pidIntX * pid.pI - this.angularVelocity.x * pid.pD;
            const avzCmd = errR * pid.rP + this._pidIntZ * pid.pI - this.angularVelocity.z * pid.rD;

            const angLerp = 0.35 / cls.inertia;
            this.angularVelocity.x += (avxCmd - this.angularVelocity.x) * angLerp + instability;
            this.angularVelocity.z += (avzCmd - this.angularVelocity.z) * angLerp + instability;
            this.angularVelocity.y -= yawInput * pid.yP * sensScale * gpScale;
            this.angularVelocity.multiplyScalar(cls.angularDamping - 0.05);

            this.rotation.x = THREE.MathUtils.clamp(this.rotation.x + this.angularVelocity.x, -this.maxTilt, this.maxTilt);
            this.rotation.z = THREE.MathUtils.clamp(this.rotation.z + this.angularVelocity.z, -this.maxTilt, this.maxTilt);
            this.rotation.y += this.angularVelocity.y;

            this._up.set(0, 1, 0).applyEuler(this.rotation);

            // Дедзона для altitude hold
            const inDB = Math.abs(throttle - 0.5) < 0.06;
            if (inDB) { if (newAltHoldTarget === null) newAltHoldTarget = this.position.y; }
            else newAltHoldTarget = null;

            const thrustBase = (throttle / 0.5) * (-GRAVITY) * (cls.thrustNorm / 22.0);
            let thrustScalar;
            if (inDB && newAltHoldTarget !== null) {
                thrustScalar = -GRAVITY * (cls.thrustNorm / 22.0)
                    + (newAltHoldTarget - this.position.y) * 8.0
                    - this.velocity.y * 4.0;
            } else {
                thrustScalar = thrustBase;
            }
            thrustScalar *= thrustFactor;

            const dragMag = cls.drag + this.velocity.length() * 0.10 + (100 - this.health) * 0.004;
            this._acc.copy(this._up).multiplyScalar(thrustScalar)
                .add(this._tmpVec.set(0, GRAVITY, 0))
                .addScaledVector(this.velocity, -dragMag);

            // Ground effect
            if (this.position.y < 2.5 && throttle > 0.05) {
                const gef = Math.max(0, (2.5 - this.position.y) / 2.5);
                this._acc.y += gef * gef * cls.groundEffectMult * throttle * 18;
            }

            this.velocity.addScaledVector(this._acc, delta);

            if (Math.abs(pitchInput) < 0.05 && Math.abs(rollInput) < 0.05) {
                this.velocity.x *= 0.96;
                this.velocity.z *= 0.96;
            }

        } else {
            // ── ACRO ───────────────────────────────────────────────────────
            newAltHoldTarget = null;
            const rateScale = (cls.acroRateScale || 1.0) * sensScale * gpScale * 2.0;

            this.angularVelocity.x +=  pitchInput * pid.pP * 0.025 * rateScale * pitchSign + instability;
            this.angularVelocity.z -= rollInput  * pid.rP * 0.025 * rateScale + instability;
            this.angularVelocity.y -= yawInput   * pid.yP * 0.018 * sensScale * gpScale + instability;
            this.angularVelocity.multiplyScalar(cls.angularDamping);

            this.rotation.x = THREE.MathUtils.clamp(this.rotation.x + this.angularVelocity.x, -this.maxTilt, this.maxTilt);
            this.rotation.z = THREE.MathUtils.clamp(this.rotation.z + this.angularVelocity.z, -this.maxTilt, this.maxTilt);
            this.rotation.y += this.angularVelocity.y;

            this._up.set(0, 1, 0).applyEuler(this.rotation);

            const rainDrag    = config.weather === 'rain' ? 0.2 : 0;
            const thrustScalar = (throttle / 0.5) * (-GRAVITY) * (cls.thrustNorm / 22.0) * thrustFactor;
            const dragMag = cls.drag + this.velocity.length() * 0.10 + (100 - this.health) * 0.004 + rainDrag;

            this._acc.copy(this._up).multiplyScalar(thrustScalar)
                .add(this._tmpVec.set(0, GRAVITY, 0))
                .addScaledVector(this.velocity, -dragMag);

            if (this.position.y < 2.5 && throttle > 0.1) {
                const gef = Math.max(0, (2.5 - this.position.y) / 2.5);
                this._acc.y += gef * gef * cls.groundEffectMult * throttle * 18;
            }

            this.velocity.addScaledVector(this._acc, delta);
        }

        // ── Ветер + турбулентность ─────────────────────────────────────────
        this.velocity.addScaledVector(this._windVec,       delta);
        this.velocity.addScaledVector(this._turbulenceVec, delta);

        // ── Ограничение скорости ───────────────────────────────────────────
        const sportMult = config.droneMode === 'sport' ? 1.6 : (config.droneMode === 'acro' ? 2.2 : 1.0);
        if (this.velocity.length() > cls.speedLimit * sportMult)
            this.velocity.setLength(cls.speedLimit * sportMult);

        this.position.addScaledVector(this.velocity, delta);

        // ── Земля ──────────────────────────────────────────────────────────
        if (this.position.y < 0.1) {
            this.position.y = 0.1;
            if (this.velocity.y < -5 && !this.isCrashed) {
                this.health -= Math.abs(this.velocity.y) * 1.5;
                if (this.health <= 0) {
                    this.isCrashed = true;
                    this.health = 0;
                    this.propDamage = [1, 1, 1, 1];
                    this._onCrash();
                }
            }
            if (this.velocity.y < 0) {
                if (Math.abs(this.velocity.y) > 2) this._onLand(Math.abs(this.velocity.y));
                this.velocity.y = 0;
            }
            const fric = config.weather === 'snow' ? 0.98 : config.weather === 'rain' ? 0.95 : 0.85;
            this.velocity.x *= fric;
            this.velocity.z *= fric;
            if (isAngle) newAltHoldTarget = 0.1;
        }

        // ── Батарея ────────────────────────────────────────────────────────
        const batteryDrain = throttle * delta * (250 / cls.batteryCapacity) * 0.05;
        this.battery = Math.max(0, this.battery - batteryDrain);
        if (this.battery === 0 && !this.isCrashed) {
            this.isCrashed = true;
            this.health = 0;
            this.angularVelocity.set(0, 0, 0);
            newAltHoldTarget = null;
        }

        // ── AABB коллизии ────────────────────────────────────────────────
        this.resolveCollisions(colliders);

        // Синхронизация фиктивного body для BombManager
        this.body.position        = this.position;
        this.body.velocity        = this.velocity;
        this.body.angularVelocity = this.angularVelocity;

        return newAltHoldTarget;
    }
}