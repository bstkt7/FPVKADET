import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// ── DronePreview — 3D превью дрона на экране старта ──────────────────────────
// Статические импорты вместо вложенных динамических — быстрее, проще.

export function DronePreview() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let frameId   = null;
        let renderer  = null;
        let roMain    = null;
        let disposed  = false;

        function makeFallback() {
            const root = new THREE.Group();
            const bm = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
            const am = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
            const mm = new THREE.MeshLambertMaterial({ color: 0x444444 });
            const pm = new THREE.MeshLambertMaterial({ color: 0xcccccc, transparent: true, opacity: 0.8 });
            root.add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.28), bm));
            [Math.PI / 4, -Math.PI / 4].forEach(ry => {
                const a = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 0.06), am);
                a.rotation.y = ry; root.add(a);
            });
            [[-0.7, -0.7, 1], [0.7, -0.7, -1], [-0.7, 0.7, -1], [0.7, 0.7, 1]].forEach(([x, z, d]) => {
                const mg = new THREE.Group(); mg.position.set(x, 0, z);
                mg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.09, 0.08, 12), mm));
                const sg = new THREE.Group(); sg.position.y = 0.06;
                sg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.014, 16), pm));
                for (let b = 0; b < 2; b++) {
                    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.59, 0.017, 0.064), pm);
                    bl.rotation.y = b * Math.PI / 2; sg.add(bl);
                }
                mg.add(sg); root.add(mg);
            });
            return root;
        }

        function initThree(W, H) {
            if (renderer || disposed) return;
            if (disposed) return;

            canvas.width  = Math.round(W * window.devicePixelRatio);
            canvas.height = Math.round(H * window.devicePixelRatio);

            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
            renderer.setSize(W, H);
            renderer.setPixelRatio(window.devicePixelRatio);
            renderer.setClearColor(0x000000, 0);

            const scene  = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(42, W / H, 0.01, 100);
            camera.position.set(2.0, 1.2, 2.2);
            camera.lookAt(0, 0.15, 0);

            scene.add(new THREE.AmbientLight(0x88bbff, 0.7));
            const key  = new THREE.DirectionalLight(0xffffff, 1.2); key.position.set(3, 5, 3); scene.add(key);
            const fill = new THREE.DirectionalLight(0x00e664, 0.4); fill.position.set(-3, 1, -2); scene.add(fill);
            const rim  = new THREE.PointLight(0x00e664, 0.6, 8); rim.position.set(0, -0.5, 0); scene.add(rim);

            const propellers = [];
            let droneGroup   = null;
            let mixer        = null;
            const clock      = new THREE.Clock();

            const loader = new GLTFLoader();
            loader.setMeshoptDecoder(MeshoptDecoder);
            loader.load(
                '/assets/models/quad_opt.glb',
                (gltf) => {
                    if (disposed) return;
                    const model = gltf.scene;
                    const box   = new THREE.Box3().setFromObject(model);
                    const size  = box.getSize(new THREE.Vector3());
                    model.scale.setScalar(1.5 / Math.max(size.x, size.y, size.z));
                    box.setFromObject(model);
                    model.position.sub(box.getCenter(new THREE.Vector3()));
                    box.setFromObject(model);
                    model.position.y -= box.min.y;

                    droneGroup = new THREE.Group();
                    droneGroup.add(model);
                    droneGroup.rotation.x = 0.18;
                    droneGroup.rotation.y = -0.6;
                    scene.add(droneGroup);

                    if (gltf.animations?.length > 0) {
                        mixer = new THREE.AnimationMixer(model);
                        const propNames = ['polySurface270', 'polySurface271', 'polySurface272', 'polySurface273'];
                        const clip      = THREE.AnimationClip.findByName(gltf.animations, 'Take 001') || gltf.animations[0];
                        const filtered  = clip.tracks.filter(t => propNames.includes(t.name.split('.')[0]));
                        const useClip   = filtered.length > 0
                            ? new THREE.AnimationClip('props', clip.duration, filtered)
                            : clip;
                        mixer.clipAction(useClip).setLoop(THREE.LoopRepeat, Infinity).play();
                    }

                    const propNames = ['polySurface270', 'polySurface271', 'polySurface272', 'polySurface273'];
                    const dirs      = [1, -1, -1, 1];
                    model.traverse(child => {
                        const idx = propNames.indexOf(child.name);
                        if (idx !== -1) propellers.push({ mesh: child, dir: dirs[idx] });
                    });
                },
                undefined,
                () => {
                    if (disposed) return;
                    droneGroup = new THREE.Group();
                    droneGroup.add(makeFallback());
                    droneGroup.rotation.x = 0.18;
                    droneGroup.rotation.y = -0.6;
                    scene.add(droneGroup);
                }
            );

            let t = 0;
            function renderLoop() {
                if (disposed) return;
                frameId = requestAnimationFrame(renderLoop);
                const delta = Math.min(clock.getDelta(), 0.05);
                t += delta;
                if (droneGroup) {
                    droneGroup.rotation.y  = -0.6 + Math.sin(t * 0.5) * 0.32;
                    droneGroup.position.y  = Math.sin(t * 0.85) * 0.045;
                }
                if (mixer) mixer.update(delta);
                else for (const p of propellers) p.mesh.rotation.y += p.dir * 40 * delta;
                renderer.render(scene, camera);
            }
            renderLoop();

            roMain = new ResizeObserver(() => {
                const w = canvas.clientWidth, h = canvas.clientHeight;
                if (!w || !h) return;
                renderer.setSize(w, h);
                camera.aspect = w / h;
                camera.updateProjectionMatrix();
            });
            roMain.observe(canvas);
        }

        // Ждём реального размера через ResizeObserver
        const sizeObs = new ResizeObserver(entries => {
            for (const e of entries) {
                const { width, height } = e.contentRect;
                if (width > 0 && height > 0) {
                    sizeObs.disconnect();
                    initThree(width, height);
                    return;
                }
            }
        });
        sizeObs.observe(canvas);
        if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
            sizeObs.disconnect();
            initThree(canvas.clientWidth, canvas.clientHeight);
        }

        return () => {
            disposed = true;
            sizeObs.disconnect();
            if (roMain)  roMain.disconnect();
            if (frameId) cancelAnimationFrame(frameId);
            if (renderer) renderer.dispose();
        };
    }, []);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
