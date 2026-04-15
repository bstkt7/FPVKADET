import React from 'react';
import T from '../styles/tokens.js';
import { Key } from './ui/index.jsx';
import { StatusDot } from './GameOverlay.jsx';
import { DronePreview } from './DronePreview.jsx';
import { MAP_SHORT_LABELS, WEATHER_LABELS, DRONE_CLASS_LABELS } from '../config/labels.js';

// ── QuickPanel — правая панель быстрых настроек ───────────────────────────────

function QuickChip({ label, active, color = T.accent, onClick }) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '5px 10px', borderRadius: 4, cursor: 'pointer',
                border: `1px solid ${active ? color + '66' : T.border}`,
                background: active ? color + '12' : T.surface,
                color: active ? color : T.muted,
                fontFamily: T.mono, fontSize: 10, letterSpacing: 0.8,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => {
                if (!active) {
                    e.currentTarget.style.borderColor = color + '44';
                    e.currentTarget.style.color = color + 'bb';
                }
            }}
            onMouseLeave={e => {
                if (!active) {
                    e.currentTarget.style.borderColor = T.border;
                    e.currentTarget.style.color = T.muted;
                }
            }}
        >{label}</button>
    );
}

function QuickToggle({ label, value, color = T.accent, onChange }) {
    return (
        <div
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: `1px solid ${T.border}22`,
            }}
        >
            <span style={{ fontFamily: T.mono, fontSize: 10, color: value ? T.text : T.muted, letterSpacing: 0.8 }}>
                {label}
            </span>
            <div
                onClick={onChange}
                style={{
                    width: 34, height: 18, borderRadius: 9, cursor: 'pointer',
                    position: 'relative', flexShrink: 0,
                    background: value ? color : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${value ? color + '80' : T.border}`,
                    transition: 'background 0.2s',
                }}
            >
                <div style={{
                    position: 'absolute', top: 1, left: value ? 15 : 1,
                    width: 14, height: 14, borderRadius: '50%',
                    background: value ? '#000' : T.muted,
                    transition: 'left 0.2s',
                }} />
            </div>
        </div>
    );
}

function PanelSection({ title, color = T.muted, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{
                fontFamily: T.mono, fontSize: 8, color,
                letterSpacing: 2.5, marginBottom: 8,
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                {title}
                <div style={{ flex: 1, height: 1, background: `${color}22` }} />
            </div>
            {children}
        </div>
    );
}

function QuickConfigPanel({ settings, onChange }) {
    const mapEntries = Object.entries(MAP_SHORT_LABELS);
    const weatherEntries = Object.entries(WEATHER_LABELS);
    const droneEntries = Object.entries(DRONE_CLASS_LABELS);

    const droneColor = id =>
        id === 'tiny_whoop' ? T.blue : id === 'heavy_sync' ? T.amber : T.accent;

    const weatherEmoji = key => ({ clear: '☀', overcast: '☁', rain: '🌧', storm: '⛈', snow: '❄', fog: '🌫', night: '🌙' })[key] || '';
    const mapEmoji = key => ({ warehouse: '🏭', city: '🏙', forest: '🌲', desert: '🏜', stadium: '🏟', rooftop: '🏢', canyon: '🏔', underground: '⛏' })[key] || '';

    return (
        <div style={{
            position: 'relative', zIndex: 2,
            width: 220, flexShrink: 0,
            background: '#08080c',
            border: `1px solid ${T.border}`,
            borderTop: `1px solid rgba(0,230,100,0.12)`,
            borderRadius: 8,
            boxShadow: '0 0 80px rgba(0,0,0,0.9)',
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Top accent */}
            <div style={{
                position: 'absolute', top: 0, left: '15%', right: '15%', height: 1,
                background: `linear-gradient(to right, transparent, ${T.accent}66, transparent)`,
            }} />

            <div style={{ padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Header */}
                <div style={{
                    fontFamily: T.mono, fontSize: 9, color: T.accent,
                    letterSpacing: 3, marginBottom: 16,
                    display: 'flex', alignItems: 'center', gap: 8,
                }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: T.accent }} />
                    БЫСТРАЯ НАСТРОЙКА
                </div>

                {/* Drone class */}
                <PanelSection title="КЛАСС ДРОНА" color={T.amber}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {droneEntries.map(([id, label]) => (
                            <QuickChip
                                key={id}
                                label={label}
                                active={settings.droneClass === id}
                                color={droneColor(id)}
                                onClick={() => { onChange('droneClass', id); onChange('pid', null); }}
                            />
                        ))}
                    </div>
                </PanelSection>

                {/* Map */}
                <PanelSection title="ТРАССА" color={T.accent}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {mapEntries.map(([id, label]) => (
                            <QuickChip
                                key={id}
                                label={`${mapEmoji(id)} ${label}`}
                                active={settings.map === id}
                                color={T.accent}
                                onClick={() => onChange('map', id)}
                            />
                        ))}
                    </div>
                </PanelSection>

                {/* Weather */}
                <PanelSection title="ПОГОДА" color={T.blue}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {weatherEntries.map(([id, label]) => (
                            <QuickChip
                                key={id}
                                label={`${weatherEmoji(id)} ${label}`}
                                active={settings.weather === id}
                                color={T.blue}
                                onClick={() => onChange('weather', id)}
                            />
                        ))}
                    </div>
                </PanelSection>

                {/* Visual FX */}
                <PanelSection title="ВИЗУАЛЬНЫЕ ЭФФЕКТЫ" color={T.muted}>
                    <QuickToggle
                        label="ВИНЬЕТКА"
                        value={settings.vignette}
                        color={T.accent}
                        onChange={() => onChange('vignette', !settings.vignette)}
                    />
                    <QuickToggle
                        label="ХРОМ. АБЕРРАЦИЯ"
                        value={settings.chromatic}
                        color={T.accent}
                        onChange={() => onChange('chromatic', !settings.chromatic)}
                    />
                    <QuickToggle
                        label="ПОМЕХИ / ГЛИТЧ"
                        value={settings.glitch}
                        color={T.accent}
                        onChange={() => onChange('glitch', !settings.glitch)}
                    />
                </PanelSection>

                {/* Footer hint */}
                <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                    <div style={{
                        padding: '8px 10px', borderRadius: 4,
                        border: `1px solid ${T.border}`, background: T.surface,
                        fontFamily: T.sans, fontSize: 10, color: T.muted, lineHeight: 1.5,
                        textAlign: 'center',
                    }}>
                        Все параметры →{' '}
                        <span style={{ color: T.accent, cursor: 'default' }}>НАСТРОЙКИ</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── StartScreen ───────────────────────────────────────────────────────────────

export function StartScreen({ settings, gpConnected, gpLabel, onStart, onStartTutorial, onShowInstr, onShowSettings, onShowLeaderboard, onChange }) {
    const mapLabel = MAP_SHORT_LABELS;
    const weatherLabel = WEATHER_LABELS;
    const classLabel = DRONE_CLASS_LABELS;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: T.bg,
            overflow: 'hidden',
        }}>
            {/* Background grid */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
                backgroundImage: `
                  linear-gradient(rgba(0,230,100,0.025) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(0,230,100,0.025) 1px, transparent 1px)
                `,
                backgroundSize: '40px 40px',
            }} />
            {/* Radial glow */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
                background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,230,100,0.04) 0%, transparent 70%)',
            }} />
            {/* Scanline */}
            <div style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: '2px',
                background: 'linear-gradient(to right, transparent, rgba(0,230,100,0.15), transparent)',
                animation: 'scanline 6s linear infinite',
                pointerEvents: 'none', zIndex: 1,
            }} />

            {/* Drone 3D preview */}
            <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: '20vw', height: '20vw',
                minWidth: 180, minHeight: 180,
                pointerEvents: 'none', zIndex: 1,
            }}>
                <div style={{
                    position: 'absolute', top: 16, left: 16, width: 24, height: 24,
                    borderTop: `1px solid ${T.accent}33`, borderLeft: `1px solid ${T.accent}33`,
                }} />
                <div style={{
                    position: 'absolute', bottom: 16, right: 16, width: 24, height: 24,
                    borderBottom: `1px solid ${T.accent}33`, borderRight: `1px solid ${T.accent}33`,
                }} />
                <DronePreview />
            </div>

            {/* ── Two-panel wrapper ── */}
            <div className="fade-in" style={{
                position: 'relative', zIndex: 2,
                display: 'flex', gap: 12, alignItems: 'stretch',
                margin: '0 20px',
            }}>

                {/* ── Left: main card (original) ── */}
                <div style={{
                    width: 400, flexShrink: 0,
                    background: '#08080c',
                    border: `1px solid ${T.border}`,
                    borderTop: `1px solid rgba(0,230,100,0.2)`,
                    borderRadius: 8,
                    boxShadow: '0 0 80px rgba(0,0,0,0.9), 0 0 40px rgba(0,230,100,0.03)',
                    position: 'relative',
                }}>
                    {/* Top accent line */}
                    <div style={{
                        position: 'absolute', top: 0, left: '20%', right: '20%', height: 1,
                        background: `linear-gradient(to right, transparent, ${T.accent}, transparent)`,
                        borderRadius: 1,
                    }} />

                    <div style={{ padding: '24px 28px 26px' }}>
                        {/* Logo */}
                        <div style={{ textAlign: 'center', marginBottom: 6 }}>
                            <img
                                src="/assets/images/logo.png"
                                alt="FPV"
                                style={{ height: 140, filter: `drop-shadow(0 0 16px ${T.accent}44)` }}
                                onError={e => { e.target.style.display = 'none'; }}
                            />
                        </div>

                        {/* Title */}
                        <div style={{ textAlign: 'center', marginBottom: 22 }}>
                            <div style={{
                                fontFamily: T.mono, fontSize: 20, color: T.accent,
                                letterSpacing: 5, marginBottom: 6,
                                textShadow: `0 0 20px ${T.accent}40`,
                            }}>FPV СИМУЛЯТОР 0.1a</div>
                            <div style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: 2.5 }}>
                                ГБОУ ГККШИ ИМ. В. В. УСМАНОВА
                            </div>
                        </div>

                        {/* Status row */}
                        <div style={{
                            display: 'flex', gap: 0, marginBottom: 22,
                            border: `1px solid ${T.border}`, borderRadius: 5,
                            overflow: 'hidden',
                        }}>
                            {[
                                { label: 'СИСТЕМА', value: 'ГОТОВО', color: T.accent },
                                { label: 'КОНТРОЛЛЕР', value: gpLabel, color: gpConnected ? T.accent : T.amber },
                                {
                                    label: 'РЕЖИМ',
                                    value: settings.droneMode === 'acro' ? 'ACRO' : settings.droneMode === 'sport' ? 'SPORT' : 'ANGLE',
                                    color: T.blue,
                                },
                            ].map(({ label, value, color }, i) => (
                                <React.Fragment key={label}>
                                    {i > 0 && <div style={{ width: 1, background: T.border, flexShrink: 0 }} />}
                                    <div style={{ flex: 1, padding: '10px 0', background: T.surface }}>
                                        <StatusDot label={label} value={value} color={color} />
                                    </div>
                                </React.Fragment>
                            ))}
                        </div>

                        {/* Quick binds */}
                        <div style={{
                            marginBottom: 18, padding: '12px 14px',
                            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5,
                        }}>
                            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, letterSpacing: 2.5, marginBottom: 10 }}>
                                БЫСТРЫЕ КЛАВИШИ
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                                {[
                                    ['Tab', 'Переключить вид (FPV / 3rd)'],
                                    ['M', 'Режим: Angle / Sport / Acro'],
                                    ['N', 'Бомба (зарядить / сбросить)'],
                                    ['R', 'Рестарт после краша'],
                                ].map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Key>{k}</Key>
                                        <span style={{ fontFamily: T.sans, fontSize: 11, color: T.muted }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Config preview */}
                        <div style={{
                            marginBottom: 18, padding: '9px 14px',
                            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        }}>
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted, letterSpacing: 1 }}>
                                {classLabel[settings.droneClass]} — {mapLabel[settings.map]} — {weatherLabel[settings.weather]}
                            </span>
                            <button
                                onClick={onShowSettings}
                                style={{
                                    background: 'none', border: `1px solid ${T.border}`, borderRadius: 3,
                                    color: T.muted, fontFamily: T.mono, fontSize: 9, letterSpacing: 1,
                                    cursor: 'pointer', padding: '3px 8px',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + '44'; e.currentTarget.style.color = T.accent; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
                            >ИЗМЕНИТЬ</button>
                        </div>

                        {/* Secondary buttons */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            {[
                                { label: 'ИНСТРУКЦИЯ', color: T.blue, bg: T.blueDim, action: onShowInstr },
                                { label: 'РЕКОРДЫ', color: T.accent, bg: T.accent + '22', action: onShowLeaderboard },
                                { label: 'РЕДАКТОР', color: T.amber, bg: T.amberDim, action: () => window.open('/map-editor.html', '_blank') },
                            ].map(({ label, color, bg, action }) => (
                                <button
                                    key={label}
                                    onClick={action}
                                    style={{
                                        flex: 1, padding: '9px 0', borderRadius: 5,
                                        border: `1px solid ${color}22`, background: bg,
                                        color, fontFamily: T.mono, fontSize: 10, letterSpacing: 1.5,
                                        cursor: 'pointer', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = color + '55'; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = color + '22'; }}
                                >{label}</button>
                            ))}
                        </div>

                        {/* Start buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <button
                                onClick={onStart}
                                style={{
                                    width: '100%', padding: '12px 0', borderRadius: 5, border: 'none',
                                    background: `linear-gradient(135deg, ${T.accent}, #00c056)`,
                                    color: '#000', fontFamily: T.mono, fontSize: 12,
                                    fontWeight: 700, letterSpacing: 3, cursor: 'pointer',
                                    transition: 'opacity 0.15s, transform 0.15s',
                                    boxShadow: `0 4px 24px rgba(0,230,100,0.2)`,
                                }}
                                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.transform = 'none'; }}
                            >ЗАПУСТИТЬ</button>

                            <button
                                onClick={onStartTutorial}
                                style={{
                                    width: '100%', padding: '10px 0', borderRadius: 5, border: `1px solid ${T.blue}44`,
                                    background: 'transparent',
                                    color: T.blue, fontFamily: T.mono, fontSize: 11,
                                    fontWeight: 700, letterSpacing: 2, cursor: 'pointer',
                                    transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = `${T.blue}22`; e.currentTarget.style.borderColor = T.blue; }}
                                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = `${T.blue}44`; }}
                            >ОБУЧЕНИЕ</button>
                        </div>
                    </div>
                </div>

                {/* ── Right: quick config panel ── */}
                <QuickConfigPanel settings={settings} onChange={onChange} />

            </div>{/* end two-panel wrapper */}
        </div>
    );
}