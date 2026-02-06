const GRAVITY = 9.8;
const PIXELS_PER_METER = 10;
const FPS = 60;
const DT = 1 / FPS;
const SCALE_HEIGHT = 7000;
const RHO_SL = 1.225;
const R_EARTH = 6371000;

// Configurable Physics Constants (Mutable)
const CONFIG = {
    MAX_THRUST_BOOSTER: 2000000,
    MAX_THRUST_UPPER: 500000,
    MASS_BOOSTER: 40000,
    MASS_UPPER: 15000,
    FUEL_MASS: 30000,
    DRAG_COEFF: 0.5,
    ISP_VAC_BOOSTER: 311,
    ISP_SL_BOOSTER: 282,
    ISP_VAC_UPPER: 348,
    ISP_SL_UPPER: 100
};
