// --- Configuration ---
const GRAVITY = 9.8;
const PIXELS_PER_METER = 10;
const FPS = 60;
const DT = 1 / FPS;
const SCALE_HEIGHT = 7000;
const RHO_SL = 1.225;
const R_EARTH = 6371000;

// Configurable Physics Constants
let MAX_THRUST_BOOSTER = 2000000;
let MAX_THRUST_UPPER = 500000;
let MASS_BOOSTER = 40000;
let MASS_UPPER = 15000;
let FUEL_MASS = 30000;
let DRAG_COEFF = 0.5;

const ISP_VAC_BOOSTER = 311;
const ISP_SL_BOOSTER = 282;
const ISP_VAC_UPPER = 348;
const ISP_SL_UPPER = 100;

// --- Setup Canvas ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
let width, height;

// Bloom Canvas
const bloomCanvas = document.createElement('canvas');
const bloomCtx = bloomCanvas.getContext('2d');

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    bloomCanvas.width = width / 4; // Lower res for blur performance
    bloomCanvas.height = height / 4;
}
window.addEventListener('resize', resize);
resize();

// --- AUDIO ENGINE ---
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.noiseGain = null;
        this.lowPass = null;
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

        const noiseNode = this.ctx.createBufferSource();
        noiseNode.buffer = buffer;
        noiseNode.loop = true;

        this.lowPass = this.ctx.createBiquadFilter();
        this.lowPass.type = 'lowpass';
        this.lowPass.frequency.value = 100;

        this.noiseGain = this.ctx.createGain();
        this.noiseGain.gain.value = 0;

        noiseNode.connect(this.lowPass);
        this.lowPass.connect(this.noiseGain);
        this.noiseGain.connect(this.masterGain);
        noiseNode.start(0);

        this.initialized = true;
        this.muted = false;
    }

    setThrust(level) {
        if (!this.initialized || this.muted) return;
        const targetVol = Math.max(0, level * 0.5);
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
        this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.1);
        if (this.muted && window.speechSynthesis) window.speechSynthesis.cancel();
        return this.muted;
    }

    speak(text) {
        if (this.muted || !this.initialized || !window.speechSynthesis) return;
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.1;
        const voices = window.speechSynthesis.getVoices();
        const preferred = voices.find(v => v.name.includes('Google US English') || v.name.includes('Samantha'));
        if (preferred) utter.voice = preferred;
        window.speechSynthesis.speak(utter);
    }
}
const audio = new AudioEngine();

// --- SYSTEMS ---

class PIDController {
    constructor(kp, ki, kd, setpoint = 0) {
        this.kp = kp;
        this.ki = ki;
        this.kd = kd;
        this.setpoint = setpoint;
        this.integral = 0;
        this.lastError = 0;
    }

    update(measurement, dt) {
        const error = this.setpoint - measurement;
        this.integral += error * dt;
        const derivative = (error - this.lastError) / dt;
        this.lastError = error;
        return (this.kp * error) + (this.ki * this.integral) + (this.kd * derivative);
    }

    reset() {
        this.integral = 0;
        this.lastError = 0;
    }
}

class TelemetrySystem {
    constructor() {
        this.canvas = document.getElementById('graph-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.data = [];
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
            if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();

        this.ctx.strokeStyle = '#3498db';
        this.ctx.beginPath();
        this.data.forEach((d, i) => {
            const x = (i / (this.data.length - 1)) * w;
            const y = h - (d.vel / maxVel) * h;
            if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
        });
        this.ctx.stroke();
    }
}
const telemetry = new TelemetrySystem();

class Navball {
    constructor() {
        this.canvas = document.getElementById('navball');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
    }

    draw(angle, progradeAngle) {
        const ctx = this.ctx;
        const cx = this.width / 2;
        const cy = this.height / 2;
        const r = this.width / 2 - 2;

        ctx.clearRect(0, 0, this.width, this.height);
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.clip();

        // Rotate World Background
        ctx.translate(cx, cy);
        ctx.rotate(-angle); 

        // Sky & Ground
        ctx.fillStyle = '#3498db';
        ctx.fillRect(-r * 2, -r * 2, r * 4, r * 2);
        ctx.fillStyle = '#8e44ad';
        ctx.fillRect(-r * 2, 0, r * 4, r * 2);
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-r * 2, 0); ctx.lineTo(r * 2, 0); ctx.stroke();
        
