import { useEffect, useRef, useState } from 'react';

export default function CustomCursor() {
  const dotRef = useRef(null);
  const ringRef = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const isFine = window.matchMedia('(pointer: fine)').matches;
    if (!isFine) return;
    setEnabled(true);
    document.body.classList.add('custom-cursor-on');

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;
    let raf;

    const move = (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (dotRef.current) dotRef.current.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
    };
    const loop = () => {
      rx += (mx - rx) * 0.18;
      ry += (my - ry) * 0.18;
      if (ringRef.current) ringRef.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(loop);
    };
    const over = (e) => {
      const target = e.target.closest?.('button, a, [role="button"], input, select, textarea, .cursor-hover, .card-hover');
      document.body.classList.toggle('cursor-active', Boolean(target));
    };
    const down = () => document.body.classList.add('cursor-down');
    const up = () => document.body.classList.remove('cursor-down');
    const leaveWindow = () => { if (dotRef.current) dotRef.current.style.opacity = '0'; if (ringRef.current) ringRef.current.style.opacity = '0'; };
    const enterWindow = () => { if (dotRef.current) dotRef.current.style.opacity = '1'; if (ringRef.current) ringRef.current.style.opacity = '1'; };

    window.addEventListener('mousemove', move);
    window.addEventListener('mouseover', over);
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    document.addEventListener('mouseleave', leaveWindow);
    document.addEventListener('mouseenter', enterWindow);
    raf = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseover', over);
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      document.removeEventListener('mouseleave', leaveWindow);
      document.removeEventListener('mouseenter', enterWindow);
      cancelAnimationFrame(raf);
      document.body.classList.remove('custom-cursor-on', 'cursor-active', 'cursor-down');
    };
  }, []);

  if (!enabled) return null;
  return (
    <>
      <div ref={dotRef} className="cc-dot" />
      <div ref={ringRef} className="cc-ring" />
    </>
  );
}
