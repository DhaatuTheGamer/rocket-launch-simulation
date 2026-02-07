// No imports needed, loaded via script tags


// --- Setup Canvas ---
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });

// Bloom Canvas
const bloomCanvas = document.createElement('canvas');
const bloomCtx = bloomCanvas.getContext('2d');

// --- Global Systems ---
const audio = new AudioEngine();
const telemetry = new TelemetrySystem();
const navball = new Navball();
const missionLog = new MissionLog();
const sas = new SAS();

// Assign to state for global access from vessels
state.audio = audio;
state.audio = audio;
state.missionLog = missionLog;
state.assets = new AssetLoader();

// --- CAMERA & GAME STATE ---
let trackedEntity = null;
let mainStack = null;
let booster = null;
let cameraMode = 'TRACKING';
let timeScale = 1.0;
let cameraShakeX = 0, cameraShakeY = 0;
let missionState = { liftoff: false, supersonic: false, maxq: false, meco: false };

window.addEventListener('resize', resize);
resize();

function resize() {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    canvas.width = state.width;
    canvas.height = state.height;
    bloomCanvas.width = state.width / 4;
    bloomCanvas.height = state.height / 4;
    state.groundY = state.height - 50;
}

// --- HELPERS ---
function performStaging() {
    if (Date.now() - lastStageTime < 1000) return;
    lastStageTime = Date.now();

    if (trackedEntity instanceof FullStack) {
        missionLog.log("STAGING: S1 SEP", "warn");
        audio.playStaging();

        // Spawn Particles
        for (let i = 0; i < 30; i++) {
            state.particles.push(new Particle(trackedEntity.x + (Math.random() - 0.5) * 20, trackedEntity.y + 80,
                trackedEntity.vx + (Math.random() - 0.5) * 20, trackedEntity.vy + (Math.random() - 0.5) * 20,
                Math.random() * 1 + 0.5, 'smoke'));
        }

        // Remove FullStack
        state.entities = state.entities.filter(e => e !== trackedEntity);

        // Spawn Booster (Debris/Auto-land)
        // Correction: Booster spawns at same pos
        booster = new Booster(trackedEntity.x, trackedEntity.y, trackedEntity.vx, trackedEntity.vy);
        booster.angle = trackedEntity.angle;
        booster.fuel = 0.05; // Leftover
        booster.active = true; // For autopilot
        state.entities.push(booster);

        // Spawn Upper Stage (Controlled)
        upperStage = new UpperStage(trackedEntity.x, trackedEntity.y - 60, trackedEntity.vx, trackedEntity.vy + 2); // Push away
        upperStage.angle = trackedEntity.angle;
        upperStage.active = true;
        upperStage.throttle = 1.0;
        state.entities.push(upperStage);

        mainStack = upperStage;
        trackedEntity = upperStage;

    } else if (trackedEntity instanceof UpperStage && !trackedEntity.fairingsDeployed) {
        trackedEntity.fairingsDeployed = true;
        missionLog.log("FAIRING SEP", "info");
        audio.playStaging();

        const fL = new Fairing(trackedEntity.x - 12, trackedEntity.y - 40, trackedEntity.vx - 10, trackedEntity.vy);
        fL.angle = trackedEntity.angle - 0.5;
        state.entities.push(fL);

        const fR = new Fairing(trackedEntity.x + 12, trackedEntity.y - 40, trackedEntity.vx + 10, trackedEntity.vy);
        fR.angle = trackedEntity.angle + 0.5;
        state.entities.push(fR);

    } else if (trackedEntity instanceof UpperStage) {
        // Payload Separation
        missionLog.log("PAYLOAD DEP", "success");
        audio.playStaging();

        trackedEntity.active = false;
        trackedEntity.throttle = 0;

        const payload = new Payload(trackedEntity.x, trackedEntity.y - 20, trackedEntity.vx, trackedEntity.vy + 1);
        payload.angle = trackedEntity.angle;
        state.entities.push(payload);

        trackedEntity = payload;
        mainStack = payload;
    }
}

