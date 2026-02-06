export default class PIDController {
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
