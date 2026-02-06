// Imports assumed global: PIDController

const SASModes = {
    OFF: 'OFF',
    STABILITY: 'STABILITY',
    PROGRADE: 'PROGRADE',
    RETROGRADE: 'RETROGRADE'
};

class SAS {
    constructor() {
        this.mode = SASModes.OFF;
        this.pid = new PIDController(5.0, 0.1, 50.0); // Tuning for angle control
        this.targetAngle = 0;
    }

    setMode(mode, currentAngle) {
        this.mode = mode;
        if (mode === SASModes.STABILITY) {
            this.targetAngle = currentAngle;
        }
        this.pid.reset();
    }

    update(vessel, dt) {
        if (this.mode === SASModes.OFF) return 0;

        let setpoint = this.targetAngle;

        if (this.mode === SASModes.PROGRADE) {
            const speed = Math.sqrt(vessel.vx ** 2 + vessel.vy ** 2);
            if (speed > 1) { // Only valid if moving
                setpoint = Math.atan2(vessel.vx, -vessel.vy);
            }
        } else if (this.mode === SASModes.RETROGRADE) {
            const speed = Math.sqrt(vessel.vx ** 2 + vessel.vy ** 2);
            if (speed > 1) {
                setpoint = Math.atan2(vessel.vx, -vessel.vy) + Math.PI;
                // Normalize to -PI..PI range mostly for clean crossover, 
                // though simple PID might handle wrapping if error calc is robust.
                // Let's ensure shortest path rotation logic in PID or here.
            }
        }

        // Handle Angle Wrapping for Error Calculation
        // The simple PID computes (setpoint - current). 
        // If setpoint is PI and current is -PI, error is 2PI, but should be 0.
        // We need to feed a "wrapped" error or adjust setpoint to be close to current.

        // Let's do it manually:
        let error = setpoint - vessel.angle;
        while (error > Math.PI) error -= Math.PI * 2;
        while (error < -Math.PI) error += Math.PI * 2;

        // "Hack": Reset PID setpoint to 0 and pass 'error' as -measurement effectively?
        // Or just use the error directly if we trust the PID implementation?
        // Our PID takes (measurement, dt) and computes error = setpoint - measurement.
        // So we can set PID setpoint to 0, and pass -error as measurement.
        // Let's refine the PID usage.

        this.pid.setpoint = 0;
        const controlOutput = this.pid.update(-error, dt);

        // Clamp output to gimbal range (usually -0.2 to 0.2 or similar)
        // Check Vessel max gimbal. usually 0.4 rads or so.
        return Math.max(-0.5, Math.min(0.5, controlOutput));
    }
}
