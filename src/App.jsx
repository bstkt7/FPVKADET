import React, { useEffect, useRef, useState, useCallback } from 'react';
import { initEngine } from './engine.js';
import { initGamepadVisualizer, gamepadState } from './gamepad.js';
import { tryAudioInit } from './audio.js';
import { globalStyles } from './styles/global.js';
import { InstructionModal } from './components/modals/InstructionModal.jsx';
import { SettingsModal }    from './components/modals/SettingsModal.jsx';
import { InGameButtons }    from './components/GameOverlay.jsx';
import { StartScreen }      from './components/StartScreen.jsx';
import { LeaderboardModal } from './components/modals/LeaderboardModal.jsx';
import { DRONE_CLASSES }    from './physics.js';

// ── Дефолтные настройки ───────────────────────────────────────────────────────
// Используем defaultPID прямо из DRONE_CLASSES (единственный источник истины)
const DEFAULT_SETTINGS = {
    playerName:     'СпидиГонщик',
    droneClass:     'freestyle_5',
    droneMode:      'angle',
    flightMode:     'medium',
    controllerType: 'gamepad',
    map:            'hangar',
    weather:        'clear',
    fov:            90,
    sensitivity:    5,
    groundFriction: 5,
    invertPitch:    false,
    vignette:       true,
    chromatic:      true,
    glitch:         true,
    arcadeMode:     false,
    quality:        'medium',
    pid:            null,   // null = брать из DRONE_CLASSES[droneClass].defaultPID
};

