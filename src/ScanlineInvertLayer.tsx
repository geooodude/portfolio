import React, { useEffect, useRef } from 'react';

const LINE_COUNT = 14;

/**
 * Thin vertical strips on the left portion of the viewport using backdrop-filter: invert
 * so the fractal (and anything behind) reads inverted along each line. Falls back to
 * mix-blend-mode where backdrop-filter is unavailable.
 */
export default function ScanlineInvertLayer() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const supportsBackdrop =
      typeof CSS !== 'undefined' &&
      (CSS.supports('backdrop-filter', 'invert(1)') || CSS.supports('-webkit-backdrop-filter', 'invert(1)'));

    const lines: { el: HTMLDivElement; x: number; vx: number }[] = [];

    for (let i = 0; i < LINE_COUNT; i++) {
      const el = document.createElement('div');
      if (supportsBackdrop) {
        el.style.cssText = [
          'position:absolute',
          'top:0',
          'height:100%',
          'width:2px',
          'left:0',
          'background:transparent',
          'backdrop-filter:invert(1)',
          '-webkit-backdrop-filter:invert(1)',
          'pointer-events:none',
          'will-change:transform',
        ].join(';');
      } else {
        el.style.cssText = [
          'position:absolute',
          'top:0',
          'height:100%',
          'width:2px',
          'left:0',
          'background:#fff',
          'mix-blend-mode:difference',
          'opacity:0.85',
          'pointer-events:none',
          'will-change:transform',
        ].join(';');
      }
      host.appendChild(el);
      lines.push({
        el,
        x: Math.random() * 120,
        vx: 0.2 + Math.random() * 0.85,
      });
    }

    let raf = 0;
    const step = () => {
      const zone = window.innerWidth * 0.44;
      for (const L of lines) {
        L.x += L.vx;
        if (L.x > zone + 8) {
          L.x = -6 - Math.random() * 40;
          L.vx = 0.15 + Math.random() * 0.95;
        }
        L.el.style.transform = `translate3d(${L.x}px,0,0)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onResize = () => {
      for (const L of lines) {
        L.x = Math.min(L.x, window.innerWidth * 0.44);
      }
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      host.innerHTML = '';
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        width: '44vw',
        height: '100vh',
        zIndex: 130,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    />
  );
}
