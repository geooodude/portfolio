import * as THREE from 'three';

function mulberry32(seed: number) {
    return function () {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Deterministic flow field for per-pixel sort axis (R,G encode cos/sin of angle). */
export function createSortFlowTexture(seed: number): THREE.DataTexture {
    const S = 128;
    const rnd = mulberry32(seed >>> 0);
    const data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
        const u = rnd();
        const v = rnd();
        const ang = (u + v * 0.5) * Math.PI * 2;
        data[i * 4] = Math.floor(Math.cos(ang) * 110 + 128);
        data[i * 4 + 1] = Math.floor(Math.sin(ang) * 110 + 128);
        data[i * 4 + 2] = Math.floor(rnd() * 255);
        data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

/** `?seed=` or `?sortSeed=` for repeatable flow field; omit for random each load. */
export function readSortSeed(): number {
    if (typeof window === 'undefined') return 0x5eed;
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get('sortSeed') ?? sp.get('seed');
    if (q === null || q === '') return (Math.random() * 0x7fffffff) | 0;
    const n = parseInt(q, 10);
    return Number.isFinite(n) ? n >>> 0 : 0x5eed;
}
