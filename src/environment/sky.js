import * as THREE from 'three';

// ── Небо ──────────────────────────────────────────────────────────────────────
export function createSky(config) {
    const weather = config?.weather || 'clear';

    const skyColors = {
        clear: { zenith: 0x0a4fa8, mid: 0x1a7fd4, horizon: 0x7ec8e3, haze: 0xc9e8f5 },
        rain: { zenith: 0x1a2535, mid: 0x2a3a50, horizon: 0x4a5a6a, haze: 0x6a7a8a },
        snow: { zenith: 0x5a7090, mid: 0x8098b0, horizon: 0xb0c8d8, haze: 0xd8e8f0 },
    };
    const c = skyColors[weather] || skyColors.clear;

    const skyMat = new THREE.ShaderMaterial({
        fog: false, // Небо не должно затуманиваться
        uniforms: {
            uZenith: { value: new THREE.Color(c.zenith) },
            uMid: { value: new THREE.Color(c.mid) },
            uHorizon: { value: new THREE.Color(c.horizon) },
            uHaze: { value: new THREE.Color(c.haze) },
            uSunDir: { value: new THREE.Vector3(0.45, 0.35, -0.82).normalize() },
            uSunColor: { value: new THREE.Color(weather === 'clear' ? 0xffe8b0 : 0x889090) },
            uWeather: { value: weather === 'rain' ? 1.0 : weather === 'snow' ? 2.0 : 0.0 },
        },
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_Position.z = gl_Position.w;
            }
        `,
        fragmentShader: `
            uniform vec3 uZenith, uMid, uHorizon, uHaze, uSunDir, uSunColor;
            uniform float uWeather;
            varying vec3 vDir;

            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5); }
            float noise(vec2 p) {
                vec2 i = floor(p), f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(hash(i), hash(i+vec2(1,0)), f.x),
                           mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
            }
            float fbm(vec2 p) {
                float v = 0.0, a = 0.5;
                for(int i=0;i<4;i++){ v += a*noise(p); p*=2.1; a*=0.5; }
                return v;
            }

            void main() {
                vec3 dir = normalize(vDir);
                float up = clamp(dir.y, 0.0, 1.0);

                // Градиент неба
                vec3 sky = uZenith;
                sky = mix(sky, uMid,     smoothstep(0.6, 0.2, up));
                sky = mix(sky, uHorizon, smoothstep(0.2, 0.05, up)); 
                // Важно: на dir.y = 0.0 и ниже значение будет равно 1.0!
                // Значит на самом крае горизонта и под землей цвет неба = 100% uHaze (цвет тумана).
                sky = mix(sky, uHaze,    smoothstep(0.1, 0.0, dir.y)); 

                // Отрисовка солнца
                if (uWeather < 0.5) {
                    float sun    = dot(dir, uSunDir);
                    float disc   = smoothstep(0.9996, 0.9999, sun);
                    float corona = pow(max(0.0, sun), 128.0) * 0.6;
                    float glow   = pow(max(0.0, sun), 8.0)   * 0.25;
                    sky += uSunColor * (disc * 3.0 + corona + glow);
                    float halo = pow(max(0.0, sun), 4.0) * smoothstep(0.08, 0.0, up) * 0.4;
                    sky = mix(sky, vec3(1.0, 0.85, 0.5), halo);
                }

                // Отрисовка облаков
                if (dir.y > 0.0) {
                    vec2 uv = dir.xz / (dir.y + 0.01) * 0.4;
                    float clouds  = fbm(uv * 1.2 + vec2(0.3, 0.1));
                    float density = uWeather < 0.5 ? 0.28 : uWeather < 1.5 ? 0.72 : 0.55;
                    vec3 cloudColor = uWeather < 0.5 ? vec3(1.0, 1.0, 1.0)
                                    : uWeather < 1.5 ? vec3(0.4, 0.45, 0.5)
                                    : vec3(0.82, 0.86, 0.90);
                    float cloudMask = smoothstep(density, density + 0.18, clouds);
                    cloudMask *= smoothstep(0.0, 0.12, dir.y);
                    sky = mix(sky, cloudColor, cloudMask * 0.85);
                }

                gl_FragColor = vec4(sky, 1.0);
            }
        `,
        side: THREE.BackSide,
        depthWrite: false,
    });

    const q = config?.quality || 'medium';
    const wSeg = q === 'low' ? 16 : q === 'medium' ? 24 : 32;
    const hSeg = q === 'low' ? 8 : q === 'medium' ? 12 : 16;
    return new THREE.Mesh(new THREE.SphereGeometry(700, wSeg, hSeg), skyMat);
}

export function createSunAndLighting(sc, config) {
    const isRain = config?.weather === 'rain';
    const isSnow = config?.weather === 'snow';

    // Окружающий свет
    sc.add(new THREE.AmbientLight(isRain ? 0x4a5a6a : isSnow ? 0x90a0b0 : 0x87ceeb, isRain ? 0.3 : 0.6));

    // Солнце
    const sun = new THREE.DirectionalLight(0xfff5e0, isRain ? 0.4 : isSnow ? 0.8 : 1.2);
    sun.position.set(60, 120, -80);
    sc.add(sun);

    // Добавляем дымку (туман) для скрытия горизонта. Цвета строго из массива skyColors.haze!
    const fogColor = isRain ? 0x6a7a8a : isSnow ? 0xd8e8f0 : 0xc9e8f5;
    sc.fog = new THREE.Fog(fogColor, 300, 1100); // Увеличил дальность в 5 раз (до 1.6км!)
    sc.background = new THREE.Color(fogColor); // Подстраховка для краёв сцены
}
