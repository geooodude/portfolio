import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ARABIC_POEMS } from './arabicPoems';

const INTERNAL_H = 58;
const PIX = 3;
const FONT_STACK = '"Noto Naskh Arabic", Tahoma, "Segoe UI", sans-serif';
const VERT_SCALE = 1.52;

type WordEntry = { text: string; w: number; fs: number };

function wordScale(i: number, seed: number): number {
  const t = Math.sin((i + 1) * 12.9898 + seed * 43.758) * 8375.35;
  const r = t - Math.floor(t);
  return 0.68 + r * 0.42;
}

function poemSeed(poem: string): number {
  let s = 0;
  for (let i = 0; i < poem.length; i++) s = (s + poem.charCodeAt(i) * (i + 1)) % 100000;
  return s / 100000;
}

function buildEntries(ctx: CanvasRenderingContext2D, words: string[], seed: number): WordEntry[] {
  return words.map((word, i) => {
    const fs = Math.round(11 + wordScale(i, seed) * 15);
    ctx.font = `700 ${fs}px ${FONT_STACK}`;
    const text = word + ' ';
    return { text, w: ctx.measureText(text).width, fs };
  });
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, n | 0));
}

function applyRasterGrunge(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  seed: number,
  segmentW: number,
) {
  try {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const p = i >> 2;
      const x = p % w;
      const y = (p / w) | 0;
      const lx = x % segmentW;
      const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      if (lum < 95) {
        const n =
          (Math.sin(lx * 0.21 + y * 0.13 + seed * 6.2) * 19 +
            Math.sin(lx * 0.07 - y * 0.19 + seed * 2.8) * 14) |
          0;
        d[i] = clampByte(d[i] + n * 0.75);
        d[i + 1] = clampByte(d[i + 1] + n * 0.68);
        d[i + 2] = clampByte(d[i + 2] + n * 0.64);
      }
    }
    ctx.putImageData(img, 0, 0);
  } catch {
    /* ignore */
  }
}

function scratchCorruption(
  ctx: CanvasRenderingContext2D,
  h: number,
  seed: number,
  segmentW: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 14; k++) {
    const col = ((seed * 7919 + k * 9973) % Math.max(4, segmentW - 4)) + 2;
    const a = 0.11 + (k % 5) * 0.055;
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.fillRect(col, 0, 1, h);
    ctx.fillRect(col + segmentW, 0, 1, h);
  }
  ctx.restore();
}

function drawSegment(
  ctx: CanvasRenderingContext2D,
  entries: WordEntry[],
  rightX: number,
  baseline: number,
  seed: number,
) {
  let x = rightX;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const jy = Math.sin(seed * 12.7 + i * 4.17) * 2.8;
    const jx = Math.cos(seed * 9.2 + i * 3.01) * 1.5;

    ctx.font = `700 ${e.fs}px ${FONT_STACK}`;

    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#4a2f5c';
    ctx.fillText(e.text, x + jx + 1.4, baseline + jy + 1.1);

    ctx.globalAlpha = 0.26;
    ctx.fillStyle = '#7a5a18';
    ctx.fillText(e.text, x + jx - 1, baseline + jy - 0.7);

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = '#2a2438';
    ctx.fillText(e.text, x + jx + 2.2, baseline + jy - 1.2);

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#050308';
    ctx.fillText(e.text, x + jx, baseline + jy);

    x -= e.w;
  }
}

export default function ArabicPoemBanner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [poemIndex] = useState(() => Math.floor(Math.random() * ARABIC_POEMS.length));
  const [layout, setLayout] = useState({ cssW: 2400, dur: 72 });

  const poem = ARABIC_POEMS[poemIndex] ?? ARABIC_POEMS[0];
  const words = useMemo(() => poem.split(/\s+/).filter(Boolean), [poem]);
  const seed = useMemo(() => poemSeed(poem), [poem]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || words.length === 0) return;

    let alive = true;

    const paint = async () => {
      try {
        await document.fonts.load(`700 26px ${FONT_STACK}`);
      } catch {
        /* fallback */
      }
      if (!alive) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const entries = buildEntries(ctx, words, seed);
      const textW = entries.reduce((s, e) => s + e.w, 0);
      const pad = 6;
      const segmentW = Math.ceil(textW + pad * 2);
      const totalW = segmentW * 2;

      canvas.width = totalW;
      canvas.height = INTERNAL_H;

      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.clearRect(0, 0, totalW, INTERNAL_H);
      ctx.imageSmoothingEnabled = false;

      ctx.save();
      ctx.translate(0, INTERNAL_H * 0.5);
      ctx.scale(1, VERT_SCALE);
      ctx.translate(0, -INTERNAL_H * 0.5);

      const baseline = INTERNAL_H * 0.7;

      drawSegment(ctx, entries, segmentW - pad, baseline, seed);
      drawSegment(ctx, entries, segmentW * 2 - pad, baseline, seed);

      ctx.restore();

      scratchCorruption(ctx, INTERNAL_H, seed * 10000, segmentW);
      applyRasterGrunge(ctx, totalW, INTERNAL_H, seed, segmentW);

      const dur = Math.min(150, Math.max(42, 52 + segmentW / 50));
      if (alive) {
        setLayout({ cssW: totalW * PIX, dur });
      }
    };

    void paint();
    return () => {
      alive = false;
    };
  }, [poem, words, seed]);

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: '8vh',
        left: '-8vw',
        width: '116vw',
        overflow: 'hidden',
        zIndex: 125,
        pointerEvents: 'none',
        background: 'transparent',
        transform: 'rotate(-8deg) skewX(-14deg)',
        transformOrigin: '50% 40%',
      }}
    >
      <div style={{ overflow: 'hidden', width: '100%' }}>
        <div
          style={{
            transform: 'scaleY(1.38)',
            transformOrigin: 'center 42%',
          }}
        >
          <canvas
            ref={canvasRef}
            className="arabic-poem-marquee-layer"
            style={{
              width: layout.cssW,
              height: INTERNAL_H * PIX,
              animationDuration: `${layout.dur}s`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
