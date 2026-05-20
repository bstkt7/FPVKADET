import * as THREE from 'three';
import { createGround } from './ground.js';
import { createUHangar } from './hangar.js';
import { SPAWN_POS } from '../config/constants.js';

// ── Закруглённый квадрат — контур в локальном XY ─────────────────────────────
// Возвращает Vector3[] для CatmullRomCurve3 (замкнутый)
function roundedRectPath(w, h, r, cornerSegs = 4) {
    const pts = [];
    const corners = [
        { cx: w / 2 - r, cy: h / 2 - r, a0: 0 },
        { cx: -w / 2 + r, cy: h / 2 - r, a0: Math.PI / 2 },
        { cx: -w / 2 + r, cy: -h / 2 + r, a0: Math.PI },
        { cx: w / 2 - r, cy: -h / 2 + r, a0: 3 * Math.PI / 2 },
    ];
    for (const c of corners) {
        for (let i = 0; i <= cornerSegs; i++) {
            const a = c.a0 + (i / cornerSegs) * (Math.PI / 2);
            pts.push(new THREE.Vector3(
                c.cx + Math.cos(a) * r,
                c.cy + Math.sin(a) * r,
                0
            ));
        }
    }
    return pts;
}

// ── Гоночное кольцо (закруглённый квадрат) ───────────────────────────────────
export function createGate(scene, gateObjects, x, y, z, color, rotY) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    scene.add(group);

    const W = 5.2, H = 5.2, R = 1.6;   // ширина, высота, радиус углов
    const tubeR = 0.15;                  // толщина трубки рамки

    // Контур кольца в плоскости XY, потом повернём
    const shapePts = roundedRectPath(W, H, R, 4);
    const curve = new THREE.CatmullRomCurve3(shapePts, true, 'catmullrom', 0.0);

    // Основная рамка
    const frameGeo = new THREE.TubeGeometry(curve, 48, tubeR, 8, true);
    const frameMat = new THREE.MeshLambertMaterial({
        color, emissive: color, emissiveIntensity: 2.2,
        transparent: true, opacity: 0.95,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.rotation.y = Math.PI / 2;   // повернуть в плоскость ZY (вдоль оси Z)
    group.add(frame);

    // Glow-слой — чуть толще, прозрачный
    const glowGeo = new THREE.TubeGeometry(curve, 32, tubeR * 2.0, 5, true);
    const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18 });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.y = Math.PI / 2;
    group.add(glow);

    // Зона пролёта — плоский прямоугольник
    const zoneShape = new THREE.Shape();
    const hw = W / 2 - R, hh = H / 2 - R;
    zoneShape.moveTo(-W / 2 + R, -H / 2);
    zoneShape.lineTo(W / 2 - R, -H / 2);
    zoneShape.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + R);
    zoneShape.lineTo(W / 2, H / 2 - R);
    zoneShape.quadraticCurveTo(W / 2, H / 2, W / 2 - R, H / 2);
    zoneShape.lineTo(-W / 2 + R, H / 2);
    zoneShape.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - R);
    zoneShape.lineTo(-W / 2, -H / 2 + R);
    zoneShape.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + R, -H / 2);
    const zoneGeo = new THREE.ShapeGeometry(zoneShape, 4);
    const zoneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, side: THREE.DoubleSide });
    const zone = new THREE.Mesh(zoneGeo, zoneMat);
    zone.rotation.y = Math.PI / 2;
    group.add(zone);

    // Точечный свет
    const ptLight = new THREE.PointLight(color, 3, 14);
    group.add(ptLight);
    group.userData.ptLight = ptLight;

    // innerR — для проверки пролёта берём меньшую полуось минус рамка
    gateObjects.push({
        group, position: new THREE.Vector3(x, y, z),
        innerR: Math.min(W, H) / 2 - tubeR,
        frameMat, glowMat, zoneMat, baseColor: color,
    });
}

// ── Вспомогательные объекты ───────────────────────────────────────────────────
export function createBox(scene, colliders, x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 })
    );
    mesh.position.set(x, y + h / 2, z);
    scene.add(mesh);
    colliders.push({ cx: x, cy: y + h / 2, cz: z, hw: w / 2, hh: h / 2, hd: d / 2, rotY: 0 });
}

