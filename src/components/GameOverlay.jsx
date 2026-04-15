import React, { useState } from 'react';
import T from '../styles/tokens.js';

export function StatusDot({ label, value, color }) {
    return (
        <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: T.muted, letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <span style={{
                    width: 5, height: 5, borderRadius: '50%', background: color,
                    boxShadow: `0 0 6px ${color}`,
                    animation: 'pulse-dot 2s ease-in-out infinite',
                }} />
                <span style={{ fontFamily: T.mono, fontSize: 10, color }}>{value}</span>
            </div>
        </div>
    );
}

export function InGameButtons({ onShowInstr, onShowSettings, onExit }) {
    const [hovered, setHovered] = useState(null);
    const buttons = [
        { id: 'instr',    label: 'ИНСТРУКЦИЯ', color: T.blue,   bg: T.blueDim },
        { id: 'settings', label: 'НАСТРОЙКИ',  color: T.amber,  bg: T.amberDim },
        { id: 'exit',     label: 'ВЫХОД',       color: T.red,    bg: 'rgba(255,60,60,0.08)' },
    ];
    const handlers = { instr: onShowInstr, settings: onShowSettings, exit: onExit };
    return (
        <div style={{
            position: 'fixed', top: 14, right: 20,
            zIndex: 150, display: 'flex', gap: 6, pointerEvents: 'auto',
        }}>
            {buttons.map(btn => (
                <button
                    key={btn.id}
                    onClick={handlers[btn.id]}
                    onMouseEnter={() => setHovered(btn.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                        padding: '6px 14px', borderRadius: 4,
                        border: `1px solid ${btn.color}${hovered === btn.id ? '55' : '22'}`,
                        background: hovered === btn.id ? btn.bg : 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(12px)',
                        color: btn.color, fontFamily: T.mono, fontSize: 10,
                        letterSpacing: 1.5, cursor: 'pointer',
                        transition: 'all 0.15s',
                        transform: hovered === btn.id ? 'translateY(-1px)' : 'none',
                    }}
                >{btn.label}</button>
            ))}
        </div>
    );
}