function initGame() {
    state.entities = [];
    state.particles = [];
    mainStack = new FullStack();
    mainStack.y = state.groundY - mainStack.h;
    state.entities.push(mainStack);
    trackedEntity = mainStack;
    missionState = { liftoff: false, supersonic: false, maxq: false, meco: false };
    missionLog.clear();
    state.autopilotEnabled = false;
    document.getElementById('autopilot-btn').innerText = "🤖 Auto-Land: OFF";
    timeScale = 1.0;
    booster = null;
    cameraMode = 'TRACKING';
    state.cameraY = 0;
}

function initiateLaunch() {
    if (missionState.liftoff) return; // Prevent double launch
    mainStack.throttle = 1.0;
    missionState.liftoff = true;
    audio.speak("Liftoff");
}

// --- RENDERERS ---

function updateOrbitPaths(now) {
    state.entities.forEach(e => {
        if (e.crashed) return;
        const alt = (state.groundY - e.y - e.h) / PIXELS_PER_METER;

        let needsUpdate = false;
        if (e.throttle > 0) needsUpdate = true;
        if (alt < 140000) needsUpdate = true;
        if (now - (e.lastOrbitUpdate || 0) > 1000) needsUpdate = true;
        if (!e.orbitPath) needsUpdate = true;

        if (needsUpdate) {
            e.orbitPath = [];
            e.lastOrbitUpdate = now;

            let simState = { x: e.x / 10, y: e.y / 10, vx: e.vx, vy: e.vy, mass: e.mass };
            let steps = 200;
            let dtPred = 10;

            const startPhi = simState.x / R_EARTH;
            const startR = R_EARTH + (state.groundY / 10 - simState.y - e.h / 10);
            e.orbitPath.push({ phi: startPhi, r: startR });

            for (let i = 0; i < steps; i++) {
                const pAlt = (state.groundY / 10 - simState.y - e.h / 10);
                const pRad = pAlt + R_EARTH;
                const pG = 9.8 * Math.pow(R_EARTH / pRad, 2);
                const pFy = pG - (simState.vx ** 2) / pRad;

                simState.vy += pFy * dtPred;
                simState.x += simState.vx * dtPred;
                simState.y += simState.vy * dtPred;

                if (simState.y * 10 > state.groundY) break;

                const pPhi = (simState.x * 10) / R_EARTH;
                const pR = R_EARTH + (state.groundY / 10 - simState.y - e.h / 10);
                e.orbitPath.push({ phi: pPhi, r: pR });
            }
        }
    });
}

function drawMap() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, state.width, state.height);

    const cx = state.width / 2;
    const cy = state.height / 2;
    const scale = 0.00005;

    // Draw Earth
    const r_earth_px = R_EARTH * scale;
    ctx.fillStyle = '#3498db';
    ctx.beginPath(); ctx.arc(cx, cy, r_earth_px, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();

    // Draw Orbits
    state.entities.forEach(e => {
        if (e.crashed) return;
        const alt = (state.groundY - e.y - e.h) / PIXELS_PER_METER;
        const r = R_EARTH + alt;
        const phi = e.x / R_EARTH;

        const ox = cx + Math.cos(phi - Math.PI / 2) * r * scale;
        const oy = cy + Math.sin(phi - Math.PI / 2) * r * scale;

        ctx.fillStyle = e === trackedEntity ? '#f1c40f' : '#aaa';
        ctx.beginPath(); ctx.arc(ox, oy, 3, 0, Math.PI * 2); ctx.fill();

        if (e.orbitPath) {
            ctx.beginPath();
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 1;
            e.orbitPath.forEach((p, i) => {
                const px = cx + Math.cos(p.phi - Math.PI / 2) * p.r * scale;
                const py = cy + Math.sin(p.phi - Math.PI / 2) * p.r * scale;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            });
            ctx.stroke();
        }
    });

    ctx.fillStyle = 'white';
    ctx.font = '20px monospace';
    ctx.fillText("ORBITAL MAP MODE [M]", 20, 40);
}

