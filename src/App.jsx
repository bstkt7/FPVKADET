import React, { useEffect, useRef, useState, useCallback } from 'react';
// НОВОЕ: Импортируем updateEngineConfig
import { initEngine, updateEngineConfig } from './engine.js';
import { initGamepadVisualizer, gamepadState } from './gamepad.js';
import { tryAudioInit } from './audio.js';
import { globalStyles } from './styles/global.js';
import { InstructionModal } from './components/modals/InstructionModal.jsx';
import { SettingsModal } from './components/modals/SettingsModal.jsx';
import { InGameButtons } from './components/GameOverlay.jsx';
import { StartScreen } from './components/StartScreen.jsx';
import { LeaderboardModal } from './components/modals/LeaderboardModal.jsx';
import { DRONE_CLASSES } from './physics.js';

// ── Дефолтные настройки ───────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
    playerName: 'СпидиГонщик',
    droneClass: 'freestyle_5',
    droneMode: 'angle',
    flightMode: 'medium',
    controllerType: 'gamepad',
    map: 'hangar',
    weather: 'clear',
    fov: 90,
    sensitivity: 5,
    groundFriction: 5,
    invertPitch: false,
    vignette: true,
    chromatic: true,
    glitch: true,
    arcadeMode: false,
    quality: 'medium',
    cameraMode: 'fpv',
    pid: null,
};

function loadSettings() {
    try {
        const saved = localStorage.getItem('fpv_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.map === 'tutorial') {
                parsed.map = 'hangar';
            }
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
    } catch (e) { /* ignore */ }
    return { ...DEFAULT_SETTINGS };
}

function saveSettings(s) {
    try { localStorage.setItem('fpv_settings', JSON.stringify(s)); } catch (e) { /* ignore */ }
}

export default function App() {
    const [settings, setSettings] = useState(loadSettings);
    const [started, setStarted] = useState(false);
    const [tutorialMode, setTutorialMode] = useState(false);
    const [showInstr, setShowInstr] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [showLb, setShowLb] = useState(false);
    const [gpLabel, setGpLabel] = useState('НЕТ');
    const [gpConnected, setGpConnected] = useState(false);

    const threeRef = useRef(null);
    const hudRef = useRef(null);
    const hudStaticRef = useRef(null);
    const gpCanvasRef = useRef(null);
    const gpInfoRef = useRef(null);
    const audioRef = useRef(null);
    const disposeRef = useRef(null);

    // ── НОВОЕ: Изменение настройки "На лету" ──────────────────────────────────
    const changeSetting = useCallback((key, val) => {
        setSettings(prev => {
            const next = { ...prev, [key]: val };
            saveSettings(next);

            // Отправляем новые настройки прямиком в запущенный 3D-движок!
            updateEngineConfig(next);

            return next;
        });
    }, []);

    // ── Геймпад-пульс ─────────────────────────────────────────────────────────
    useEffect(() => {
        const update = () => {
            setGpConnected(gamepadState.connected);
            if (gamepadState.connected) {
                setGpLabel(gamepadState.type.toUpperCase());
            } else {
                setGpLabel('НЕТ');
            }
        };
        const id = setInterval(update, 200);
        window.addEventListener('gamepadconnected', update);
        window.addEventListener('gamepaddisconnected', update);
        return () => {
            clearInterval(id);
            window.removeEventListener('gamepadconnected', update);
            window.removeEventListener('gamepaddisconnected', update);
        };
    }, []);

    // ── Фоновая музыка меню ───────────────────────────────────────────────────
    useEffect(() => {
        if (started) {
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
            return;
        }
        const audio = new Audio('/assets/sounds/soundtrack.mp3');
        audio.loop = true;
        audio.volume = 0.25;
        audio.onerror = () => { audioRef.current = null; };
        audioRef.current = audio;
        const play = () => audio.play().catch(() => { });
        document.addEventListener('pointerdown', play, { once: true });
        document.addEventListener('keydown', play, { once: true });
        return () => {
            document.removeEventListener('pointerdown', play);
            document.removeEventListener('keydown', play);
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

        const cls = DRONE_CLASSES[settings.droneClass] || DRONE_CLASSES['freestyle_5'];
        const pid = (settings.pid && settings.pid._fromClass === settings.droneClass)
            ? settings.pid
            : cls.defaultPID;

        const dispose = initEngine({
            threeCanvas: threeRef.current,
            hudCanvas: hudRef.current,
            hudStaticCanvas: hudStaticRef.current,
            infoElement: gpInfoRef.current,
            config: {
                ...settings,
                map: tutorialMode ? 'tutorial' : settings.map,
                fov: settings.fov,
                sensitivity: settings.sensitivity,
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
        setTutorialMode(false);
        setSettings(prev => {
            if (prev.map === 'tutorial') {
                const next = { ...prev, map: 'hangar' };
                saveSettings(next);
                return next;
            }
            return prev;
        });
        setStarted(true);
    }, []);

    const handleExit = useCallback(() => {
        if (typeof disposeRef.current === 'function') {
            disposeRef.current();
            disposeRef.current = null;
        }
        setTutorialMode(false);
        setStarted(false);
    }, []);

    const handleStartTutorial = useCallback(() => {
        tryAudioInit();
        setTutorialMode(true);
        setStarted(true);
    }, []);

    // ── Рендер ───────────────────────────────────────────────────────────────
    return (
        <>
            <style>{globalStyles}</style>

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
                    onChange={changeSetting}
                />
            )}

            {started && (
                <InGameButtons
                    onShowInstr={() => setShowInstr(true)}
                    onShowSettings={() => setShowSettings(true)}
                    onExit={handleExit}
                />
            )}

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