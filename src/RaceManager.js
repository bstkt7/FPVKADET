const BACKEND = 'http://localhost:5000';
const SECTOR_DIVIDERS = [0.33, 0.67]; // 3 сектора: 0→gate4, gate4→gate8, gate8→fin

export class RaceManager {
    constructor() {
        this.nextGateIdx  = 0;
        this.gateGlowTime = 0;
        this.gateObjects  = [];
        this.raceTimer = {
            running: false,
            startTime: 0,
            elapsed: 0,
            finished: false,
            lapTime: null,
            lapCount: 0,
            bestLap: null,
            lapHistory: [],
            // Секторный таймер
            sectorStart: 0,
            sectorTimes: [],
            bestSectors: [],
            currentSector: 0,
        };
        this._isSubmitting = false;
    }

    setGates(gates) {
        this.gateObjects  = gates;
        this.nextGateIdx  = 0;
    }

    resetTimer() {
        const rt = this.raceTimer;
        rt.running   = false;
        rt.finished  = false;
        rt.elapsed   = 0;
        rt.lapTime   = null;
        rt.lapCount  = 0;
        rt.bestLap   = null;
        rt.lapHistory = [];
        rt.sectorStart = 0;
        rt.sectorTimes  = [];
        rt.currentSector = 0;
        this.nextGateIdx = 0;
    }

    _sectorForGate(idx) {
        const frac = idx / Math.max(1, this.gateObjects.length);
        if (frac < SECTOR_DIVIDERS[0]) return 0;
        if (frac < SECTOR_DIVIDERS[1]) return 1;
        return 2;
    }

    async _submitRecord(engineConfig, lapMs) {
        if (this._isSubmitting) return;
        this._isSubmitting = true;
        try {
            const res = await fetch(`${BACKEND}/api/leaderboard`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerName: engineConfig.playerName || 'AnonymousPilot',
                    droneClass: engineConfig.droneClass  || 'freestyle_5',
                    mapName:    engineConfig.map         || 'hangar',
                    lapTimeMs:  Math.round(lapMs),
                }),
            });
            const data = await res.json();
            console.log('✅ Рекорд сохранён:', data);
        } catch (e) {
            console.warn('⚠️  Бэкенд недоступен, рекорд не сохранён:', e.message);
        } finally {
            this._isSubmitting = false;
        }
    }

    update(delta, droneState, playCheckpoint, engineConfig) {
        this.gateGlowTime += delta;

        for (let i = 0; i < this.gateObjects.length; i++) {
            const g = this.gateObjects[i];
            const ptLight = g.group.userData.ptLight;

            if (i === this.nextGateIdx) {
                const pulse = 0.5 + 0.5 * Math.sin(this.gateGlowTime * 5);
                g.glowMat.opacity    = 0.55 + pulse * 0.45;
                g.zoneMat.opacity    = 0.10 + pulse * 0.15;
                g.torusMat.emissive.setHex(g.baseColor).multiplyScalar(2.5 + pulse * 2.5);
                if (ptLight) ptLight.intensity = 4.0 + pulse * 4.0;

                const gp = g.position, dp = droneState.position;
                const hDist = Math.sqrt((dp.x - gp.x) ** 2 + (dp.z - gp.z) ** 2);

                if (hDist < g.innerR && Math.abs(dp.y - gp.y) < 4.5) {
                    const prevIdx = this.nextGateIdx;
                    this.nextGateIdx = (this.nextGateIdx + 1) % this.gateObjects.length;
                    if (playCheckpoint) playCheckpoint();

                    // Начало круга (первое кольцо)
                    if (prevIdx === 0 && !this.raceTimer.running) {
                        const rt = this.raceTimer;
                        rt.running    = true;
                        rt.finished   = false;
                        rt.lapTime    = null;
                        rt.startTime  = performance.now();
                        rt.elapsed    = 0;
                        rt.sectorStart   = rt.startTime;
                        rt.sectorTimes   = [];
                        rt.currentSector = 0;
                    }

                    // Проверка смены сектора
                    if (this.raceTimer.running) {
                        const rt = this.raceTimer;
                        const newSector = this._sectorForGate(this.nextGateIdx);
                        if (newSector !== rt.currentSector) {
                            const sectorMs = performance.now() - rt.sectorStart;
                            rt.sectorTimes.push({ sector: rt.currentSector, ms: sectorMs });
                            rt.sectorStart = performance.now();
                            rt.currentSector = newSector;
                        }
                    }

                    // Завершение круга (вернулись к кольцу 0)
                    if (this.raceTimer.running && this.nextGateIdx === 0) {
                        const rt = this.raceTimer;
                        const lapMs = performance.now() - rt.startTime;
                        // Последний сектор
                        rt.sectorTimes.push({ sector: rt.currentSector, ms: performance.now() - rt.sectorStart });

                        rt.lapTime  = lapMs;
                        rt.lapCount++;
                        rt.finished = true;

                        const prevBest = rt.bestLap;
                        const lapDelta = prevBest !== null ? lapMs - prevBest : null;
                        if (prevBest === null || lapMs < prevBest) {
                            rt.bestLap = lapMs;
                            // Обновляем лучшие секторные времена
                            rt.bestSectors = rt.sectorTimes.map(s => s.ms);
                        }

                        rt.lapHistory.push({
                            lap:     rt.lapCount,
                            time:    lapMs,
                            delta:   lapDelta,
                            sectors: rt.sectorTimes.map(s => s.ms),
                            isBest:  lapMs === rt.bestLap,
                        });
                        rt.lapHistory.forEach(r => { r.isBest = r.time === rt.bestLap; });

                        // Отправка на бэкенд (async, не блокирует игру)
                        this._submitRecord(engineConfig, lapMs);

                        // Сброс для нового круга
                        rt.running    = true;
                        rt.finished   = false;
                        rt.startTime  = performance.now();
                        rt.elapsed    = 0;
                        rt.sectorStart   = rt.startTime;
                        rt.sectorTimes   = [];
                        rt.currentSector = 0;
                    }
                }
            } else {
                // Inactive: subtle persistent glow so rings are always visible
                g.glowMat.opacity = 0.18;
                g.zoneMat.opacity = 0.04;
                g.torusMat.emissiveIntensity = 1.8;
                if (ptLight) ptLight.intensity = 1.0;
            }
        }

        if (this.raceTimer.running) {
            this.raceTimer.elapsed = performance.now() - this.raceTimer.startTime;
        }
    }
}
