export default class MissionLog {
    constructor() {
        this.el = document.getElementById('log-list');
        this.events = [];
    }
    log(message, type = 'info') {
        if (this.events.length > 0 && this.events[this.events.length - 1].msg === message) return;
        const now = new Date();
        const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        this.events.push({ time, msg: message, type });
        const li = document.createElement('li');
        li.className = type;
        li.innerText = `[${time}] ${message}`;
        this.el.prepend(li);
        if (this.el.children.length > 10) this.el.removeChild(this.el.lastChild);
    }
    clear() { this.el.innerHTML = ''; this.events = []; }
}
