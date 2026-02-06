export default class Particle {
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
            this.vx = (Math.random() - 0.5) * 20;
            this.vy = (Math.random() - 0.5) * 20;
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