// --- PHYSICS LOOP ---
const FIXED_DT = 1 / 60;
let accumulator = 0;
let lastTime = 0;

function updatePhysics(dt) {
    // Update SAS
    if (mainStack && mainStack.active && sas.mode !== SASModes.OFF) {
        if (keys['ArrowLeft'] || keys['ArrowRight']) {
            // Manual override handled in input?
        } else {
            const sasOut = sas.update(mainStack, dt * timeScale);
            mainStack.gimbalAngle = sasOut;
        }
    }

    const simDt = dt * timeScale;
    state.entities.forEach(e => {
        e.applyPhysics(simDt, keys);
        e.spawnExhaust(timeScale);
    });

    if (trackedEntity) {
        const alt = (state.groundY - trackedEntity.y - trackedEntity.h) / PIXELS_PER_METER;
        const vel = Math.sqrt(trackedEntity.vx ** 2 + trackedEntity.vy ** 2);

        const rho = 1.225 * Math.exp(-alt / 7000);
        audio.setThrust(trackedEntity.throttle, rho, vel);

        if (!missionState.liftoff && alt > 20) { missionState.liftoff = true; missionLog.log("LIFTOFF", "warn"); audio.speak("Liftoff"); }
        if (!missionState.supersonic && vel > 340) { missionState.supersonic = true; missionLog.log("SUPERSONIC", "info"); }
        if (!missionState.maxq && trackedEntity.q > 5000) { missionState.maxq = true; missionLog.log("MAX Q", "warn"); audio.speak("Max Q"); }
    }

    for (let i = state.particles.length - 1; i >= 0; i--) {
        let p = state.particles[i];
        p.update(state.groundY, timeScale);
        if (p.life <= 0) state.particles.splice(i, 1);
    }
}

