const game = new Game();
game.init();

// ========================================
// UI/UX IMPROVEMENTS - Event Listeners
// ========================================

// Track flight phase for dynamic buttons
let flightPhase = 'prelaunch'; // 'prelaunch', 'ascending', 'descending', 'landed'

// --- IMPROVEMENT #7: Onboarding System ---
function showOnboarding() {
    if (localStorage.getItem('onboarding-complete')) return;
    const overlay = document.getElementById('tooltip-overlay');
    if (overlay) overlay.classList.add('visible');
}

document.getElementById('tooltip-dismiss')?.addEventListener('click', () => {
    document.getElementById('tooltip-overlay').classList.remove('visible');
    localStorage.setItem('onboarding-complete', 'true');
});

// --- Splash Screen Buttons ---
document.getElementById('start-btn')?.addEventListener('click', () => {
    document.getElementById('splash-screen').style.display = 'none';
    game.missionLog.log("Mission Control Active", "info");
    showOnboarding();
});

document.getElementById('open-vab-btn')?.addEventListener('click', () => {
    document.getElementById('vab-modal').style.display = 'flex';
    updateVABStats();
});

// --- IMPROVEMENT #3: VAB Stats Calculation ---
function updateVABStats() {
    const fuelMass = parseFloat(document.getElementById('rng-fuel').value) * 1000; // kg
    const dryMass = 5000; // kg (fixed dry mass)
    const thrust = parseFloat(document.getElementById('rng-thrust').value) * 1000000; // N
    const isp = 300; // seconds (specific impulse)
    const g = 9.81;

    // Delta-V = Isp * g * ln(m0 / mf)
    const m0 = fuelMass + dryMass;
    const mf = dryMass;
    const deltaV = isp * g * Math.log(m0 / mf);

    // TWR = Thrust / (Weight) = Thrust / (m0 * g)
    const twr = thrust / (m0 * g);

    // Update display
    const dvElement = document.getElementById('vab-dv');
    const twrElement = document.getElementById('vab-twr');

    if (dvElement) {
        dvElement.textContent = Math.round(deltaV).toLocaleString();
        dvElement.className = 'vab-stat-value ' + (deltaV > 3000 ? 'good' : deltaV > 2000 ? 'warning' : 'bad');
    }
    if (twrElement) {
        twrElement.textContent = twr.toFixed(2);
        twrElement.className = 'vab-stat-value ' + (twr > 1.2 ? 'good' : twr > 1.0 ? 'warning' : 'bad');
    }
}

// VAB Slider Updates with Stats Recalculation
['rng-fuel', 'rng-thrust', 'rng-drag'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', (e) => {
        const valId = 'val-' + id.replace('rng-', '');
        document.getElementById(valId).textContent = e.target.value;
        updateVABStats();
    });
});

// VAB Launch Button
document.getElementById('vab-launch-btn')?.addEventListener('click', () => {
    CONFIG.FUEL_MASS = parseFloat(document.getElementById('rng-fuel').value) * 1000;
    CONFIG.MAX_THRUST_BOOSTER = parseFloat(document.getElementById('rng-thrust').value) * 1000000;
    CONFIG.DRAG_COEFF = parseFloat(document.getElementById('rng-drag').value);

    document.getElementById('vab-modal').style.display = 'none';
    document.getElementById('splash-screen').style.display = 'none';
    game.reset();
    game.missionLog.log("Custom Vehicle Configured", "info");
    showOnboarding();
});

// --- IMPROVEMENT #2: Dynamic Action Buttons ---
function updateActionButton() {
    const btn = document.getElementById('launch-btn');
    if (!btn || !game.trackedEntity) return;

    const alt = (game.groundY - game.trackedEntity.y - game.trackedEntity.h) / PIXELS_PER_METER;
    const vy = game.trackedEntity.vy;

    if (game.trackedEntity.throttle === 0 && alt < 100) {
        // Pre-launch
        btn.textContent = '🚀 INITIATE LAUNCH';
        btn.className = 'primary state-launch';
        flightPhase = 'prelaunch';
    } else if (vy < 0) {
        // Ascending
        btn.textContent = '🛑 ABORT MISSION';
        btn.className = 'primary state-abort';
        flightPhase = 'ascending';
    } else if (vy > 0 && alt > 1000) {
        // Descending from high altitude
        btn.textContent = '🦿 DEPLOY LEGS';
        btn.className = 'primary state-deploy';
        flightPhase = 'descending';
    }
}

// Launch/Abort/Deploy button
document.getElementById('launch-btn')?.addEventListener('click', () => {
    if (flightPhase === 'prelaunch' && game.mainStack?.throttle === 0) {
        game.mainStack.active = true;
        game.mainStack.throttle = 1.0;
        game.missionLog.log("IGNITION SEQUENCE START", "warn");
        updateActionButton();
    } else if (flightPhase === 'ascending') {
        // Abort - cut engines
        if (game.mainStack) game.mainStack.throttle = 0;
        game.missionLog.log("ABORT INITIATED", "warn");
    } else if (flightPhase === 'descending') {
        game.missionLog.log("LANDING LEGS DEPLOYED", "info");
    }
});

