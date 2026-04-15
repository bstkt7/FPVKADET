import * as THREE from 'three';

// ── Погодные частицы ──────────────────────────────────────────────────────────
export function createWeatherParticles(scene, weather) {
    if (weather === 'clear') return null;
    const count = weather === 'rain' ? 4000 : 2500;
    const geo   = new THREE.BufferGeometry();
    const pos   = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        pos[i * 3]     = (Math.random() - 0.5) * 400;
        pos[i * 3 + 1] = Math.random() * 200;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 400;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
        color:       weather === 'rain' ? 0x88ccff : 0xffffff,
        size:        weather === 'rain' ? 0.3 : 0.8,
        transparent: true,
        opacity:     0.6,
        blending:    THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    return points;
}

export function updateWeatherParticles(particles, delta, weather, dronePos) {
    if (!particles) return;
    const pos   = particles.geometry.attributes.position.array;
    const speed = weather === 'rain' ? 80 : 20;
    const count = pos.length / 3;
    for (let i = 0; i < count; i++) {
        pos[i * 3 + 1] -= speed * delta;

        const dx = pos[i * 3]     - dronePos.x;
        const dz = pos[i * 3 + 2] - dronePos.z;
        if (pos[i * 3 + 1] < 0)  pos[i * 3 + 1] = 150;
        if (Math.abs(dx) > 200)   pos[i * 3]     = dronePos.x + (Math.random() - 0.5) * 400;
        if (Math.abs(dz) > 200)   pos[i * 3 + 2] = dronePos.z + (Math.random() - 0.5) * 400;
    }
    particles.geometry.attributes.position.needsUpdate = true;
}
