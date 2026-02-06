export const GRAVITY = 9.8;
export const PIXELS_PER_METER = 10;
export const FPS = 60;
export const DT = 1 / FPS;
export const SCALE_HEIGHT = 7000;
export const RHO_SL = 1.225;
export const R_EARTH = 6371000;

// Configurable Physics Constants (Mutable)
export const CONFIG = {
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