export function createBuilding(scene, colliders, x, z, h) {
    const w = 15 + Math.random() * 20;
    const d = 15 + Math.random() * 20;
    // Окна / стекло: серо-голубые оттенки
    const hue = 0.5 + Math.random() * 0.15;
    const lit = 0.15 + Math.random() * 0.25;
    const color = new THREE.Color().setHSL(hue, 0.4, lit);
    
    // Легкий материал с отражениями
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    scene.add(mesh);
    colliders.push({ cx: x, cy: h / 2, cz: z, hw: w / 2, hh: h / 2, hd: d / 2, rotY: 0 });
}

export function createPine(scene, colliders, x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    scene.add(group);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1d });
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1d3d1d, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 8), trunkMat);
    trunk.position.y = 2; group.add(trunk);
    for (let i = 0; i < 3; i++) {
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(3 - i * 0.8, 4, 8), leavesMat);
        leaves.position.y = 4 + i * 2.5; group.add(leaves);
    }
    colliders.push({ cx: x, cy: 5, cz: z, hw: 1.5, hh: 10, hd: 1.5, rotY: 0 });
}

// ── Данные трасс ──────────────────────────────────────────────────────────────
const TRACK_DATA = {
    open_field: [
        { x: 0, y: 10, z: -5, color: 0x00ccff, rotY: 1.571 },
        { x: 0, y: 12, z: 40, color: 0xff6600, rotY: 1.571 },
        { x: 0, y: 14, z: 90, color: 0xff6600, rotY: 2.149 },
        { x: 40, y: 12, z: 120, color: 0x00ccff, rotY: -0.245 },
        { x: 90, y: 10, z: 110, color: 0xff6600, rotY: -1.030 },
        { x: 120, y: 18, z: 60, color: 0xff6600, rotY: -1.768 },
        { x: 110, y: 25, z: 10, color: 0x00ccff, rotY: -2.222 },
        { x: 70, y: 20, z: -30, color: 0xff6600, rotY: -2.201 },
        { x: 30, y: 14, z: -60, color: 0xff6600, rotY: -2.554 },
        { x: 0, y: 10, z: -80, color: 0x00ff88, rotY: -2.356 },
        { x: -30, y: 14, z: -50, color: 0xff6600, rotY: -1.373 },
        { x: -20, y: 10, z: -5, color: 0x00ff88, rotY: 0.245 },
    ],
    city_run: [
        { x: -50, y: 15, z: 0, color: 0x00ff88, rotY: 0 },
        { x: 0, y: 25, z: 100, color: 0xff00ff, rotY: 0.5 },
        { x: 100, y: 15, z: 50, color: 0x00ffff, rotY: 1.5 },
        { x: 50, y: 10, z: -100, color: 0xffff00, rotY: 3.14 },
    ],
    hangar: [
        { x: 0, y: 6, z: -45, color: 0x00e6ff, rotY: 1.571 },
        { x: 0, y: 6, z: -15, color: 0x00ccff, rotY: 1.571 },
        { x: 0, y: 6, z: 15, color: 0x00ccff, rotY: 1.571 },
        { x: 0, y: 6, z: 45, color: 0x00e6ff, rotY: 1.571 },
        { x: 60, y: 8, z: 80, color: 0x00ffcc, rotY: 0.785 },
        { x: 110, y: 12, z: 60, color: 0xff6600, rotY: 1.571 },
        { x: 130, y: 16, z: 0, color: 0xff6600, rotY: 1.571 },
        { x: 110, y: 12, z: -60, color: 0xff6600, rotY: 2.356 },
        { x: 60, y: 8, z: -90, color: 0x00ffcc, rotY: 3.142 },
        { x: -10, y: 10, z: -95, color: 0xffcc00, rotY: 3.142 },
        { x: -60, y: 8, z: -80, color: 0xff3344, rotY: -2.356 },
        { x: -30, y: 6, z: -62, color: 0x00ffcc, rotY: -1.571 },
    ],
    tutorial: [
        { x: 0, y: 6, z: 0, color: 0x00ff88, rotY: 1.571 },
    ],
};

