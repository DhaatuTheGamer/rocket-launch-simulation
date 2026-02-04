# Realistic Orbital Launch Simulation

A high-fidelity web-based physics simulation of an orbital launch vehicle, featuring multi-stage mechanics, atmospheric physics, and propulsive landing capabilities. Built with HTML5 Canvas and vanilla JavaScript.

## 🚀 Key Features

### Physics & Mechanics
*   **Multi-Stage Rocketry**: Detailed simulation of a two-stage vehicle (`FullStack`, `Booster`, `UpperStage`).
*   **Staging Mechanics**: Momentum-preserving separation events with interstage debris.
*   **Propulsive Landing**: Manually pilot the first-stage booster back to Earth using vector thrust control.
*   **Atmospheric Physics**: Realistic drag model (`Cd`, `rho`), Dynamic Pressure (`Max Q`) calculation, and exponential atmosphere.
*   **Orbital Mechanics**: Simulated gravity turn, centrifugal force, and apogee prediction.

### Visuals & Immersion
*   **Dynamic Environment**: Day/Night cycle, sun position, and atmospheric haze that changes with altitude.
*   **Particle System**: Thousands of particles for exhaust, smoke, fire, sparks, and explosions.
*   **Visual Effects**: Vapor cones (shockwaves) at transonic speeds/high Q, camera shake, and heat glow.
*   **Cinematic Cameras**: Three camera modes (Tracking, Onboard Rocket Cam, Fixed Tower Cam) plus time dilation controls.

### Systems
*   **Audio Engine**: Procedurally generated engine rumble (Brown Noise) with dynamic filtering, staging clunks, and explosions.
*   **Mission Control Telemetry**: Real-time scrolling graphs for Altitude and Velocity.
*   **Payload Deployment**: Deployable fairings and satellite payload with solar panel animation.

## 🎮 Mission Controls

### Flight
*   **SPACE**: Initiate Launch Sequence (Auto-Countdown)
*   **S**: Stage Separation (Manual trigger)
*   **P**: Deploy Payload (Fairings & Satellite)
*   **ESC**: Reset Simulation

### Guidance & Navigation
*   **ARROW KEYS**: 
    *   `UP/DOWN`: Throttle Control (Booster/Manual)
    *   `LEFT/RIGHT`: Thrust Vectoring (Tilt) - *Tip: Use for Gravity Turn or Landing*
*   **X**: Cut Engine (Instant 0% throttle)

### Camera & Time
*   **1**: Tracking Cam (Default)
*   **2**: Onboard Rocket Cam (Cinematic)
*   **3**: Tower Cam (Fixed)
*   **B**: Focus Booster (For landing)
*   **]**: Increase Time Warp (up to 10x)
*   **[**: Decrease Time Warp (Slow Mo)
*   **\\**: Reset Time Scale

## 🛠️ Installation & Usage

1.  **Clone or Download** this repository.
2.  **Open** `index.html` in any modern web browser.
    *   *Note for Audio:* You must click the "Enable Audio" button (or "Start Mission" on the splash screen) to allow the browser to play sound.

## 📂 Project Structure

*   `index.html`: UI structure, telemetry graphs, and overlay elements.
*   `script.js`:
    *   **Physics Engine**: Rigid body dynamics, gravity, drag, thrust.
    *   **Audio Engine**: Web Audio API implementation for procedural sound.
    *   **Game Loop**: Canvas rendering and state management.
*   `style.css`: HUD styling, glass-morphism effects, and splash screen.

## 💻 Customization

Simulation constants can be tweaked in the `Configuration` section of `script.js`:

```javascript
const SCALE_HEIGHT = 7000;  // Atmosphere density scale
const MAX_THRUST_BOOSTER = 2000000; // Newtons
const FUEL_MASS = 30000;    // kg
```