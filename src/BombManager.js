import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { BOMB_GRAVITY } from './config/constants.js';

export class BombManager {
    constructor(scene, droneState) {
        this.scene = scene;
        this.droneState = droneState;
        this.bomb = {
            attached: false, dropped: false, exploded: false,
            mesh: null,
            velocity: new THREE.Vector3(),
            position: new THREE.Vector3(),
            particles: [],
            shockwave: null, shockwaveAge: 0,
            flashAge: 0,
            pointLight: null,
        };
    }

    createBombMesh() {
        const g = new THREE.Group();
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a3a1a });
        const noseMat = new THREE.MeshLambertMaterial({ color: 0x1a2a10 });
        const finMat  = new THREE.MeshLambertMaterial({ color: 0x3a4a2a });
        const bandMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.55, 10), bodyMat);
        g.add(body);
        const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 10), noseMat);
        nose.position.y = -0.38; nose.rotation.z = Math.PI; g.add(nose);
        for (let i = 0; i < 4; i++) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.12), finMat);
            fin.position.y = 0.28;
            fin.position.x = Math.sin(i * Math.PI / 2) * 0.17;
            fin.position.z = Math.cos(i * Math.PI / 2) * 0.17;
            g.add(fin);
        }
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.06, 10), bandMat);
        band.position.y = 0.1; g.add(band);
        g.scale.setScalar(0.5);
        g.rotation.x = Math.PI;
        return g;
    }

    armBomb() {
        if (!this.bomb.attached && !this.bomb.dropped) {
            this.bomb.mesh = this.createBombMesh();
            this.scene.add(this.bomb.mesh);
            this.bomb.attached = true;
            this.bomb.exploded = false;
        }
    }

    dropBomb() {
        if (this.bomb.attached && this.bomb.mesh) {
            this.bomb.attached = false;
            this.bomb.dropped = true;
            this.bomb.exploded = false;
            this.bomb.position.copy(this.bomb.mesh.position);
            // Наследуем velocity дрона из синхронизированного THREE-вектора
            this.bomb.velocity.copy(this.droneState.velocity);
        }
    }

    spawnExplosion(pos) {
        this.bomb.flashAge = 0.5;

        // ── Точечный свет взрыва ──
        if (this.bomb.pointLight) this.scene.remove(this.bomb.pointLight);
        this.bomb.pointLight = new THREE.PointLight(0xff6600, 25, 80);
        this.bomb.pointLight.position.copy(pos);
        this.scene.add(this.bomb.pointLight);

        // ── Ударная волна ──
        if (this.bomb.shockwave) this.scene.remove(this.bomb.shockwave);
        this.bomb.shockwave = new THREE.Mesh(
            new THREE.TorusGeometry(0.5, 0.22, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
        );
        this.bomb.shockwave.position.copy(pos);
        this.bomb.shockwave.rotation.x = Math.PI / 2;
        this.scene.add(this.bomb.shockwave);
        this.bomb.shockwaveAge = 0;

        // ── Частицы (огонь + дым) ──
        for (let i = 0; i < 60; i++) {
            const isSmoke = i > 35;
            const size = isSmoke ? 0.55 + Math.random() * 1.1 : 0.12 + Math.random() * 0.45;
            const color = isSmoke ? 0x333333 : (Math.random() < 0.5 ? 0xff4400 : 0xffaa00);
            const pm = new THREE.Mesh(
                new THREE.SphereGeometry(size, 4, 4),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isSmoke ? 0.65 : 0.95 })
            );
            pm.position.copy(pos);
            const spd = isSmoke ? 1.5 + Math.random() * 3.5 : 6 + Math.random() * 18;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;
            const vel = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta) * spd,
                Math.abs(Math.cos(phi)) * spd * (isSmoke ? 1.8 : 1.0),
                Math.sin(phi) * Math.sin(theta) * spd
            );
            this.scene.add(pm);
            this.bomb.particles.push({ mesh: pm, vel, life: 1.0, isSmoke });
        }

        // ── Воздействие на дрон через Cannon impulse ──────────────────────────
        const dp  = this.droneState.position;
        const dist = dp.distanceTo(pos);
        if (dist < 22 && this.droneState.body) {
            const forceScale = (1 - dist / 22) * 28 * this.droneState.classData.mass;
            const dir = new THREE.Vector3().subVectors(dp, pos).normalize();
            const impulse = new CANNON.Vec3(
                dir.x * forceScale,
                Math.abs(dir.y) * forceScale * 1.5 + 4,
                dir.z * forceScale
            );
            this.droneState.body.applyImpulse(impulse, this.droneState.body.position);

            if (dist < 6) {
                const dmg = 55 * (1 - dist / 6);
                this.droneState.health = Math.max(0, this.droneState.health - dmg);
                if (this.droneState.health <= 0) {
                    this.droneState.isCrashed = true;
                    this.droneState.health = 0;
                }
            }
        }
    }

    update(delta, colliders, playCrash) {
        // ── Обновление частиц ──
        for (let i = this.bomb.particles.length - 1; i >= 0; i--) {
            const p = this.bomb.particles[i];
            p.life -= delta * (p.isSmoke ? 0.45 : 1.1);
            if (p.life <= 0) { this.scene.remove(p.mesh); this.bomb.particles.splice(i, 1); continue; }
            p.vel.y -= 4.5 * delta;
            p.vel.multiplyScalar(1 - delta * (p.isSmoke ? 0.25 : 0.8));
            p.mesh.position.addScaledVector(p.vel, delta);
            p.mesh.material.opacity = p.isSmoke ? p.life * 0.6 : p.life * 0.9;
            if (p.isSmoke) p.mesh.scale.addScalar(delta * 1.2);
        }

        // ── Ударная волна ──
        if (this.bomb.shockwave) {
            this.bomb.shockwaveAge += delta;
            this.bomb.shockwave.scale.setScalar(1 + this.bomb.shockwaveAge * 28);
            this.bomb.shockwave.material.opacity = Math.max(0, 0.9 - this.bomb.shockwaveAge * 2.8);
            if (this.bomb.shockwaveAge > 0.32) { this.scene.remove(this.bomb.shockwave); this.bomb.shockwave = null; }
        }

        // ── Угасание света ──
        if (this.bomb.pointLight) {
            this.bomb.pointLight.intensity -= delta * 80;
            if (this.bomb.pointLight.intensity <= 0) { this.scene.remove(this.bomb.pointLight); this.bomb.pointLight = null; }
        }

        if (this.bomb.flashAge > 0) this.bomb.flashAge -= delta;

        // ── Бомба прикреплена к дрону ──
        if (this.bomb.attached && this.bomb.mesh) {
            const off = new THREE.Vector3(0, -0.55, 0.1);
            off.applyEuler(this.droneState.rotation);
            this.bomb.mesh.position.copy(this.droneState.position).add(off);
            this.bomb.mesh.rotation.copy(this.droneState.rotation);
            this.bomb.mesh.rotation.x += Math.PI;
            return;
        }

        // ── Физика падения бомбы ──
        if (this.bomb.dropped && this.bomb.mesh && !this.bomb.exploded) {
            this.bomb.velocity.y -= BOMB_GRAVITY * delta;
            this.bomb.position.addScaledVector(this.bomb.velocity, delta);
            this.bomb.mesh.position.copy(this.bomb.position);
            this.bomb.mesh.rotation.x += delta * 2.2;

            let hit = this.bomb.position.y <= 0.25;
            if (!hit) {
                for (const c of colliders) {
                    const dx = this.bomb.position.x - c.cx;
                    const dy = this.bomb.position.y - c.cy;
                    const dz = this.bomb.position.z - c.cz;
                    if (Math.abs(dx) < c.hw + 0.5 && Math.abs(dy) < c.hh + 0.5 && Math.abs(dz) < c.hd + 0.5) {
                        hit = true; break;
                    }
                }
            }

            if (hit) {
                this.bomb.exploded = true;
                this.bomb.dropped = false;
                this.scene.remove(this.bomb.mesh);
                this.bomb.mesh = null;
                this.spawnExplosion(this.bomb.position.clone());
                if (playCrash) playCrash();
            }
        }
    }
}
