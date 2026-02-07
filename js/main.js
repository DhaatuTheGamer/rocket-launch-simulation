const game = new Game();
game.init();


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
