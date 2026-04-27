import * as THREE from 'three';
import { createGround } from './ground.js';
import { createUHangar } from './hangar.js';
import { SPAWN_POS } from '../config/constants.js';

// ── Гоночное кольцо ───────────────────────────────────────────────────────────
export function createGate(scene, gateObjects, x, y, z, color, rotY) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    scene.add(group);

    const innerR = 4.5, tubeR = 0.45;

    // Основной тор
    const torusGeo = new THREE.TorusGeometry(innerR + tubeR, tubeR, 16, 48);
    const torusMat = new THREE.MeshPhysicalMaterial({
        color, emissive: color, emissiveIntensity: 3.5,
        roughness: 0.1, metalness: 0.6,
        transparent: true, opacity: 0.95,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.y = Math.PI / 2;
    group.add(torus);

    // Glow-слой 1 (ближний)
    const glowGeo1 = new THREE.TorusGeometry(innerR + tubeR, tubeR * 2.2, 10, 32);
    const glowMat1 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 });
    const glow1    = new THREE.Mesh(glowGeo1, glowMat1);
    glow1.rotation.y = Math.PI / 2;
    group.add(glow1);

    // Glow-слой 2 (дальний, мягкий)
    const glowGeo2 = new THREE.TorusGeometry(innerR + tubeR, tubeR * 4.0, 8, 24);
    const glowMat2 = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.10 });
    const glow2    = new THREE.Mesh(glowGeo2, glowMat2);
    glow2.rotation.y = Math.PI / 2;
    group.add(glow2);

    // Зона пролёта (полупрозрачный диск)
    const zoneGeo = new THREE.CircleGeometry(innerR, 24);
    const zoneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, side: THREE.DoubleSide });
    const zone    = new THREE.Mesh(zoneGeo, zoneMat);
    zone.rotation.y = Math.PI / 2;
    group.add(zone);

    // Точечный свет — яркий
    const ptLight = new THREE.PointLight(color, 6, 22);
    group.add(ptLight);
    group.userData.ptLight = ptLight;

    gateObjects.push({
        group, position: new THREE.Vector3(x, y, z),
        innerR: innerR + 1,
        torusMat, glowMat: glowMat1, glowMat1, glowMat2, zoneMat, baseColor: color,
    });
}

// ── Вспомогательные объекты на треке ─────────────────────────────────────────

/** Создаёт ящик-препятствие с AABB-коллайдером */
export function createBox(scene, colliders, x, y, z, w, h, d) {
    const geo  = new THREE.BoxGeometry(w, h, d);
    const mat  = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + h / 2, z);
    scene.add(mesh);
    colliders.push({
        cx: x, cy: y + h / 2, cz: z,
        hw: w / 2, hh: h / 2, hd: d / 2,
        rotY: 0,
    });
}

export function createPine(scene, colliders, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    scene.add(group);

    const trunkMat  = new THREE.MeshStandardMaterial({ color: 0x4a2e1d });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1d3d1d, roughness: 0.9 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 8), trunkMat);
    trunk.position.y = 2;
    group.add(trunk);

    for (let i = 0; i < 3; i++) {
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(3 - i * 0.8, 4, 8), leavesMat);
        leaves.position.y = 4 + i * 2.5;
        group.add(leaves);
    }

    colliders.push({ cx: x, cy: 5, cz: z, hw: 1.5, hh: 10, hd: 1.5, rotY: 0 });
}

// ── Строитель трассы ──────────────────────────────────────────────────────────

