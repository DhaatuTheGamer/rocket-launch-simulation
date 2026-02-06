export default class Navball {
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
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
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
