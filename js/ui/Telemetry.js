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
