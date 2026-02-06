import { GRAVITY, PIXELS_PER_METER, SCALE_HEIGHT, RHO_SL, R_EARTH, CONFIG } from '../constants.js';
import { state } from '../state.js';
import Particle from './Particle.js';
import PIDController from '../utils/PIDController.js';

export default class Vessel {
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
        this.cd = CONFIG.DRAG_COEFF;
        this.q = 0;
        this.apogee = 0;
        this.ispVac = 300; this.ispSL = 280;
        this.health = 100;
    }

    // RK4 Integration
    getDerivatives(stateDict, t, dt) {
        // state = {x, y, vx, vy, mass}
        const x = stateDict.x;
        const y = stateDict.y;
        const vx = stateDict.vx;
        const vy = stateDict.vy;
        const mass = stateDict.mass;

        const altitude = (state.groundY - y - this.h) / PIXELS_PER_METER;
        const safeAlt = Math.max(0, altitude);

        const rho = RHO_SL * Math.exp(-safeAlt / SCALE_HEIGHT);
        const vSq = vx * vx + vy * vy;
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

    applyPhysics(dt, keys) {
        if (this.crashed) return;

        // Need to check for control authority. 
        // This logic was "isControllable". We'll pass `keys` from main.js if it's the controlled vessel
        // But for now let's just use the method signature to allow passing input

        // This part needs to be handled by the caller or specialized method, 
        // but for now we'll assume we handle it here if we can access keys.
        // Since keys are not global, we might need to modify this.
        // For this step, I'll assume `keys` will be passed or handled in a `control(dt, keys)` method.
        // But to keep it working like before:

        // Note: The original code used a global `keys` object.
        // I will add a `control` method that main calls.

    }

    // New method to replace inline control logic
    control(dt, keys, isBooster) {
        if (state.autopilotEnabled && isBooster) {
            this.runAutopilot(dt);
        } else {
            let targetGimbal = 0;
            if (keys['ArrowLeft']) targetGimbal = 0.2;
            else if (keys['ArrowRight']) targetGimbal = -0.2;
            this.gimbalAngle += (targetGimbal - this.gimbalAngle) * 10 * dt;
            if (Math.abs(this.gimbalAngle) > 0.001) this.angle -= this.gimbalAngle * 2.0 * dt;
        }
    }

    updatePhysics(dt) {
        if (this.crashed) return;

        const stateDict = {
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

        const k1 = evaluate(stateDict, 0, 0, null);
        const k2 = evaluate(stateDict, 0, dt * 0.5, k1);
        const k3 = evaluate(stateDict, 0, dt * 0.5, k2);
        const k4 = evaluate(stateDict, 0, dt, k3);

        const dxdt = (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx) / 6;
        const dydt = (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy) / 6;
        const dvxdt = (k1.dvx + 2 * k2.dvx + 2 * k3.dvx + k4.dvx) / 6;
        const dvydt = (k1.dvy + 2 * k2.dvy + 2 * k3.dvy + k4.dvy) / 6;

        this.vx += dvxdt * dt;
        this.vy += dvydt * dt;
        this.x += dxdt * dt * PIXELS_PER_METER;
        this.y += dydt * dt * PIXELS_PER_METER;

        if (this.throttle > 0 && this.fuel > 0) {
            const flowRate = (this.throttle * this.maxThrust) / (9.8 * this.ispVac);
            this.fuel -= (flowRate / CONFIG.FUEL_MASS) * dt;
            this.mass -= flowRate * dt;
        }

        const altitude = (state.groundY - this.y - this.h) / PIXELS_PER_METER;
        const rho = RHO_SL * Math.exp(-Math.max(0, altitude) / SCALE_HEIGHT);
        const v = Math.sqrt(this.vx ** 2 + this.vy ** 2);
        this.q = 0.5 * rho * v * v;

        let alpha = 0;
        if (v > 10) {
            const velAngle = Math.atan2(this.vx, -this.vy);
            alpha = Math.abs(this.angle - velAngle);
            if (alpha > Math.PI) alpha = Math.PI * 2 - alpha;
        }

        if (this.q > 5000 && alpha > 0.2) {
            this.health -= 100 * dt;
            if (Math.random() > 0.8) state.particles.push(new Particle(this.x, this.y + this.h / 2, 'debris'));
        }
        if (this.health <= 0) {
            if (state.missionLog) state.missionLog.log("STRUCTURAL FAILURE DUE TO AERO FORCES", "warn");
            this.explode();
        }

        if (this.y + this.h > state.groundY) {
            this.y = state.groundY - this.h;
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
        if (state.audio) state.audio.playExplosion();
        for (let i = 0; i < 30; i++) {
            state.particles.push(new Particle(this.x + Math.random() * 20 - 10, this.y + this.h - Math.random() * 20, 'fire'));
            state.particles.push(new Particle(this.x, this.y + this.h / 2, 'debris'));
        }
    }

    spawnExhaust(timeScale) {
        if (this.throttle <= 0 || this.fuel <= 0 || this.crashed) return;
        const count = Math.ceil(this.throttle * 5 * timeScale);
        const altitude = (state.groundY - this.y - this.h) / PIXELS_PER_METER;
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
            state.particles.push(p);
            if (Math.random() > 0.5 && vacuumFactor < 0.5)
                state.particles.push(new Particle(exX, exY, 'smoke', this.vx + ejectVx, this.vy + ejectVy));
        }
    }

    drawPlasma(ctx) {
        if (this.q > 2000) {
            const intensity = Math.min((this.q - 2000) / 8000, 0.8);
            ctx.save();
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = `rgba(255, 100, 50, ${intensity})`;
            ctx.beginPath();
            ctx.arc(0, this.h, 20 + Math.random() * 10, 0, Math.PI * 2);
            ctx.fill();
            // Streamers
            ctx.fillStyle = `rgba(255, 200, 100, ${intensity * 0.5})`;
            ctx.fillRect(-this.w / 2 - 5, 20, this.w + 10, this.h - 20);
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

    draw(ctx, camY) { }
}
