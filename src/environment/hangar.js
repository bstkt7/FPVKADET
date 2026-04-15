import * as THREE from 'three';

/** Детерминированный PRNG */
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ── Прямой коридор-ангар с препятствиями ─────────────────────────────────────
//   Коридор ориентирован вдоль оси Z, открытые торцы (вход / выход).
//   Ширина 20 м, высота 12 м, длина 120 м.
export function createUHangar(scene, colliders, hx, hz, rotY = 0) {
    const group = new THREE.Group();
    group.position.set(hx, 0, hz);
    group.rotation.y = rotY;

    const isSnow = scene.userData.weather === 'snow';

    const wallMat   = new THREE.MeshLambertMaterial({ color: isSnow ? 0x8899aa : 0x606870 });
    const roofMat   = new THREE.MeshLambertMaterial({ color: isSnow ? 0xd0dde8 : 0x484f55 });
    const floorMat  = new THREE.MeshLambertMaterial({ color: 0x3a3a40 });
    const lampMat   = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
    const boxMat    = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x2a3a4a });
    const metalMat  = new THREE.MeshLambertMaterial({ color: 0x909090 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.7 });
    const dangerMat = new THREE.MeshLambertMaterial({ color: 0xdd3322 });

    const L = 120; // длина коридора
    const W = 20;  // ширина
    const H = 12;  // высота

    // ── Пол ─────────────────────────────────────────────────────────────────
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W, 0.2, L), floorMat);
    floor.position.set(0, 0.1, 0);
    group.add(floor);

    // ── Разметка пола (центральная полоса) ──────────────────────────────────
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, L), stripeMat);
    centerLine.position.set(0, 0.21, 0);
    group.add(centerLine);

    // Боковые полосы
    for (const sx of [-W / 2 + 1.2, W / 2 - 1.2]) {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, L), stripeMat);
        sl.position.set(sx, 0.21, 0);
        group.add(sl);
    }

    // ── Стены (левая и правая, без торцов) ──────────────────────────────────
    for (const sx of [-W / 2, W / 2]) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.5, H, L), wallMat);
        wall.position.set(sx, H / 2, 0);
        group.add(wall);
    }

    // ── Крыша ───────────────────────────────────────────────────────────────
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W, 0.6, L), roofMat);
    roof.position.set(0, H, 0);
    group.add(roof);

    // ── Фермы крыши (поперечные балки) ──────────────────────────────────────
    for (let zi = -50; zi <= 50; zi += 20) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.4, 0.4), metalMat);
        beam.position.set(0, H - 0.3, zi);
        group.add(beam);
        // вертикальные стойки под балками
        for (const sx of [-W / 2 + 0.5, W / 2 - 0.5]) {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, H, 8), metalMat);
            pole.position.set(sx, H / 2, zi);
            group.add(pole);
        }
    }

    // ── Лампы ───────────────────────────────────────────────────────────────
    const lampZs = [-50, -25, 0, 25, 50];
    for (const lz of lampZs) {
        for (const lx of [-W / 4, W / 4]) {
            const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), lampMat);
            lamp.position.set(lx, H - 0.4, lz);
            group.add(lamp);
            const light = new THREE.PointLight(0xfffadd, 1.0, 28);
            light.position.set(lx, H - 0.4, lz);
            group.add(light);
        }
    }

    // ── Препятствия ─────────────────────────────────────────────────────────
    const rng = mulberry32(42);

    // Хранить препятствия для коллайдеров
    const obs = []; // { lx, ly, lz, w, h, d }

    function addBox(lx, lz, w, h, d) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), boxMat);
        mesh.position.set(lx, h / 2 + 0.2, lz);
        group.add(mesh);
        obs.push({ lx, ly: h / 2 + 0.2, lz, w, h, d });
    }
    function addBarrel(lx, lz) {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), barrelMat);
        mesh.position.set(lx, 0.75, lz);
        group.add(mesh);
        obs.push({ lx, ly: 0.75, lz, w: 0.9, h: 1.1, d: 0.9 });
    }

    // Красно-белые стойки-препятствия (вертикальные трубы посередине)
    function addPole(lx, lz) {
        const mat = rng() > 0.5 ? dangerMat : metalMat;
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, H * 0.7, 8), mat);
        mesh.position.set(lx, H * 0.35, lz);
        group.add(mesh);
        obs.push({ lx, ly: H * 0.35, lz, w: 0.5, h: H * 0.7, d: 0.5 });
    }

    // Стена-ширма (частичная, с проходом)
    function addWallBarrier(lz, gapFrom, gapTo) {
        // Левый кусок
        const leftW = (W / 2 + gapFrom) - 0.5;
        if (leftW > 0.2) {
            const lx = -W / 2 + 0.5 + leftW / 2;
            const bh = 6 + rng() * 3;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(leftW, bh, 0.5), wallMat);
            mesh.position.set(lx, bh / 2, lz);
            group.add(mesh);
            obs.push({ lx, ly: bh / 2, lz, w: leftW, h: bh, d: 0.5 });
        }
        // Правый кусок
        const rightW = (W / 2 - gapTo) - 0.5;
        if (rightW > 0.2) {
            const lx = gapTo + rightW / 2;
            const bh = 6 + rng() * 3;
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(rightW, bh, 0.5), wallMat);
            mesh.position.set(lx, bh / 2, lz);
            group.add(mesh);
            obs.push({ lx, ly: bh / 2, lz, w: rightW, h: bh, d: 0.5 });
        }
    }

    // ── Расстановка препятствий по длине ─────────────────────────────────────

    // Секция 1: z≈-45 — стена с проходом слева
    addWallBarrier(-45, -8, 1);

    // Секция 2: z≈-30 — кластер ящиков и бочек у стен
    addBox(-W / 2 + 2,   -30, 1.5, 2.0, 1.5);
    addBox(-W / 2 + 2.5, -32, 1.2, 1.2, 1.2);
    addBarrel(-W / 2 + 4.5, -31);
    addBox(W / 2 - 2,    -29, 1.5, 2.5, 1.5);
    addBarrel(W / 2 - 4.5, -30);

    // Секция 3: z≈-15 — три стойки в шахматном порядке
    addPole(-5, -15);
    addPole(0,  -11);
    addPole(5,  -15);

    // Секция 4: z≈0  — стена с проходом справа
    addWallBarrier(0, -2, 7);

    // Секция 5: z≈15 — ящики посередине
    addBox(-3, 15, 2, 3, 1.5);
    addBox(3,  15, 2, 3, 1.5);
    addBox(0,  17, 1.5, 1.5, 1.5);

    // Секция 6: z≈30 — стойки + бочки
    addPole(-6, 30);
    addPole(6,  30);
    addBarrel(0, 29);
    addBarrel(0, 31);

    // Секция 7: z≈45 — стена с центральным проходом
    addWallBarrier(45, -3, 3);

    scene.add(group);

    // ── Коллайдеры ──────────────────────────────────────────────────────────
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    function addC(lx, ly, lz, cw, ch, cd) {
        const wx = cos * lx - sin * lz + hx;
        const wz = sin * lx + cos * lz + hz;
        colliders.push({ cx: wx, cy: ly, cz: wz, hw: cw / 2, hh: ch / 2, hd: cd / 2, rotY });
    }

    // Стены
    addC(-W / 2, H / 2, 0, 0.5, H, L);
    addC( W / 2, H / 2, 0, 0.5, H, L);
    // Крыша
    addC(0, H + 0.3, 0, W, 0.6, L);

    // Препятствия
    for (const o of obs) {
        addC(o.lx, o.ly, o.lz, o.w, o.h, o.d);
    }

    return group;
}
