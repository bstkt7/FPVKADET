import React from 'react';
import T from '../../styles/tokens.js';
import { Modal, ModalHeader } from '../ui/Modal.jsx';
import { SectionLabel, Divider } from '../ui/index.jsx';
import { DRONE_CLASSES } from '../../physics.js';
import {
    MAP_LABELS, WEATHER_LABELS,
    DRONE_MODE_LABELS, FLIGHT_MODE_LABELS,
    CONTROLLER_TYPE_LABELS, QUALITY_LABELS,
} from '../../config/labels.js';

// ── Внутренние подкомпоненты ──────────────────────────────────────────────────

function SelectRow({ label, hint, value, name, options, onChange }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text, letterSpacing: 1 }}>{label}</span>
                {hint && <span style={{ fontFamily: T.sans, fontSize: 10, color: T.muted }}>{hint}</span>}
            </div>
            <select
                value={value}
                onChange={e => onChange(name, e.target.value)}
                style={{
                    width: '100%', padding: '8px 34px 8px 12px', borderRadius: 5,
                    border: `1px solid ${T.border}`,
                    background: 'rgba(0,0,0,0.5)',
                    color: T.text, fontFamily: T.mono, fontSize: 11, outline: 'none', cursor: 'pointer',
                    transition: 'border-color 0.15s',
                }}
                onFocus={e  => e.target.style.borderColor = T.borderHi}
                onBlur={e   => e.target.style.borderColor = T.border}
            >
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
        </div>
    );
}

function SliderRow({ label, value, name, min, max, step = 1, fmt = v => v, onChange }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text, letterSpacing: 1 }}>{label}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.accent }}>{fmt(value)}</span>
            </div>
            <input type="range" min={min} max={max} step={step} value={value}
                onChange={e => onChange(name, Number(e.target.value))}
            />
        </div>
    );
}

function ToggleRow({ label, hint, value, name, onChange }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
                <div style={{ fontFamily: T.mono, fontSize: 10, color: T.text, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
                {hint && <div style={{ fontFamily: T.sans, fontSize: 11, color: T.muted }}>{hint}</div>}
            </div>
            <div
                onClick={() => onChange(name, !value)}
                style={{
                    width: 40, height: 22, borderRadius: 11, cursor: 'pointer', position: 'relative', flexShrink: 0,
                    background: value ? T.accent : 'rgba(255,255,255,0.08)',
                    border: `1px solid ${value ? T.accent + '80' : T.border}`,
                    transition: 'background 0.2s',
                }}
            >
                <div style={{
                    position: 'absolute', top: 2, left: value ? 19 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: value ? '#000' : T.muted,
                    transition: 'left 0.2s',
                }} />
            </div>
        </div>
    );
}

function TextRow({ label, hint, value, name, onChange, maxLength }) {
    return (
        <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text, letterSpacing: 1 }}>{label}</span>
                {hint && <span style={{ fontFamily: T.sans, fontSize: 10, color: T.muted }}>{hint}</span>}
            </div>
            <input
                type="text"
                value={value || ''}
                maxLength={maxLength || 20}
                onChange={e => onChange(name, e.target.value)}
                style={{
                    width: '100%', padding: '8px 12px', borderRadius: 5,
                    border: `1px solid ${T.border}`,
                    background: 'rgba(0,0,0,0.5)',
                    color: T.text, fontFamily: T.mono, fontSize: 11, outline: 'none',
                    transition: 'border-color 0.15s',
                }}
                onFocus={e  => e.target.style.borderColor = T.accent}
                onBlur={e   => e.target.style.borderColor = T.border}
            />
        </div>
    );
}

