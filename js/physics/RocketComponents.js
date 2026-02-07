// Imports assumed global

class FullStack extends Vessel {
    constructor(x, y) {
        super(x, y);
        this.h = 160;
        this.mass = CONFIG.MASS_BOOSTER + CONFIG.MASS_UPPER + CONFIG.FUEL_MASS;
        this.maxThrust = CONFIG.MAX_THRUST_BOOSTER;
    }
    draw(ctx, camY) {
        if (this.crashed) return;
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        this.drawShockwave(ctx);

        const rocketImg = state.assets ? state.assets.get('rocket_body') : null;
        const engineImg = state.assets ? state.assets.get('rocket_engine') : null;

        if (rocketImg && engineImg) {
            // Draw Engine
            ctx.save();
            ctx.translate(0, 160);
            ctx.rotate(this.gimbalAngle);
            ctx.drawImage(engineImg, -15, -10, 30, 40);
            ctx.restore();

            // Draw Body
            ctx.drawImage(rocketImg, -20, 0, 40, 160);
        } else {
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
            ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-15, 20); ctx.lineTo(15, 20); ctx.lineTo(10, 0); ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }
}

class Booster extends Vessel {
    constructor(x, y, vx, vy) {
        super(x, y);
        this.vx = vx; this.vy = vy;
        this.h = 100;
        this.mass = CONFIG.MASS_BOOSTER;
        this.maxThrust = CONFIG.MAX_THRUST_BOOSTER;
        this.fuel = 0.3;
        this.ispVac = CONFIG.ISP_VAC_BOOSTER; this.ispSL = CONFIG.ISP_SL_BOOSTER;

        // PID: Negative Kp because Positive Angle (Right) needs Positive Gimbal (Left Tilt)
        this.pidTilt = new PIDController(-5.0, 0.0, -50.0);
        this.pidThrottle = new PIDController(0.1, 0.001, 0.5);

        this.active = true;

        this.nextStage = {
            type: 'UpperStage',
            separationVelocity: 3,
            offsetY: -20
        };
    }

    applyPhysics(dt, keys) {
        if (state.autopilotEnabled && this.active && !this.crashed) {
            this.runAutopilot(dt);
        }
        super.applyPhysics(dt, keys);
    }

    runAutopilot(dt) {
        const alt = (state.groundY - this.y - this.h) / PIXELS_PER_METER;

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

        const rocketImg = state.assets ? state.assets.get('rocket_body') : null;
        const engineImg = state.assets ? state.assets.get('rocket_engine') : null;

        if (rocketImg && engineImg) {
            // Draw Body (Booster section using part of image or scaled?)
            // Just reusing rocket image for simplicity of placeholder logic
            ctx.drawImage(rocketImg, -20, 0, 40, 100);

            ctx.save();
            ctx.translate(0, 100);
            ctx.rotate(this.gimbalAngle);
            ctx.drawImage(engineImg, -15, -10, 30, 40);
            ctx.restore();
        } else {
            ctx.fillStyle = '#eee'; ctx.fillRect(-20, 0, 40, 100);

            ctx.save();
            ctx.translate(0, 100);
            ctx.rotate(this.gimbalAngle);
            ctx.fillStyle = '#222';
            ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-15, 20); ctx.lineTo(15, 20); ctx.lineTo(10, 0); ctx.fill();
            ctx.restore();
        }

        if ((state.groundY - this.y - this.h) / PIXELS_PER_METER < 200) {
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
        this.mass = CONFIG.MASS_UPPER;
        this.maxThrust = CONFIG.MAX_THRUST_UPPER;
        this.active = true;
        this.fairingsDeployed = false;

        this.nextStage = {
            type: 'Payload',
            separationVelocity: 2,
            offsetY: -10
        };
        this.ispVac = CONFIG.ISP_VAC_UPPER; this.ispSL = CONFIG.ISP_SL_UPPER;
    }
    draw(ctx, camY) {
        if (this.crashed) return;
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        this.drawShockwave(ctx);

        const rocketImg = state.assets ? state.assets.get('rocket_body') : null;
        const engineImg = state.assets ? state.assets.get('rocket_engine') : null;
        const fairingImg = state.assets ? state.assets.get('fairing') : null;

        if (rocketImg && engineImg) {
            // Engine
            ctx.save();
            ctx.translate(0, 60);
            ctx.drawImage(engineImg, -10, -5, 20, 25);
            ctx.restore();

            // Tank
            ctx.drawImage(rocketImg, -20, 0, 40, 60);

            // Fairing
            if (!this.fairingsDeployed) {
                if (fairingImg) {
                    ctx.drawImage(fairingImg, -20, -40, 40, 40);
                } else {
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(0, -40, 20, 0); ctx.fill();
                }
            } else {
                ctx.fillStyle = '#f1c40f'; ctx.fillRect(-10, -5, 20, 5);
            }

        } else {
            ctx.fillStyle = '#444';
            ctx.beginPath(); ctx.moveTo(-10, 60); ctx.lineTo(10, 60); ctx.lineTo(15, 75); ctx.lineTo(-15, 75); ctx.fill();

            ctx.fillStyle = '#fff';
            ctx.fillRect(-20, 0, 40, 60);

            if (!this.fairingsDeployed) {
                ctx.beginPath(); ctx.moveTo(-20, 0); ctx.quadraticCurveTo(0, -40, 20, 0); ctx.fill();
            } else {
                ctx.fillStyle = '#f1c40f'; ctx.fillRect(-10, -5, 20, 5);
            }
        }
        ctx.restore();
    }
}

class Payload extends Vessel {
    constructor(x, y, vx, vy) {
        super(x, y);
        this.vx = vx; this.vy = vy; this.mass = 1000; this.w = 20; this.h = 20;
        this.active = true;
        this.color = '#bdc3c7';

        this.nextStage = {
            type: 'Booster',
            separationVelocity: 5,
            offsetY: -30
        };
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
        this.vx = vx + side * 5; this.vy = vy; this.side = side; this.active = false;
        this.h = 40; this.cd = 2.0;
    }
    draw(ctx, camY) {
        ctx.save();
        ctx.translate(this.x, this.y - camY);
        ctx.rotate(this.angle);
        this.drawPlasma(ctx);
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        if (this.side === -1) { ctx.moveTo(0, 0); ctx.lineTo(-20, 0); ctx.quadraticCurveTo(0, -40, 0, 0); }
        else { ctx.moveTo(0, 0); ctx.lineTo(20, 0); ctx.quadraticCurveTo(0, -40, 0, 0); }
        ctx.fill();
        ctx.restore();
    }
}
