import React, { useCallback, useEffect, useRef, useState } from 'react';

/** Page palette: buttons + fractal UI */
const PAL = {
  panel: '#433E52',
  panelHi: '#5a525e',
  gold: '#c9a227',
  goldDim: '#8b6914',
  violet: '#4a3d5c',
  violetDeep: '#2c2438',
  sclera: '#ebe6ef',
  scleraShadow: '#d4cfe0',
  irisOuter: '#5c486e',
  irisMid: '#7b6494',
  irisInner: '#c9a227',
  pupil: '#0f0a12',
  sigil: '#c9a227',
  sigilGhost: 'rgba(155, 125, 202, 0.55)',
  vein: 'rgba(67, 62, 82, 0.4)',
};

/** Logical canvas — CSS scales up (was 72×80 @ ×3 → now ~3× area: 648×720) */
const W = 81;
const H = 90;
const DISPLAY_SCALE = 8;

type PupilNorm = { x: number; y: number };

function drawSigils(ctx: CanvasRenderingContext2D, cx: number, cy: number, t: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(t * 0.00022);
  const g = ctx.createLinearGradient(-50, -50, 50, 50);
  g.addColorStop(0, PAL.sigil);
  g.addColorStop(0.5, PAL.sigilGhost);
  g.addColorStop(1, PAL.goldDim);
  ctx.strokeStyle = g;
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'miter';

  const rune = (r: number, phase: number) => {
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = phase + (i / 7) * Math.PI * 2;
      const x = Math.cos(a) * r * (0.7 + (i % 2) * 0.35);
      const y = Math.sin(a) * r * 0.55;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  rune(48, t * 0.0004);
  rune(56, -t * 0.0003 + 1.2);

  ctx.beginPath();
  ctx.moveTo(-62, -8);
  ctx.lineTo(-52, 12);
  ctx.lineTo(-58, 22);
  ctx.lineTo(-44, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(62, 8);
  ctx.lineTo(50, -14);
  ctx.lineTo(58, -24);
  ctx.lineTo(46, -4);
  ctx.stroke();

  for (let k = 0; k < 5; k++) {
    const ang = (k / 5) * Math.PI * 2 + t * 0.0005;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * 62, Math.sin(ang) * 62);
    ctx.lineTo(Math.cos(ang) * 72, Math.sin(ang) * 72);
    ctx.stroke();
    ctx.fillStyle = PAL.gold;
    ctx.fillRect(Math.cos(ang) * 74 - 1, Math.sin(ang) * 74 - 1, 2, 2);
  }

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = PAL.sigilGhost;
  ctx.translate(cx + 2, cy - 1);
  ctx.rotate(0.08);
  rune(44, t * 0.00035 + 0.5);
  ctx.restore();
}

function drawFloatingEye(
  ctx: CanvasRenderingContext2D,
  pupil: PupilNorm,
  t: number,
  blinkOpen: number,
) {
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2 + 2;

  drawSigils(ctx, cx, cy, t);

  const rx = 34;
  const ry = 46;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.04, blinkOpen));
  ctx.translate(-cx, -cy);

  const gSclera = ctx.createRadialGradient(cx - 8, cy - 12, 4, cx, cy, ry + 6);
  gSclera.addColorStop(0, PAL.sclera);
  gSclera.addColorStop(0.55, PAL.scleraShadow);
  gSclera.addColorStop(1, '#c8c0d4');

  ctx.fillStyle = gSclera;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = PAL.violetDeep;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = PAL.vein;
  ctx.lineWidth = 0.45;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.3 + i * 4, cy - ry * 0.2);
    ctx.bezierCurveTo(
      cx - 10 + i * 3,
      cy,
      cx - 6 + i * 2,
      cy + 8,
      cx - 4 + i * 5,
      cy + ry * 0.35,
    );
    ctx.stroke();
  }

  const irisRx = 21;
  const irisRy = 28;
  const gIris = ctx.createRadialGradient(cx - 5, cy - 8, 2, cx, cy, irisRy + 4);
  gIris.addColorStop(0, PAL.irisInner);
  gIris.addColorStop(0.35, PAL.irisMid);
  gIris.addColorStop(0.75, PAL.irisOuter);
  gIris.addColorStop(1, PAL.violetDeep);

  ctx.fillStyle = gIris;
  ctx.beginPath();
  ctx.ellipse(cx, cy, irisRx, irisRy, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = PAL.goldDim;
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  const maxOff = 9;
  const px = cx + pupil.x * maxOff * 2;
  const py = cy + pupil.y * maxOff * 2;

  ctx.fillStyle = PAL.pupil;
  ctx.beginPath();
  ctx.ellipse(px, py, 9, 11, pupil.x * 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(20,12,24,0.5)';
  ctx.beginPath();
  ctx.ellipse(px + 1.5, py + 1.5, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.35 + pupil.x * 4, cy - ry * 0.38 + pupil.y * 3, 4, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = PAL.sigil;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.7;
  const sigT = t * 0.001;
  for (let q = 0; q < 3; q++) {
    const a0 = sigT + q * 0.4;
    const a1 = a0 + 1.35;
    ctx.beginPath();
    ctx.arc(px, py, 14 + q * 3, a0, a1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.restore();

  if (blinkOpen < 0.98) {
    ctx.fillStyle = PAL.panel;
    ctx.beginPath();
    ctx.ellipse(cx, cy - ry * 0.15 * blinkOpen, rx * 1.05, ry * 0.42 * (1 - blinkOpen), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.panelHi;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.15 * blinkOpen, rx * 1.05, ry * 0.38 * (1 - blinkOpen), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export default function SeraphimOverlay() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const motionCanvasRef = useRef<HTMLCanvasElement>(null);
  const pupilRef = useRef<PupilNorm>({ x: 0, y: 0 });
  const targetRef = useRef<PupilNorm>({ x: 0, y: 0 });
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const faceDetectorRef = useRef<null | { detect: (s: CanvasImageSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> }>(null);
  const lastGoodRef = useRef({ x: 0, y: 0, t: 0 });
  const blinkStateRef = useRef<{ phase: 'idle' | 'down' | 'hold' | 'up'; start: number }>({
    phase: 'idle',
    start: 0,
  });
  const blinkOpenRef = useRef(1);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'active' | 'denied'>('idle');

  const scheduleNextBlink = useCallback(() => {
    if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    blinkTimerRef.current = setTimeout(() => {
      blinkStateRef.current = { phase: 'down', start: performance.now() };
      blinkTimerRef.current = setTimeout(
        scheduleNextBlink,
        2400 + Math.random() * 5000,
      );
    }, 1800 + Math.random() * 4200);
  }, []);

  useEffect(() => {
    scheduleNextBlink();
    return () => {
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, [scheduleNextBlink]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('denied');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play();
      }
      if ('FaceDetector' in window) {
        try {
          const FD = (window as unknown as { FaceDetector: new (o?: object) => { detect: (s: CanvasImageSource) => Promise<{ boundingBox: DOMRectReadOnly }[]> } }).FaceDetector;
          faceDetectorRef.current = new FD({ fastMode: true, maxDetectedFaces: 1 });
        } catch {
          faceDetectorRef.current = null;
        }
      }
      setStatus('active');
    } catch {
      setStatus('denied');
    }
  }, []);

  useEffect(() => {
    void startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
    };
  }, [startCamera]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const motionCanvas = motionCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mw = 48;
    const mh = 36;
    let motionCtx: CanvasRenderingContext2D | null = null;
    if (motionCanvas) {
      motionCanvas.width = mw;
      motionCanvas.height = mh;
      motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
    }

    const tick = async (t: number) => {
      const v = videoRef.current;
      const detector = faceDetectorRef.current;
      const now = performance.now();
      const bs = blinkStateRef.current;
      if (bs.phase === 'down') {
        const e = now - bs.start;
        if (e < 70) blinkOpenRef.current = 1 - e / 70;
        else {
          blinkOpenRef.current = 0;
          blinkStateRef.current = { phase: 'hold', start: now };
        }
      } else if (bs.phase === 'hold') {
        if (now - bs.start > 45) {
          blinkStateRef.current = { phase: 'up', start: now };
        }
        blinkOpenRef.current = 0;
      } else if (bs.phase === 'up') {
        const e = now - bs.start;
        if (e < 95) blinkOpenRef.current = e / 95;
        else {
          blinkOpenRef.current = 1;
          blinkStateRef.current = { phase: 'idle', start: now };
        }
      } else {
        blinkOpenRef.current = 1;
      }

      let tx = 0;
      let ty = 0;
      let tracked = false;

      if (status === 'active' && v && v.readyState >= 2) {
        if (detector) {
          try {
            const faces = await detector.detect(v);
            if (faces.length > 0) {
              const b = faces[0].boundingBox;
              const nx = (b.left + b.width / 2) / v.videoWidth;
              const ny = (b.top + b.height / 2) / v.videoHeight;
              tx = (0.5 - nx) * 1.15;
              ty = (ny - 0.5) * 1.1;
              tracked = true;
              lastGoodRef.current = { x: tx, y: ty, t };
            }
          } catch {
            /* ignore */
          }
        }

        if (!tracked && motionCtx && motionCanvas) {
          motionCtx.drawImage(v, 0, 0, mw, mh);
          const img = motionCtx.getImageData(0, 0, mw, mh);
          const d = img.data;
          const prev = prevFrameRef.current;
          if (prev && prev.length === d.length) {
            let sx = 0;
            let sy = 0;
            let c = 0;
            for (let i = 0; i < d.length; i += 16) {
              const diff =
                Math.abs(d[i] - prev[i]) +
                Math.abs(d[i + 1] - prev[i + 1]) +
                Math.abs(d[i + 2] - prev[i + 2]);
              if (diff > 28) {
                const p = i >> 2;
                const x = p % mw;
                const y = (p / mw) | 0;
                sx += x;
                sy += y;
                c++;
              }
            }
            if (c > 8) {
              const mx = sx / c / mw;
              const my = sy / c / mh;
              tx = (0.5 - mx) * 0.95;
              ty = (my - 0.5) * 0.9;
              tracked = true;
              lastGoodRef.current = { x: tx, y: ty, t };
            }
          }
          prevFrameRef.current = new Uint8ClampedArray(d);
        }
      }

      if (!tracked) {
        const lg = lastGoodRef.current;
        if (t - lg.t < 700) {
          tx = lg.x;
          ty = lg.y;
        } else {
          tx = Math.sin(t * 0.0018) * 0.22;
          ty = Math.sin(t * 0.0023 + 1.1) * 0.18;
        }
      }

      targetRef.current.x = Math.max(-0.55, Math.min(0.55, tx));
      targetRef.current.y = Math.max(-0.55, Math.min(0.55, ty));

      const cur = pupilRef.current;
      const tg = targetRef.current;
      const s = 0.14;
      cur.x += (tg.x - cur.x) * s;
      cur.y += (tg.y - cur.y) * s;

      drawFloatingEye(ctx, cur, t, blinkOpenRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status]);

  return (
    <div
      className="floating-eye-overlay"
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        zIndex: 200,
        padding: '14px 16px 18px',
        background: `linear-gradient(160deg, rgba(67,62,82,0.94), rgba(44,36,56,0.92))`,
        border: `2px solid ${PAL.gold}`,
        borderRadius: '50% / 42%',
        boxShadow: `0 0 32px rgba(74,61,94,0.65), inset 0 0 28px rgba(0,0,0,0.35), 0 0 0 1px ${PAL.violet}`,
        pointerEvents: status === 'denied' ? 'auto' : 'none',
      }}
    >
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          display: 'block',
          width: W * DISPLAY_SCALE,
          height: H * DISPLAY_SCALE,
          imageRendering: 'pixelated',
        }}
      />
      <canvas ref={motionCanvasRef} width={48} height={36} style={{ display: 'none' }} />
      <video ref={videoRef} playsInline muted autoPlay style={{ display: 'none' }} />
      {status === 'denied' && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            right: 8,
            fontSize: 10,
            color: 'rgba(201,162,39,0.85)',
            textAlign: 'center',
            fontFamily: 'monospace',
          }}
        >
          <button
            type="button"
            onClick={() => void startCamera()}
            style={{
              marginTop: 6,
              fontSize: 11,
              padding: '6px 10px',
              cursor: 'pointer',
              background: PAL.panel,
              color: PAL.sclera,
              border: `1px solid ${PAL.gold}`,
              borderRadius: 4,
            }}
          >
            enable eye
          </button>
        </div>
      )}
    </div>
  );
}