function animate(currentTime) {
    if (!lastTime) lastTime = currentTime;
    const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1);
    lastTime = currentTime;
    accumulator += deltaTime;

    // Physics Updates
    while (accumulator >= FIXED_DT) {
        updatePhysics(FIXED_DT);
        if (cameraMode === 'MAP') updateOrbitPaths(currentTime);
        accumulator -= FIXED_DT;
    }

    // Rendering
    if (cameraMode === 'MAP') {
        drawMap();
    } else {
        ctx.clearRect(0, 0, state.width, state.height);

        // Atmosphere
        const alt = -state.cameraY;
        const spaceRatio = Math.min(Math.max(alt / 60000, 0), 1);
        const grd = ctx.createLinearGradient(0, 0, 0, state.height);

        const rBot = Math.floor(135 * (1 - spaceRatio));
        const gBot = Math.floor(206 * (1 - spaceRatio));
        const bBot = Math.floor(235 * (1 - spaceRatio));
        const rTop = Math.floor(0 * (1 - spaceRatio));
        const gTop = Math.floor(0 * (1 - spaceRatio));
        const bTop = Math.floor(20 * (1 - spaceRatio));

        grd.addColorStop(0, `rgb(${rTop}, ${gTop}, ${bTop})`);
        grd.addColorStop(1, `rgb(${rBot}, ${gBot}, ${bBot})`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, state.width, state.height);

        // Camera Shake & Transform
        if (trackedEntity) {
            let targetY = trackedEntity.y - state.height * 0.6;
            if (cameraMode === 'ROCKET') targetY = trackedEntity.y - state.height / 2;
            if (cameraMode === 'TOWER') targetY = 0;
            if (targetY < 0) state.cameraY += (targetY - state.cameraY) * 0.1;
            else state.cameraY += (0 - state.cameraY) * 0.1;

            const q = trackedEntity.q || 0;
            const shake = Math.min(q / 200, 10);
            cameraShakeX = (Math.random() - 0.5) * shake;
            cameraShakeY = (Math.random() - 0.5) * shake;
        }

        ctx.save();
        ctx.translate(cameraShakeX, -state.cameraY + cameraShakeY);

        ctx.fillStyle = '#2ecc71'; ctx.fillRect(-50000, state.groundY, 100000, 500);

        // Bloom
        bloomCtx.clearRect(0, 0, bloomCanvas.width, bloomCanvas.height);
        bloomCtx.save();
        bloomCtx.scale(0.25, 0.25);
        bloomCtx.translate(cameraShakeX, -state.cameraY + cameraShakeY);
        state.particles.forEach(p => {
            if (p.type === 'fire') {
                bloomCtx.beginPath();
                bloomCtx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
                bloomCtx.fillStyle = 'rgba(255, 100, 0, 1)';
                bloomCtx.fill();
            }
        });
        bloomCtx.restore();

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.filter = 'blur(10px)';
        ctx.drawImage(bloomCanvas, 0, 0, state.width, state.height);
        ctx.filter = 'none';
        ctx.restore();

        // Draw State
        state.particles.forEach(p => p.draw(ctx));
        state.entities.forEach(e => e.draw(ctx, state.cameraY));

        ctx.restore();

        // HUD Updates
        if (trackedEntity) {
            const velAngle = Math.atan2(trackedEntity.vx, -trackedEntity.vy);
            navball.draw(trackedEntity.angle, velAngle);
            const alt = (state.groundY - trackedEntity.y - trackedEntity.h) / PIXELS_PER_METER;
            const vel = Math.sqrt(trackedEntity.vx ** 2 + trackedEntity.vy ** 2);

            const hudAlt = document.getElementById('hud-alt');
            const hudVel = document.getElementById('hud-vel');
            const hudApogee = document.getElementById('hud-apogee');
            const hudVSpeed = document.getElementById('hud-vspeed');

            if (hudAlt) hudAlt.innerText = (alt / 1000).toFixed(1);
            if (hudVel) hudVel.innerText = vel.toFixed(0);
            if (hudVSpeed) hudVSpeed.innerText = (-trackedEntity.vy).toFixed(0);

            const apogee = trackedEntity.apogee || (alt / 1000);
            if (hudApogee) hudApogee.innerText = apogee.toFixed(1);

            telemetry.update(performance.now() / 1000, alt, vel);

            // Gauges
            let fuel = 0;
            let thrust = 0;

            if (booster && booster.active) {
                fuel = booster.fuel;
                thrust = booster.throttle;
            } else if (mainStack && mainStack.active) {
                fuel = mainStack.fuel;
                thrust = mainStack.throttle;
            } else if (trackedEntity && trackedEntity.fuel !== undefined) {
                fuel = trackedEntity.fuel;
                thrust = trackedEntity.throttle;
            }

            const gaugeFuel = document.getElementById('gauge-fuel');
            const gaugeThrust = document.getElementById('gauge-thrust');
            if (gaugeFuel) gaugeFuel.style.height = (fuel * 100) + '%';
            if (gaugeThrust) gaugeThrust.style.height = (thrust * 100) + '%';
        }

        ctx.fillStyle = 'white';
        ctx.font = '16px monospace';
        ctx.fillText(`TIME WARP: ${timeScale.toFixed(0)}x`, state.width - 150, 40);
    }

    requestAnimationFrame(animate);
}

