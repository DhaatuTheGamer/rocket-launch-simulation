// --- Configuration ---
        const GRAVITY = 9.8; 
        const PIXELS_PER_METER = 10; 
        const FPS = 60;
        const DT = 1 / FPS;
        const SCALE_HEIGHT = 7000; 
        const RHO_SL = 1.225; 
        
        // Physics constants
        const MAX_THRUST_BOOSTER = 2000000; 
        const MAX_THRUST_UPPER = 500000;    
        const MASS_BOOSTER = 40000;         
        const MASS_UPPER = 15000;           
        const FUEL_MASS = 30000;            
        
        // --- Setup Canvas ---
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d', { alpha: false });
        let width, height;
        
        function resize() {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;
        }
        window.addEventListener('resize', resize);
        resize();

        // --- AUDIO ENGINE ---
        class AudioEngine {
            constructor() {
                this.ctx = null;
                this.masterGain = null;
                this.engineOsc = null;
                this.engineGain = null;
                this.noiseNode = null;
                this.noiseGain = null;
                this.initialized = false;
                this.muted = true;
            }

            init() {
                if (this.initialized) return;
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.ctx = new AudioContext();
                this.masterGain = this.ctx.createGain();
                this.masterGain.gain.value = 0.5;
                this.masterGain.connect(this.ctx.destination);

                const bufferSize = 2 * this.ctx.sampleRate;
                const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
                const output = buffer.getChannelData(0);
                let lastOut = 0;
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    output[i] = (lastOut + (0.02 * white)) / 1.02;
                    lastOut = output[i];
                    output[i] *= 3.5; 
                }

                this.noiseNode = this.ctx.createBufferSource();
                this.noiseNode.buffer = buffer;
                this.noiseNode.loop = true;
                
                this.lowPass = this.ctx.createBiquadFilter();
                this.lowPass.type = 'lowpass';
                this.lowPass.frequency.value = 100;

                this.noiseGain = this.ctx.createGain();
                this.noiseGain.gain.value = 0;

                this.noiseNode.connect(this.lowPass);
                this.lowPass.connect(this.noiseGain);
                this.noiseGain.connect(this.masterGain);
                this.noiseNode.start(0);
                
                this.initialized = true;
                this.muted = false;
            }

            setThrust(level) {
                if (!this.initialized || this.muted) return;
                const targetVol = Math.max(0, level * 0.8);
                this.noiseGain.gain.setTargetAtTime(targetVol, this.ctx.currentTime, 0.1);
                const targetFreq = 100 + (level * 800);
                this.lowPass.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
            }

            playExplosion() {
                if (!this.initialized || this.muted) return;
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(100, this.ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 1);
                gain.gain.setValueAtTime(1, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start();
                osc.stop(this.ctx.currentTime + 1);
            }

            playStaging() {
                 if (!this.initialized || this.muted) return;
                 const osc = this.ctx.createOscillator();
                 const gain = this.ctx.createGain();
                 osc.frequency.setValueAtTime(150, this.ctx.currentTime);
                 gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
                 gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
                 osc.connect(gain);
                 gain.connect(this.masterGain);
                 osc.start();
                 osc.stop(this.ctx.currentTime + 0.1);
            }
            
            toggleMute() {
                if (!this.initialized) this.init();
                this.muted = !this.muted;
                if (this.muted) {
                    this.masterGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
                } else {
                    this.masterGain.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.1);
                }
                return this.muted;
            }
        }

        const audio = new AudioEngine();

        // --- TELEMETRY GRAPH ENGINE ---
        class TelemetrySystem {
            constructor() {
                this.canvas = document.getElementById('graph-canvas');
                this.ctx = this.canvas.getContext('2d');
                this.data = []; 
                this.startTime = 0;
                this.maxDataPoints = 300; 
                this.lastSample = 0;
            }

            update(time, alt, vel) {
                if (time - this.lastSample > 0.1) { 
                    this.data.push({ t: time, alt: alt, vel: vel });
                    if (this.data.length > this.maxDataPoints) this.data.shift();
                    this.lastSample = time;
                }
            }

            draw() {
                const w = this.canvas.width;
                const h = this.canvas.height;
                this.ctx.clearRect(0, 0, w, h);

                if (this.data.length < 2) return;

                const maxAlt = Math.max(...this.data.map(d => d.alt), 100);
                const maxVel = Math.max(...this.data.map(d => d.vel), 100);

                this.ctx.lineWidth = 2;

                this.ctx.strokeStyle = '#2ecc71';
                this.ctx.beginPath();
                this.data.forEach((d, i) => {
                    const x = (i / (this.data.length - 1)) * w;
                    const y = h - (d.alt / maxAlt) * h;
                    if (i===0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
                });
                this.ctx.stroke();

                this.ctx.strokeStyle = '#3498db';
                this.ctx.beginPath();
                this.data.forEach((d, i) => {
                    const x = (i / (this.data.length - 1)) * w;
                    const y = h - (d.vel / maxVel) * h;
                    if (i===0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
                });
                this.ctx.stroke();
                
                this.ctx.fillStyle = '#2ecc71';
                this.ctx.fillText(`ALT: ${maxAlt.toFixed(0)}m`, 5, 10);
                this.ctx.fillStyle = '#3498db';
                this.ctx.fillText(`VEL: ${maxVel.toFixed(0)}m/s`, 5, 20);
            }
        }
        
        const telemetry = new TelemetrySystem();

        // --- Utils ---
        const random = (min, max) => Math.random() * (max - min) + min;

        // --- Classes ---

        class Particle {
            constructor(x, y, type, vx = 0, vy = 0) {
                this.x = x;
                this.y = y;
                this.type = type; 
                this.life = 1.0;
                
                const spread = type === 'smoke' ? 2 : 1.5;
                // Base velocity + random spread in all directions
                this.vx = vx + random(-spread, spread);
                this.vy = vy + random(-spread, spread); 

                if (type === 'smoke') {
                    this.size = random(10, 20);
                    this.growRate = random(0.5, 1.5);
                    this.color = 200 + random(-20, 20);
                    this.alpha = 0.5;
                    this.decay = random(0.005, 0.015);
                } else if (type === 'fire') {
                    this.size = random(5, 12);
                    this.growRate = -0.1;
                    this.decay = random(0.05, 0.1);
                } else if (type === 'spark') {
                    this.size = random(1, 3);
                    this.vx = vx + random(-5, 5); // Sparks are erratic
                    this.vy = vy + random(-5, 5);
                    this.decay = random(0.05, 0.1);
                } else if (type === 'debris') {
                    this.size = random(2, 5);
                    this.vx = random(-20, 20);
                    this.vy = random(-20, 20);
                    this.decay = 0.01;
                    this.color = 50;
                }
            }

            update(groundLevel, timeScale) {
                this.life -= this.decay * timeScale;
                this.x += this.vx * timeScale;
                this.y += this.vy * timeScale;

                if (this.y + this.size > groundLevel) {
                    this.y = groundLevel - this.size;
                    this.vy *= -0.5;
                    this.vx *= 0.8;
                }

                if (this.type === 'smoke') {
                    this.size += this.growRate * timeScale;
                }
            }

            draw(ctx, camY) {
                const drawY = this.y - camY;
                ctx.beginPath();
                ctx.arc(this.x, drawY, this.size, 0, Math.PI * 2);
                
                if (this.type === 'smoke') {
                    const c = Math.floor(this.color);
                    const shade = Math.floor(c * this.life); 
                    ctx.fillStyle = `rgba(${shade},${shade},${shade},${this.alpha * this.life})`;
                } else if (this.type === 'fire') {
                    const g = Math.floor(255 * this.life);
                    ctx.fillStyle = `rgba(255,${g},0,${this.life})`;
                } else if (this.type === 'spark') {
                    ctx.fillStyle = `rgba(255, 200, 150, ${this.life})`;
                } else if (this.type === 'debris') {
                    ctx.fillStyle = `rgba(50, 50, 50, ${this.life})`;
                }
                ctx.fill();
            }
        }

        class Vessel {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                this.vx = 0;
                this.vy = 0; 
                this.angle = 0; 
                this.mass = 1000;
                this.w = 40;
                this.h = 100;
                this.throttle = 0;
                this.fuel = 1.0;
                this.active = true;
                this.maxThrust = 100000;
                this.crashed = false;
                this.cd = 0.5; 
                this.q = 0; 
                this.apogee = 0;
            }

            applyPhysics(dt) {
                if (this.crashed) return;

                const altitude = (groundY - this.y - this.h) / PIXELS_PER_METER;
                const safeAlt = Math.max(0, altitude);
                
                const rho = RHO_SL * Math.exp(-safeAlt / SCALE_HEIGHT);

                const v = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
                this.q = 0.5 * rho * v * v;
                const dragForceMagnitude = this.q * 0.1 * this.cd; 
                
                let dragFx = 0;
                let dragFy = 0;
                if (v > 0) {
                     dragFx = -dragForceMagnitude * (this.vx / v);
                     dragFy = -dragForceMagnitude * (this.vy / v);
                }

                const R_EARTH = 6371000;
                const realAltitude = altitude + R_EARTH;
                const g_real = 9.8 * Math.pow(R_EARTH / realAltitude, 2);
                
                let fx = 0;
                let fy = this.mass * g_real; 
                
                const f_centrifugal = (this.mass * this.vx * this.vx) / realAltitude; 
                fy -= f_centrifugal; 

                fx += dragFx;
                fy += dragFy;

                if (this.throttle > 0 && this.fuel > 0) {
                    const thrust = this.throttle * this.maxThrust;
                    fx += Math.sin(this.angle) * thrust;
                    fy -= Math.cos(this.angle) * thrust;
                    this.fuel -= (this.throttle * 0.0005) * (dt / (1/60)); 
                }

                const ax = fx / this.mass;
                const ay = fy / this.mass;

                this.vx += ax * dt;
                this.vy += ay * dt;

                this.x += this.vx * dt * PIXELS_PER_METER;
                this.y += this.vy * dt * PIXELS_PER_METER;

                if (this.vy < 0) { 
                    this.apogee = altitude + (this.vy * this.vy) / (2 * 9.8);
                } else {
                    this.apogee = altitude;
                }

                if (this.active && altitude > 2000 && !booster && this.throttle > 0) { 
                     const targetAngle = Math.min(Math.PI / 2, (altitude - 2000) / 40000); 
                     if (this.angle < targetAngle) this.angle += 0.0005 * (dt * 60);
                }

                if (this.y + this.h > groundY) {
                    this.y = groundY - this.h;
                    if (this.vy > 15) { 
                        this.explode();
                    } else {
                        this.vy = 0;
                        this.vx = 0;
                        this.throttle = 0;
                        if (Math.abs(this.angle) > 0.3) {
                            this.explode();
                        }
                    }
                }
            }

            explode() {
                if (this.crashed) return;
                this.crashed = true;
                this.active = false;
                this.throttle = 0;
                audio.playExplosion();
                for(let i=0; i<20; i++) {
                    particles.push(new Particle(this.x + random(-10,10), this.y + this.h, 'fire'));
                    particles.push(new Particle(this.x, this.y + this.h/2, 'debris'));
                }
            }
            
            spawnExhaust(timeScale) {
                if (this.throttle <= 0 || this.fuel <= 0 || this.crashed) return;
                const count = Math.ceil(this.throttle * 5 * timeScale); 
                
                // Calculate engine nozzle position (bottom of the rocket)
                // Rocket "down" direction is (-sin(angle), cos(angle)) in canvas coords due to clockwise rotation
                const exX = this.x - Math.sin(this.angle) * this.h;
                const exY = this.y + Math.cos(this.angle) * this.h; 
                
                // Calculate exhaust velocity vector relative to world
                // Exhaust shoots "down" relative to rocket
                const ejectionSpeed = 30 + (this.throttle * 20);
                const ejectVx = -Math.sin(this.angle) * ejectionSpeed;
                const ejectVy = Math.cos(this.angle) * ejectionSpeed;

                for (let i = 0; i < count; i++) {
                     // Particle velocity = Vessel Velocity + Ejection Velocity
                     particles.push(new Particle(exX, exY, 'fire', this.vx + ejectVx, this.vy + ejectVy));
                     if (Math.random() > 0.5) particles.push(new Particle(exX, exY, 'smoke', this.vx + ejectVx, this.vy + ejectVy));
                }
            }

            drawShockwave(ctx) {
                if (this.q > 500 && this.vy < -50) { 
                     ctx.save();
                     ctx.globalAlpha = Math.min((this.q - 500) / 1000, 0.6);
                     ctx.strokeStyle = 'white';
                     ctx.lineWidth = 3;
                     ctx.beginPath();
                     ctx.moveTo(-40, 40);
                     ctx.quadraticCurveTo(0, -60, 40, 40); 
                     ctx.stroke();
                     if (this.q > 2000) {
                        ctx.fillStyle = `rgba(255, 100, 50, 0.3)`;
                        ctx.globalCompositeOperation = 'screen';
                        ctx.fill();
                     }
                     ctx.restore();
                }
            }
        }

        class FullStack extends Vessel {
            constructor() {
                super(width/2, groundY - 160);
                this.h = 160;
                this.mass = MASS_BOOSTER + MASS_UPPER + FUEL_MASS;
                this.maxThrust = MAX_THRUST_BOOSTER;
            }
            draw(ctx, camY) {
                if (this.crashed) return;
                const drawX = this.x;
                const drawY = this.y - camY;
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(this.angle);
                this.drawShockwave(ctx);
                ctx.fillStyle = '#fff';
                ctx.fillRect(-20, 0, 40, 60);
                ctx.beginPath();
                ctx.moveTo(-20, 0);
                ctx.quadraticCurveTo(0, -40, 20, 0);
                ctx.fill();
                ctx.fillStyle = '#222';
                ctx.fillRect(-20, 60, 40, 5);
                ctx.fillStyle = '#eee';
                ctx.fillRect(-20, 65, 40, 95); 
                ctx.fillStyle = '#333';
                ctx.beginPath();
                ctx.moveTo(-20, 140);
                ctx.lineTo(-30, 160);
                ctx.lineTo(-20, 150);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(20, 140);
                ctx.lineTo(30, 160);
                ctx.lineTo(20, 150);
                ctx.fill();
                ctx.restore();
            }
        }

        class Booster extends Vessel {
            constructor(x, y, vx, vy) {
                super(x, y);
                this.vx = vx;
                this.vy = vy;
                this.h = 100;
                this.mass = MASS_BOOSTER; 
                this.maxThrust = MAX_THRUST_BOOSTER;
                this.fuel = 0.3; 
            }
            draw(ctx, camY) {
                if (this.crashed) return;
                const drawX = this.x;
                const drawY = this.y - camY;
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(this.angle);
                ctx.fillStyle = '#eee'; 
                ctx.fillRect(-20, 0, 40, 100);
                ctx.fillStyle = '#222';
                ctx.fillRect(-15, 100, 30, 5);
                if (this.y > groundY - 300) {
                     ctx.fillStyle = '#111';
                     ctx.fillRect(-35, 90, 15, 5); 
                     ctx.fillRect(20, 90, 15, 5); 
                }
                ctx.restore();
            }
        }

        class UpperStage extends Vessel {
            constructor(x, y, vx, vy) {
                super(x, y);
                this.vx = vx;
                this.vy = vy;
                this.h = 60;
                this.mass = MASS_UPPER;
                this.maxThrust = MAX_THRUST_UPPER;
                this.throttle = 1.0; 
                this.fairingsDeployed = false;
            }
            draw(ctx, camY) {
                if (this.crashed) return;
                const drawX = this.x;
                const drawY = this.y - camY; 
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(this.angle);
                
                this.drawShockwave(ctx);

                ctx.fillStyle = '#444';
                ctx.beginPath();
                ctx.moveTo(-10, 60);
                ctx.lineTo(10, 60);
                ctx.lineTo(15, 75);
                ctx.lineTo(-15, 75);
                ctx.fill();
                
                ctx.fillStyle = '#fff';
                ctx.fillRect(-20, 0, 40, 60);
                
                if (!this.fairingsDeployed) {
                    ctx.beginPath();
                    ctx.moveTo(-20, 0);
                    ctx.quadraticCurveTo(0, -40, 20, 0);
                    ctx.fill();
                    ctx.strokeStyle = '#ddd';
                    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-40); ctx.stroke();
                } else {
                    ctx.fillStyle = '#f1c40f';
                    ctx.fillRect(-10, -5, 20, 5);
                }
                
                ctx.restore();
            }
        }

        class Fairing extends Vessel {
             constructor(x, y, vx, vy, side) {
                super(x, y);
                this.vx = vx + (side * 5); 
                this.vy = vy;
                this.angle = 0;
                this.w = 20;
                this.h = 40;
                this.mass = 500;
                this.side = side;
                this.throttle = 0;
                this.active = false; 
                this.cd = 2.0; 
            }
            draw(ctx, camY) {
                const drawX = this.x;
                const drawY = this.y - camY;
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.rotate(this.angle + (this.side === -1 ? 0 : 0)); 
                
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                if (this.side === -1) {
                    ctx.moveTo(0,0); ctx.lineTo(-20,0); ctx.quadraticCurveTo(0, -40, 0, 0);
                } else {
                    ctx.moveTo(0,0); ctx.lineTo(20,0); ctx.quadraticCurveTo(0, -40, 0, 0);
                }
                ctx.fill();
                ctx.restore();
            }
        }

        class Payload extends Vessel {
            constructor(x, y, vx, vy) {
                super(x, y);
                this.vx = vx;
                this.vy = vy;
                this.mass = 1000;
                this.w = 20;
                this.h = 20;
                this.throttle = 0;
                this.active = true; 
                this.angle = 0;
                this.deployed = false;
            }
            draw(ctx, camY) {
                 const drawX = this.x;
                 const drawY = this.y - camY;
                 ctx.save();
                 ctx.translate(drawX, drawY);
                 ctx.rotate(this.angle);
                 
                 ctx.fillStyle = '#f1c40f'; 
                 ctx.fillRect(-10, -10, 20, 20);
                 
                 if (this.deployed) {
                     ctx.fillStyle = '#3498db';
                     ctx.fillRect(-40, -5, 30, 10);
                     ctx.fillRect(10, -5, 30, 10);
                 }
                 
                 if (Math.floor(Date.now() / 500) % 2 === 0) {
                     ctx.fillStyle = 'red';
                     ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();
                 }

                 ctx.restore();
            }
        }

        // --- Global State ---
        let groundY = height - 50;
        let entities = [];
        let particles = [];
        let cameraY = 0;
        let starField = [];
        
        let mainStack; 
        let booster; 
        
        let cameraMode = 'TRACKING'; 
        let cameraShakeX = 0;
        let cameraShakeY = 0;
        let trackedEntity = null; 
        
        let timeScale = 1.0; 
        
        let sunY = -200; 

        for(let i=0; i<600; i++) {
            starField.push({
                x: Math.random() * 8000 - 4000,
                y: Math.random() * -100000,
                size: Math.random() * 2,
                alpha: Math.random()
            });
        }

        function initGame() {
            entities = [];
            mainStack = new FullStack();
            mainStack.y = groundY - mainStack.h;
            entities.push(mainStack);
            booster = null;
            trackedEntity = mainStack;
            cameraMode = 'TRACKING';
            timeScale = 1.0;
        }

        // --- Core Functions ---

        function performStaging() {
            if (!mainStack || !mainStack.active) return;
            audio.playStaging();
            mainStack.active = false; 
            const idx = entities.indexOf(mainStack);
            if (idx > -1) entities.splice(idx, 1);
            
            const b = new Booster(mainStack.x, mainStack.y + 60, mainStack.vx, mainStack.vy);
            const u = new UpperStage(mainStack.x, mainStack.y, mainStack.vx, mainStack.vy);
            
            u.vy -= 2; b.vy += 2; b.angle = 0.05; 
            
            entities.push(b); entities.push(u);
            booster = b; trackedEntity = u; 
            document.getElementById('booster-stats').style.display = 'block';
            for(let i=0; i<30; i++) {
                const spreadVx = random(-10, 10);
                const spreadVy = random(-5, 5);
                particles.push(new Particle(mainStack.x, mainStack.y + 60, 'smoke', mainStack.vx + spreadVx, mainStack.vy + spreadVy));
            }
        }

        function performPayloadDep() {
            const u = entities.find(e => e instanceof UpperStage);
            if (!u || u.fairingsDeployed) return;
            
            audio.playStaging(); 
            u.fairingsDeployed = true;
            
            const f1 = new Fairing(u.x - 10, u.y - 30, u.vx, u.vy, -1);
            const f2 = new Fairing(u.x + 10, u.y - 30, u.vx, u.vy, 1);
            
            const p = new Payload(u.x, u.y - 20, u.vx, u.vy - 1); 
            p.deployed = true;
            
            entities.push(f1);
            entities.push(f2);
            entities.push(p);
            
            for(let i=0; i<10; i++) {
                const sparkVx = random(-5, 5);
                const sparkVy = random(-5, 5);
                particles.push(new Particle(u.x, u.y - 40, 'spark', u.vx + sparkVx, u.vy + sparkVy));
            }
            
            trackedEntity = p;
        }

        function updatePhysics(dt) {
            const simDt = dt * timeScale;

            if (!trackedEntity || !trackedEntity.active && trackedEntity !== booster) { 
                 trackedEntity = entities.find(e => e instanceof UpperStage) || entities[0];
            }

            let totalThrust = 0;
            entities.forEach(e => {
                e.applyPhysics(simDt);
                e.spawnExhaust(timeScale);
                if (e.active) totalThrust = Math.max(totalThrust, e.throttle);
            });
            audio.setThrust(totalThrust);
            
            const q = trackedEntity ? trackedEntity.q : 0;
            const shakeIntensity = Math.min(q / 100, 15); 
            cameraShakeX = (Math.random() - 0.5) * shakeIntensity;
            cameraShakeY = (Math.random() - 0.5) * shakeIntensity;

            let targetY = 0;
            if (cameraMode === 'FIXED') {
                targetY = 0; cameraY += (0 - cameraY) * 0.1;
            } else if (cameraMode === 'ROCKET' && trackedEntity) {
                const screenCenterY = height / 2;
                targetY = trackedEntity.y - screenCenterY;
                cameraY = targetY; 
            } else {
                if (trackedEntity) {
                    targetY = trackedEntity.y - (height * 0.6);
                    if (targetY < 0) cameraY += (targetY - cameraY) * 0.1;
                    else cameraY += (0 - cameraY) * 0.1;
                }
            }

            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update(groundY, timeScale);
                if (particles[i].life <= 0) particles.splice(i, 1);
            }
        }

        function drawEnvironment() {
            const altitude = -cameraY; 
            
            const spaceFade = Math.min(Math.max(altitude / 30000, 0), 1);
            
            const r = 135 * (1 - spaceFade);
            const g = 206 * (1 - spaceFade);
            const b = 235 * (1 - spaceFade) + 20 * spaceFade;
            
            ctx.fillStyle = `rgb(${r},${g},${b})`;
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.translate(cameraShakeX, -cameraY + cameraShakeY);

            if (spaceFade > 0.1) {
                ctx.fillStyle = `rgba(255, 255, 255, ${spaceFade})`;
                starField.forEach(star => {
                    ctx.beginPath();
                    ctx.arc(star.x + width/2, star.y, star.size, 0, Math.PI*2);
                    ctx.fill();
                });
            }

            ctx.fillStyle = '#f39c12';
            ctx.shadowBlur = 50;
            ctx.shadowColor = '#f1c40f';
            ctx.beginPath();
            ctx.arc(width/2 + 200, -50000, 1000, 0, Math.PI*2); 
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#444'; 
            ctx.fillRect(width/2 - 200, groundY, 400, 20);
            ctx.fillStyle = '#2d3436';
            ctx.fillRect(-20000, groundY + 20, 40000, 500); 

            if (altitude > 5000) {
                 const gradient = ctx.createLinearGradient(0, groundY - 500, 0, groundY + 100);
                 gradient.addColorStop(0, `rgba(255,255,255,0)`);
                 gradient.addColorStop(1, `rgba(135, 206, 235, ${0.5 * (1-spaceFade)})`);
                 ctx.fillStyle = gradient;
                 ctx.fillRect(-10000, groundY - 2000, 20000, 3000);
            }

            if (entities.length > 0 && entities[0] === mainStack && Math.abs(mainStack.y - (groundY - mainStack.h)) < 10) {
                 ctx.fillStyle = '#555';
                 ctx.fillRect(width/2 - 120, groundY - 300, 40, 300);
            }

            ctx.restore();
        }

        function drawStats() {
            if (trackedEntity) {
                const alt = (groundY - trackedEntity.y - trackedEntity.h) / PIXELS_PER_METER;
                const vel = Math.sqrt(trackedEntity.vx**2 + trackedEntity.vy**2);
                telemetry.update(performance.now() / 1000, alt, vel);
                
                document.getElementById('alt').textContent = Math.max(0, alt/1000).toFixed(2); 
                document.getElementById('vel').textContent = vel.toFixed(0);
                document.getElementById('apogee').textContent = (trackedEntity.apogee/1000).toFixed(1);
            }
            telemetry.draw();
            
            if (timeScale !== 1.0) {
                ctx.fillStyle = 'white';
                ctx.font = '20px monospace';
                ctx.fillText(`TIME: ${timeScale.toFixed(1)}x`, width - 150, 50);
            }
            
            if (booster && !booster.crashed) {
                document.getElementById('boost-fuel').textContent = Math.floor(booster.fuel * 100);
                document.getElementById('boost-thrust').textContent = Math.floor(booster.throttle * 100);
            } else if (booster && booster.crashed) {
                document.getElementById('boost-thrust').textContent = "LOST";
            }
        }

        function animate() {
            ctx.clearRect(0, 0, width, height);
            updatePhysics(DT);
            drawEnvironment();
            
            ctx.save();
            ctx.translate(cameraShakeX, cameraShakeY);
            particles.forEach(p => p.draw(ctx, cameraY));
            entities.forEach(e => e.draw(ctx, cameraY));
            ctx.restore();
            
            drawStats();
            requestAnimationFrame(animate);
        }

        // --- Interaction ---
        
        const launchBtn = document.getElementById('launch-btn');
        const audioBtn = document.getElementById('audio-btn');
        const statusMsg = document.getElementById('status-msg');
        const splashScreen = document.getElementById('splash-screen');
        const startBtn = document.getElementById('start-btn');

        initGame();

        startBtn.addEventListener('click', () => {
            splashScreen.style.opacity = 0;
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 500);
            
            // Try init audio on this click too (user gesture)
            audio.init();
            // Default to enabled if they click Start? Or respect the mute button?
            // AudioEngine init() sets muted=false by default, so yes.
            audioBtn.innerText = "🔊 Mute Audio";
        });

        function initiateLaunch() {
            if (launchBtn.disabled) return;
            audio.init(); 
            launchBtn.disabled = true;
            launchBtn.innerText = "Launch Sequence Active";
            
            let count = 3;
            statusMsg.style.opacity = 1;
            statusMsg.innerText = "T-MINUS " + count;

            const timer = setInterval(() => {
                count--;
                if (count > 0) {
                    statusMsg.innerText = "T-MINUS " + count;
                } else if (count === 0) {
                    statusMsg.innerText = "IGNITION";
                    if (mainStack) mainStack.throttle = 1.0;
                } else if (count === -1) {
                    statusMsg.innerText = "LIFTOFF";
                    statusMsg.style.color = "#ffdd57";
                } else if (count < -3) {
                    statusMsg.style.opacity = 0;
                    clearInterval(timer);
                }
            }, 1000);
        }

        launchBtn.addEventListener('click', initiateLaunch);
        audioBtn.addEventListener('click', () => {
            const isMuted = audio.toggleMute();
            audioBtn.innerText = isMuted ? "🔇 Enable Audio" : "🔊 Mute Audio";
        });

        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault(); 
                initiateLaunch();
            } else if (e.code === 'KeyS') {
                performStaging();
            } else if (e.code === 'KeyP') {
                performPayloadDep();
            } else if (e.code === 'ArrowUp') {
                if (booster) booster.throttle = Math.min(booster.throttle + 0.1, 1.0);
            } else if (e.code === 'ArrowDown') {
                if (booster) booster.throttle = Math.max(booster.throttle - 0.1, 0.0);
            } else if (e.code === 'ArrowLeft') {
                if (booster) booster.angle -= 0.1;
                if (mainStack && mainStack.active) mainStack.angle -= 0.05;
            } else if (e.code === 'ArrowRight') {
                 if (booster) booster.angle += 0.1;
                 if (mainStack && mainStack.active) mainStack.angle += 0.05;
            } else if (e.code === 'KeyX') {
                 if (booster) booster.throttle = 0;
            } else if (e.code === 'Digit1') {
                cameraMode = 'TRACKING';
                trackedEntity = entities.find(e => e instanceof UpperStage) || entities[0];
            } else if (e.code === 'Digit2') {
                cameraMode = 'ROCKET';
                trackedEntity = entities.find(e => e instanceof UpperStage) || entities[0];
            } else if (e.code === 'Digit3') {
                cameraMode = 'FIXED';
            } else if (e.code === 'KeyB') {
                if (booster) trackedEntity = booster;
            } else if (e.code === 'BracketRight') { 
                timeScale = Math.min(timeScale * 2, 10.0);
            } else if (e.code === 'BracketLeft') { 
                timeScale = Math.max(timeScale / 2, 0.1);
            } else if (e.code === 'Backslash') { 
                timeScale = 1.0;
            } else if (e.code === 'Escape') {
                location.reload();
            }
        });

        animate();