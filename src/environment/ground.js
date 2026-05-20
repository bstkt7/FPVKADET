import * as THREE from 'three';

// ── Земля с запечённой текстурой (генерируется 1 раз, не нагружает GPU) ──────
function bakeGroundTexture(weather) {
    const SIZE = 512;
    const canvas = new OffscreenCanvas(SIZE, SIZE);
    const ctx = canvas.getContext('2d');

    function hash(x, y) {
        let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return h - Math.floor(h);
    }
    function smoothNoise(px, py) {
        const ix = Math.floor(px), iy = Math.floor(py);
        const fx = px - ix, fy = py - iy;
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const a = hash(ix, iy), b = hash(ix + 1, iy);
        const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return a + (b - a) * ux + (c - a) * uy + (d - a + a - b - c + b) * ux * uy;
    }
    function fbm(px, py) {
        return smoothNoise(px, py) * 0.5 + smoothNoise(px * 2, py * 2) * 0.25 + smoothNoise(px * 4, py * 4) * 0.125;
    }

    const isSnow = weather === 'snow', isRain = weather === 'rain';
    const gA = isSnow ? [224, 235, 245] : isRain ? [31, 46, 36] : [46, 71, 31];
    const gB = isSnow ? [199, 214, 230] : isRain ? [23, 36, 26] : [33, 56, 20];
    const dA = isSnow ? [184, 199, 210] : isRain ? [51, 56, 46] : [82, 66, 41];
    const dB = isSnow ? [166, 179, 191] : isRain ? [41, 46, 36] : [66, 51, 31];

    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;

    for (let py = 0; py < SIZE; py++) {
        for (let px = 0; px < SIZE; px++) {
            const wx = px / SIZE * 200, wy = py / SIZE * 200;
            const n1 = fbm(wx * 0.08, wy * 0.08);
            const n2 = fbm(wx * 0.32 + 3.7, wy * 0.32 + 3.7);
            const n3 = smoothNoise(wx * 1.5 + 1.1, wy * 1.5 + 1.1);

            let r = gA[0] + (gB[0] - gA[0]) * n2;
            let g = gA[1] + (gB[1] - gA[1]) * n2;
            let b = gA[2] + (gB[2] - gA[2]) * n2;
            const t1 = Math.max(0, Math.min(1, (n1 - 0.45) / 0.15));
            r += (dA[0] - r) * t1; g += (dA[1] - g) * t1; b += (dA[2] - b) * t1;
            const t2 = Math.max(0, Math.min(1, (n1 - 0.55) / 0.15)) * 0.5;
            r += (dB[0] - r) * t2; g += (dB[1] - g) * t2; b += (dB[2] - b) * t2;
            const noiseOff = (n3 - 0.5) * 8;
            r += noiseOff; g += noiseOff; b += noiseOff;

            if (!isSnow) {
                const lx = Math.abs(((wx * 0.02) % 1 + 1) % 1 - 0.5);
                const ly = Math.abs(((wy * 0.02) % 1 + 1) % 1 - 0.5);
                const line = Math.max(0, (Math.max(lx, ly) - 0.48) / 0.02) * 0.12;
                const lc = isRain ? 128 : 204;
                r += (lc - r) * line; g += (lc - g) * line; b += (lc - b) * line;
            }
            if (isSnow && smoothNoise(wx * 8, wy * 8) > 0.82) {
                r += (255 - r) * 0.3; g += (255 - g) * 0.3; b += (255 - b) * 0.3;
            }

            const idx = (py * SIZE + px) * 4;
            d[idx]     = Math.max(0, Math.min(255, r));
            d[idx + 1] = Math.max(0, Math.min(255, g));
            d[idx + 2] = Math.max(0, Math.min(255, b));
            d[idx + 3] = 255;
        }
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
}

export function createGround(scene, config) {
    const weather = config?.weather || 'clear';

    // Текстура запекается один раз — больше нет fbm в шейдере каждый кадр
    const bakedCanvas = bakeGroundTexture(weather);
    const tex = new THREE.CanvasTexture(bakedCanvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(20, 20); // тайлируем 20×20 по полю 4000×4000

    const groundMat = new THREE.MeshLambertMaterial({ map: tex });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
}