// --- CONTROLS ---
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Space') { if (!missionState.liftoff) initiateLaunch(); }
    if (e.code === 'KeyS') performStaging();
    if (e.code === 'KeyP') performPayloadDep();
    if (e.code === 'KeyM') cameraMode = (cameraMode === 'MAP' ? 'TRACKING' : 'MAP');
    if (e.code === 'Escape') initGame();

    if (e.code === 'KeyA') {
        state.autopilotEnabled = !state.autopilotEnabled;
        document.getElementById('autopilot-btn').innerText = `🤖 Auto-Land: ${state.autopilotEnabled ? 'ON' : 'OFF'}`;
    }

    if (e.code === 'Digit1') { cameraMode = 'TRACKING'; trackedEntity = state.entities.find(e => e instanceof UpperStage) || state.entities[0]; }
    if (e.code === 'Digit2') { cameraMode = 'ROCKET'; if (trackedEntity) trackedEntity = trackedEntity; }
    if (e.code === 'Digit3') { cameraMode = 'TOWER'; }
    if (e.code === 'KeyB' && booster) trackedEntity = booster;

    if (e.key === ']') timeScale = Math.min(10, timeScale + 1);
    if (e.key === '[') timeScale = Math.max(1, timeScale - 1);
    if (e.key === '\\') timeScale = 1.0;

    if (e.code === 'ArrowUp') {
        if (booster && booster.active) booster.throttle = Math.min(1, booster.throttle + 0.1);
        else if (mainStack && mainStack.active) mainStack.throttle = Math.min(1, mainStack.throttle + 0.1);
    }
    if (e.code === 'ArrowDown') {
        if (booster && booster.active) booster.throttle = Math.max(0, booster.throttle - 0.1);
        else if (mainStack && mainStack.active) mainStack.throttle = Math.max(0, mainStack.throttle - 0.1);
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

document.getElementById('open-vab-btn').addEventListener('click', () => {
    document.getElementById('vab-modal').style.display = 'flex';
});

document.getElementById('vab-launch-btn').addEventListener('click', () => {
    CONFIG.FUEL_MASS = parseInt(document.getElementById('rng-fuel').value) * 1000;
    CONFIG.MAX_THRUST_BOOSTER = parseFloat(document.getElementById('rng-thrust').value) * 1000000;
    CONFIG.DRAG_COEFF = parseFloat(document.getElementById('rng-drag').value);
    document.getElementById('vab-modal').style.display = 'none';
    initGame();
});

['fuel', 'thrust', 'drag'].forEach(id => {
    document.getElementById(`rng-${id}`).addEventListener('input', e => {
        document.getElementById(`val-${id}`).innerText = e.target.value;
    });
});

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('splash-screen').style.opacity = 0;
    setTimeout(() => { document.getElementById('splash-screen').style.display = 'none'; }, 500);
    audio.init();
    document.getElementById('audio-btn').innerText = "🔇 Mute Audio";
    audio.muted = false;
    audio.masterGain.gain.setTargetAtTime(0.5, audio.ctx.currentTime, 0.1);
});

document.getElementById('launch-btn').addEventListener('click', initiateLaunch);

document.getElementById('audio-btn').addEventListener('click', () => {
    const isMuted = audio.toggleMute();
    document.getElementById('audio-btn').innerText = isMuted ? "🔊 Enable Audio" : "🔇 Mute Audio";
});

// Mobile Controls (Simplified for now)
const joystickZone = document.getElementById('joystick-zone');
const joystickKnob = document.getElementById('joystick-knob');
const throttleZone = document.getElementById('throttle-zone');
const throttleHandle = document.getElementById('throttle-handle');
let touchIdJoy = null, touchIdThrot = null;

if (joystickZone) {
    joystickZone.addEventListener('touchstart', e => {
        e.preventDefault();
        touchIdJoy = e.changedTouches[0].identifier;
        updateJoystick(e.changedTouches[0]);
    }, { passive: false });
    joystickZone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchIdJoy) updateJoystick(e.changedTouches[i]);
        }
    }, { passive: false });
    joystickZone.addEventListener('touchend', e => {
        e.preventDefault();
        touchIdJoy = null;
        joystickKnob.style.top = '35px'; joystickKnob.style.left = '35px';
        keys['ArrowLeft'] = false; keys['ArrowRight'] = false;
    });
}
function updateJoystick(touch) {
    const rect = joystickZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = touch.clientX - cx;
    const dy = touch.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const max = 35;
    const f = dist > max ? max / dist : 1;
    joystickKnob.style.left = (35 + dx * f) + 'px';
    joystickKnob.style.top = (35 + dy * f) + 'px';
    if (dx < -10) { keys['ArrowLeft'] = true; keys['ArrowRight'] = false; }
    else if (dx > 10) { keys['ArrowRight'] = true; keys['ArrowLeft'] = false; }
    else { keys['ArrowLeft'] = false; keys['ArrowRight'] = false; }
}