// --- IMPROVEMENT #9: Color-Coded Toggle Buttons ---
document.getElementById('autopilot-btn')?.addEventListener('click', (e) => {
    state.autopilotEnabled = !state.autopilotEnabled;
    e.target.textContent = state.autopilotEnabled ? '🤖 Auto-Land: ON' : '🤖 Auto-Land: OFF';
    e.target.classList.toggle('enabled', state.autopilotEnabled);
});

document.getElementById('audio-btn')?.addEventListener('click', (e) => {
    const muted = game.audio.toggleMute();
    e.target.textContent = muted ? '🔇 Enable Audio' : '🔊 Disable Audio';
    e.target.classList.remove('enabled', 'disabled');
    e.target.classList.add(muted ? 'disabled' : 'enabled');
});

// --- IMPROVEMENT #4: SAS Control with Mode Indicator ---
document.querySelectorAll('.sas-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sas-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const mode = btn.id.replace('sas-', '').toUpperCase();
        if (game.sas) {
            game.sas.setMode(SASModes[mode] || SASModes.OFF, game.trackedEntity?.angle || 0);
        }

        // Update SAS mode indicator
        const modeText = document.getElementById('sas-mode-text');
        const modeIcons = { OFF: '⭕', STABILITY: '⚡', PROGRADE: '⬆️', RETROGRADE: '⬇️' };
        if (modeText) {
            modeText.textContent = mode;
            modeText.previousElementSibling.textContent = modeIcons[mode] || '🎯';
        }
    });
});

// --- IMPROVEMENT #10: Camera Mode Panel ---
document.querySelectorAll('#camera-panel button').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#camera-panel button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const camMode = parseInt(btn.dataset.cam);
        if (game.input) game.input.cameraMode = camMode;
        game.missionLog.log(`Camera: ${btn.textContent.trim()}`, "info");
    });
});

// Update action button periodically
setInterval(updateActionButton, 500);


function performStaging(gameInstance) {
    if (Date.now() - (lastStageTime || 0) < 1000) return;
    window.lastStageTime = Date.now(); // Global for now

    const game = gameInstance || window.state; // Fallback to window.state if not passed

    if (game.trackedEntity instanceof FullStack) {
        game.missionLog.log("STAGING: S1 SEP", "warn");
        game.audio.playStaging();

        for (let i = 0; i < 30; i++) {
            game.particles.push(new Particle(game.trackedEntity.x + (Math.random() - 0.5) * 20, game.trackedEntity.y + 80,
                game.trackedEntity.vx + (Math.random() - 0.5) * 20, game.trackedEntity.vy + (Math.random() - 0.5) * 20,
                Math.random() * 1 + 0.5, 'smoke'));
        }

        state.entities = state.entities.filter(e => e !== game.trackedEntity);

        game.booster = new Booster(game.trackedEntity.x, game.trackedEntity.y, game.trackedEntity.vx, game.trackedEntity.vy);
        game.booster.angle = game.trackedEntity.angle;
        game.booster.fuel = 0.05;
        game.booster.active = true;
        game.entities.push(game.booster);

        game.upperStage = new UpperStage(game.trackedEntity.x, game.trackedEntity.y - 60, game.trackedEntity.vx, game.trackedEntity.vy + 2);
        game.upperStage.angle = game.trackedEntity.angle;
        game.upperStage.active = true;
        game.upperStage.throttle = 1.0;
        game.entities.push(game.upperStage);

        game.mainStack = game.upperStage;
        game.trackedEntity = game.upperStage;

        // Sync Globals
        window.mainStack = game.mainStack;
        window.trackedEntity = game.trackedEntity;
        window.booster = game.booster;

    } else if (game.trackedEntity instanceof UpperStage && !game.trackedEntity.fairingsDeployed) {
        game.trackedEntity.fairingsDeployed = true;
        game.missionLog.log("FAIRING SEP", "info");
        game.audio.playStaging();

        const fL = new Fairing(game.trackedEntity.x - 12, game.trackedEntity.y - 40, game.trackedEntity.vx - 10, game.trackedEntity.vy);
        fL.angle = game.trackedEntity.angle - 0.5;
        game.entities.push(fL);

        const fR = new Fairing(game.trackedEntity.x + 12, game.trackedEntity.y - 40, game.trackedEntity.vx + 10, game.trackedEntity.vy);
        fR.angle = game.trackedEntity.angle + 0.5;
        game.entities.push(fR);

    } else if (game.trackedEntity instanceof UpperStage) {
        // Payload Separation
        game.missionLog.log("PAYLOAD DEP", "success");
        game.audio.playStaging();

        game.trackedEntity.active = false;
        game.trackedEntity.throttle = 0;

        const payload = new Payload(game.trackedEntity.x, game.trackedEntity.y - 20, game.trackedEntity.vx, game.trackedEntity.vy + 1);
        payload.angle = game.trackedEntity.angle;
        game.entities.push(payload);

        game.trackedEntity = payload;
        game.mainStack = payload; // Control payload?
        window.trackedEntity = payload;
    }
}
