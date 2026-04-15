import React, { useEffect, useState } from 'react';
import T from '../../styles/tokens.js';
import { Modal, ModalHeader } from '../ui/Modal.jsx';
import { MAP_LABELS, DRONE_CLASS_LABELS } from '../../config/labels.js';

function formatTime(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const cs = Math.floor((ms % 1000) / 10);
    return `${m > 0 ? m + ':' : ''}${String(s).padStart(m > 0 ? 2 : 1, '0')}.${String(cs).padStart(2, '0')}`;
}

export function LeaderboardModal({ mapName, onClose }) {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLoading(true);
        fetch(`http://localhost:5000/api/leaderboard/${mapName}`)
            .then(res => {
                if (!res.ok) throw new Error('Ошибка связи с сервером');
                return res.json();
            })
            .then(data => {
                setRecords(data);
                setLoading(false);
            })
            .catch(err => {
                setError(err.message);
                setLoading(false);
            });
    }, [mapName]);

    return (
        <Modal onClose={onClose} maxWidth={520}>
            <ModalHeader title="Рекорды сервера" subtitle={`ТРАССА: ${MAP_LABELS[mapName]?.toUpperCase() || mapName}`} onClose={onClose} />
            <div style={{ padding: '22px 28px', minHeight: '300px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted, fontFamily: T.mono, fontSize: 13 }}>
                        <div style={{ marginBottom: 10 }}>Загрузка данных...</div>
                        <div style={{ fontSize: 10, opacity: 0.5 }}>Установка связи с сервером</div>
                    </div>
                ) : error ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: T.amber, fontFamily: T.mono, fontSize: 13 }}>
                        <div style={{ marginBottom: 10 }}>Нет подключения к серверу</div>
                        <div style={{ fontSize: 10, color: T.muted }}>Убедитесь, что backend запущен локально (порт 5000).</div>
                    </div>
                ) : records.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted, fontFamily: T.mono, fontSize: 13 }}>
                        Здесь пока пусто.<br/>Будьте первым, кто установит рекорд на этой трассе!
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: T.mono, fontSize: 11 }}>
                            <thead>
                                <tr style={{ color: T.muted, borderBottom: `1px solid ${T.border}` }}>
                                    <th style={{ textAlign: 'left', padding: '8px 4px', width: 30 }}>#</th>
                                    <th style={{ textAlign: 'left', padding: '8px 4px' }}>ПИЛОТ</th>
                                    <th style={{ textAlign: 'left', padding: '8px 4px' }}>КЛАСС</th>
                                    <th style={{ textAlign: 'right', padding: '8px 4px' }}>ВРЕМЯ</th>
                                </tr>
                            </thead>
                            <tbody>
                                {records.map((r, i) => (
                                    <tr key={r.id || i} style={{ 
                                        borderBottom: i === records.length - 1 ? 'none' : `1px solid rgba(255,255,255,0.04)`, 
                                        color: i === 0 ? T.accent : i === 1 ? '#d6dee3' : i === 2 ? '#b87333' : T.text 
                                    }}>
                                        <td style={{ padding: '14px 4px' }}>{i + 1}</td>
                                        <td style={{ padding: '14px 4px', fontWeight: i === 0 ? 700 : 400 }}>{r.playerName}</td>
                                        <td style={{ padding: '14px 4px', color: T.muted, fontSize: 10 }}>
                                            {DRONE_CLASS_LABELS[r.droneClass]?.split('—')[0]?.trim() || r.droneClass}
                                        </td>
                                        <td style={{ padding: '14px 4px', textAlign: 'right', fontWeight: 700, fontSize: 13 }}>
                                            {formatTime(r.lapTimeMs)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </Modal>
    );
}
