const express = require("express");
const {getRouter} = require("stremio-addon-sdk");
const addonInterface = require("./addon");
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require("cors");
const iconv = require("iconv-lite");
const fs = require("node:fs");
const path = require("node:path");
const {execFile} = require('child_process');

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
        if (line.startsWith("Dialogue:") && line.includes("Default")) {
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
    const {id, sh, cookie} = req.params;
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

        // Zapisz plik ZIPX na dysku
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 500) throw new Error("Błąd sesji");

        const tempZipxPath = path.join(__dirname, `temp_${id}_${Date.now()}.zipx`);
        const outputDir = path.join(__dirname, `out_${id}_${Date.now()}`);

        // Zapisz jako ZIPX
        fs.writeFileSync(tempZipxPath, buffer);

        // Używamy obietnicy, aby poczekać na zakończenie rozpakowywania
        const {promisify} = require('util');
        const execFilePromise = promisify(execFile);

        try {
            // Rozpakuj plik (używamy zmiennej tempZipxPath, nie stringa)
            await execFilePromise("7z", ["x", tempZipxPath, `-o${outputDir}`, "-y"]);

            // Znajdź rozpakowany plik w katalogu wyjściowym
            const files = fs.readdirSync(outputDir);
            const subFileName = files.find(f => f.toLowerCase().match(/\.(txt|srt|ass)$/));

            if (subFileName) {
                const fullPath = path.join(outputDir, subFileName);
                console.log(`[SERVER] Przetwarzanie: ${subFileName}`);
                let content = iconv.decode(fs.readFileSync(fullPath), "win1250");

                if (subFileName.toLowerCase().endsWith(".ass")) {
                    content = convertAssToSrt(content);
                }

                const output = iconv.encode(content, "win1250");
                res.send(output);
                console.log(`[SERVER] Wysłano napisy.`);
            } else {
                throw new Error("Nie znaleziono napisów wewnątrz ZIPX");
            }
        } finally {
            // Usuń tymczasowy plik i folder po zakończeniu (lub błędzie)
            if (fs.existsSync(tempZipxPath)) fs.unlinkSync(tempZipxPath);
            if (fs.existsSync(outputDir)) fs.rmSync(outputDir, {recursive: true, force: true});
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