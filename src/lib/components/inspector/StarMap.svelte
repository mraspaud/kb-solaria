<script lang="ts">
  import { onMount } from 'svelte';
  import { chatStore } from '../../stores/chat';
  import { inputEngine } from '../../stores/input';
  import { getUserColor } from '../../logic/theme';

  const CONFIG = {
      SCALE_RATIO: 0.001, 
      CORE_COLOR: '#DCD7BA', 
      RETICLE_IDLE: '#54546D',
      RETICLE_ACTIVE: '#FF9E3B', 
      PALETTE: ['#727169', '#54546D', '#7E9CD8', '#363646'],
      
      MAX_AGE_HOURS: 30 * 24, 
      DEBUG_LABELS: true,
      SPEED_MULTIPLIER: 1.0,
      FPS_LIMIT: 30,
  };

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

  interface Star {
      id: string;
      name: string;
      targetRadius: number; 
      currentRadius: number; 
      angle: number;       
      speed: number;
      baseColor: string;
      phase: number;       
      activity: number; 
      lastActivity: number;
      mass: number;     
      magnitude: number; 
      planets: Planet[];
  }

  interface Planet {
      id: string; 
      name: string;
      angle: number;
      speed: number;
      dist: number;
      color: string;
  }

  interface Dust {
      x: number;
      y: number;
      size: number;
      alpha: number;
  }

  let stars: Map<string, Star> = new Map();
  let dust: Dust[] = [];
  let systemMaxMass = 1; 

  function seededRandom(str: string) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
      }
      return ((h >>> 0) / 4294967296);
  }

  // --- CONTINUOUS GRAVITY ---
  // Replaces the "Zones" with a smooth slider from 0 to 1
  function calculateOrbit(lastActiveMs: number, id: string): { radius: number, speed: number } {
      const now = Date.now();
      const diffHours = Math.max(0, (now - lastActiveMs) / (1000 * 60 * 60));
      
      // 1. Logarithmic Time (Fast initial dropoff)
      // Useful for distinguishing "Now" from "1 hour ago"
      const logRatio = Math.log(diffHours + 1) / Math.log(CONFIG.MAX_AGE_HOURS + 1);
      
      // 2. Linear Time (Slow steady dropoff)
      // Useful for spreading out the "Days ago" stars
      const linearRatio = Math.min(1.0, diffHours / CONFIG.MAX_AGE_HOURS);

      // 3. Blend (The "Natural" Distribution)
      // 30% Linear + 70% Log creates a dense center but fills the edges nicely
      const combinedRatio = (linearRatio * 0.3) + (logRatio * 0.7);

      // Map 0.0-1.0 to Screen Radius (0.15 to 0.95)
      // We add a tiny seeded variance so two channels with exact same timestamps don't overlap
      const jitter = (seededRandom(id + '_rad') - 0.5) * 0.05;
      const radius = 0.15 + (combinedRatio * 0.8) + jitter;

      // Keplerian Speed: Closer = Faster
      const s = CONFIG.SPEED_MULTIPLIER;
      const speed = (0.00005 * s) / Math.max(0.1, radius);

      return { radius, speed };
  }

  function getSortedStars() {
      return Array.from(stars.values()).sort((a, b) => {
          const scoreA = (a.magnitude * 0.7) + (a.activity * 0.3);
          const scoreB = (b.magnitude * 0.7) + (b.activity * 0.3);
          return scoreA - scoreB; 
      });
  }

  // Initialize Background Starfield
  function initDust() {
      dust = [];
      for (let i = 0; i < 300; i++) {
          dust.push({
              x: Math.random(), // 0-1 normalized coords
              y: Math.random(),
              size: Math.random() * 1.5,
              alpha: Math.random() * 0.15 + 0.05 // Very faint
          });
      }
  }

  function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'F2') {
          debugLabels = !debugLabels;
      }
  }

  onMount(() => {
      initDust();
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
          let lastActive = (c.lastReadAt || 0) * 1000;
          if (c.lastPostAt) lastActive = c.lastPostAt * 1000; 
          if (lastActive > now + 86400000) {
              lastActive = 0; 
          }
          const physics = calculateOrbit(lastActive, c.id);
          
          const rawMass = c.mass || 0.0;
          const ratio = rawMass / systemMaxMass;
          
          // USER TWEAK: Power 0.15 for better brightness balance
          const magnitude = Math.pow(ratio, 0.15); 

          if (!stars.has(c.id)) {
              const seed = seededRandom(c.id);
              stars.set(c.id, {
                  id: c.id,
                  name: c.name + "/" + c.lastReadAt + "/" + c.lastPostAt, 
                  // name: "wla",                
                  targetRadius: physics.radius,
                  currentRadius: 1.2, 
                  angle: seededRandom(c.id + '_ang') * Math.PI * 2,
                  speed: physics.speed * (seededRandom(c.id+'dir') > 0.5 ? 1 : -1),
                  baseColor: CONFIG.PALETTE[Math.floor(seed * CONFIG.PALETTE.length)],
                  phase: Math.random() * Math.PI * 2,
                  activity: 0,
                  lastActivity: lastActive,
                  mass: rawMass,
                  magnitude: magnitude, 
                  planets: []
              });
          } else {
              const s = stars.get(c.id)!;
              s.name = c.name;
              s.targetRadius = physics.radius;
              s.magnitude = magnitude; 
              s.mass = rawMass;
              
              if (Math.abs(s.speed) !== physics.speed) {
                  const dir = s.speed > 0 ? 1 : -1;
                  s.speed = physics.speed * dir;
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
                  const seed = seededRandom(authorId); 
                  const userObj = allUsers.get(authorId);
                  activeStar.planets.push({
                      id: authorId,
                      name: userObj?.name || 'Unknown', 
                      angle: Math.random() * Math.PI * 2,
                      speed: (0.004 + (seed * 0.006)) * CONFIG.SPEED_MULTIPLIER,
                      dist: 1 + (seed * 1.5),
                      color: getUserColor(authorId) 
                  });
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
      const sortedStars = getSortedStars();
      
      for (const star of sortedStars) {
          star.angle += star.speed; 
          if (star.activity < 0.01) star.activity = 0;
          star.currentRadius += (star.targetRadius - star.currentRadius) * 0.05;

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
                  p.angle += p.speed;
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
