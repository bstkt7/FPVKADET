// ── Метки карт, погоды и классов дронов ──────────────────────────────────────
// Единственный источник истины — используется и в UI (SettingsModal, StartScreen)

export const MAP_LABELS = {
    hangar:     'Обучающий ангар',
    open_field: 'Открытое поле — зигзаг',
    city_run:   'Городской кросс',
};

export const MAP_SHORT_LABELS = {
    hangar:     'Ангар',
    open_field: 'Поле',
    city_run:   'Город',
};

export const WEATHER_LABELS = {
    clear: 'Ясно',
    rain:  'Дождь',
    snow:  'Снег',
};

export const DRONE_CLASS_LABELS = {
    tiny_whoop:   'Tiny Whoop',
    freestyle_5:  '5" Freestyle',
    heavy_sync:   'Heavy Sync',
};

export const DRONE_MODE_LABELS = {
    angle: 'Angle — стабилизация + Alt Hold',
    sport: 'Sport — большие крены, высокая скорость',
    acro:  'Acro — полный ручной контроль',
};

export const FLIGHT_MODE_LABELS = {
    light:  'Лёгкий — быстрые реакции',
    medium: 'Средний — сбалансированный',
    heavy:  'Тяжёлый — плавный, медленный',
};

export const CONTROLLER_TYPE_LABELS = {
    gamepad: 'Геймпад (Xbox / DualShock)',
    fpv:     'FPV-пульт (Betaflight / Radiomaster)',
};

export const QUALITY_LABELS = {
    low:    'Низкое',
    medium: 'Среднее',
    high:   'Высокое',
};
