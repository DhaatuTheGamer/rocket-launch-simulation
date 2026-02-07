class Game {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.groundY = this.height - 100;

        // Init Systems
        this.input = new InputManager();
        this.audio = new AudioEngine();
        this.assets = new AssetLoader();

        // --- GLOBAL INTEROP COMPATIBILITY ---
        window.state = this;
        window.PIXELS_PER_METER = 10;
        window.R_EARTH = 6371000;
        // Constants usually in constants.js, assuming loaded

        this.entities = [];
        this.particles = [];
        this.cameraY = 0;
        this.cameraMode = 'ROCKET';
        this.cameraShakeX = 0;
        this.cameraShakeY = 0;
        this.timeScale = 1.0;

        this.trackedEntity = null;
        this.mainStack = null;
        this.booster = null;
        this.upperStage = null;

        this.missionState = { liftoff: false, supersonic: false, maxq: false };
        this.lastTime = 0;
        this.accumulator = 0;
        this.FIXED_DT = 1 / 60;

        // Bloom setup
        this.bloomCanvas = document.createElement('canvas');
        this.bloomCanvas.width = this.width / 4;
        this.bloomCanvas.height = this.height / 4;
        this.bloomCtx = this.bloomCanvas.getContext('2d');

        // Navball
        this.navball = new Navball(document.getElementById('navball'));
        this.telemetry = new TelemetrySystem();
        this.missionLog = new MissionLog();
        this.sas = new SAS();

        // Expose to window for old scripts
        window.navball = this.navball;
        window.missionLog = this.missionLog;
        window.audio = this.audio;
    }

    async init() {
        // Init Audio
        document.addEventListener('click', () => {
            if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
            this.audio.init();
        }, { once: true });
        document.addEventListener('touchstart', () => {
            if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
            this.audio.init();
        }, { once: true });

        await this.assets.loadAll();
        this.reset();
        this.animate(0);
    }

    reset() {
        this.entities = [];
        this.particles = [];
        this.cameraY = 0;
        this.timeScale = 1;

        const rocket = new FullStack(this.width / 2, this.groundY - 160);
        this.entities.push(rocket);
        this.mainStack = rocket;
        this.trackedEntity = rocket;

        window.mainStack = this.mainStack;
        window.trackedEntity = this.trackedEntity;
        window.booster = null;
        window.upperStage = null;
    }

    updatePhysics(dt) {
        // --- INPUT HANDLING ---
        // Time Warp
        if (this.input.actions.TIME_WARP_UP && this.timeScale < 100) this.timeScale *= 1.1;
        if (this.input.actions.TIME_WARP_DOWN && this.timeScale > 1) this.timeScale *= 0.9;

        // Toggle Map
        if (this.input.actions.MAP_MODE) this.cameraMode = (this.cameraMode === 'MAP') ? 'ROCKET' : 'MAP';
        // Reset Map action to prevent toggle flicker (input manager might need to handle one-shot)
        this.input.actions.MAP_MODE = false;

        // Staging
        if (this.input.actions.STAGE) {
            performStaging(this); // Pass game instance
            this.input.actions.STAGE = false;
        }

        // SAS Toggle
        if (this.input.actions.SAS_TOGGLE) {
            // Simple toggle cycle
            const modes = ['OFF', 'STABILITY', 'PROGRADE', 'RETROGRADE']; // Values from SAS.js?
            // Need access to SASModes
            // For now, UI buttons handle SAS primarily.
        }

        const simDt = dt * this.timeScale;

        // --- CONTROL ---
        if (this.mainStack && this.mainStack.active) {
            const steer = this.input.getSteering();
            // Manual Override
            if (Math.abs(steer) > 0.1) {
                this.mainStack.gimbalAngle = steer * 0.4;
            } else if (this.sas.mode !== 'OFF') { // String check or Enum
                const sasOut = this.sas.update(this.mainStack, simDt);
                this.mainStack.gimbalAngle = sasOut;
            } else {
                this.mainStack.gimbalAngle = 0;
            }

            // Throttle
            if (this.input.actions.THROTTLE_UP) this.mainStack.throttle += 0.02 * this.timeScale;
            if (this.input.actions.THROTTLE_DOWN) this.mainStack.throttle -= 0.02 * this.timeScale;
            // Cut Engine
            if (this.input.actions.CUT_ENGINE) this.mainStack.throttle = 0;

            this.mainStack.throttle = Math.max(0, Math.min(1, this.mainStack.throttle));
        }

        // --- PHYSICS ---
        this.entities.forEach(e => {
            e.applyPhysics(simDt, {}); // No keys passed, control handled above
            e.spawnExhaust(this.timeScale);
        });

        // Sync particles from global state (Vessel adds to state.particles)
        if (state.particles.length > 0) {
            this.particles.push(...state.particles);
            state.particles.length = 0; // Clear after transfer
        }

        // Events
        if (this.trackedEntity) {
            const alt = (this.groundY - this.trackedEntity.y - this.trackedEntity.h) / window.PIXELS_PER_METER;
            const vel = Math.sqrt(this.trackedEntity.vx ** 2 + this.trackedEntity.vy ** 2);
            const rho = 1.225 * Math.exp(-alt / 7000);
            this.audio.setThrust(this.trackedEntity.throttle, rho, vel);

            if (!this.missionState.liftoff && alt > 20) { this.missionState.liftoff = true; this.missionLog.log("LIFTOFF", "warn"); this.audio.speak("Liftoff"); }
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            let p = this.particles[i];
            p.update(this.groundY, this.timeScale);
            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Sync Globals (Backwards Compat)
        window.trackedEntity = this.trackedEntity;
        window.mainStack = this.mainStack;
    }

    updateOrbitPaths(now) {
        // Simple caching logic from before
        this.entities.forEach(e => {
            if (e.crashed) return;
            const alt = (this.groundY - e.y - e.h) / window.PIXELS_PER_METER;
            let needsUpdate = false;
            if (e.throttle > 0) needsUpdate = true;
            if (alt < 140000) needsUpdate = true;
            if (now - (e.lastOrbitUpdate || 0) > 1000) needsUpdate = true;
            if (!e.orbitPath) needsUpdate = true;

            if (needsUpdate) {
                // Orbit calc ... (simplified for brevity, identical to logic in main.js)
                // Would be better to extract `calculateOrbit(e)` as a utility function.
                e.orbitPath = [];
                e.lastOrbitUpdate = now;

                let simState = { x: e.x / 10, y: e.y / 10, vx: e.vx, vy: e.vy };
                let dtPred = 10;
                // ... Prediction Loop ...
                // Re-implementation omitted for length limit, assuming known
                // Or I can copy it fully if space permits.
                // Let's implement full orbit logic to ensure it works.

                const startPhi = simState.x / R_EARTH;
                const startR = R_EARTH + (this.groundY / 10 - simState.y - e.h / 10);
                e.orbitPath.push({ phi: startPhi, r: startR });

                for (let i = 0; i < 200; i++) {
                    const pAlt = (this.groundY / 10 - simState.y - e.h / 10);
                    const pRad = pAlt + R_EARTH;
                    const pG = 9.8 * Math.pow(R_EARTH / pRad, 2);
                    const pFy = pG - (simState.vx ** 2) / pRad;
                    simState.vy += pFy * dtPred;
                    simState.x += simState.vx * dtPred;
                    simState.y += simState.vy * dtPred;
                    if (simState.y * 10 > this.groundY) break;

                    const pPhi = (simState.x * 10) / R_EARTH;
                    const pR = R_EARTH + (this.groundY / 10 - simState.y - e.h / 10);
                    e.orbitPath.push({ phi: pPhi, r: pR });
                }
            }
        });
    }

    draw() {
        if (this.cameraMode === 'MAP') {
            // Draw Map
            this.ctx.fillStyle = '#000';
            this.ctx.fillRect(0, 0, this.width, this.height);

            const cx = this.width / 2;
            const cy = this.height / 2;
            const scale = 0.00005;

            // Earth
            const r_earth_px = R_EARTH * scale;
            this.ctx.fillStyle = '#3498db';
            this.ctx.beginPath(); this.ctx.arc(cx, cy, r_earth_px, 0, Math.PI * 2); this.ctx.fill();

            // Orbits
            this.entities.forEach(e => {
                if (e.crashed) return;
                const alt = (this.groundY - e.y - e.h) / PIXELS_PER_METER;
                const r = R_EARTH + alt;
                const phi = e.x / R_EARTH;
                const ox = cx + Math.cos(phi - Math.PI / 2) * r * scale;
                const oy = cy + Math.sin(phi - Math.PI / 2) * r * scale;

                this.ctx.fillStyle = (e === this.trackedEntity) ? '#f1c40f' : '#aaa';
                this.ctx.beginPath(); this.ctx.arc(ox, oy, 3, 0, Math.PI * 2); this.ctx.fill();

                if (e.orbitPath) {
                    this.ctx.strokeStyle = this.ctx.fillStyle;
                    this.ctx.beginPath();
                    e.orbitPath.forEach((p, i) => {
                        const px = cx + Math.cos(p.phi - Math.PI / 2) * p.r * scale;
                        const py = cy + Math.sin(p.phi - Math.PI / 2) * p.r * scale;
                        if (i === 0) this.ctx.moveTo(px, py); else this.ctx.lineTo(px, py);
                    });
                    this.ctx.stroke();
                }
            });
            this.ctx.fillStyle = 'white'; this.ctx.font = '20px monospace';
            this.ctx.fillText("MAP MODE", 20, 40);

        } else {
            this.ctx.clearRect(0, 0, this.width, this.height);

            // Sky Gradient
            const alt = -this.cameraY;
            const spaceRatio = Math.min(Math.max(alt / 60000, 0), 1);
            const grd = this.ctx.createLinearGradient(0, 0, 0, this.height);
            const rBot = Math.floor(135 * (1 - spaceRatio));
            const gBot = Math.floor(206 * (1 - spaceRatio));
            const bBot = Math.floor(235 * (1 - spaceRatio));
            const bTop = Math.floor(20 * (1 - spaceRatio));
            grd.addColorStop(0, `rgb(0, 0, ${bTop})`);
            grd.addColorStop(1, `rgb(${rBot}, ${gBot}, ${bBot})`);
            this.ctx.fillStyle = grd;
            this.ctx.fillRect(0, 0, this.width, this.height);

            // Camera
            // Smooth follow
            if (this.trackedEntity) {
                let targetY = this.trackedEntity.y - this.height * 0.6;
                if (this.cameraMode === 'ROCKET') targetY = this.trackedEntity.y - this.height / 2;
                if (targetY < 0) this.cameraY += (targetY - this.cameraY) * 0.1;
                else this.cameraY += (0 - this.cameraY) * 0.1;

                const q = this.trackedEntity.q || 0;
                const shake = Math.min(q / 200, 10);
                this.cameraShakeX = (Math.random() - 0.5) * shake;
                this.cameraShakeY = (Math.random() - 0.5) * shake;
            }

            this.ctx.save();
            this.ctx.translate(this.cameraShakeX, -this.cameraY + this.cameraShakeY);

            // Ground
            this.ctx.fillStyle = '#2ecc71'; this.ctx.fillRect(-50000, this.groundY, 100000, 500);

            // Particles (world space, already translated)
            this.particles.forEach(p => p.draw(this.ctx));

            // Entities - pass 0 since context is already translated by cameraY
            this.entities.forEach(e => e.draw(this.ctx, 0));

            this.ctx.restore();

            // HUD Elements in Screen Space
            if (this.trackedEntity) {
                const velAngle = Math.atan2(this.trackedEntity.vx, -this.trackedEntity.vy);
                this.navball.draw(this.trackedEntity.angle, velAngle);

                // Update HUD DOM
                const alt = (this.groundY - this.trackedEntity.y - this.trackedEntity.h) / PIXELS_PER_METER;
                const vel = Math.sqrt(this.trackedEntity.vx ** 2 + this.trackedEntity.vy ** 2);

                // Calculate apogee estimate
                const g = 9.8;
                const apogeeEst = alt + (this.trackedEntity.vy < 0 ? (this.trackedEntity.vy ** 2) / (2 * g) : 0);

                document.getElementById('hud-alt').textContent = (alt / 1000).toFixed(1);
                document.getElementById('hud-vel').textContent = Math.floor(vel);
                document.getElementById('hud-apogee').textContent = (Math.max(alt, apogeeEst) / 1000).toFixed(1);

                // Update gauges
                document.getElementById('gauge-fuel').style.height = (this.trackedEntity.fuel * 100) + '%';
                document.getElementById('gauge-thrust').style.height = (this.trackedEntity.throttle * 100) + '%';
            }
        }
    }

    animate(currentTime) {
        if (!this.lastTime) this.lastTime = currentTime;
        const deltaTime = Math.min((currentTime - this.lastTime) / 1000, 0.1);
        this.lastTime = currentTime;
        this.accumulator += deltaTime;

        while (this.accumulator >= this.FIXED_DT) {
            this.updatePhysics(this.FIXED_DT);
            if (this.cameraMode === 'MAP') this.updateOrbitPaths(currentTime);
            this.accumulator -= this.FIXED_DT;
        }

        this.draw();
        requestAnimationFrame((t) => this.animate(t));
    }
}