// ── PID секция — читает defaultPID напрямую из DRONE_CLASSES ─────────────────
function PidSection({ settings, onChange }) {
    const cls = DRONE_CLASSES[settings.droneClass] || DRONE_CLASSES['freestyle_5'];
    const defaults = cls.defaultPID;
    const current  = (settings.pid && settings.pid._fromClass === settings.droneClass)
        ? settings.pid
        : { ...defaults, _fromClass: settings.droneClass };

    const pidFields = [
        { key: 'pP', label: 'Pitch P', min: 0.01, max: 0.50, step: 0.01 },
        { key: 'pI', label: 'Pitch I', min: 0.001, max: 0.10, step: 0.001 },
        { key: 'pD', label: 'Pitch D', min: 0.01, max: 1.20, step: 0.01 },
        { key: 'rP', label: 'Roll P',  min: 0.01, max: 0.50, step: 0.01 },
        { key: 'rD', label: 'Roll D',  min: 0.01, max: 1.20, step: 0.01 },
        { key: 'yP', label: 'Yaw P',   min: 0.01, max: 0.40, step: 0.01 },
    ];

    return (
        <>
            {pidFields.map(({ key, label, min, max, step }) => (
                <div key={key} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
                        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.text, letterSpacing: 1 }}>{label}</span>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>
                                def: {defaults[key].toFixed(key === 'pI' ? 3 : 2)}
                            </span>
                            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.blue }}>
                                {(current[key] || defaults[key]).toFixed(key === 'pI' ? 3 : 2)}
                            </span>
                        </div>
                    </div>
                    <input type="range" min={min} max={max} step={step}
                        value={current[key] || defaults[key]}
                        onChange={e => {
                            const newPid = { ...current, [key]: Number(e.target.value), _fromClass: settings.droneClass };
                            onChange('pid', newPid);
                        }}
                    />
                </div>
            ))}
            <button
                onClick={() => onChange('pid', null)}
                style={{
                    marginBottom: 4, padding: '6px 14px', borderRadius: 4,
                    border: `1px solid ${T.border}`, background: 'transparent',
                    color: T.muted, fontFamily: T.mono, fontSize: 10, letterSpacing: 1,
                    cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.amber + '55'; e.currentTarget.style.color = T.amber; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
            >СБРОСИТЬ К ДЕФОЛТУ</button>
        </>
    );
}

