let audioCtx = null;
let audioSource = null;
let audioGainNode = null;
let audioPitchFilter = null;
let audioBuffer = null;
let audioStarted = false;
let currentVolume = 0.0;
let currentPlaybackRate = 1.0;
let checkpointBuffer = null;
let crashBuffer = null;
let landBuffer = null;
let explosionBuffer = null;

async function loadBuffer(url) {
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await audioCtx.decodeAudioData(await r.arrayBuffer());
    } catch (e) {
        console.warn(`[audio] не удалось загрузить ${url}:`, e.message);
        return null;
    }
}

export async function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioGainNode = audioCtx.createGain();
    audioGainNode.gain.value = 0.0;

    audioPitchFilter = audioCtx.createBiquadFilter();
    audioPitchFilter.type = 'lowshelf';
    audioPitchFilter.frequency.value = 800;
    audioPitchFilter.gain.value = 0;

    audioGainNode.connect(audioPitchFilter);
    audioPitchFilter.connect(audioCtx.destination);

    audioBuffer     = await loadBuffer('./assets/sounds/quad.mp3');
    checkpointBuffer= await loadBuffer('./assets/sounds/checkpoint.mp3');
    crashBuffer     = await loadBuffer('./assets/sounds/crash.mp3');
    landBuffer      = await loadBuffer('./assets/sounds/land.mp3');
    explosionBuffer = await loadBuffer('./assets/sounds/big-bang.mp3');

    if (audioBuffer) startAudioLoop();
}

function playSFX(buffer, volume = 1.0) {
    if (!audioCtx || !buffer) return;
    const src  = audioCtx.createBufferSource();
    src.buffer = buffer;
    const gain = audioCtx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(audioCtx.destination);
    src.start(0);
}

export function playCheckpoint() {
    playSFX(checkpointBuffer, 0.9);
}

export function playCrash() {
    if (crashBuffer) {
        playSFX(crashBuffer, 1.0);
        return;
    }
    // Синтетический fallback
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(160, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.35);
    gain.gain.setValueAtTime(0.7, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.start(); osc.stop(audioCtx.currentTime + 0.35);
}

export function playExplosion() {
    if (explosionBuffer) {
        playSFX(explosionBuffer, 1.2);
        return;
    }
    // Если файла нет, используем звук краша как запасной
    playCrash();
}

export function playLand(impact) {
    if (landBuffer) {
        playSFX(landBuffer, Math.min(1.0, impact * 0.12));
        return;
    }
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(90, audioCtx.currentTime);
    gain.gain.setValueAtTime(Math.min(0.4, impact * 0.06), audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);
    osc.start(); osc.stop(audioCtx.currentTime + 0.12);
}

export function startAudioLoop() {
    if (!audioBuffer || !audioCtx) return;
    if (audioSource) { try { audioSource.stop(); } catch (e) {} }
    audioSource = audioCtx.createBufferSource();
    audioSource.buffer = audioBuffer;
    audioSource.loop = true;
    audioSource.playbackRate.value = currentPlaybackRate;
    audioSource.connect(audioGainNode);
    audioSource.start(0);
    audioStarted = true;
}

export function updateAudio(throttle, manualInput, isDamaged = false) {
    if (!audioCtx || !audioStarted) return;
    const targetVolume = 0.12 + (isDamaged ? Math.random() * 0.3 : throttle) * 0.88;
    const targetRate   = 0.78 + (isDamaged ? Math.random() * 0.3 : throttle) * 0.5;

    currentVolume       += (targetVolume - currentVolume) * 0.08;
    currentPlaybackRate += (targetRate   - currentPlaybackRate) * 0.08;

    audioPitchFilter.gain.value = manualInput * 3.5;
    if (isDamaged && Math.random() < 0.08) {
        audioPitchFilter.frequency.value = 300 + Math.random() * 1000;
    } else if (!isDamaged) {
        audioPitchFilter.frequency.value = 800;
    }

    audioGainNode.gain.setTargetAtTime(currentVolume, audioCtx.currentTime, 0.04);
    if (audioSource) audioSource.playbackRate.setTargetAtTime(currentPlaybackRate, audioCtx.currentTime, 0.04);
}

/** Вызывать при выходе из игры */
export function disposeAudio() {
    if (audioSource) {
        try { audioSource.stop(); } catch (e) {}
        audioSource = null;
    }
    if (audioCtx) {
        audioCtx.close();
        audioCtx = null;
    }
    audioStarted = false;
    audioBuffer = null;
}

export const tryAudioInit = () => {
    if (!audioCtx) initAudio();
    else if (audioCtx.state === 'suspended') {
        audioCtx.resume().then(() => { if (!audioStarted) startAudioLoop(); });
    }
};
