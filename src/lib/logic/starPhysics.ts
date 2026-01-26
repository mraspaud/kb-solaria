// src/lib/logic/starPhysics.ts
// Physics and data structures for the StarMap visualization

export interface Star {
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

export interface Planet {
    id: string;
    name: string;
    angle: number;
    speed: number;
    dist: number;
    color: string;
}

export interface Dust {
    x: number;
    y: number;
    size: number;
    alpha: number;
}

export interface OrbitConfig {
    maxAgeHours: number;
    speedMultiplier: number;
}

/**
 * Deterministic random number from a string seed
 */
export function seededRandom(str: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return ((h >>> 0) / 4294967296);
}

/**
 * Calculate orbital parameters based on last activity time
 * Uses a blend of logarithmic and linear decay for natural distribution
 */
export function calculateOrbit(
    lastActiveMs: number,
    id: string,
    config: OrbitConfig
): { radius: number; speed: number } {
    const now = Date.now();
    const diffHours = Math.max(0, (now - lastActiveMs) / (1000 * 60 * 60));

    // Logarithmic time (fast initial dropoff)
    const logRatio = Math.log(diffHours + 1) / Math.log(config.maxAgeHours + 1);

    // Linear time (slow steady dropoff)
    const linearRatio = Math.min(1.0, diffHours / config.maxAgeHours);

    // Blend: 30% Linear + 70% Log for natural distribution
    const combinedRatio = (linearRatio * 0.3) + (logRatio * 0.7);

    // Map 0.0-1.0 to screen radius (0.15 to 0.95) with seeded jitter
    const jitter = (seededRandom(id + '_rad') - 0.5) * 0.05;
    const radius = 0.15 + (combinedRatio * 0.8) + jitter;

    // Keplerian speed: closer = faster
    const speed = (0.00005 * config.speedMultiplier) / Math.max(0.1, radius);

    return { radius, speed };
}

/**
 * Sort stars by visual priority (magnitude + activity)
 * Dimmer stars render first (back), brighter stars last (front)
 */
export function sortStarsByPriority(stars: Map<string, Star>): Star[] {
    return Array.from(stars.values()).sort((a, b) => {
        const scoreA = (a.magnitude * 0.7) + (a.activity * 0.3);
        const scoreB = (b.magnitude * 0.7) + (b.activity * 0.3);
        return scoreA - scoreB;
    });
}

/**
 * Initialize background dust particles
 */
export function initDust(count: number): Dust[] {
    const particles: Dust[] = [];
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random(),
            y: Math.random(),
            size: Math.random() * 1.5,
            alpha: Math.random() * 0.15 + 0.05
        });
    }
    return particles;
}

/**
 * Create a new star with initial physics state
 */
export function createStar(
    id: string,
    name: string,
    physics: { radius: number; speed: number },
    palette: string[]
): Star {
    const seed = seededRandom(id);
    return {
        id,
        name,
        targetRadius: physics.radius,
        currentRadius: 1.2, // Start off-screen, animate in
        angle: seededRandom(id + '_ang') * Math.PI * 2,
        speed: physics.speed * (seededRandom(id + 'dir') > 0.5 ? 1 : -1),
        baseColor: palette[Math.floor(seed * palette.length)],
        phase: Math.random() * Math.PI * 2,
        activity: 0,
        lastActivity: 0,
        mass: 0,
        magnitude: 0,
        planets: []
    };
}

/**
 * Update star physics for one frame
 */
export function updateStarPhysics(star: Star): void {
    star.angle += star.speed;
    if (star.activity < 0.01) star.activity = 0;
    star.currentRadius += (star.targetRadius - star.currentRadius) * 0.05;
}

/**
 * Update planet physics for one frame
 */
export function updatePlanetPhysics(planet: Planet): void {
    planet.angle += planet.speed;
}

/**
 * Create a planet orbiting a star
 */
export function createPlanet(
    authorId: string,
    name: string,
    color: string,
    speedMultiplier: number
): Planet {
    const seed = seededRandom(authorId);
    return {
        id: authorId,
        name,
        angle: Math.random() * Math.PI * 2,
        speed: (0.004 + (seed * 0.006)) * speedMultiplier,
        dist: 1 + (seed * 1.5),
        color
    };
}
