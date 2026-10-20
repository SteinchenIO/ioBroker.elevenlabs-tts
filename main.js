'use strict';

/*
 * ioBroker.elevenlabs-tts
 * Liest Text aus einem Datenpunkt, ruft die ElevenLabs Text-to-Speech API auf
 * und speichert das Ergebnis als MP3-Datei.
 */

const utils = require('@iobroker/adapter-core');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const API_BASE = 'https://api.elevenlabs.io/v1';

class ElevenlabsTts extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options]
     */
    constructor(options) {
        super({
            ...options,
            name: 'elevenlabs-tts',
        });

        /** @type {Array<{text: string, source: string}>} */
        this.queue = [];
        this.busy = false;
        this.unloaded = false;

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', false, true);
        await this.setStateAsync('processing', false, true);

        const cfg = this.config;

        if (!cfg.apiKey) {
            this.log.error('Kein ElevenLabs API-Key konfiguriert.');
            return;
        }
        if (!cfg.voiceId) {
            this.log.error('Keine Voice-ID konfiguriert.');
            return;
        }
        if (!cfg.outputPath) {
            this.log.error('Kein Ausgabepfad konfiguriert.');
            return;
        }

        try {
            fs.mkdirSync(cfg.outputPath, { recursive: true });
            fs.accessSync(cfg.outputPath, fs.constants.W_OK);
        } catch (err) {
            this.log.error(`Ausgabepfad "${cfg.outputPath}" nicht beschreibbar: ${err.message}`);
            await this.setStateAsync('lastError', `Ausgabepfad nicht beschreibbar: ${err.message}`, true);
            return;
        }

        // API-Key beim Start pruefen
        await this.checkApi();

        // Eigenen "speak"-Datenpunkt immer abonnieren
        this.subscribeStates('speak');

        // Konfigurierten fremden Datenpunkt abonnieren
        if (cfg.textStateId) {
            const obj = await this.getForeignObjectAsync(cfg.textStateId);
            if (!obj) {
                this.log.warn(`Datenpunkt "${cfg.textStateId}" existiert nicht (noch nicht?). Abo wird trotzdem gesetzt.`);
            }
            this.subscribeForeignStates(cfg.textStateId);
            this.log.info(`Ueberwache Datenpunkt: ${cfg.textStateId}`);
        } else {
            this.log.info('Kein Quell-Datenpunkt konfiguriert, nur "speak" wird verwendet.');
        }
    }

    /**
     * Prueft, ob der API-Key gueltig ist.
     */
    async checkApi() {
        try {
            const res = await this.fetchWithTimeout(`${API_BASE}/user`, {
                method: 'GET',
                headers: { 'xi-api-key': this.config.apiKey },
            });
            if (res.ok) {
                await this.setStateAsync('info.connection', true, true);
                this.log.info('ElevenLabs API erreichbar, API-Key akzeptiert.');
            } else {
                // Eingeschraenkte Keys duerfen /user evtl. nicht lesen (401 mit missing_permissions)
                const body = await res.text();
                this.log.warn(`API-Check lieferte HTTP ${res.status}: ${body.slice(0, 200)}`);
                await this.setStateAsync('info.connection', res.status !== 401 || body.includes('missing_permissions'), true);
            }
        } catch (err) {
            this.log.warn(`API-Check fehlgeschlagen: ${err.message}`);
        }
    }

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (!state || this.unloaded) {
            return;
        }

        const isOwnSpeak = id === `${this.namespace}.speak`;
        const isSource = id === this.config.textStateId;

        if (!isOwnSpeak && !isSource) {
            return;
        }

        // Eigene Schreibvorgaenge (ack=true) auf "speak" ignorieren
        if (isOwnSpeak && state.ack) {
            return;
        }
        // Optional: nur bestaetigte Werte des Quell-Datenpunkts verarbeiten
        if (isSource && this.config.triggerOnlyAck && !state.ack) {
            return;
        }

        const text = typeof state.val === 'string' ? state.val.trim() : state.val == null ? '' : String(state.val).trim();
        if (!text) {
            return;
        }

        this.enqueue(text, id);
    }

    /**
     * @param {string} text
     * @param {string} source
     */
    enqueue(text, source) {
        const max = Number(this.config.maxTextLength) || 5000;
        if (text.length > max) {
            this.log.warn(`Text von ${source} hat ${text.length} Zeichen, gekuerzt auf ${max}.`);
            text = text.slice(0, max);
        }
        this.queue.push({ text, source });
        this.log.debug(`Text in Warteschlange (${this.queue.length}): ${text.slice(0, 60)}`);
        void this.processQueue();
    }

    async processQueue() {
        if (this.busy) {
            return;
        }
        this.busy = true;
        try {
            while (this.queue.length > 0 && !this.unloaded) {
                const job = this.queue.shift();
                await this.setStateAsync('processing', true, true);
                try {
                    const file = await this.synthesize(job.text);
                    await this.setStateAsync('lastFile', file, true);
                    await this.setStateAsync('lastText', job.text, true);
                    await this.setStateAsync('lastError', '', true);
                    this.log.info(`MP3 gespeichert: ${file}`);
                } catch (err) {
                    this.log.error(`Konvertierung fehlgeschlagen: ${err.message}`);
                    await this.setStateAsync('lastError', err.message, true);
                }
            }
        } finally {
            this.busy = false;
            if (!this.unloaded) {
                await this.setStateAsync('processing', false, true);
            }
        }
    }

    /**
     * Ruft ElevenLabs auf und schreibt die MP3-Datei.
     * @param {string} text
     * @returns {Promise<string>} Pfad der Datei
     */
    async synthesize(text) {
        const cfg = this.config;

        const url = `${API_BASE}/text-to-speech/${encodeURIComponent(cfg.voiceId)}?output_format=${encodeURIComponent(
            cfg.outputFormat || 'mp3_44100_128',
        )}`;

        /** @type {Record<string, any>} */
        const body = {
            text,
            model_id: cfg.modelId || 'eleven_multilingual_v2',
            voice_settings: {
                stability: this.clamp01(Number(cfg.stability) / 100),
                similarity_boost: this.clamp01(Number(cfg.similarityBoost) / 100),
            },
        };
        if (cfg.languageCode) {
            body.language_code = cfg.languageCode;
        }

        const res = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'xi-api-key': cfg.apiKey,
                'Content-Type': 'application/json',
                Accept: 'audio/mpeg',
            },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errText = await res.text();
            await this.setStateAsync('info.connection', res.status !== 401, true);
            throw new Error(`ElevenLabs HTTP ${res.status}: ${errText.slice(0, 300)}`);
        }

        await this.setStateAsync('info.connection', true, true);

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) {
            throw new Error('ElevenLabs lieferte eine leere Antwort.');
        }

        const fileName = this.buildFileName(text);
        const target = path.join(cfg.outputPath, fileName);
        const tmp = `${target}.tmp`;

        // Atomar schreiben, damit Abspieler nie eine halbe Datei sehen
        await fs.promises.writeFile(tmp, buffer);
        await fs.promises.rename(tmp, target);

        return target;
    }

    /**
     * @param {string} text
     * @returns {string}
     */
    buildFileName(text) {
        const mode = this.config.fileNameMode;
        let base;

        if (mode === 'fixed') {
            base = this.config.fixedFileName || 'speech';
        } else if (mode === 'hash') {
            base = crypto.createHash('sha1').update(`${this.config.voiceId}|${this.config.modelId}|${text}`).digest('hex').slice(0, 16);
        } else {
            const d = new Date();
            const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
            base = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${String(d.getMilliseconds()).padStart(3, '0')}`;
        }

        // Dateinamen absichern (keine Pfadtrenner, keine Sonderzeichen)
        base = String(base).replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_').slice(0, 100) || 'speech';
        return `${base}.mp3`;
    }

    /**
     * @param {string} url
     * @param {RequestInit} options
     */
    async fetchWithTimeout(url, options) {
        const timeoutMs = (Number(this.config.requestTimeoutSec) || 30) * 1000;
        return fetch(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
    }

    /**
     * @param {number} v
     */
    clamp01(v) {
        if (Number.isNaN(v)) {
            return 0.5;
        }
        return Math.min(1, Math.max(0, v));
    }

    /**
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.unloaded = true;
            this.queue = [];
            callback();
        } catch {
            callback();
        }
    }
}

if (require.main !== module) {
    /**
     * @param {Partial<utils.AdapterOptions>} [options]
     */
    module.exports = options => new ElevenlabsTts(options);
} else {
    new ElevenlabsTts();
}
