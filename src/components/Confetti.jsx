import React, { useEffect, useRef, useState } from 'react';

const colors = ['#ff4f70', '#ffd166', '#06d6a0', '#36bffa', '#a78bfa', '#ff914d'];
const random = (min, max) => min + Math.random() * (max - min);

function createParticles(width, height) {
  return Array.from({ length: width < 600 ? 65 : 110 }, () => ({
    x: random(0, width), y: random(-height * .6, -20),
    speed: random(110, 210), drift: random(-45, 45),
    size: random(5, 10), rotation: random(0, Math.PI * 2), spin: random(-5, 5),
    phase: random(0, Math.PI * 2), color: colors[Math.floor(random(0, colors.length))],
  }));
}

export default function Confetti() {
  const canvas = useRef(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (finished) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (preference.matches) { setFinished(true); return; }
    const node = canvas.current;
    const context = node.getContext('2d');
    if (!context) { setFinished(true); return; }
    let width, height, frame;
    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      node.width = width * scale;
      node.height = height * scale;
      context.setTransform(scale, 0, 0, scale, 0, 0);
    }
    resize();
    const particles = createParticles(width, height);
    const start = performance.now();
    function draw(now) {
      const elapsed = (now - start) / 1000;
      context.clearRect(0, 0, width, height);
      if (elapsed >= 4.5) { setFinished(true); return; }
      context.globalAlpha = Math.min(1, (4.5 - elapsed) / .8);
      for (const particle of particles) {
        context.save();
        context.translate(
          particle.x + particle.drift * elapsed + Math.sin(elapsed * 3 + particle.phase) * 24,
          particle.y + particle.speed * elapsed + height * .07 * elapsed * elapsed,
        );
        context.rotate(particle.rotation + particle.spin * elapsed);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        context.restore();
      }
      frame = requestAnimationFrame(draw);
    }
    const stop = () => { if (preference.matches) { cancelAnimationFrame(frame); setFinished(true); } };
    frame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    preference.addEventListener('change', stop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      preference.removeEventListener('change', stop);
    };
  }, [finished]);

  return finished ? null : <canvas ref={canvas} className="poll-confetti" aria-hidden="true" />;
}
