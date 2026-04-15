import React from 'react';
import T from '../../styles/tokens.js';

export function Key({ children }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 26, height: 22, padding: '0 6px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderBottom: '2px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            fontFamily: T.mono, fontSize: 10, color: T.text,
            letterSpacing: 0.5,
        }}>{children}</span>
    );
}

export function Pill({ children, color = T.accent }) {
    const dimMap = {
        [T.accent]: T.accentDim,
        [T.blue]:   T.blueDim,
        [T.amber]:  T.amberDim,
    };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 8px', borderRadius: 3,
            background: dimMap[color] || T.accentDim,
            border: `1px solid ${color}22`,
            fontFamily: T.mono, fontSize: 10, color,
        }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
            {children}
        </span>
    );
}

export function SectionLabel({ children, color = T.accent }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span style={{
                fontFamily: T.mono, fontSize: 9, color,
                letterSpacing: 3, textTransform: 'uppercase',
            }}>{children}</span>
            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${color}20, transparent)` }} />
        </div>
    );
}

export function Divider() {
    return <div style={{ height: 1, background: T.border, margin: '18px 0' }} />;
}

export function BindRow({ action, children }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8, gap: 8,
        }}>
            <span style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, flexShrink: 0 }}>{action}</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{children}</div>
        </div>
    );
}
