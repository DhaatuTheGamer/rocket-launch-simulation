class AssetLoader {
    constructor() {
        this.images = {};
        this.assets = [
            { key: 'rocket_body', src: 'assets/rocket_body.png' },
            { key: 'rocket_engine', src: 'assets/rocket_engine.png' },
            { key: 'fairing', src: 'assets/payload_fairing.png' },
            { key: 'flame', src: 'assets/flame_particle.png' }
        ];
    }

    loadAll() {
        return Promise.all(this.assets.map(asset => {
            return new Promise((resolve) => {
                const img = new Image();
                img.src = asset.src;
                img.onload = () => {
                    this.images[asset.key] = img;
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load asset: ${asset.src}`);
                    // Resolve anyway to continue game loading
                    resolve();
                };
            });
        }));
    }

    get(key) {
        return this.images[key];
    }
}