const TRACK_DATA = {
    open_field: [
        { x: 0,   y: 10, z: -5,   color: 0x00ccff, rotY: 1.571 },
        { x: 0,   y: 12, z: 40,   color: 0xff6600, rotY: 1.571 },
        { x: 0,   y: 14, z: 90,   color: 0xff6600, rotY: 2.149 },
        { x: 40,  y: 12, z: 120,  color: 0x00ccff, rotY: -0.245 },
        { x: 90,  y: 10, z: 110,  color: 0xff6600, rotY: -1.030 },
        { x: 120, y: 18, z: 60,   color: 0xff6600, rotY: -1.768 },
        { x: 110, y: 25, z: 10,   color: 0x00ccff, rotY: -2.222 },
        { x: 70,  y: 20, z: -30,  color: 0xff6600, rotY: -2.201 },
        { x: 30,  y: 14, z: -60,  color: 0xff6600, rotY: -2.554 },
        { x: 0,   y: 10, z: -80,  color: 0x00ff88, rotY: -2.356 },
        { x: -30, y: 14, z: -50,  color: 0xff6600, rotY: -1.373 },
        { x: -20, y: 10, z: -5,   color: 0x00ff88, rotY: 0.245 },
    ],
    city_run: [
        { x: -50, y: 15, z: 0,    color: 0x00ff88, rotY: 0 },
        { x: 0,   y: 25, z: 100,  color: 0xff00ff, rotY: 0.5 },
        { x: 100, y: 15, z: 50,   color: 0x00ffff, rotY: 1.5 },
        { x: 50,  y: 10, z: -100, color: 0xffff00, rotY: 3.14 },
    ],
    // Трасса ангара:
    //   Кольца 1-4  — прямо внутри коридора (z от -45 до +45, ось Z)
    //   Кольца 5-12 — круговая петля снаружи: выход из ангара (z≈+60) → большой круг → вход (z≈-60)
    //   Старт дрона — z=-70 (перед воротами ангара, перед кольцом №1)
    hangar: [
        // ── Внутри ангара (4 кольца прямо вдоль Z) ──────────────────────────
        // rotY=1.571 (π/2) → кольцо открыто лицом вдоль оси Z (направление полёта)
        { x: 0, y: 6, z: -45, color: 0x00e6ff, rotY: 1.571 },  // #1 — входное
        { x: 0, y: 6, z: -15, color: 0x00ccff, rotY: 1.571 },  // #2
        { x: 0, y: 6, z:  15, color: 0x00ccff, rotY: 1.571 },  // #3
        { x: 0, y: 6, z:  45, color: 0x00e6ff, rotY: 1.571 },  // #4 — выходное

        // ── Круговая петля снаружи (8 колец) ─────────────────────────────────
        // Выход из ангара → правый полукруг → возврат слева ко входу
        { x:  60, y: 8,  z:  80, color: 0x00ffcc, rotY:  0.785 },  // #5
        { x: 110, y: 12, z:  60, color: 0xff6600, rotY:  1.571 },  // #6
        { x: 130, y: 16, z:   0, color: 0xff6600, rotY:  1.571 },  // #7 — правый апекс
        { x: 110, y: 12, z: -60, color: 0xff6600, rotY:  2.356 },  // #8
        { x:  60, y: 8,  z: -90, color: 0x00ffcc, rotY:  3.142 },  // #9 — нижний
        { x: -10, y: 10, z: -95, color: 0xffcc00, rotY:  3.142 },  // #10
        { x: -60, y: 8,  z: -80, color: 0xff3344, rotY: -2.356 },  // #11
        { x: -30, y: 6,  z: -62, color: 0x00ffcc, rotY: -1.571 },  // #12 → возврат ко входу
    ],
    // Трасса обучения: одно кольцо для первого пролета
    tutorial: [
        { x: 0, y: 6, z: 0, color: 0x00ff88, rotY: 1.571 },
    ],
};

export function buildTrack(scene, colliders, gateObjects) {
    gateObjects.length = 0;

    const mapType = scene.userData.map || 'hangar';

    if (mapType === 'open_field' || mapType === 'city_run') {
        createGround(scene, { weather: scene.userData.weather });
        // Деревья на открытом поле
        if (mapType === 'open_field') {
            for (let i = 0; i < 30; i++) {
                createPine(scene, colliders, (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400);
            }
        }
    } else {
        // Ангар — прямой коридор
        createUHangar(scene, colliders, 0, 0, 0);
    }

    const gatesData = TRACK_DATA[mapType] || TRACK_DATA.hangar;
    gatesData.forEach(g => createGate(scene, gateObjects, g.x, g.y, g.z, g.color, g.rotY));

    // Плавная светящаяся линия трассы в воздухе
    if (gatesData.length > 0) {
        const points = gatesData.map(g => new THREE.Vector3(g.x, g.y, g.z));
        
        // В туториале добавим точку старта, чтобы линия вела от дрона к кольцу
        if (mapType === 'tutorial') {
            points.unshift(new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z));
        }

        // Замыкаем петлю, если это не обучение
        if (mapType !== 'tutorial' && gatesData.length > 1) {
            points.push(new THREE.Vector3(gatesData[0].x, gatesData[0].y, gatesData[0].z));
        }
        
        if (points.length > 1) {
            const curve = new THREE.CatmullRomCurve3(points);
            const tubeGeo = new THREE.TubeGeometry(curve, 128, 0.08, 8, mapType !== 'tutorial' && gatesData.length > 1);
            const tubeMat = new THREE.MeshBasicMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 0.9,
            });
            const trackMesh = new THREE.Mesh(tubeGeo, tubeMat);
            scene.add(trackMesh);

            // Дополнительный слой свечения (чуть шире и прозрачнее)
            const glowGeo = new THREE.TubeGeometry(curve, 128, 0.25, 8, mapType !== 'tutorial' && gatesData.length > 1);
            const glowMat = new THREE.MeshBasicMaterial({ 
                color: 0xffffff, 
                transparent: true, 
                opacity: 0.15,
                side: THREE.BackSide
            });
            const glowMesh = new THREE.Mesh(glowGeo, glowMat);
            scene.add(glowMesh);
        }
    }
}
