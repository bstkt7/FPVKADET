import React from 'react';
import T from '../../styles/tokens.js';
import { Modal, ModalHeader } from '../ui/Modal.jsx';
import { Key, Pill, SectionLabel, Divider, BindRow } from '../ui/index.jsx';

export function InstructionModal({ onClose }) {
    return (
        <Modal onClose={onClose} maxWidth={720}>
            <ModalHeader title="Управление" subtitle="Flight Manual v1.0" onClose={onClose} />
            <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Keyboard */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '18px 20px' }}>
                    <SectionLabel color={T.accent}>Клавиатура</SectionLabel>
                    <BindRow action="Газ вверх / вниз"><Key>W</Key><Key>S</Key></BindRow>
                    <BindRow action="Рысканье"><Key>A</Key><Key>D</Key></BindRow>
                    <BindRow action="Наклон вперёд / назад"><Key>↑</Key><Key>↓</Key></BindRow>
                    <BindRow action="Крен влево / вправо"><Key>←</Key><Key>→</Key></BindRow>
                    <BindRow action="Переключить вид"><Key>Tab</Key></BindRow>
                    <BindRow action="Режим дрона"><Key>M</Key></BindRow>
                    <BindRow action="Бомба (зарядить / сбросить)"><Key>N</Key></BindRow>
                    <BindRow action="Рестарт (после краша)"><Key>R</Key></BindRow>
                </div>

                {/* Gamepad */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '18px 20px' }}>
                    <SectionLabel color={T.blue}>Геймпад Xbox / DualShock</SectionLabel>
                    <BindRow action="Газ (Throttle)"><Pill color={T.blue}>L2 / LT</Pill></BindRow>
                    <BindRow action="Крен / Наклон"><Pill color={T.blue}>R-стик XY</Pill></BindRow>
                    <BindRow action="Рысканье (Yaw)"><Pill color={T.blue}>L-стик X</Pill></BindRow>
                    <Divider />
                    <SectionLabel color={T.blue}>Оси (режим Gamepad)</SectionLabel>
                    <BindRow action="Axis 0 — крен"><Key>L-X</Key></BindRow>
                    <BindRow action="Axis 1 — наклон"><Key>L-Y</Key></BindRow>
                    <BindRow action="Axis 2 — газ"><Key>L2 / LT</Key></BindRow>
                    <BindRow action="Axis 3 — рысканье"><Key>R-X</Key></BindRow>
                </div>

                {/* FPV controller */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '18px 20px' }}>
                    <SectionLabel color={T.amber}>FPV-пульт (Mode 2)</SectionLabel>
                    <BindRow action="Газ (Throttle)"><Pill color={T.amber}>L-стик вверх/вниз</Pill></BindRow>
                    <BindRow action="Рысканье (Yaw)"><Pill color={T.amber}>L-стик лево/право</Pill></BindRow>
                    <BindRow action="Наклон (Pitch)"><Pill color={T.amber}>R-стик вверх/вниз</Pill></BindRow>
                    <BindRow action="Крен (Roll)"><Pill color={T.amber}>R-стик лево/право</Pill></BindRow>
                    <Divider />
                    <SectionLabel color={T.amber}>Оси (режим FPV)</SectionLabel>
                    <BindRow action="Axis 0 — крен"><Key>R-X</Key></BindRow>
                    <BindRow action="Axis 1 — наклон"><Key>R-Y</Key></BindRow>
                    <BindRow action="Axis 2 — газ (инв.)"><Key>L-Y</Key></BindRow>
                    <BindRow action="Axis 3 — рысканье"><Key>L-X</Key></BindRow>
                </div>

                {/* Tips */}
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '18px 20px' }}>
                    <SectionLabel color={T.accent}>Советы</SectionLabel>
                    {[
                        ['Hover',  'Удерживай газ ~50% — дрон зависает'],
                        ['Разгон', 'Наклони вперёд + газ выше 50%'],
                        ['Разворот','Yaw при наклоне = управляемый поворот'],
                        ['Посадка','Снижай газ медленно ниже 40%'],
                        ['Angle',  'Авто-стабилизация + удержание высоты'],
                        ['Sport',  'Крены до 80°, больше скорость, без Alt-hold'],
                        ['Acro',   'Полный ручной контроль, без ограничений'],
                        ['[M]',    'Цикл: Angle → Sport → Acro'],
                        ['[N]',    'Зарядить/сбросить бомбу'],
                    ].map(([k, v]) => (
                        <div key={k} style={{ marginBottom: 9, display: 'flex', gap: 10 }}>
                            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, minWidth: 64, flexShrink: 0 }}>{k}</span>
                            <span style={{ fontFamily: T.sans, fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{v}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div style={{ padding: '12px 28px', borderTop: `1px solid ${T.border}`, fontFamily: T.mono, fontSize: 9, color: T.faint, letterSpacing: 1 }}>
                НАЖМИ ESC ИЛИ КЛИКНИ ЗА ПРЕДЕЛАМИ ОКНА ЧТОБЫ ЗАКРЫТЬ
            </div>
        </Modal>
    );
}