if (throttleZone) {
    throttleZone.addEventListener('touchstart', e => {
        e.preventDefault();
        touchIdThrot = e.changedTouches[0].identifier;
        updateThrottle(e.changedTouches[0]);
    }, { passive: false });
    throttleZone.addEventListener('touchmove', e => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === touchIdThrot) updateThrottle(e.changedTouches[i]);
        }
    }, { passive: false });
}
function updateThrottle(touch) {
    const rect = throttleZone.getBoundingClientRect();
    let val = 1.0 - (touch.clientY - rect.top) / rect.height;
    val = Math.max(0, Math.min(1, val));
    throttleHandle.style.bottom = (val * (rect.height - 30)) + 'px';
    if (booster && booster.active) booster.throttle = val;
    else if (mainStack && mainStack.active) mainStack.throttle = val;
}
document.getElementById('btn-stage').addEventListener('touchstart', (e) => { e.preventDefault(); performStaging(); });
document.getElementById('btn-payload').addEventListener('touchstart', (e) => { e.preventDefault(); performPayloadDep(); });
document.getElementById('btn-cam').addEventListener('touchstart', (e) => { e.preventDefault(); cameraMode = (cameraMode === 'TRACKING' ? 'ROCKET' : 'TRACKING'); });

// --- SAS CONTROLS ---
const sasButtons = {
    [SASModes.OFF]: document.getElementById('sas-off'),
    [SASModes.STABILITY]: document.getElementById('sas-stability'),
    [SASModes.PROGRADE]: document.getElementById('sas-prograde'),
    [SASModes.RETROGRADE]: document.getElementById('sas-retrograde')
};

function setSASMode(mode) {
    if (!trackedEntity) return;
    sas.setMode(mode, trackedEntity.angle);
    Object.values(sasButtons).forEach(btn => btn.classList.remove('active'));
    if (sasButtons[mode]) sasButtons[mode].classList.add('active');
    missionLog.log(`SAS MODE: ${mode}`, 'info');
}

Object.entries(sasButtons).forEach(([mode, btn]) => {
    btn.addEventListener('click', () => setSASMode(mode));
});

// Update Loop Injection
function updateSAS(dt) {
    if (!trackedEntity || trackedEntity.crashed) return;

    // Only apply to active controllable vessels
    // We assume trackedEntity is the one we want to control with SAS
    // But typically SAS applies to the active commanded vessel.

    let controlledVessel = null;
    if (mainStack && mainStack.active) controlledVessel = mainStack;
    else if (booster && booster.active && trackedEntity === booster) controlledVessel = booster;
    // If we are tracking booster and it's active, control it.
    // If we are tracking payload/upper but mainStack is the active one...

    if (controlledVessel) {
        // If Manual Inputs are active, override SAS (switch to Stability or Off?)
        // For now, let's say SAS overrides manual if ON, or Manual overrides if keys pressed.
        // Simple approach: If keys pressed, SAS = OFF or Temporarily suspended.

        let manualInput = false;
        if (keys['ArrowLeft'] || keys['ArrowRight']) manualInput = true;

        if (manualInput) {
            if (sas.mode !== SASModes.OFF) {
                // optionally turn off or just yield
                // let's verify manual override later.
                // For now, let arrows affect gimbal, and SAS also affect gimbal.
                // They will fight.
                // Better: Pass SAS output to applyPhysics
            }
        } else if (sas.mode !== SASModes.OFF) {
            const output = sas.update(controlledVessel, dt);
            controlledVessel.gimbalAngle = output; // Direct control
            // Visual feedback?
        }
    }
}

// Modify animate to call updateSAS
const originalAnimate = animate;
// Wait, I can't easily hook into animate without replacing the function or editing it.
// I will edit the animate function loop above using multi-replace.


state.assets.loadAll().then(() => {
    initGame();
    animate();
});