/** Загрузить настройки из localStorage, смержить с DEFAULT_SETTINGS */
function loadSettings() {
    try {
        const saved = localStorage.getItem('fpv_settings');
        if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(s) {
    try { localStorage.setItem('fpv_settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function App() {
    const [settings,     setSettings    ] = useState(loadSettings);
    const [started,      setStarted     ] = useState(false);
    const [showInstr,    setShowInstr   ] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLb,       setShowLb      ] = useState(false);
    const [gpLabel,      setGpLabel     ] = useState('НЕТ');
    const [gpConnected,  setGpConnected ] = useState(false);

    const threeRef    = useRef(null);
    const hudRef      = useRef(null);
    const hudStaticRef = useRef(null);
    const gpCanvasRef = useRef(null);
    const gpInfoRef   = useRef(null);
    const audioRef    = useRef(null);
    const disposeRef  = useRef(null);  // хранит dispose() от initEngine

    // ── Изменение настройки ───────────────────────────────────────────────────
    const changeSetting = useCallback((key, val) => {
        setSettings(prev => {
            const next = { ...prev, [key]: val };
            saveSettings(next);
            return next;
        });
    }, []);

    // ── Геймпад-пульс ─────────────────────────────────────────────────────────
    useEffect(() => {
        const id = setInterval(() => {
            setGpConnected(gamepadState.connected);
            if (gamepadState.connected) {
                setGpLabel(gamepadState.id.substring(0, 20) || 'OK');
            } else {
                setGpLabel('НЕТ');
            }
        }, 500);
        return () => clearInterval(id);
    }, []);

    // ── Фоновая музыка меню ───────────────────────────────────────────────────
    useEffect(() => {
        if (started) {
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
            return;
        }
        const audio = new Audio('/assets/sounds/soundtrack.mp3');
        audio.loop   = true;
        audio.volume = 0.25;
        audio.onerror = () => { audioRef.current = null; };
        audioRef.current = audio;
        const play = () => audio.play().catch(() => {});
        document.addEventListener('pointerdown', play, { once: true });
        document.addEventListener('keydown',     play, { once: true });
        return () => {
            document.removeEventListener('pointerdown', play);
            document.removeEventListener('keydown',     play);
            audio.pause(); audio.src = '';
        };
    }, [started]);

    // ── Инициализация геймпад-визуализатора ───────────────────────────────────
    useEffect(() => {
        if (!started) return;
        initGamepadVisualizer(gpInfoRef.current, gpCanvasRef.current);
    }, [started]);

    // ── Запуск движка  ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!started) return;

        // Подготовить PID из настроек или дефолт из DRONE_CLASSES
        const cls   = DRONE_CLASSES[settings.droneClass] || DRONE_CLASSES['freestyle_5'];
        const pid   = (settings.pid && settings.pid._fromClass === settings.droneClass)
            ? settings.pid
            : cls.defaultPID;

        const dispose = initEngine({
            threeCanvas:  threeRef.current,
            hudCanvas:    hudRef.current,
            hudStaticCanvas: hudStaticRef.current,
            infoElement:  gpInfoRef.current,
            config: {
                ...settings,
                fov:          settings.fov,
                sensitivity:  settings.sensitivity,
                groundFriction: settings.groundFriction,
                pid,
            },
        });
        disposeRef.current = dispose ?? null;

        return () => {
            if (typeof disposeRef.current === 'function') {
                disposeRef.current();
                disposeRef.current = null;
            }
        };
    }, [started]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Обработчики ──────────────────────────────────────────────────────────
    const handleStart = useCallback(() => {
        tryAudioInit();
        setStarted(true);
    }, []);

    const handleExit = useCallback(() => {
        if (typeof disposeRef.current === 'function') {
            disposeRef.current();
            disposeRef.current = null;
        }
        setStarted(false);
    }, []);

    const handleStartTutorial = useCallback(() => {
        tryAudioInit();
        // Временно форсируем настройки для туториала
        setSettings(prev => ({ ...prev, map: 'tutorial' })); 
        setStarted(true);
    }, []);

    // ── Рендер ───────────────────────────────────────────────────────────────
    return (
        <>
            <style>{globalStyles}</style>

            {/* Three.js canvas */}
            <canvas
                ref={threeRef}
                id="threeCanvas"
                style={{
                    position: 'fixed', inset: 0,
                    width: '100%', height: '100%',
                    display: started ? 'block' : 'none',
                    zIndex: 1,
                }}
            />

            {/* HUD canvas (Dynamic) */}
            <canvas
                ref={hudRef}
                id="interface"
                style={{
                    position: 'fixed', inset: 0,
                    width: '100%', height: '100%',
                    pointerEvents: 'none',
                    display: started ? 'block' : 'none',
                    zIndex: 11,
                }}
            />

            {/* HUD layer (Static) */}
            <canvas
                ref={hudStaticRef}
                id="static-interface"
                style={{
                    position: 'fixed', inset: 0,
                    width: '100%', height: '100%',
                    pointerEvents: 'none',
                    display: started ? 'block' : 'none',
                    zIndex: 10,
                }}
            />

            {/* Геймпад-визуализатор */}
            {started && (
                <div className="gamepad-info" style={{
                    position: 'fixed', bottom: 10, left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(0,0,0,0.15)',
                    paddingTop: 10, zIndex: 20,
                }}>
                    <div
                        ref={gpInfoRef}
                        id="info"
                        style={{
                            maxWidth: 300, textAlign: 'center',
                            fontWeight: 700, color: 'white', zIndex: 2,
                            fontFamily: '"JetBrains Mono", monospace',
                            fontSize: 11,
                        }}
                    />
                    <canvas ref={gpCanvasRef} width={240} height={140} style={{ display: 'block' }} />
                </div>
            )}

            {/* Вспышка по экрану при старте */}
            {!started && (
                <StartScreen
                    settings={settings}
                    gpConnected={gpConnected}
                    gpLabel={gpLabel}
                    onStart={handleStart}
                    onStartTutorial={handleStartTutorial}
                    onShowInstr={() => setShowInstr(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onShowLeaderboard={() => setShowLb(true)}
                />
            )}

            {/* Кнопки внутри игры */}
            {started && (
                <InGameButtons
                    onShowInstr={() => setShowInstr(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onExit={handleExit}
                />
            )}

            {/* Модалки */}
            {showInstr && (
                <InstructionModal onClose={() => setShowInstr(false)} />
            )}
            {showSettings && (
                <SettingsModal
                    settings={settings}
                    onChange={changeSetting}
                    onClose={() => setShowSettings(false)}
                />
            )}
            {showLb && (
                <LeaderboardModal mapName={settings.map} onClose={() => setShowLb(false)} />
            )}
        </>
    );
}