        // Prograde Marker
        if (progradeAngle !== null) {
            ctx.save();
            ctx.rotate(progradeAngle); 
            ctx.translate(0, -r * 0.7); 
            
            ctx.strokeStyle = '#f1c40f';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI*2);
            ctx.moveTo(0, -5); ctx.lineTo(0, -10);
            ctx.moveTo(0, 5); ctx.lineTo(0, 10);
            ctx.moveTo(-5, 0); ctx.lineTo(-10, 0);
            ctx.moveTo(5, 0); ctx.lineTo(10, 0);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();

        // Fixed Ship Marker
        ctx.strokeStyle = '#f39c12';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy - 5); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx + 10, cy - 5);
        ctx.stroke();
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
}
const navball = new Navball();

class MissionLog {
    constructor() {
        this.el = document.getElementById('log-list');
        this.events = [];
    }
    log(message, type = 'info') {
        if (this.events.length > 0 && this.events[this.events.length - 1].msg === message) return;
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
        this.events.push({ time, msg: message, type });
        const li = document.createElement('li');
        li.className = type;
        li.innerText = `[${time}] ${message}`;
        this.el.prepend(li);
        if (this.el.children.length > 10) this.el.removeChild(this.el.lastChild);
    }
    clear() { this.el.innerHTML = ''; this.events = []; }
}
const missionLog = new MissionLog();

// --- PHYSICS CLASSES ---

class Particle {
    constructor(x, y, type, vx = 0, vy = 0) {
        this.x = x; this.y = y; this.type = type; this.life = 1.0;
        const spread = type === 'smoke' ? 2 : 1.5;
        this.vx = vx + (Math.random() - 0.5) * spread * 2;
        this.vy = vy + (Math.random() - 0.5) * spread * 2;
        if (type === 'smoke') {
            this.size = Math.random() * 10 + 10;
            this.growRate = 1.0;
            this.color = 200;
            this.alpha = 0.5;
            this.decay = 0.01;
        } else if (type === 'fire') {
            this.size = Math.random() * 7 + 5;
            this.growRate = -0.1;
            this.decay = 0.08;
        } else if (type === 'spark') {
            this.size = Math.random() * 2 + 1;
            this.decay = 0.05;
        } else if (type === 'debris') {
            this.size = Math.random() * 2 + 3;
            this.decay = 0.02;
            this.vx = (Math.random()-0.5)*20;
            this.vy = (Math.random()-0.5)*20;
        }
    }
    update(groundLevel, timeScale) {
        this.life -= this.decay * timeScale;
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        if (this.type === 'smoke') this.size += this.growRate * timeScale;
    }
    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        if (this.type === 'smoke') {
            const c = Math.floor(this.color);
            ctx.fillStyle = `rgba(${c},${c},${c},${this.alpha * this.life})`;
        } else if (this.type === 'fire') {
            const g = Math.floor(255 * this.life);
            ctx.fillStyle = `rgba(255,${g},0,${this.life})`;
        } else if (this.type === 'spark') {
            ctx.fillStyle = `rgba(255, 200, 150, ${this.life})`;
        } else if (this.type === 'debris') {
            ctx.fillStyle = `rgba(100,100,100,${this.life})`;
        }
        ctx.fill();
    }
}

