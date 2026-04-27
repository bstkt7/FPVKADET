import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { gamepadState, setControllerType, destroyGamepadVisualizer } from './gamepad.js';

import {
    createSky, createSunAndLighting, createGround,
    buildTrack, createWeatherParticles, updateWeatherParticles,
    createUHangar, updatePeople
} from './environment/index.js';
import { tryAudioInit, updateAudio, playCheckpoint, playCrash, playLand, disposeAudio } from './audio.js';
import { drawHUDStatic, drawHUDDynamic } from './hud.js';
import { DronePhysics, DRONE_CLASSES } from './physics.js';
import { BombManager } from './BombManager.js';
import { RaceManager } from './RaceManager.js';
import { TutorialManager } from './TutorialManager.js';
import { GRAVITY, GRAVITY_SNOW, BOMB_GRAVITY, GROUND_Y, SPAWN_POS, FPV_CAM_OFFSET, FPV_CAM_TILT_DEG, THIRD_PERSON_OFFSET } from './config/constants.js';

let scene;
let camera;
let renderer;

let infoElement = null;

const pressedKeys = new Set();
let engineConfig = {
    invertPitch: false,
    flightMode: 'medium',
    controllerType: 'gamepad',
    droneMode: 'angle',
};

// ── Физика и Дрон ─────────────────────────────────────────────────────────────
// DronePhysics принимает аудио колбэки — нет прямой зависимости physics ↔ audio
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
            // ✅ ACRO — фикс
            rollInput = gamepadState.roll;      // ← УБРАЛИ минус
            pitchInput = -gamepadState.pitch;    // оставляем инверсию
        } else {
            // ✅ ANGLE — как у тебя уже работает
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

        if (cameraMode === 'fpv') {
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

    if (cameraMode === 'third') {
        _yawEuler.set(0, droneState.rotation.y, 0, 'YXZ'); _yawQuat.setFromEuler(_yawEuler);
        const desiredPos = cameraTarget.position.clone().add(thirdPersonOffset.clone().applyQuaternion(_yawQuat));

        if (!thirdPersonInited) {
            cameraSmoothed.copy(desiredPos);
            cameraLookSmoothed.copy(cameraTarget.position);
            thirdPersonInited = true;
        }

        cameraSmoothed.lerp(desiredPos, 0.08);
        cameraLookSmoothed.lerp(cameraTarget.position.clone().add(_tmpVec.set(0, 0.5, 0)), 0.12);
        camera.position.copy(cameraSmoothed);
        camera.lookAt(cameraLookSmoothed);
    }

    updatePropellers(throttle, delta, droneState.isCrashed && !droneState.turtleMode);

    updateAudio(throttle, Math.abs(pitchInput) + Math.abs(rollInput) + Math.abs(yawInput), droneState.health < 40);

    updatePeople(delta);
    raceManager.update(delta, droneState, playCheckpoint, engineConfig);
    if (bombManager) bombManager.update(delta, colliders, playCrash);
    if (tutorialManager) tutorialManager.update(delta, raceManager);

    renderer.render(scene, camera);

    drawHUDDynamic(hudCanvas, hudCtx, hudFrame, engineConfig, {
        cameraMode,
        velocity:     droneState.velocity,
        position:     droneState.position,
        throttle,
        rotation:     droneState.rotation,
        health:       droneState.health,
        battery:      droneState.battery,
        turtleMode:   droneState.turtleMode,
        isCrashed:    droneState.isCrashed,
        propDamage:   droneState.propDamage,
        weather:      engineConfig.weather,
        raceTimer:    raceManager.raceTimer,
        bombAttached: bombManager?.bomb?.attached,
        bombDropped:  bombManager?.bomb?.dropped,
        bombFlash:    bombManager?.bomb?.flashAge ?? 0,
    }, gateObjects, raceManager.nextGateIdx);
    
    if (tutorialManager) {
        tutorialManager.draw(hudCtx, hudCanvas.width, hudCanvas.height);
    }
}

export function initEngine({ threeCanvas, hudCanvas: hudCanvasElement, hudStaticCanvas: hudStaticCanvasElement, infoElement: infoEl, config } = {}) {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(config?.fov || 90, window.innerWidth / window.innerHeight, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: config?.quality === 'high' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, config?.quality === 'high' ? 2 : 1.5));

    scene.userData.weather = config?.weather || 'clear';
    scene.userData.map = config?.map || 'hangar';

    const fogColor = scene.userData.weather === 'rain' ? 0x4a5a6a
        : scene.userData.weather === 'snow' ? 0xb0c8d8
            : 0x7ec8e3;
    scene.fog = new THREE.Fog(fogColor, 250, 750);
    renderer.setClearColor(fogColor);

    scene.add(createSky(config));
    createSunAndLighting(scene, config);
    createGround(scene, config);
    buildTrack(scene, colliders, gateObjects);
    raceManager.setGates(gateObjects);

    bombManager = new BombManager(scene, droneState);
    weatherParticles = createWeatherParticles(scene, scene.userData.weather);

    scene.add(cameraTarget);

    camera.position.set(
        FPV_CAM_OFFSET.x,
        FPV_CAM_OFFSET.y,
        FPV_CAM_OFFSET.z
    );
    camera.rotation.x = THREE.MathUtils.degToRad(FPV_CAM_TILT_DEG);
    cameraTarget.add(camera);

    // Обработчики ввода — сохраняем ссылки для dispose()
    const onKeyDown = (e) => {
        pressedKeys.add(e.code);
        if (e.code === 'Tab') {
            e.preventDefault();
            cameraMode = cameraMode === 'fpv' ? 'third' : 'fpv';
            thirdPersonInited = false;
            if (cameraMode === 'fpv') {
                cameraTarget.add(camera);
                camera.position.set(FPV_CAM_OFFSET.x, FPV_CAM_OFFSET.y, FPV_CAM_OFFSET.z);
                camera.rotation.set(THREE.MathUtils.degToRad(FPV_CAM_TILT_DEG), 0, 0);
            } else {
                scene.attach(camera);
            }
        }
        if (e.code === 'KeyM') {
            engineConfig.droneMode = engineConfig.droneMode === 'angle' ? 'sport'
                : engineConfig.droneMode === 'sport' ? 'acro' : 'angle';
            altHoldTarget = null;
            droneState.angularVelocity.set(0, 0, 0);
        }
        if (e.code === 'KeyN' && bombManager) {
            if (!bombManager.bomb.attached && !bombManager.bomb.dropped) bombManager.armBomb();
            else if (bombManager.bomb.attached) bombManager.dropBomb();
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
        if (hudCanvas) {
            hudCanvas.width = window.innerWidth;
            hudCanvas.height = window.innerHeight;
        }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onResize);

    infoElement = infoEl || null;
    engineConfig = {
        invertPitch: config?.invertPitch ?? false,
        flightMode: config?.flightMode ?? 'medium',
        controllerType: config?.controllerType ?? 'gamepad',
        droneMode: config?.droneMode ?? 'angle',
        weather: config?.weather ?? 'clear',
        map: config?.map ?? 'hangar',
        droneClass: config?.droneClass ?? 'freestyle_5',
        playerName: config?.playerName ?? 'Pilot',
    };
    
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

    let animRunning = true;
    lastTime = performance.now();
    animate();

    // ── dispose() — освобождает ресурсы при выходе из игры ────────────────
    return function dispose() {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        destroyGamepadVisualizer();
        disposeAudio();
        if (droneState && droneState.dispose) droneState.dispose();
        if (renderer) {
            renderer.dispose();
            renderer = null;
        }
        scene  = null;
        camera = null;
    };
}