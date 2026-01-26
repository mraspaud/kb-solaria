<script lang="ts">
  import { onMount } from 'svelte';
  import { chatStore } from '../../stores/chat';
  import { inputEngine } from '../../stores/input';
  import { getUserColor } from '../../logic/theme';
  import { toMs } from '../../utils/time';
  import {
      type Star, type Dust,
      calculateOrbit, sortStarsByPriority, initDust,
      createStar, updateStarPhysics, updatePlanetPhysics, createPlanet
  } from '../../logic/starPhysics';

  const CONFIG = {
      SCALE_RATIO: 0.001,
      RETICLE_IDLE: '#54546D',
      RETICLE_ACTIVE: '#FF9E3B',
      PALETTE: ['#727169', '#54546D', '#7E9CD8', '#363646'],
      MAX_AGE_HOURS: 30 * 24,
      SPEED_MULTIPLIER: 1.0,
      FPS_LIMIT: 30,
  };

  const orbitConfig = { maxAgeHours: CONFIG.MAX_AGE_HOURS, speedMultiplier: CONFIG.SPEED_MULTIPLIER };

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let frameId: number;
  let observer: ResizeObserver;
  let container: HTMLDivElement;

  let lastFrameTime = 0;
  const frameInterval = 1000 / CONFIG.FPS_LIMIT;

  let singularityPulse = 0;
  let wasTyping = false;
  let debugLabels = false;

  let stars: Map<string, Star> = new Map();
  let dust: Dust[] = [];
  let systemMaxMass = 1;

  function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'F2') {
          debugLabels = !debugLabels;
      }
  }

  onMount(() => {
      dust = initDust(300);
      if (!canvas || !container) return;
      observer = new ResizeObserver((entries) => {
          for (const entry of entries) {
              const rect = entry.contentRect;
              if (rect.width > 0 && rect.height > 0) {
                  const dpr = window.devicePixelRatio || 1;
                  canvas.width = rect.width * dpr;
                  canvas.height = rect.height * dpr;
                  ctx = canvas.getContext('2d', { alpha: false })!;
                  ctx.scale(dpr, dpr);
              }
          }
      });
      observer.observe(container);
      loop();
      return () => {
          observer.disconnect();
          cancelAnimationFrame(frameId);
      };
  });

  $: {
      const channels = $chatStore.availableChannels;
      const activeId = $chatStore.activeChannel.id;
      const unreadState = $chatStore.unread;
      const currentMessages = $chatStore.messages;
      const isTyping = $inputEngine.raw.length > 0;
      const now = Date.now();

      if (wasTyping && !isTyping) singularityPulse = 1.0;
      wasTyping = isTyping;

      let maxMass = 0.001;
      channels.forEach(c => {
          const m = c.mass || 0;
          if (m > maxMass) maxMass = m;
      });
      systemMaxMass = maxMass;

      channels.forEach(c => {
          let lastActive = toMs(c.lastReadAt);
          if (c.lastPostAt) lastActive = toMs(c.lastPostAt);
          if (lastActive > now + 86400000) lastActive = 0;

          const physics = calculateOrbit(lastActive, c.id, orbitConfig);
          const rawMass = c.mass || 0.0;
          const magnitude = Math.pow(rawMass / systemMaxMass, 0.15);

          if (!stars.has(c.id)) {
              const star = createStar(c.id, c.name, physics, CONFIG.PALETTE);
              star.lastActivity = lastActive;
              star.mass = rawMass;
              star.magnitude = magnitude;
              stars.set(c.id, star);
          } else {
              const s = stars.get(c.id)!;
              s.name = c.name;
              s.targetRadius = physics.radius;
              s.magnitude = magnitude;
              s.mass = rawMass;

              if (Math.abs(s.speed) !== physics.speed) {
                  s.speed = physics.speed * (s.speed > 0 ? 1 : -1);
              }

              const u = unreadState[c.id];
              if (u?.hasMention) s.activity = 1.0;
              else if (u?.count > 0) s.activity = Math.min(0.8, 0.2 + (u.count * 0.05));
              else s.activity *= 0.95;
          }
      });

      const activeStar = stars.get(activeId);
      if (activeStar) {
          const recentAuthors = new Set<string>();
          for (let i = currentMessages.length - 1; i >= 0 && i > currentMessages.length - 30; i--) {
              recentAuthors.add(currentMessages[i].author.id);
          }
          activeStar.planets = activeStar.planets.filter(p => recentAuthors.has(p.id));
          const allUsers = $chatStore.users;
          recentAuthors.forEach(authorId => {
              if (!activeStar.planets.find(p => p.id === authorId)) {
                  const userObj = allUsers.get(authorId);
                  activeStar.planets.push(
                      createPlanet(authorId, userObj?.name || 'Unknown', getUserColor(authorId), CONFIG.SPEED_MULTIPLIER)
                  );
              }
          });
      }
      stars.forEach(s => { if (s.id !== activeId) s.planets = []; });
  }

  function loop(now: number) {
      frameId = requestAnimationFrame(loop);

      if (!ctx || !canvas || canvas.width === 0) return;

      const delta = now - lastFrameTime;
      if (delta < frameInterval) return; 
      lastFrameTime = now - (delta % frameInterval);

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const cx = w / 2;
      const cy = h / 2;
      const viewportMin = Math.min(w, h);
      const maxR = viewportMin * 0.45; 
      
      const screenScalar = Math.max(0.8, viewportMin * CONFIG.SCALE_RATIO);
      const time = Date.now() / 1000;

      // 1. CLEAR
      ctx.fillStyle = '#16161D'; 
      ctx.fillRect(0, 0, w, h);

      // 2. DRAW BACKGROUND DUST (New)
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#FFFFFF';
      dust.forEach(d => {
          const dx = d.x * w;
          const dy = d.y * h;
          ctx.globalAlpha = d.alpha;
          ctx.beginPath();
          ctx.arc(dx, dy, d.size, 0, Math.PI * 2);
          ctx.fill();
      });

      // 3. DRAW SINGULARITY
      const isInputActive = $inputEngine.raw.length > 0;
      if (singularityPulse > 0.01) {
          ctx.strokeStyle = CONFIG.RETICLE_ACTIVE;
          ctx.lineWidth = 1;
          ctx.globalAlpha = singularityPulse; 
          ctx.beginPath();
          ctx.arc(cx, cy, 10 + ((1 - singularityPulse) * 40), 0, Math.PI * 2);
          ctx.stroke();
          singularityPulse *= 0.92; 
      }
      const reticleColor = isInputActive ? CONFIG.RETICLE_ACTIVE : CONFIG.RETICLE_IDLE;
      const reticleSize = isInputActive ? 3 : 5;
      ctx.globalAlpha = isInputActive ? 0.8 : 0.4;
      ctx.strokeStyle = reticleColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, reticleSize, 0, Math.PI * 2);
      ctx.stroke();

      // 4. RENDER STARS
      const sortedStars = sortStarsByPriority(stars);

      for (const star of sortedStars) {
          updateStarPhysics(star);

          const x = cx + Math.cos(star.angle) * (star.currentRadius * maxR);
          const y = cy + Math.sin(star.angle) * (star.currentRadius * maxR);

          // SIZE SCALING (Strict Floor)
          const baseSize = screenScalar * (0.1 + (star.magnitude * 2.4));
          
          // GLOW RADIUS (Reduced to 3.0x max)
          const glowScalar = 1.0 + (star.magnitude * 2.0); 
          const glowRadius = baseSize * 2.0 * glowScalar;

          // COLOR / OPACITY
          const grad = ctx.createRadialGradient(x, y, 0.1, x, y, glowRadius);
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)'); 
          const colorStop = 0.1 + (star.magnitude * 0.3); 
          grad.addColorStop(colorStop, star.baseColor); 
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          
          ctx.globalCompositeOperation = 'source-over';
          
          const breathe = Math.sin((time * 1.0) + star.phase) * 0.05;
          ctx.globalAlpha = Math.min(1.0, 0.5 + (0.5 * star.magnitude) + (star.activity * 0.5) + breathe);
          
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
          ctx.fill();

          // LABELS (DEBUG)
          if (debugLabels) {
              ctx.font = '10px monospace';
              if (star.magnitude > 0.01 || star.activity > 0.1) {
                  ctx.fillStyle = `rgba(220, 215, 186, ${0.3 + (star.magnitude * 0.7)})`;
                  ctx.textAlign = 'center';
                  ctx.fillText(star.name, x, y - (glowRadius + 5));
              }
          }

          // PLANETS
          if (star.planets.length > 0) {
              star.planets.forEach(p => {
                  updatePlanetPhysics(p);
                  const orbitalDistance = p.dist * (baseSize * 1.0 + 4);
                  const px = x + Math.cos(p.angle) * orbitalDistance;
                  const py = y + Math.sin(p.angle) * orbitalDistance;

                  ctx.fillStyle = p.color;
                  ctx.globalAlpha = 0.9;
                  ctx.beginPath();
                  ctx.arc(px, py, 1.5, 0, Math.PI * 2);
                  ctx.fill();
              });
          }
      }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="star-map-viewport" bind:this={container}>
    <canvas bind:this={canvas} />
    <div class="noise-layer"></div>
    <div class="vignette-layer"></div>
</div>

<style>
    .star-map-viewport {
        position: relative; 
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: var(--sumi-ink-0);
        min-height: 0;
        min-width: 0;
    }

    canvas {
        display: block;
        position: absolute; 
        top: 0; 
        left: 0;
        width: 100%;
        height: 100%;
    }

    .noise-layer {
        position: absolute; inset: 0;
        opacity: 0.04;
        pointer-events: none;
        background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
    }

    .vignette-layer {
        position: absolute; inset: 0;
        pointer-events: none;
        background: radial-gradient(
            circle at center, 
            transparent 30%, 
            rgba(22, 22, 29, 0.9) 100%
        );
    }
</style>