// ── SettingsModal ─────────────────────────────────────────────────────────────
export function SettingsModal({ settings, onChange, onClose }) {
    const { invertPitch, flightMode, controllerType, fov, sensitivity, groundFriction } = settings;

    const droneClasses = Object.entries(DRONE_CLASSES).map(([id, cls]) => ({
        id,
        name:  cls.label,
        size:  cls.desc,
        color: id === 'tiny_whoop' ? T.blue : id === 'heavy_sync' ? T.amber : T.accent,
    }));

    return (
        <Modal onClose={onClose} maxWidth={480}>
            <ModalHeader title="Настройки" subtitle="Конфигурация" onClose={onClose} />
            <div style={{ padding: '22px 28px' }}>

                <SectionLabel>Профиль игрока</SectionLabel>
                <TextRow label="ИМЯ ПИЛОТА (НИКНЕЙМ)" name="playerName" value={settings.playerName} onChange={onChange} maxLength={16} hint="Будет видно в рекордах" />

                <Divider />
                <SectionLabel>Управление</SectionLabel>
                <SelectRow label="ТИП КОНТРОЛЛЕРА" name="controllerType" value={controllerType}
                    onChange={onChange}
                    options={Object.entries(CONTROLLER_TYPE_LABELS)}
                />
                <SelectRow label="РЕЖИМ ДРОНА" hint="[M] в игре" name="droneMode" value={settings.droneMode}
                    onChange={onChange}
                    options={Object.entries(DRONE_MODE_LABELS)}
                />
                <SelectRow label="РЕЖИМ ПОЛЁТА" hint="Чувствительность" name="flightMode" value={flightMode}
                    onChange={onChange}
                    options={Object.entries(FLIGHT_MODE_LABELS)}
                />
                <ToggleRow label="ИНВЕРТ ТАНГАЖА" hint="Инвертировать ось Pitch" name="invertPitch" value={invertPitch} onChange={onChange} />

                <Divider />
                <SectionLabel color={T.amber}>Класс дрона</SectionLabel>

                {droneClasses.map(dc => {
                    const active = settings.droneClass === dc.id;
                    return (
                        <div
                            key={dc.id}
                            onClick={() => { onChange('droneClass', dc.id); onChange('pid', null); }}
                            style={{
                                marginBottom: 8, padding: '10px 14px', borderRadius: 5, cursor: 'pointer',
                                border: `1px solid ${active ? dc.color + '66' : T.border}`,
                                background: active ? dc.color + '0e' : T.surface,
                                transition: 'all 0.15s',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
                                <span style={{ fontFamily: T.mono, fontSize: 11, color: active ? dc.color : T.text }}>{dc.name}</span>
                                <span style={{ fontFamily: T.mono, fontSize: 9, color: T.muted }}>{dc.size.split('—')[0].trim()}</span>
                            </div>
                            <div style={{ fontFamily: T.sans, fontSize: 11, color: T.muted }}>{dc.size.split('—').slice(1).join('—').trim()}</div>
                        </div>
                    );
                })}

                <Divider />
                <SectionLabel color={T.blue}>PID-регуляторы</SectionLabel>
                <div style={{ fontFamily: T.sans, fontSize: 11, color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
                    Настройка как в Betaflight. По умолчанию — значения выбранного класса.
                </div>
                <PidSection settings={settings} onChange={onChange} />

                <Divider />
                <SectionLabel>Камера</SectionLabel>
                <SliderRow label="ПОЛЕ ЗРЕНИЯ (FOV)" name="fov" value={fov} min={60} max={120} step={5} fmt={v => `${v}°`} onChange={onChange} />
                <SliderRow label="ЧУВСТВИТЕЛЬНОСТЬ" name="sensitivity" value={sensitivity} min={1} max={10} fmt={v => `${v}/10`} onChange={onChange} />

                <Divider />
                <SectionLabel>Физика</SectionLabel>
                <SliderRow label="ТРЕНИЕ ЗЕМЛИ" name="groundFriction" value={groundFriction} min={1} max={10} fmt={v => `${v}/10`} onChange={onChange} />
                <SelectRow label="КАЧЕСТВО ГРАФИКИ" name="quality" value={settings.quality}
                    onChange={onChange}
                    options={Object.entries(QUALITY_LABELS)}
                />

                <Divider />
                <SectionLabel>Карта и погода</SectionLabel>
                <SelectRow label="ТРАССА" name="map" value={settings.map}
                    onChange={onChange}
                    options={Object.entries(MAP_LABELS)}
                />
                <SelectRow label="ПОГОДА" name="weather" value={settings.weather}
                    onChange={onChange}
                    options={Object.entries(WEATHER_LABELS)}
                />

                <Divider />
                <SectionLabel>Визуальные эффекты</SectionLabel>
                <ToggleRow label="ВИНЬЕТКА"               hint="Затемнение краёв экрана"   name="vignette"  value={settings.vignette}  onChange={onChange} />
                <ToggleRow label="ХРОМАТИЧЕСКАЯ АБЕРРАЦИЯ" hint="RGB-сдвиг по краям"         name="chromatic" value={settings.chromatic} onChange={onChange} />
                <ToggleRow label="ПОМЕХИ / ГЛИТЧ"          hint="Случайные артефакты сигнала" name="glitch"    value={settings.glitch}    onChange={onChange} />

                <button
                    onClick={onClose}
                    style={{
                        width: '100%', marginTop: 4, padding: '10px 0', borderRadius: 5, border: 'none',
                        background: T.accent, color: '#000',
                        fontFamily: T.mono, fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', letterSpacing: 2,
                        transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.target.style.opacity = '0.85'}
                    onMouseLeave={e => e.target.style.opacity = '1'}
                >ПРИМЕНИТЬ</button>
            </div>
        </Modal>
    );
}
