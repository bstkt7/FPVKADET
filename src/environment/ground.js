import * as THREE from 'three';

// ── Земля с процедурным шейдером ─────────────────────────────────────────────
export function createGround(scene, config) {
    const weather = config?.weather || 'clear';

    const groundMat = new THREE.ShaderMaterial({
        fog: true, // Включаем поддержку тумана
        uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib['fog'],
            { uWeather: { value: weather === 'rain' ? 1.0 : weather === 'snow' ? 2.0 : 0.0 } }
        ]),
        vertexShader: `
            varying vec2 vUV;
            varying vec3 vWorld;
            #include <fog_pars_vertex>
            void main() {
                vUV   = uv;
                vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }
        `,
        fragmentShader: `
            uniform float uWeather;
            varying vec2 vUV;
            varying vec3 vWorld;
            #include <fog_pars_fragment>

            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5); }
            float noise(vec2 p) {
                vec2 i=floor(p), f=fract(p);
                f=f*f*(3.0-2.0*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),
                           mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
            }
            float fbm(vec2 p){
                float v=0.0,a=0.5;
                for(int i=0;i<3;i++){v+=a*noise(p);p*=2.0;a*=0.5;}
                return v;
            }

            void main() {
                vec2 w = vWorld.xz;

                vec3 grassA = uWeather > 1.5 ? vec3(0.88,0.92,0.96) : uWeather > 0.5 ? vec3(0.12,0.18,0.14) : vec3(0.18,0.28,0.12);
                vec3 grassB = uWeather > 1.5 ? vec3(0.78,0.84,0.90) : uWeather > 0.5 ? vec3(0.09,0.14,0.10) : vec3(0.13,0.22,0.08);
                vec3 dirtA  = uWeather > 1.5 ? vec3(0.72,0.78,0.82) : uWeather > 0.5 ? vec3(0.20,0.22,0.18) : vec3(0.32,0.26,0.16);
                vec3 dirtB  = uWeather > 1.5 ? vec3(0.65,0.70,0.75) : uWeather > 0.5 ? vec3(0.16,0.18,0.14) : vec3(0.26,0.20,0.12);

                float n1 = fbm(w * 0.08);
                float n2 = fbm(w * 0.32 + 3.7);
                float n3 = noise(w * 1.5 + 1.1);

                vec3 col = mix(grassA, grassB, n2);
                col = mix(col, dirtA, smoothstep(0.45, 0.60, n1));
                col = mix(col, dirtB, smoothstep(0.55, 0.70, n1) * 0.5);
                col += (n3 - 0.5) * 0.03;

                if (uWeather < 1.5) {
                    vec2 lw = abs(fract(w * 0.02 + 0.5) - 0.5);
                    float line = smoothstep(0.48, 0.50, max(lw.x, lw.y));
                    col = mix(col, vec3(0.5, 0.5, 0.5) * (uWeather > 0.5 ? 0.6 : 0.8), line * 0.12);
                }

                if (uWeather > 1.5) {
                    float speckle = step(0.82, noise(w * 8.0));
                    col = mix(col, vec3(1.0), speckle * 0.3);
                }

                gl_FragColor = vec4(col, 1.0);
                #include <fog_fragment>
            }
        `,
        side: THREE.FrontSide,
    });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 1, 1), groundMat);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground); // ВЕРНУЛИ ЗЕМЛЮ!

}
