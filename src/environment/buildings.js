import * as THREE from 'three';

// ── Люди убраны из сцены по запросу ─────────────────────────────────────────
// Файл оставлен для совместимости импортов.

export const peopleList = [];

export function updatePeople(/* delta */) {
    // no-op: люди отключены
}

// Пустышка — экспортируется, но ничего не создаёт
export function createPerson(/* parentGroup, colliders, x, y, z */) {}

// Пустышка — здания/школа не нужна на карте ангара
export function createSchoolBuilding(/* scene, colliders, bx, bz, rotY */) {}
