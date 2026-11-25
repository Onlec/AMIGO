import React, { useEffect, useRef, useState } from 'react';

const colors = ['#ff4f70', '#ffd166', '#06d6a0', '#36bffa', '#a78bfa', '#ff914d'];
const random = (min, max) => min + Math.random() * (max - min);
const gravity = 650;
const duration = 3.4;
const playbackRate = 1.6;

function createParticles(width, height, originY) {
  const launchHeight = Math.max(20, Math.min(height * .32, 250, originY - 24));
  const launchSpeed = Math.sqrt(2 * gravity * launchHeight);
  const spread = Math.min(width * .23, 220);
  return Array.from({ length: width < 600 ? 28 : 40 }, () => ({
    x: random(-12, 12), y: random(-8, 8),
    speed: random(.75, 1) * launchSpeed, drift: random(-spread, spread),
    size: random(10, 17), rotation: random(0, Math.PI * 2), spin: random(-5, 5),
    phase: random(0, Math.PI * 2), color: colors[Math.floor(random(0, colors.length))],
  }));
}

export default function Confetti({ originRef }) {
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
    function origin() {
      const rect = originRef.current.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    const particles = createParticles(width, height, origin().y);
    const start = performance.now();
    function draw(now) {
      const elapsed = (now - start) / 1000 * playbackRate;
      const center = origin();
      context.clearRect(0, 0, width, height);
      if (elapsed >= duration) { setFinished(true); return; }
      context.globalAlpha = Math.min(1, (duration - elapsed) / .8);
      for (const particle of particles) {
        context.save();
        context.translate(
          center.x + particle.x + particle.drift * elapsed
            + (Math.sin(elapsed * 3 + particle.phase) - Math.sin(particle.phase)) * 8,
          center.y + particle.y - particle.speed * elapsed + .5 * gravity * elapsed * elapsed,
        );
        context.rotate(particle.rotation + particle.spin * elapsed);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size * .35, particle.size, particle.size * .7);
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
  }, [finished, originRef]);

  return finished ? null : <canvas ref={canvas} className="poll-confetti" aria-hidden="true" />;
}
