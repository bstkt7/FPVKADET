import React from 'react';
import T from '../../styles/tokens.js';

export function Modal({ onClose, children, maxWidth = 700 }) {
    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.8)',
                backdropFilter: 'blur(8px)',
                animation: 'fadeIn 0.2s ease',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '100%', maxWidth,
                    maxHeight: '88vh', overflowY: 'auto',
                    margin: '0 20px',
                    background: '#0a0a0e',
                    border: `1px solid ${T.border}`,
                    borderTop: `1px solid ${T.borderHi}`,
                    borderRadius: 8,
                    boxShadow: '0 40px 120px rgba(0,0,0,0.9)',
                }}
                onClick={e => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}

export function ModalHeader({ title, subtitle, onClose }) {
    return (
        <div style={{
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            padding: '24px 28px 20px',
            borderBottom: `1px solid ${T.border}`,
        }}>
            <div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: T.accent, letterSpacing: 3, marginBottom: 5, textTransform: 'uppercase' }}>
                    {subtitle}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 18, color: T.text, letterSpacing: 1 }}>
                    {title}
                </div>
            </div>
            <button
                onClick={onClose}
                style={{
                    background: 'none', border: `1px solid ${T.border}`, borderRadius: 4,
                    color: T.muted, fontFamily: T.mono, fontSize: 11, cursor: 'pointer',
                    padding: '5px 10px', flexShrink: 0, marginTop: 4,
                    transition: 'border-color 0.15s, color 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.faint; e.currentTarget.style.color = T.text; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted; }}
            >ESC</button>
        </div>
    );
}
