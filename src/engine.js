import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// ── НОВОЕ: Импорты для Постобработки ──────────────────────────────────────────
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

import { gamepadState, setControllerType, destroyGamepadVisualizer } from './gamepad.js';

import {
    createSky, createSunAndLighting, createGround,
    buildTrack, createWeatherParticles, updateWeatherParticles,
    createUHangar, updatePeople
} from './environment/index.js';
import { tryAudioInit, updateAudio, playCheckpoint, playCrash, playExplosion, playLand, disposeAudio } from './audio.js';
import { drawHUDStatic, drawHUDDynamic } from './hud.js';
import { DronePhysics, DRONE_CLASSES } from './physics.js';
import { BombManager } from './BombManager.js';
import { RaceManager } from './RaceManager.js';
import { TutorialManager } from './TutorialManager.js';
import { GRAVITY, GRAVITY_SNOW, BOMB_GRAVITY, GROUND_Y, SPAWN_POS, FPV_CAM_OFFSET, FPV_CAM_TILT_DEG, THIRD_PERSON_OFFSET } from './config/constants.js';

let scene;
let camera;
let renderer;
let composer; // НОВОЕ: Композер эффектов
let fpvPass;  // НОВОЕ: Наш кастомный шейдер FPV

let infoElement = null;

const pressedKeys = new Set();
let engineConfig = {
    invertPitch: false,
    flightMode: 'medium',
    controllerType: 'gamepad',
    droneMode: 'angle',
    vignette: true,
    chromatic: true,
    glitch: true,
};

// ── Физика и Дрон ─────────────────────────────────────────────────────────────
const droneState = new DronePhysics({
    onCrash: playCrash,
    onLand: playLand,
});

let cameraTarget = new THREE.Object3D();
let hudCanvas = null;
let hudCtx = null;
let hudStaticCanvas = null;
let hudStaticCtx = null;
let throttleState = 0.5;

const _tmpVec = new THREE.Vector3();
const _yawQuat = new THREE.Quaternion();
const _yawEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const thirdPersonOffset = new THREE.Vector3(THIRD_PERSON_OFFSET.x, THIRD_PERSON_OFFSET.y, THIRD_PERSON_OFFSET.z);

let lastTime = performance.now();
let hudFrame = 0;
let weatherParticles = null;
let altHoldTarget = null;
let bottomLightOverlayTimer = 0; // Таймер для OSD подсветки

// ── Камера ────────────────────────────────────────────────────────────────────
let cameraMode = 'fpv';
const cameraSmoothed = new THREE.Vector3();
const cameraLookSmoothed = new THREE.Vector3();
let thirdPersonInited = false;

// ── Среда ────────────────────────────────────────────────────────────────────
let droneGroup = null;
const propellers = [];
const colliders = [];
const gateObjects = [];
let bombManager = null;
let raceManager = new RaceManager();
let tutorialManager = null;

