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
