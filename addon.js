const {addonBuilder} = require("stremio-addon-sdk");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const manifest = {
    id: "org.animesub.polskienapisy",
    version: "1.0.0",
    name: "AnimeSub PL",
    description: "Addon dostarczający polskie napisy do Twoich ulubionych tytułów.",
    resources: ["subtitles"],
    types: ["movie", "series"],
    catalogs: [],
    background: "https://dl.strem.io/addon-background.jpg",
    logNo: "https://dl.strem.io/addon-logNo.png",
};

const builder = new addonBuilder(manifest);

const SEASON_DATA = {
    1: 25, 2: 12, 3: 22, 4: 35
};

builder.defineSubtitlesHandler(async (args) => {
    const TARGET_ID = "tt2560140";

    if (args.id.includes(TARGET_ID)) {
        const parts = args.id.split(':');
        const season = parseInt(parts[1]);
        const episode = parseInt(parts[2]);

        let absoluteEpisode = 0;
        for (let s = 1; s < season; s++) {
            if (SEASON_DATA[s]) absoluteEpisode += SEASON_DATA[s];
        }
        absoluteEpisode += episode;

        const searchQuery = `Shingeki no Kyojin ep${absoluteEpisode}`;
        const searchUrl = `http://animesub.info/szukaj.php?szukane=${encodeURIComponent(searchQuery)}&pTitle=org`;

        console.log(`[ADDON] Szukanie odcinka: ${searchUrl}`);

        try {
            const response = await fetch(searchUrl);
            const html = await response.text();

            const setCookie = response.headers.get('set-cookie');
            const cookie = setCookie ? setCookie.split(';')[0] : '';

            const idMatch = html.match(/name="id" value="(\d+)"/);
            const shMatch = html.match(/name="sh" value="([a-f0-9]+)"/);

            if (idMatch && shMatch) {
                const id = idMatch[1];
                const sh = shMatch[1];
                const cookieBase64 = Buffer.from(cookie).toString('base64') || 'none';

                // TWOJE LOKALNE IP KOMPUTERA
                const localIP = "192.168.0.209";

                return {
                    subtitles: [
                        {
                            id: `animesub_${id}`,
                            url: `http://${localIP}:7000/download/${id}/${sh}/${cookieBase64}/subtitles.srt`,
                            lang: "pol",
                            label: `AnimeSub PL - Odcinek ${absoluteEpisode}`
                        }
                    ]
                };
            }
        } catch (error) {
            console.error("[ERROR] Search error:", error);
        }
    }
    return { subtitles: [] };
});

module.exports = builder.getInterface();