const express = require("express");
const { getRouter } = require("stremio-addon-sdk");
const addonInterface = require("./addon");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const AdmZip = require("adm-zip");
const cors = require("cors");
const iconv = require("iconv-lite");

const app = express();
app.use(cors());

// Funkcja pomocnicza dla idealnego formatu czasu SRT (00:00:00,000)
function formatTime(assTime) {
    let [h, m, s] = assTime.split(':');
    if (!s.includes('.')) s += '.00';
    let [sec, ms] = s.split('.');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${sec.padStart(2, '0')},${ms.padEnd(3, '0')}`;
}

function convertAssToSrt(assContent) {
    const lines = assContent.split(/\r?\n/);
    let srtOutput = "";
    let counter = 1;
    for (let line of lines) {
        if (line.startsWith("Dialogue:")) {
            const parts = line.split(',');
            if (parts.length < 10) continue;
            const start = formatTime(parts[1]);
            const end = formatTime(parts[2]);
            let text = parts.slice(9).join(',').replace(/\{.*?\}/g, '').replace(/\\N/g, '\n').replace(/\\n/g, '\n').trim();
            if (text) {
                srtOutput += `${counter}\n${start} --> ${end}\n${text}\n\n`;
                counter++;
            }
        }
    }
    return srtOutput;
}

app.get("/download/:id/:sh/:cookie/:filename", async (req, res) => {
    const { id, sh, cookie } = req.params;
    console.log(`[SERVER] Próba pobrania ID: ${id}`);

    try {
        const decodedCookie = cookie !== 'none' ? Buffer.from(cookie, 'base64').toString() : '';
        const params = new URLSearchParams();
        params.append('id', id);
        params.append('sh', sh);

        const response = await fetch("http://animesub.info/sciagnij.php", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Cookie": decodedCookie,
                "Referer": "http://animesub.info/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            body: params
        });

        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 500) throw new Error("Błąd sesji");

        const zip = new AdmZip(buffer);
        const subFile = zip.getEntries().find(e => e.entryName.toLowerCase().match(/\.(txt|srt|ass)$/));

        if (subFile) {
            console.log(`[SERVER] Przetwarzanie: ${subFile.entryName}`);
            let content = iconv.decode(subFile.getData(), "win1250");

            if (subFile.entryName.toLowerCase().endsWith(".ass")) {
                content = convertAssToSrt(content);
            }

            // Konwersja na UTF-8 przed wysłaniem
            const output = iconv.encode(content, "win1250");
            res.send(output);
            console.log(`[SERVER] Wysłano napisy.`);
        }
    } catch (e) {
        console.error("[SERVER ERROR]", e.message);
        res.status(500).send("Error");
    }
});

app.use("/", getRouter(addonInterface));

app.listen(7000, "0.0.0.0", () => {
    console.log("Serwer działa na http://192.168.0.209:7000");
});