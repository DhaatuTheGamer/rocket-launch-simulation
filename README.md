# Realistic Orbital Launch Simulation v2.0

A high-fidelity, "best-in-class" web-based physics simulation of an orbital launch vehicle. This project has been upgraded from a simple prototype to a robust simulator featuring **RK4 integration**, **PID autopilots**, **Keplerian orbital mapping**, and **cinema-quality visuals**.

Built with HTML5 Canvas and vanilla JavaScript (no external libraries).

## 🌟 New "Best-in-Class" Features

### 🛠 UI/UX Enhancements
*   **Navball (Attitude Indicator):** A fully functional aviation-style Navball showing the rocket's orientation relative to the horizon and the **Prograde Vector** (velocity direction), essential for precise gravity turns.
*   **Vehicle Assembly Building (VAB):** An interactive "No-Code" configurator before launch. Tweak **Fuel Mass**, **Thrust Limits**, and **Aerodynamics** via sliders to design your own rocket variants without editing code.
*   **Mobile-Responsive Touch Controls:** Full support for mobile devices with an on-screen virtual joystick for gimbal control and a touch slider for throttle.
*   **Mission Event Log:** A scrolling timeline that automatically logs critical mission milestones like "LIFTOFF", "SUPERSONIC", "MAX Q", and "MECO".

### ⚛️ Deep Physics & Simulation
*   **Runge-Kutta 4 (RK4) Solver:** Upgraded from simple Euler integration to RK4, allowing for extreme precision and stability even at high time-warps (up to 10x).
*   **PID Autopilot:** A Flight Computer that can autonomously land the booster. It uses a **PID Controller** for attitude stability and calculates a precise **Suicide Burn** to reach 0 m/s exactly at ground level.
*   **Orbital Map Mode:** A dedicated "Map View" (Toggle `M`) displaying the Earth and the rocket's predicted orbital path/trajectory using real Keplerian mechanics.
*   **Structural & Thermal Damage:** A dynamic health system. High dynamic pressure (`Max Q`) combined with aggressive angles of attack will tear the rocket apart.

### 🎨 Visuals & Immersion
*   **Bloom Post-Processing:** A custom rendering pass that draws engine flames to an off-screen buffer, blurs them, and composites them with a `screen` blend mode for blindingly bright, realistic engine glow.
*   **Audio Callouts:** Integrated Text-to-Speech (TTS) for mission control voiceovers ("Liftoff", "Supersonic", "Max Q").
*   **Motion Blur:** Subtle alpha-based trail effects to convey speed.

### v2.1 Update: High-Fidelity Physics & Audio
*   **Fixed Timestep Loop:** Simulation now runs at a deterministic 60Hz independent of frame rate, ensuring consistent physics on all devices.
*   **Dynamic Audio Engine:**
    *   **Pitch Modulation:** Engine sound screams higher as you gain velocity (Doppler/Stress effect).
    *   **Atmospheric Damping:** Sound fades into a deep rumble as you leave the atmosphere, becoming silent in the vacuum of space.
*   **Optimized Keplerian Map:** Map View (M) now uses a cached orbit prediction algorithm, massively reducing CPU usage while maintaining 200-step prediction accuracy.
*   **Code Architecture:** Refactored into a clean `Game` class architecture with a dedicated `InputManager` supporting unified Keyboard/Touch handling.

### 🎨 v2.1 Visual Overhaul
*   **Atmospheric Scattering:** Sky color dynamically transitions from Earth-blue to Space-black based on altitude.
*   **Glassmorphism HUD:** New telemetry dashboard with graphical fuel/thrust gauges and digital inputs.
*   **Sprite Rendering:** Support for sprite-based rockets (with procedural fallbacks if assets are missing).

---

## 🎮 Mission Controls

### Flight
*   **SPACE**: Initiate Launch Sequence (Auto-Countdown)
*   **S**: Stage Separation (Manual trigger)
*   **P**: Deploy Payload (Fairings & Satellite)
*   **ESC**: Reset Simulation

### Guidance & Navigation
*   **ARROW KEYS**:
    *   `UP/DOWN`: Throttle Control
    *   `LEFT/RIGHT`: Thrust Vectoring (Gimbal)
*   **A**: Toggle **PID Autopilot** (Auto-Land Booster)
*   **X**: Cut Engine (Instant 0% throttle)

### Camera & Tools
*   **1**: Tracking Cam (Default)
*   **2**: Onboard Rocket Cam (Cinematic)
*   **3**: Tower Cam (Fixed)
*   **M**: **Orbital Map Mode**
*   **B**: Switch Focus to Booster
*   **]**: Increase Time Warp (up to 10x)
*   **[**: Decrease Time Warp
*   **\**: Reset Time Scale

## 🛠️ Installation & Usage

1.  **Clone or Download** this repository.
2.  **Open** `index.html` in any modern web browser.
3.  **Click** "Enter Mission Control" to start the audio engine and simulation.

## 📂 Project Structure

*   `index.html`: UI structure, Navball canvas, VAB modal, and HUD.
*   `script.js`:
    *   **RK4 Solver**: Advanced physics integration.
    *   **PIDController**: Control theory implementation for auto-landing.
    *   **AudioEngine**: Web Audio API & SpeechSynthesis.
    *   **Renderer**: Canvas drawing with Bloom and Particle systems.
*   `style.css`: Glass-morphism UI styling and animations.

## 💻 Customization

You can now customize the rocket directly in the **VAB Menu** before launch!
For deeper changes, edit the constants in `script.js`:

```javascript
const SCALE_HEIGHT = 7000;      // Atmosphere height
const ISP_VAC_BOOSTER = 311;    // Engine efficiency (Vacuum)
const R_EARTH = 6371000;        // Planet Radius
```