function applyCameraMode(nextMode) {
    if (!camera || !cameraTarget || !scene) return;
    cameraMode = nextMode;
    thirdPersonInited = false;

    if (cameraMode === 'fpv') {
        cameraTarget.add(camera);
        camera.position.set(FPV_CAM_OFFSET.x, FPV_CAM_OFFSET.y, FPV_CAM_OFFSET.z);
        camera.rotation.set(THREE.MathUtils.degToRad(FPV_CAM_TILT_DEG), 0, 0);
    } else if (cameraMode === 'gov') {
        cameraTarget.add(camera);
        camera.position.set(0, -0.15, 0);
        camera.rotation.set(-Math.PI / 2, 0, 0);
    } else {
        scene.attach(camera);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// НОВОЕ: КАСТОМНЫЙ FPV ШЕЙДЕР
// ══════════════════════════════════════════════════════════════════════════════
const FPVShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "time": { value: 0.0 },
        "vignetteStrength": { value: 0.0 },
        "chromaStrength": { value: 0.0 },
        "glitchStrength": { value: 0.0 },
        "resolution": { value: new THREE.Vector2() }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float time;
        uniform float vignetteStrength;
        uniform float chromaStrength;
        uniform float glitchStrength;
        uniform vec2 resolution;

        varying vec2 vUv;

        // Генератор случайных чисел для шума
        float rand(vec2 co) {
            return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
        }

        void main() {
            vec2 uv = vUv;
            
            // ── GLITCH (Полосы и разрывы кадра при краше) ──
            if (glitchStrength > 0.0) {
                float scanline = sin(uv.y * resolution.y * 0.4) * 0.04 * glitchStrength;
                uv.x += scanline;
                
                // Крупные разрывы (tearing) при сильном глитче
                if (glitchStrength > 0.5) {
                    float tear = step(0.9, sin(uv.y * 20.0 + time * 15.0));
                    uv.x += tear * (rand(vec2(time, uv.y)) - 0.5) * 0.1 * glitchStrength;
                }
            }

            // ── CHROMA (Расслоение цветов RGB) ──
            vec2 offset = vec2(chromaStrength, 0.0);
            
            float r = texture2D(tDiffuse, uv + offset).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - offset).b;
            vec4 texColor = vec4(r, g, b, 1.0);

            // ── STATIC NOISE (Аналоговый шум камеры) ──
            if (glitchStrength > 0.0) {
                float noise = (rand(uv + time) - 0.5) * 0.3 * glitchStrength;
                texColor.rgb += noise;
            }

            // ── VIGNETTE (Туннельное зрение / Затенение краев) ──
            if (vignetteStrength > 0.0) {
                float dist = distance(vUv, vec2(0.5));
                float vignette = smoothstep(1.0, 0.2, dist * (1.0 + vignetteStrength));
                texColor.rgb *= vignette;
            }

            gl_FragColor = texColor;
        }
    `
};

// ── Дрон ─────────────────────────────────────────────────────────────────────
function createFallbackDrone() {
    const root = new THREE.Group();
    const armLen = 0.7, propR = 0.32, propH = 0.014, motorH = 0.08;
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const armMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const motorMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const propMatA = new THREE.MeshLambertMaterial({ color: 0xdddddd, transparent: true, opacity: 0.80 });
    const propMatB = new THREE.MeshLambertMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.80 });

    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), bodyMat));

    const armGeo = new THREE.BoxGeometry(armLen * 2, 0.04, 0.06);
    const arm1 = new THREE.Mesh(armGeo, armMat); arm1.rotation.y = Math.PI / 4; root.add(arm1);
    const arm2 = new THREE.Mesh(armGeo, armMat); arm2.rotation.y = -Math.PI / 4; root.add(arm2);

    for (const md of [
        { x: -armLen, z: -armLen, dir: +1, mat: propMatA }, { x: armLen, z: -armLen, dir: -1, mat: propMatB },
        { x: -armLen, z: armLen, dir: -1, mat: propMatB }, { x: armLen, z: armLen, dir: +1, mat: propMatA },
    ]) {
        const mg = new THREE.Group(); mg.position.set(md.x, 0, md.z);
        mg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, motorH, 8), motorMat));
        const sg = new THREE.Group(); sg.position.y = motorH / 2 + propH / 2 + 0.01;
        sg.add(new THREE.Mesh(new THREE.CylinderGeometry(propR, propR, propH, 10), md.mat));
        for (let b = 0; b < 2; b++) {
            const bl = new THREE.Mesh(new THREE.BoxGeometry(propR * 1.85, propH * 1.2, propR * 0.20), md.mat);
            bl.rotation.y = b * Math.PI / 2;
            sg.add(bl);
        }
        mg.add(sg); root.add(mg); propellers.push({ group: sg, dir: md.dir });
    }
    return root;
}

function loadDroneModel(sc) {
    droneGroup = new THREE.Group(); sc.add(droneGroup);
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load('/assets/models/quad_opt.glb', (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.scale.setScalar(1.5 / Math.max(size.x, size.y, size.z));
        box.setFromObject(model); model.position.sub(box.getCenter(new THREE.Vector3()));
        box.setFromObject(model); model.position.y -= box.min.y;
        droneGroup.add(model);

        const propNames = ['polySurface270', 'polySurface271', 'polySurface272', 'polySurface273'];
        const dirs = [1, -1, -1, 1];
        model.traverse(child => {
            const idx = propNames.indexOf(child.name);
            if (idx !== -1) propellers.push({ group: child, dir: dirs[idx] });
        });
    }, undefined, () => { droneGroup.add(createFallbackDrone()); });
}

function updatePropellers(throttle, delta, isCrashed) {
    if (isCrashed) return;
    const rpm = (5 + throttle * 60) * delta;
    for (const p of propellers) p.group.rotation.y += p.dir * rpm;
}

// ── Главный цикл ──────────────────────────────────────────────────────────────
function getSensitivityScale() {
    return engineConfig.flightMode === 'light' ? 1.3 : engineConfig.flightMode === 'heavy' ? 0.5 : 1.0;
}

function animate() {
    requestAnimationFrame(animate);
    hudFrame++;
    const now = performance.now(), delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    let yawInput = 0, pitchInput = 0, rollInput = 0, throttleInput = 0;
    const sens = getSensitivityScale();

    if (gamepadState.connected) {
        throttleInput = gamepadState.throttle;
        yawInput = gamepadState.yaw;

        if (engineConfig.droneMode === 'acro') {
            rollInput = gamepadState.roll;
            pitchInput = -gamepadState.pitch;
        } else {
            rollInput = -gamepadState.roll;
            pitchInput = gamepadState.pitch;
        }
    }

    if (pressedKeys.has('KeyA')) yawInput -= sens;
    if (pressedKeys.has('KeyD')) yawInput += sens;
    if (pressedKeys.has('ArrowUp')) pitchInput -= sens;
    if (pressedKeys.has('ArrowDown')) pitchInput += sens;
    if (pressedKeys.has('ArrowLeft')) rollInput -= sens;
    if (pressedKeys.has('ArrowRight')) rollInput += sens;

    const tStep = engineConfig.flightMode === 'heavy' ? 0.0015 : engineConfig.flightMode === 'light' ? 0.0035 : 0.0025;
    if (!gamepadState.connected) {
        if (pressedKeys.has('KeyW')) throttleState = Math.min(1, throttleState + tStep);
        if (pressedKeys.has('KeyS')) throttleState = Math.max(0, throttleState - tStep);
    }

    const throttle = gamepadState.connected ? THREE.MathUtils.clamp(throttleInput, 0, 1) : throttleState;

    altHoldTarget = droneState.update(delta, {
        yawInput,
        pitchInput,
        rollInput,
        throttle,
        gamepadConnected: gamepadState.connected
    }, engineConfig, colliders, altHoldTarget);

    cameraTarget.position.copy(droneState.position);
    cameraTarget.rotation.copy(droneState.rotation);

    if (droneGroup) {
        droneGroup.position.copy(cameraTarget.position);
        droneGroup.rotation.copy(droneState.rotation);

        if (cameraMode === 'fpv' || cameraMode === 'gov') {
            droneGroup.visible = false;
        } else if (droneState.turtleMode && hudFrame % 10 < 5) {
            droneGroup.visible = false;
        } else {
            droneGroup.visible = true;
        }
    }

    if (weatherParticles) {
        updateWeatherParticles(weatherParticles, delta, engineConfig.weather, droneState.position);
    }

    // Для GOV камеры нет необходимости расчитывать позицию от 3-го лица, так как она прикреплена к дрону

    updatePropellers(throttle, delta, droneState.isCrashed && !droneState.turtleMode);
    updateAudio(throttle, Math.abs(pitchInput) + Math.abs(rollInput) + Math.abs(yawInput), droneState.health < 40);
    updatePeople(delta);
    raceManager.update(delta, droneState, playCheckpoint, engineConfig);
    if (bombManager) bombManager.update(delta, colliders, playCrash, playExplosion);
    if (tutorialManager) tutorialManager.update(delta, raceManager);

    if (gamepadState.justPressedSquare && bombManager) {
        if (!bombManager.bomb.attached && !bombManager.bomb.dropped) {
            bombManager.armBomb();
        } else if (bombManager.bomb.attached) {
            bombManager.dropBomb();
            bottomLightOverlayTimer = 2.0;
        }
    }

    if (fpvPass && (cameraMode === 'fpv' || cameraMode === 'gov')) {
        fpvPass.uniforms.time.value += delta;

        const speed = droneState.velocity.length();
        const lowBatRatio = droneState.battery < 20 ? (20 - droneState.battery) / 20 : 0; // 0.0 до 1.0
        const isCrashed = droneState.isCrashed && !droneState.turtleMode;

        // 1. VIGNETTE (Виньетка + Туннельный эффект от скорости)
        const baseVignette = engineConfig.vignette ? 0.3 : 0.0;
        const speedEffect = engineConfig.vignette ? (speed * 0.015) : 0.0;
        fpvPass.uniforms.vignetteStrength.value = baseVignette + speedEffect;

        // 2. CHROMATIC ABERRATION (Расслоение)
        const baseChroma = engineConfig.chromatic ? 0.001 : 0.0; // исправлен: был 0.001 в обоих ветках
        const batChroma = engineConfig.chromatic ? (lowBatRatio * 0.008) : 0.0;
        const crashChroma = (engineConfig.chromatic && isCrashed) ? 0.02 : 0.0;
        const chromaTotal = baseChroma + batChroma + crashChroma;
        fpvPass.uniforms.chromaStrength.value = chromaTotal;

        // 3. GLITCH / NOISE (Помехи)
        const baseGlitch = engineConfig.glitch ? 0.015 : 0.0;
        const batGlitch = engineConfig.glitch ? (lowBatRatio * 0.2) : 0.0;
        const crashGlitch = (engineConfig.glitch && isCrashed) ? 1.0 : 0.0;
        const glitchTotal = baseGlitch + batGlitch + crashGlitch;
        fpvPass.uniforms.glitchStrength.value = glitchTotal;

        // Пропускаем EffectComposer если все эффекты незначительны → экономим RT-блит
        const vigTotal = fpvPass.uniforms.vignetteStrength.value;
        const needsPostFX = vigTotal > 0.05 || chromaTotal > 0.003 || glitchTotal > 0.01;
        if (needsPostFX) {
            composer.render();
        } else {
            renderer.render(scene, camera);
        }
    } else {
        // Вид от 3-го лица — обычный рендер без постобработки
        renderer.render(scene, camera);
    }

    // ── HUD (обновляем через кадр — 30 FPS достаточно для UI) ──
    if (hudFrame % 2 !== 0) return;
    drawHUDDynamic(hudCanvas, hudCtx, hudFrame, engineConfig, {
        cameraMode,
        velocity: droneState.velocity,
        position: droneState.position,
        throttle,
        rotation: droneState.rotation,
        health: droneState.health,
        battery: droneState.battery,
        turtleMode: droneState.turtleMode,
        isCrashed: droneState.isCrashed,
        propDamage: droneState.propDamage,
        weather: engineConfig.weather,
        raceTimer: raceManager.raceTimer,
        bombAttached: bombManager?.bomb?.attached,
        bombDropped: bombManager?.bomb?.dropped,
        bombFlash: bombManager?.bomb?.flashAge ?? 0,
    }, gateObjects, raceManager.nextGateIdx);

    if (tutorialManager) {
        tutorialManager.draw(hudCtx, hudCanvas.width, hudCanvas.height);
    }

    // ── OSD "Нижняя подсветка вкл" ──
    if (bottomLightOverlayTimer > 0) {
        bottomLightOverlayTimer -= delta;
        if (hudCtx) {
            const cx = hudCanvas.width / 2;
            const cy = hudCanvas.height / 2;
            const ow = 300; 
            const oh = 140;
            
            hudCtx.save();
            hudCtx.fillStyle = 'rgba(80, 80, 80, 0.5)';
            hudCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            hudCtx.lineWidth = 1.5;
            
            hudCtx.beginPath();
            hudCtx.roundRect(cx - ow / 2, cy - oh / 2, ow, oh, 16);
            hudCtx.fill();
            hudCtx.stroke();
            
            // Текст снизу (стандартный регистр, шрифт поменьше)
            hudCtx.fillStyle = 'white';
            hudCtx.font = '14px "JetBrains Mono", sans-serif';
            hudCtx.textAlign = 'center';
            hudCtx.textBaseline = 'bottom';
            hudCtx.fillText('Нижняя подсветка вкл', cx, cy + oh/2 - 20);
            
            // Отрисовка белой монохромной иконки лампочки
            const bulbY = cy - 20;
            hudCtx.strokeStyle = 'white';
            hudCtx.lineWidth = 2.5;
            hudCtx.beginPath();
            hudCtx.arc(cx, bulbY, 14, Math.PI * 0.75, Math.PI * 2.25);
            hudCtx.lineTo(cx + 7, bulbY + 18);
            hudCtx.lineTo(cx - 7, bulbY + 18);
            hudCtx.closePath();
            hudCtx.stroke();
            
            // Закрашенные элементы цоколя
            hudCtx.fillStyle = 'white';
            hudCtx.fillRect(cx - 6, bulbY + 21, 12, 4);
            hudCtx.fillRect(cx - 4, bulbY + 27, 8, 4);
            
            // Лучи
            hudCtx.lineWidth = 2;
            const rayR1 = 20, rayR2 = 28;
            for(let i=0; i<=4; i++) {
                const angle = Math.PI + Math.PI/4 * i; // От 180° до 360°
                hudCtx.beginPath();
                hudCtx.moveTo(cx + Math.cos(angle)*rayR1, bulbY + Math.sin(angle)*rayR1);
                hudCtx.lineTo(cx + Math.cos(angle)*rayR2, bulbY + Math.sin(angle)*rayR2);
                hudCtx.stroke();
            }
            
            hudCtx.restore();
        }
    }
}

export function initEngine({ threeCanvas, hudCanvas: hudCanvasElement, hudStaticCanvas: hudStaticCanvasElement, infoElement: infoEl, config } = {}) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(config?.fov || 90, window.innerWidth / window.innerHeight, 0.1, 2000);

    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: config?.quality === 'high' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // medium → 1.0, high → 1.5 (было 1.5/2 — слишком много пикселей)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, config?.quality === 'high' ? 1.5 : 1.0));

    // ════════════════════════════════════════════════════════════════════════
    // НОВОЕ: Инициализация EffectComposer
    // ════════════════════════════════════════════════════════════════════════
    composer = new EffectComposer(renderer);

    // 1. Обычный рендер сцены
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // 2. Наложение наших FPV-эффектов
    fpvPass = new ShaderPass(FPVShader);
    fpvPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
    composer.addPass(fpvPass);

    // Устанавливаем настройки
    engineConfig = {
        invertPitch: config?.invertPitch ?? false,
        flightMode: config?.flightMode ?? 'medium',
        controllerType: config?.controllerType ?? 'gamepad',
        droneMode: config?.droneMode ?? 'angle',
        weather: config?.weather ?? 'clear',
        map: config?.map ?? 'hangar',
        droneClass: config?.droneClass ?? 'freestyle_5',
        playerName: config?.playerName ?? 'Pilot',
        // Загружаем настройки эффектов
        vignette: config?.vignette ?? true,
        chromatic: config?.chromatic ?? true,
        glitch: config?.glitch ?? true,
        cameraMode: config?.cameraMode ?? 'fpv',
    };

    scene.userData.weather = engineConfig.weather;
    scene.userData.map = engineConfig.map;

    const fogColor = scene.userData.weather === 'rain' ? 0x4a5a6a
        : scene.userData.weather === 'snow' ? 0xb0c8d8
            : 0x7ec8e3;
    scene.fog = new THREE.Fog(fogColor, 250, 750);
    renderer.setClearColor(fogColor);

    scene.add(createSky(engineConfig));
    createSunAndLighting(scene, engineConfig);
    createGround(scene, engineConfig);
    buildTrack(scene, colliders, gateObjects);
    raceManager.setGates(gateObjects);

    bombManager = new BombManager(scene, droneState);
    weatherParticles = createWeatherParticles(scene, scene.userData.weather);

    scene.add(cameraTarget);
    applyCameraMode(engineConfig.cameraMode);

    const onKeyDown = (e) => {
        pressedKeys.add(e.code);
        if (e.code === 'Tab') {
            e.preventDefault();
            applyCameraMode(cameraMode === 'fpv' ? 'gov' : 'fpv');
        }
        if (e.code === 'KeyM') {
            engineConfig.droneMode = engineConfig.droneMode === 'angle' ? 'sport'
                : engineConfig.droneMode === 'sport' ? 'acro' : 'angle';
            altHoldTarget = null;
            droneState.angularVelocity.set(0, 0, 0);
        }
        if (e.code === 'KeyN' && bombManager) {
            if (!bombManager.bomb.attached && !bombManager.bomb.dropped) {
                bombManager.armBomb();
            } else if (bombManager.bomb.attached) {
                bombManager.dropBomb();
                bottomLightOverlayTimer = 2.0;
            }
        }
        if (e.code === 'KeyR' && (droneState.health <= 0 || droneState.turtleMode)) {
            if (gateObjects.length > 0) {
                const prevIdx = raceManager.nextGateIdx === 0 ? gateObjects.length - 1 : raceManager.nextGateIdx - 1;
                const g = gateObjects[prevIdx];
                droneState.resetAt(g.position, new THREE.Euler(0, g.group.rotation.y, 0));
            } else {
                droneState.resetAt(new THREE.Vector3(SPAWN_POS.x, SPAWN_POS.y, SPAWN_POS.z));
            }
            raceManager.resetTimer();
        }
    };
    const onKeyUp = (e) => pressedKeys.delete(e.code);

    const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        // НОВОЕ: Обновляем размеры для постобработки
        if (composer) composer.setSize(window.innerWidth, window.innerHeight);
        if (fpvPass) fpvPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);

        if (hudCanvas) {
            hudCanvas.width = window.innerWidth;
            hudCanvas.height = window.innerHeight;
        }
        if (hudStaticCanvas) {
            hudStaticCanvas.width = window.innerWidth;
            hudStaticCanvas.height = window.innerHeight;
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    infoElement = infoEl || null;

    if (engineConfig.map === 'tutorial') {
        tutorialManager = new TutorialManager(scene, droneState, hudCanvas);
    } else {
        tutorialManager = null;
    }

    setControllerType(engineConfig.controllerType);
    loadDroneModel(scene);

    hudCanvas = hudCanvasElement;
    if (hudCanvas) {
        hudCtx = hudCanvas.getContext('2d');
        hudCanvas.width = window.innerWidth;
        hudCanvas.height = window.innerHeight;
    }

    hudStaticCanvas = hudStaticCanvasElement;
    if (hudStaticCanvas) {
        hudStaticCtx = hudStaticCanvas.getContext('2d');
        hudStaticCanvas.width = window.innerWidth;
        hudStaticCanvas.height = window.innerHeight;

        const clsLabel = DRONE_CLASSES[engineConfig.droneClass]?.label || 'Drone';
        drawHUDStatic(hudStaticCanvas, hudStaticCtx, engineConfig, clsLabel);
    }

    document.addEventListener('keydown', tryAudioInit, { once: true });
    document.addEventListener('pointerdown', tryAudioInit, { once: true });
    window.addEventListener('gamepadconnected', tryAudioInit, { once: true });

    lastTime = performance.now();
    animate();

    return function dispose() {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        destroyGamepadVisualizer();
        disposeAudio();
        if (droneState && droneState.dispose) droneState.dispose();
        if (composer) {
            // Очищаем композер
            composer.passes.forEach(p => p.dispose && p.dispose());
            composer = null;
        }
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene = null;
        camera = null;
    };
}
export function updateEngineConfig(newConfig) {
    if (engineConfig) {
        engineConfig = { ...engineConfig, ...newConfig };

        if (typeof newConfig?.fov === 'number' && camera) {
            camera.fov = newConfig.fov;
            camera.updateProjectionMatrix();
        }

        if (typeof newConfig?.controllerType === 'string') {
            setControllerType(newConfig.controllerType);
        }

        if (typeof newConfig?.cameraMode === 'string' && newConfig.cameraMode !== cameraMode) {
            applyCameraMode(newConfig.cameraMode);
        }
    }
}