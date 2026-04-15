// ── environment/index.js ─────────────────────────────────────────────────────
// Re-export всего из подмодулей — обратная совместимость с engine.js

export { createSky, createSunAndLighting } from './sky.js';
export { createGround }                     from './ground.js';
export { createUHangar }                    from './hangar.js';
    export { createSchoolBuilding, updatePeople } from './buildings.js';
export { createGate, createBox, createPine, buildTrack } from './gates.js';
export { createWeatherParticles, updateWeatherParticles } from './weather.js';
