import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

// ── CORS — только разрешённый источник ──────────────────────────────────────
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: '10kb' })); // ограничение размера тела запроса

let db;

// ── Rate-limiting (простой in-memory) ────────────────────────────────────────
const rateMap = new Map();
function rateLimitMiddleware(maxReq = 20, windowMs = 60000) {
    return (req, res, next) => {
        const ip  = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const rec = rateMap.get(ip) || { count: 0, start: now };
        if (now - rec.start > windowMs) { rec.count = 0; rec.start = now; }
        rec.count++;
        rateMap.set(ip, rec);
        if (rec.count > maxReq) {
            return res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' });
        }
        next();
    };
}

// ── Инициализация SQLite ──────────────────────────────────────────────────────
async function initDB() {
    db = await open({ filename: './database.sqlite', driver: sqlite3.Database });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS records (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            playerName TEXT NOT NULL DEFAULT 'AnonymousPilot',
            droneClass TEXT NOT NULL,
            mapName    TEXT NOT NULL,
            lapTimeMs  INTEGER NOT NULL,
            date       DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_records_map ON records(mapName, lapTimeMs);
    `);
    console.log('✅ SQLite готов. Таблица records создана/проверена.');
}

initDB().catch(err => {
    console.error('❌ Ошибка инициализации SQLite:', err);
    process.exit(1);
});

// ── API Routes ────────────────────────────────────────────────────────────────

/** GET /api/leaderboard/:map — Получить ТОП-15 рекордов */
app.get('/api/leaderboard/:map', async (req, res) => {
    try {
        const map = String(req.params.map).slice(0, 50);
        const records = await db.all(
            `SELECT id, playerName, droneClass, mapName, lapTimeMs, date
             FROM records
             WHERE mapName = ?
             ORDER BY lapTimeMs ASC
             LIMIT 15`,
            [map]
        );
        res.json(records);
    } catch (error) {
        console.error('[leaderboard GET]', error);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

/** POST /api/leaderboard — Сохранить рекорд */
app.post('/api/leaderboard', rateLimitMiddleware(20, 60000), async (req, res) => {
    try {
        const { playerName, droneClass, mapName, lapTimeMs } = req.body;

        // ── Валидация ──
        if (!lapTimeMs || !mapName || !droneClass) {
            return res.status(400).json({ error: 'Не хватает данных для сохранения.' });
        }
        if (typeof lapTimeMs !== 'number' || lapTimeMs < 5000 || lapTimeMs > 3600000) {
            return res.status(400).json({ error: 'Некорректное время круга (5с – 60мин).' });
        }
        const validClasses = ['tiny_whoop', 'freestyle_5', 'heavy_sync'];
        if (!validClasses.includes(droneClass)) {
            return res.status(400).json({ error: 'Неизвестный класс дрона.' });
        }

        const name = String(playerName || 'AnonymousPilot').trim().slice(0, 30) || 'AnonymousPilot';
        const map  = String(mapName).slice(0, 50);

        const result = await db.run(
            `INSERT INTO records (playerName, droneClass, mapName, lapTimeMs) VALUES (?, ?, ?, ?)`,
            [name, droneClass, map, Math.round(lapTimeMs)]
        );

        res.status(201).json({ message: 'Рекорд сохранён!', recordId: result.lastID });
    } catch (error) {
        console.error('[leaderboard POST]', error);
        res.status(500).json({ error: 'Ошибка сервера при сохранении рекорда' });
    }
});

/** GET /health — healthcheck для Docker */
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
    console.log(`🚀 Backend запущен на http://localhost:${PORT}`);
    console.log(`   CORS разрешён для: ${ALLOWED_ORIGIN}`);
});

process.on('exit', (code) => {
    console.log(`Остановка процесса backend с кодом: ${code}`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

setInterval(() => {
    // Keep event loop alive
}, 1000 * 60 * 60);