const TRACK_OVERRIDE_KEY = 'fpv_track_overrides';

function getRuntimeTrackData(mapType) {
    const defaults = TRACK_DATA[mapType];
    if (!defaults || typeof window === 'undefined') return defaults;
    try {
        const raw = window.localStorage.getItem(TRACK_OVERRIDE_KEY);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        const gates = parsed?.[mapType]?.gates;
        if (!Array.isArray(gates) || gates.length === 0) return defaults;
        return gates.map(g => ({
            x: Number(g.x) || 0,
            y: Number(g.y) || 0,
            z: Number(g.z) || 0,
            color: Number(g.color) || 0x00ccff,
            rotY: Number(g.rotY) || 0,
        }));
    } catch (e) {
        return defaults;
    }
}

// ── Строитель трассы ──────────────────────────────────────────────────────────
export function buildTrack(scene, colliders, gateObjects) {
    gateObjects.length = 0;
    const mapType = scene.userData.map || 'hangar';
    const quality = scene.userData.quality || 'medium';

    if (mapType === 'open_field' || mapType === 'city_run') {
        createGround(scene, { weather: scene.userData.weather });
        if (mapType === 'open_field') {
            const pineCount = quality === 'low' ? 12 : quality === 'medium' ? 20 : 30;
            for (let i = 0; i < pineCount; i++) {
                createPine(scene, colliders,
                    (Math.random() - 0.5) * 400,
                    (Math.random() - 0.5) * 400);
            }
        } else if (mapType === 'city_run') {
            const gates = TRACK_DATA.city_run || [];
            let attempts = 0;
            let spawned = 0;
            const maxBuildings = quality === 'low' ? 22 : quality === 'medium' ? 32 : 45;
            while (spawned < maxBuildings && attempts < 200) {
                attempts++;
                const px = (Math.random() - 0.5) * 500;
                const pz = (Math.random() - 0.5) * 500;
                const h = 20 + Math.random() * 80; // высотки
                
                // Проверка, чтобы не загородить ворота (оставляем радиус ~35 метров)
                let tooClose = false;
                for (const g of gates) {
                    const dist = Math.hypot(g.x - px, g.z - pz);
                    if (dist < 38) {
                        tooClose = true;
                        break;
                    }
                }
                
                // Не ставим на прямо спавне
                if (Math.hypot(SPAWN_POS.x - px, SPAWN_POS.z - pz) < 35) tooClose = true;

                if (!tooClose) {
                    createBuilding(scene, colliders, px, pz, h);
                    spawned++;
                }
            }
        }
    } else {
        createUHangar(scene, colliders, 0, 0, 0);
    }

    const gatesData = getRuntimeTrackData(mapType) || TRACK_DATA.hangar;
    gatesData.forEach(g => createGate(scene, gateObjects, g.x, g.y, g.z, g.color, g.rotY));

    // ── Линия трассы (потолще: тонкий TubeGeometry, квадратное сечение) ──────
    if (gatesData.length > 1) {
        const pts = gatesData.map(g => new THREE.Vector3(g.x, g.y, g.z));
        const closed = mapType !== 'tutorial';

        if (mapType === 'tutorial') {
            pts.unshift(new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z));
        }

        const curve = new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.5);
        const trackSegs = quality === 'low' ? [32, 0] : quality === 'medium' ? [56, 36] : [90, 60];
        const lineGeo = new THREE.TubeGeometry(curve, trackSegs[0], 0.06, 4, closed);
        const lineMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.65,
        });
        scene.add(new THREE.Mesh(lineGeo, lineMat));

        if (trackSegs[1] > 0) {
            const glowGeo = new THREE.TubeGeometry(curve, trackSegs[1], 0.18, 4, closed);
            const glowMat = new THREE.MeshBasicMaterial({
                color: 0x88ffee,
                transparent: true,
                opacity: 0.12,
            });
            scene.add(new THREE.Mesh(glowGeo, glowMat));
        }
    }
}