class Vessel {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = 0; this.vy = 0;
        this.angle = 0; this.gimbalAngle = 0;
        this.mass = 1000;
        this.w = 40; this.h = 100;
        this.throttle = 0;
        this.fuel = 1.0;
        this.active = true;
        this.maxThrust = 100000;
        this.crashed = false;
        this.cd = DRAG_COEFF;
        this.q = 0;
        this.apogee = 0;
        this.ispVac = 300; this.ispSL = 280;
        this.health = 100;
    }

    // RK4 Integration
    getDerivatives(state, t, dt) {
        // state = {x, y, vx, vy, mass}
        const x = state.x;
        const y = state.y;
        const vx = state.vx;
        const vy = state.vy;
        const mass = state.mass;

        const altitude = (groundY - y - this.h) / PIXELS_PER_METER;
        const safeAlt = Math.max(0, altitude);
        
        const rho = RHO_SL * Math.exp(-safeAlt / SCALE_HEIGHT);
        const vSq = vx*vx + vy*vy;
        const v = Math.sqrt(vSq);
        const q = 0.5 * rho * vSq;
        
        // Mach Drag
        const mach = v / 340;
        let machMult = 1.0;
        if (mach > 0.8 && mach < 1.2) machMult = 2.5;
        else if (mach >= 1.2) machMult = 1.5;
        
        const dragF = q * 0.1 * this.cd * machMult;
        let dragFx = 0, dragFy = 0;
        if (v > 0) {
            dragFx = -dragF * (vx / v);
            dragFy = -dragF * (vy / v);
        }

        const realRad = safeAlt + R_EARTH;
        const g = 9.8 * Math.pow(R_EARTH / realRad, 2);
        
        let fx = 0;
        let fy = mass * g; 
        const f_cent = (mass * vx * vx) / realRad;
        fy -= f_cent;

        fx += dragFx;
        fy += dragFy;

        let flowRate = 0;
        if (this.active && this.throttle > 0 && this.fuel > 0) {
            const pRatio = rho / RHO_SL;
            const isp = this.ispVac + (this.ispSL - this.ispVac) * pRatio;
            const thrust = this.throttle * this.maxThrust * (isp / this.ispVac);
            
            fx += Math.sin(this.angle) * thrust;
            fy -= Math.cos(this.angle) * thrust;

            flowRate = (this.throttle * this.maxThrust) / (9.8 * this.ispVac);
        }

        return {
            dx: vx,
            dy: vy,
            dvx: fx / mass,
            dvy: fy / mass,
            dmass: -flowRate 
        };
    }

    applyPhysics(dt) {
        if (this.crashed) return;
        
        const isControllable = (this === booster) || (this === mainStack && (!booster || !booster.active) && mainStack.active);
        if (isControllable) {
            if (autopilotEnabled && this === booster) {
                this.runAutopilot(dt);
            } else {
                let targetGimbal = 0;
                if (keys['ArrowLeft']) targetGimbal = 0.2;
                else if (keys['ArrowRight']) targetGimbal = -0.2;
                this.gimbalAngle += (targetGimbal - this.gimbalAngle) * 10 * dt;
                if (Math.abs(this.gimbalAngle) > 0.001) this.angle -= this.gimbalAngle * 2.0 * dt;
            }
        }

        const state = { 
            x: this.x / PIXELS_PER_METER,
            y: this.y / PIXELS_PER_METER, 
            vx: this.vx, 
            vy: this.vy, 
            mass: this.mass 
        };

        const evaluate = (s, t, dt, d) => {
            const tempState = {
                x: s.x + (d ? d.dx * dt : 0),
                y: s.y + (d ? d.dy * dt : 0),
                vx: s.vx + (d ? d.dvx * dt : 0),
                vy: s.vy + (d ? d.dvy * dt : 0),
                mass: s.mass
            };
            return this.getDerivatives(tempState, t, dt);
        }

        const k1 = evaluate(state, 0, 0, null);
        const k2 = evaluate(state, 0, dt*0.5, k1);
        const k3 = evaluate(state, 0, dt*0.5, k2);
        const k4 = evaluate(state, 0, dt, k3);

        const dxdt  = (k1.dx + 2*k2.dx + 2*k3.dx + k4.dx) / 6;
        const dydt  = (k1.dy + 2*k2.dy + 2*k3.dy + k4.dy) / 6;
        const dvxdt = (k1.dvx + 2*k2.dvx + 2*k3.dvx + k4.dvx) / 6;
        const dvydt = (k1.dvy + 2*k2.dvy + 2*k3.dvy + k4.dvy) / 6;
        
        this.vx += dvxdt * dt;
        this.vy += dvydt * dt;
        this.x += dxdt * dt * PIXELS_PER_METER;
        this.y += dydt * dt * PIXELS_PER_METER;

        if (this.throttle > 0 && this.fuel > 0) {
             const flowRate = (this.throttle * this.maxThrust) / (9.8 * this.ispVac);
             this.fuel -= (flowRate / FUEL_MASS) * dt;
             this.mass -= flowRate * dt;
        }

        const altitude = (groundY - this.y - this.h) / PIXELS_PER_METER;
        const rho = RHO_SL * Math.exp(-Math.max(0, altitude) / SCALE_HEIGHT);
        const v = Math.sqrt(this.vx**2 + this.vy**2);
        this.q = 0.5 * rho * v * v;
        
        let alpha = 0;
        if (v > 10) {
            const velAngle = Math.atan2(this.vx, -this.vy);
            alpha = Math.abs(this.angle - velAngle);
            if (alpha > Math.PI) alpha = Math.PI * 2 - alpha;
        }
        
        if (this.q > 5000 && alpha > 0.2) {
            this.health -= 100 * dt;
            if (Math.random() > 0.8) particles.push(new Particle(this.x, this.y+this.h/2, 'debris'));
        }
        if (this.health <= 0) {
             missionLog.log("STRUCTURAL FAILURE DUE TO AERO FORCES", "warn");
             this.explode();
        }

        if (this.y + this.h > groundY) {
            this.y = groundY - this.h;
            if (this.vy > 15 || Math.abs(this.angle) > 0.3) {
                this.explode();
            } else {
                this.vy = 0; this.vx = 0; this.throttle = 0;
            }
        }
    }

    explode() {
        if (this.crashed) return;
        this.crashed = true; this.active = false; this.throttle = 0;
        audio.playExplosion();
        for(let i=0; i<30; i++) {
            particles.push(new Particle(this.x + Math.random()*20-10, this.y + this.h - Math.random()*20, 'fire'));
            particles.push(new Particle(this.x, this.y + this.h/2, 'debris'));
        }
    }

    spawnExhaust(timeScale) {
        if (this.throttle <= 0 || this.fuel <= 0 || this.crashed) return;
        const count = Math.ceil(this.throttle * 5 * timeScale);
        const altitude = (groundY - this.y - this.h) / PIXELS_PER_METER;
        const vacuumFactor = Math.min(Math.max(0, altitude) / 30000, 1.0);
        const spreadBase = 0.1 + (vacuumFactor * 1.5);
        const exX = this.x - Math.sin(this.angle) * this.h;
        const exY = this.y + Math.cos(this.angle) * this.h;
        const ejectionSpeed = 30 + (this.throttle * 20);

        for (let i = 0; i < count; i++) {
            const particleAngle = this.angle + Math.PI + (Math.random() - 0.5) * spreadBase;
            const ejectVx = Math.sin(particleAngle) * ejectionSpeed;
            const ejectVy = -Math.cos(particleAngle) * ejectionSpeed;
            const p = new Particle(exX, exY, 'fire', this.vx + ejectVx, this.vy + ejectVy);
            if (vacuumFactor > 0.8) p.decay *= 0.5;
            particles.push(p);
            if (Math.random() > 0.5 && vacuumFactor < 0.5) 
                particles.push(new Particle(exX, exY, 'smoke', this.vx + ejectVx, this.vy + ejectVy));
        }
    }

    drawPlasma(ctx) {
        if (this.q > 2000) {
            const intensity = Math.min((this.q - 2000) / 8000, 0.8);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(255, 100, 50, ${intensity})`;
            ctx.beginPath();
            ctx.arc(0, this.h, 20 + Math.random()*10, 0, Math.PI*2);
            ctx.fill();
            // Streamers
            ctx.fillStyle = `rgba(255, 200, 100, ${intensity * 0.5})`;
            ctx.fillRect(-this.w/2 - 5, 20, this.w + 10, this.h - 20);
            ctx.restore();
        }
    }

    drawShockwave(ctx) {
        if (this.q > 5000 && this.vy < -50) { // Transonic/High Q
             const intensity = Math.min((this.q - 5000) / 10000, 0.5);
             ctx.save();
             ctx.strokeStyle = `rgba(255, 255, 255, ${intensity})`;
             ctx.lineWidth = 3;
             ctx.beginPath();
             ctx.moveTo(-50, 40);
             ctx.quadraticCurveTo(0, -80, 50, 40); 
             ctx.stroke();
             ctx.restore();
        }
    }
    
    draw(ctx, camY) {}
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
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        this.drawShockwave(ctx);

        // Body
        ctx.fillStyle = '#fff';
        ctx.fillRect(-20, 0, 40, 60); 
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(0, -40, 20, 0); ctx.fill(); 
        ctx.fillStyle = '#eee'; ctx.fillRect(-20, 60, 40, 100); 
        
        // Engine
        ctx.save();
        ctx.translate(0, 160);
        ctx.rotate(this.gimbalAngle);
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-15,20); ctx.lineTo(15,20); ctx.lineTo(10,0); ctx.fill();
        ctx.restore();
        
        ctx.restore();
    }
}

class Booster extends Vessel {
    constructor(x, y, vx, vy) {
        super(x, y);
        this.vx = vx; this.vy = vy;
        this.h = 100;
        this.mass = MASS_BOOSTER;
        this.maxThrust = MAX_THRUST_BOOSTER;
        this.fuel = 0.3;
        this.ispVac = ISP_VAC_BOOSTER; this.ispSL = ISP_SL_BOOSTER;
        
        // PID: Negative Kp because Positive Angle (Right) needs Positive Gimbal (Left Tilt)
        // Wait: Positive Gimbal -> Rotates Left (Counter-Clockwise).
        // If Angle is Positive (Right), we want to Rotate Left.
        // So we want Positive Gimbal.
        // PID(0 - Pos) = Neg Error.
        // So we need Negative Kp to flip Neg Error to Pos Output.
        this.pidTilt = new PIDController(-5.0, 0.0, -50.0); 
        this.pidThrottle = new PIDController(0.1, 0.001, 0.5); 
    }

    applyPhysics(dt) {
        if (autopilotEnabled && this.active && !this.crashed) {
            this.runAutopilot(dt);
        }
        super.applyPhysics(dt);
    }

    runAutopilot(dt) {
        const alt = (groundY - this.y - this.h) / PIXELS_PER_METER;
        
        // 1. Angle Control
        const tiltOutput = this.pidTilt.update(this.angle, dt);
        this.gimbalAngle = Math.max(-0.4, Math.min(0.4, tiltOutput));
        
        // 2. Suicide Burn
        const g = 9.8;
        const maxAccel = (this.maxThrust / this.mass) - g;
        // v^2 = 2ad -> d = v^2 / 2a
        const stopDist = (this.vy * this.vy) / (2 * maxAccel);
        
        if (this.vy > 0 && alt < stopDist + 100) { 
             this.throttle = 1.0;
             // Terminal precision
             if (alt < 50) {
                 const targetVel = alt * 0.2; 
                 const err = this.vy - targetVel;
                 this.throttle = Math.min(1, Math.max(0, 0.5 + err * 0.2));
             }
        } else {
             this.throttle = 0;
        }
        if (alt < 1) this.throttle = 0; 
    }

    draw(ctx, camY) {
        if (this.crashed) return;
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        
        ctx.fillStyle = '#eee'; ctx.fillRect(-20, 0, 40, 100);
        
        ctx.save();
        ctx.translate(0, 100);
        ctx.rotate(this.gimbalAngle);
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(-15,20); ctx.lineTo(15,20); ctx.lineTo(10,0); ctx.fill();
        ctx.restore();
        
        if ((groundY - this.y - this.h)/PIXELS_PER_METER < 200) {
            ctx.fillStyle = '#111';
            ctx.fillRect(-40, 90, 20, 5); ctx.fillRect(20, 90, 20, 5);
        }
        
        ctx.restore();
    }
}

class UpperStage extends Vessel {
    constructor(x, y, vx, vy) {
        super(x, y);
        this.vx = vx; this.vy = vy;
        this.h = 60;
        this.mass = MASS_UPPER;
        this.maxThrust = MAX_THRUST_UPPER;
        this.throttle = 1.0;
        this.fairingsDeployed = false;
        this.ispVac = ISP_VAC_UPPER; this.ispSL = ISP_SL_UPPER;
    }
    draw(ctx, camY) {
        if (this.crashed) return;
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        this.drawShockwave(ctx);
        
        ctx.fillStyle = '#444'; 
        ctx.beginPath(); ctx.moveTo(-10, 60); ctx.lineTo(10, 60); ctx.lineTo(15, 75); ctx.lineTo(-15, 75); ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.fillRect(-20, 0, 40, 60);

        if (!this.fairingsDeployed) {
            ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(0, -40, 20, 0); ctx.fill();
        } else {
            ctx.fillStyle = '#f1c40f'; ctx.fillRect(-10, -5, 20, 5); 
        }
        ctx.restore();
    }
}

class Payload extends Vessel {
    constructor(x, y, vx, vy) {
        super(x, y);
        this.vx = vx; this.vy = vy; this.mass = 1000; this.w = 20; this.h = 20;
        this.active = true;
    }
    draw(ctx, camY) {
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        ctx.fillStyle = '#f1c40f'; ctx.fillRect(-10, -10, 20, 20);
        ctx.fillStyle = '#3498db'; ctx.fillRect(-40, -5, 30, 10); ctx.fillRect(10, -5, 30, 10); 
        ctx.restore();
    }
}

class Fairing extends Vessel {
    constructor(x, y, vx, vy, side) {
        super(x, y);
        this.vx = vx + side*5; this.vy = vy; this.side = side; this.active = false;
        this.h=40; this.cd=2.0;
    }
    draw(ctx, camY) {
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        if (this.side === -1) { ctx.moveTo(0,0); ctx.lineTo(-20,0); ctx.quadraticCurveTo(0, -40, 0, 0); }
        else { ctx.moveTo(0,0); ctx.lineTo(20,0); ctx.quadraticCurveTo(0, -40, 0, 0); }
        ctx.fill();
        ctx.restore();
    }
}

// --- GLOBAL STATE ---
let groundY = height - 50;
let entities = [];
let particles = [];
let cameraY = 0;
let cameraShakeX = 0, cameraShakeY = 0;
let mainStack, booster, trackedEntity;
let cameraMode = 'TRACKING'; 
let timeScale = 1.0;
let autopilotEnabled = false;

let missionState = { liftoff: false, supersonic: false, maxq: false, meco: false };

function initGame() {
    entities = [];
    particles = [];
    mainStack = new FullStack();
    mainStack.y = groundY - mainStack.h;
    entities.push(mainStack);
    trackedEntity = mainStack;
    missionState = { liftoff: false, supersonic: false, maxq: false, meco: false };
    missionLog.clear();
    autopilotEnabled = false;
    document.getElementById('autopilot-btn').innerText = "🤖 Auto-Land: OFF";
}

// --- HELPERS ---
function performStaging() {
    if (!mainStack || !mainStack.active) return;
    audio.playStaging();
    mainStack.active = false;
    entities.splice(entities.indexOf(mainStack), 1);
    
    const b = new Booster(mainStack.x, mainStack.y + 60, mainStack.vx, mainStack.vy);
    const u = new UpperStage(mainStack.x, mainStack.y, mainStack.vx, mainStack.vy);
    
    u.vy -= 2; b.vy += 2; b.angle = 0.05; 
    entities.push(b); entities.push(u);
    booster = b; trackedEntity = u;
    
    document.getElementById('booster-stats').style.display = 'block';
    missionLog.log("STAGE SEPARATION CONFIRMED", "info");
}

function performPayloadDep() {
    const u = entities.find(e => e instanceof UpperStage);
    if (!u || u.fairingsDeployed) return;
    audio.playStaging();
    u.fairingsDeployed = true;
    entities.push(new Fairing(u.x-10, u.y-30, u.vx, u.vy, -1));
    entities.push(new Fairing(u.x+10, u.y-30, u.vx, u.vy, 1));
    const p = new Payload(u.x, u.y-20, u.vx, u.vy-1);
    entities.push(p);
    trackedEntity = p;
    missionLog.log("PAYLOAD DEPLOYMENT", "info");
}

// --- RENDERERS ---

function drawMap() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    
    const cx = width / 2;
    const cy = height / 2;
    const scale = 0.00005; 

    // Draw Earth
    const r_earth_px = R_EARTH * scale;
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(cx, cy, r_earth_px, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

    // Draw Orbits
    entities.forEach(e => {
        if (e.crashed) return;
        const alt = (groundY - e.y - e.h) / PIXELS_PER_METER;
        const r = R_EARTH + alt;
        const phi = e.x / R_EARTH; 

        // Draw Object
        const ox = cx + Math.cos(phi - Math.PI/2) * r * scale;
        const oy = cy + Math.sin(phi - Math.PI/2) * r * scale;
        
        ctx.fillStyle = e === trackedEntity ? '#f1c40f' : '#aaa';
        ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI*2); ctx.fill();

        // Orbital Path Prediction
        ctx.beginPath();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1;
        
        let simState = {x: e.x/10, y: e.y/10, vx: e.vx, vy: e.vy, mass: e.mass};
        let steps = 200;
        let dtPred = 10; 
        
        ctx.moveTo(ox, oy);
        
        for(let i=0; i<steps; i++) {
             const pAlt = (groundY/10 - simState.y - e.h/10);
             const pRad = pAlt + R_EARTH;
             const pG = 9.8 * Math.pow(R_EARTH/pRad, 2);
             const pFy = pG - (simState.vx**2)/pRad;
             
             simState.vy += pFy * dtPred; 
             simState.x += simState.vx * dtPred;
             simState.y += simState.vy * dtPred;
             
             if (simState.y * 10 > groundY) break; 
             
             const pPhi = (simState.x * 10) / R_EARTH;
             const pR = R_EARTH + (groundY/10 - simState.y - e.h/10);
             
             const px = cx + Math.cos(pPhi - Math.PI/2) * pR * scale;
             const py = cy + Math.sin(pPhi - Math.PI/2) * pR * scale;
             ctx.lineTo(px, py);
        }
        ctx.stroke();
    });
    
    ctx.fillStyle = 'white';
    ctx.font = '20px monospace';
    ctx.fillText("ORBITAL MAP MODE [M]", 20, 40);
}

function animate() {
    if (cameraMode === 'MAP') {
        drawMap();
    } else {
        ctx.clearRect(0, 0, width, height);
        
        const simDt = DT * timeScale;
        entities.forEach(e => {
            e.applyPhysics(simDt);
            e.spawnExhaust(timeScale);
        });
        
        if (trackedEntity) {
             const alt = (groundY - trackedEntity.y - trackedEntity.h) / PIXELS_PER_METER;
             const vel = Math.sqrt(trackedEntity.vx**2 + trackedEntity.vy**2);
             if (!missionState.liftoff && alt > 20) { missionState.liftoff = true; missionLog.log("LIFTOFF", "warn"); audio.speak("Liftoff"); }
             if (!missionState.supersonic && vel > 340) { missionState.supersonic = true; missionLog.log("SUPERSONIC", "info"); }
             if (!missionState.maxq && trackedEntity.q > 5000) { missionState.maxq = true; missionLog.log("MAX Q", "warn"); audio.speak("Max Q"); }
        }

        if (trackedEntity) {
             let targetY = trackedEntity.y - height * 0.6;
             if (cameraMode === 'ROCKET') targetY = trackedEntity.y - height/2;
             if (targetY < 0) cameraY += (targetY - cameraY) * 0.1;
             else cameraY += (0 - cameraY) * 0.1;
             
             const q = trackedEntity.q || 0;
             const shake = Math.min(q/200, 10);
             cameraShakeX = (Math.random()-0.5)*shake;
             cameraShakeY = (Math.random()-0.5)*shake;
        }

        const alt = -cameraY;
        const spaceRatio = Math.min(Math.max(alt / 50000, 0), 1);
        const r = 135 * (1 - spaceRatio);
        const g = 206 * (1 - spaceRatio);
        const b = 235 * (1 - spaceRatio) + 20 * spaceRatio;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(0,0,width,height);
        
        ctx.save();
        ctx.translate(cameraShakeX, -cameraY + cameraShakeY);
        
        ctx.fillStyle = '#2ecc71'; ctx.fillRect(-50000, groundY, 100000, 500);
        
        bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
        bloomCtx.save();
        bloomCtx.scale(0.25, 0.25); 
        bloomCtx.translate(cameraShakeX, -cameraY + cameraShakeY);
        
        particles.forEach(p => {
            if (p.type === 'fire') {
                bloomCtx.beginPath();
                bloomCtx.arc(p.x, p.y, p.size * 2, 0, Math.PI*2);
                bloomCtx.fillStyle = 'rgba(255, 100, 0, 1)';
                bloomCtx.fill();
            }
        });
        bloomCtx.restore();
        
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = 'blur(10px)';
        ctx.drawImage(bloomCanvas, 0, 0, width, height);
        ctx.filter = 'none';
        ctx.restore();

        particles.forEach((p, i) => {
            p.update(groundY, timeScale);
            p.draw(ctx);
            if (p.life <= 0) particles.splice(i, 1);
        });
        
        entities.forEach(e => e.draw(ctx, cameraY));
        
        ctx.restore();
        
        if (trackedEntity) {
            const velAngle = Math.atan2(trackedEntity.vx, -trackedEntity.vy);
            navball.draw(trackedEntity.angle, velAngle);
            const alt = (groundY - trackedEntity.y - trackedEntity.h)/PIXELS_PER_METER;
            const vel = Math.sqrt(trackedEntity.vx**2 + trackedEntity.vy**2);
            document.getElementById('alt').innerText = (alt/1000).toFixed(1);
            document.getElementById('vel').innerText = vel.toFixed(0);
            document.getElementById('apogee').innerText = (alt/1000).toFixed(1); 
            telemetry.update(performance.now()/1000, alt, vel);
        }
        telemetry.draw();
    }
    
    requestAnimationFrame(animate);
}

// --- CONTROLS ---
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') { if(!missionState.liftoff) initiateLaunch(); }
    if (e.code === 'KeyS') performStaging();
    if (e.code === 'KeyP') performPayloadDep();
    if (e.code === 'KeyM') cameraMode = (cameraMode === 'MAP' ? 'TRACKING' : 'MAP');
    if (e.code === 'KeyA') {
        autopilotEnabled = !autopilotEnabled;
        document.getElementById('autopilot-btn').innerText = `🤖 Auto-Land: ${autopilotEnabled ? 'ON' : 'OFF'}`;
    }
    if (e.code === 'Digit1') trackedEntity = entities.find(e => e instanceof UpperStage) || entities[0];
    if (e.code === 'Digit2') trackedEntity = trackedEntity; 
    if (e.code === 'KeyB' && booster) trackedEntity = booster;
    
    if (e.code === 'ArrowUp' && booster) booster.throttle = Math.min(1, booster.throttle+0.1);
    if (e.code === 'ArrowDown' && booster) booster.throttle = Math.max(0, booster.throttle-0.1);
});
window.addEventListener('keyup', e => keys[e.code] = false);

document.getElementById('open-vab-btn').addEventListener('click', () => {
    document.getElementById('vab-modal').style.display = 'flex';
});

document.getElementById('vab-launch-btn').addEventListener('click', () => {
    FUEL_MASS = parseInt(document.getElementById('rng-fuel').value) * 1000;
    MAX_THRUST_BOOSTER = parseFloat(document.getElementById('rng-thrust').value) * 1000000;
    DRAG_COEFF = parseFloat(document.getElementById('rng-drag').value);
    document.getElementById('vab-modal').style.display = 'none';
    initGame();
});

['fuel', 'thrust', 'drag'].forEach(id => {
    document.getElementById(`rng-${id}`).addEventListener('input', e => {
        document.getElementById(`val-${id}`).innerText = e.target.value;
    });
});

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('splash-screen').style.opacity = 0;
    setTimeout(() => { document.getElementById('splash-screen').style.display = 'none'; }, 500);
    audio.init(); 
    document.getElementById('audio-btn').innerText = "🔊 Mute Audio";
    audio.muted = false;
    audio.masterGain.gain.setTargetAtTime(0.5, audio.ctx.currentTime, 0.1);
});

function initiateLaunch() {
    initGame();
    mainStack.throttle = 1.0;
    missionState.liftoff = true;
    audio.speak("Liftoff");
}

document.getElementById('launch-btn').addEventListener('click', initiateLaunch);

document.getElementById('audio-btn').addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    document.getElementById('audio-btn').innerText = isMuted ? "🔇 Enable Audio" : "🔊 Mute Audio";
});

const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const throttleZone = document.getElementById('throttle-zone');
const throttleHandle = document.getElementById('throttle-handle');
let touchIdJoy = null, touchIdThrot = null;

if (joystickZone) {
    joystickZone.addEventListener('touchstart', e => {
        e.preventDefault();
        touchIdJoy = e.changedTouches[0].identifier;
        updateJoystick(e.changedTouches[0]);
    }, {passive:false});
    joystickZone.addEventListener('touchmove', e => {
        e.preventDefault();
        for(let i=0; i<e.changedTouches.length; i++) {
            if(e.changedTouches[i].identifier === touchIdJoy) updateJoystick(e.changedTouches[i]);
        }
    }, {passive:false});
    joystickZone.addEventListener('touchend', e => {
        e.preventDefault();
        touchIdJoy = null;
        joystickKnob.style.top = '35px'; joystickKnob.style.left = '35px';
        keys['ArrowLeft'] = false; keys['ArrowRight'] = false;
    });
}
function updateJoystick(touch) {
    const rect = joystickZone.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const max = 35;
    const f = dist > max ? max/dist : 1;
    joystickKnob.style.left = (35 + dx*f) + 'px';
    joystickKnob.style.top = (35 + dy*f) + 'px';
    if(dx < -10) { keys['ArrowLeft'] = true; keys['ArrowRight'] = false; }
    else if(dx > 10) { keys['ArrowRight'] = true; keys['ArrowLeft'] = false; }
    else { keys['ArrowLeft'] = false; keys['ArrowRight'] = false; }
}

if (throttleZone) {
    throttleZone.addEventListener('touchstart', e => {
        e.preventDefault();
        touchIdThrot = e.changedTouches[0].identifier;
        updateThrottle(e.changedTouches[0]);
    }, {passive:false});
    throttleZone.addEventListener('touchmove', e => {
        e.preventDefault();
        for(let i=0; i<e.changedTouches.length; i++) {
            if(e.changedTouches[i].identifier === touchIdThrot) updateThrottle(e.changedTouches[i]);
        }
    }, {passive:false});
}
function updateThrottle(touch) {
    const rect = throttleZone.getBoundingClientRect();
    let val = 1.0 - (touch.clientY - rect.top) / rect.height;
    val = Math.max(0, Math.min(1, val));
    throttleHandle.style.bottom = (val * (rect.height - 30)) + 'px';
    if(booster) booster.throttle = val;
    else if(mainStack) mainStack.throttle = val;
}
document.getElementById('btn-stage').addEventListener('touchstart', (e)=>{e.preventDefault();performStaging();});
document.getElementById('btn-payload').addEventListener('touchstart', (e)=>{e.preventDefault();performPayloadDep();});
document.getElementById('btn-cam').addEventListener('touchstart', (e)=>{e.preventDefault(); cameraMode = (cameraMode === 'TRACKING' ? 'ROCKET' : 'TRACKING');});

initGame();
animate();