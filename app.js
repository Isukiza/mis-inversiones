/**
 * PATRIMONIO FAMILIAR ISUKIZA - MODULAR JS + ENCRYPTION
 */

// ══════════════════════════════════════════════════
// 1. CONFIGURACIÓN Y CONSTANTES
// ══════════════════════════════════════════════════
const Config = {
    ACCIONES_DEFAULT: [
        { ticker: "AMZN",    nombre: "Amazon",    cant: 20,   mon: "USD", coste: 0, inv: 0 },
        { ticker: "SAN.MC",  nombre: "Santander", cant: 1080, mon: "EUR", coste: 0, inv: 0 },
        { ticker: "OHLA.MC", nombre: "OHLA",      cant: 300,  mon: "EUR", coste: 0, inv: 0 }
    ],
    // Tarjetas que se pueden contraer (ahora solo la gráfica de evolución)
    CARDS: {
        evolucion: { body: "body-evolucion", card: "card-total"    }
    },
    // Carteras del selector lateral: al elegir una, su detalle sustituye al donut
    PANELS: ["bolsa", "fondos", "indie", "efectivo", "epsv"],
    COLORES: {
        total: "#4ade80", efectivo: "#22d3ee", fondos: "#a78bfa",
        indie: "#34d399", epsv: "#fb7185", bolsa: "#3b82f6"
    },
    TREEMAP_CATS: [
        { key: 'bolsa',    label: 'Bolsa',    color: '#3b82f6' },
        { key: 'fondos',   label: 'Fondos',   color: '#8b5cf6' },
        { key: 'indie',    label: 'Indie',    color: '#10b981' },
        { key: 'epsv',     label: 'EPSV',     color: '#f43f5e' },
        { key: 'efectivo', label: 'Efectivo', color: '#06b6d4' }
    ],
    PROXIES: [
        url => `https://shrill-violet-57df.george-bouza.workers.dev/?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
        url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ]
};

// ══════════════════════════════════════════════════
// MÓDULO DE SINCRONIZACIÓN EN LA NUBE (GitHub) — CON CIFRADO
// Sustituye por completo el bloque "const Cloud = { ... };" de app.js
// ══════════════════════════════════════════════════
const Cloud = {
    // Repo y fichero donde se guardan los datos.
    // Recomendado: un repo PRIVADO aparte (p. ej. "Isukiza/isukiza-data").
    REPO: "Isukiza/mis-inversiones",
    FILE: "isukiza_cloud_data.json",

    // ── Cifrado ────────────────────────────────────
    KDF_ITER: 100000,

    _deriveKey(pass, salt) {
        return CryptoJS.PBKDF2(pass, salt, {
            keySize: 256 / 32,
            iterations: this.KDF_ITER,
            hasher: CryptoJS.algo.SHA256
        });
    },
    _encrypt(obj) {
        const salt = CryptoJS.lib.WordArray.random(16);
        const iv   = CryptoJS.lib.WordArray.random(16);
        const key  = this._deriveKey(State.masterKey, salt);
        const ct   = CryptoJS.AES.encrypt(JSON.stringify(obj), key, {
            iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7
        });
        // _fecha y _device quedan en claro para que autoSync compare sin descifrar
        return {
            _enc: 1,
            _kdf: "pbkdf2-sha256-" + this.KDF_ITER,
            _fecha: obj._fecha,
            _device: obj._device,
            salt: salt.toString(CryptoJS.enc.Base64),
            iv:   iv.toString(CryptoJS.enc.Base64),
            data: ct.ciphertext.toString(CryptoJS.enc.Base64)
        };
    },
    _decrypt(env) {
        const salt  = CryptoJS.enc.Base64.parse(env.salt);
        const iv    = CryptoJS.enc.Base64.parse(env.iv);
        const key   = this._deriveKey(State.masterKey, salt);
        const bytes = CryptoJS.AES.decrypt(
            { ciphertext: CryptoJS.enc.Base64.parse(env.data) }, key,
            { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
        );
        const txt = bytes.toString(CryptoJS.enc.Utf8);
        if (!txt) throw new Error("Clave incorrecta o datos corruptos");
        return JSON.parse(txt);
    },
    // Devuelve el JSON en claro (string) listo para App.importarJSON.
    // Si el fichero está en el formato antiguo (texto plano), lo deja pasar tal cual.
    _unwrap(jsonStr) {
        const parsed = JSON.parse(jsonStr);
        if (!parsed._enc) return jsonStr;
        return JSON.stringify(this._decrypt(parsed));
    },

    // ── Token de GitHub (sin cambios) ──────────────
    getToken() {
        const enc = localStorage.getItem("isukiza_cloud_token");
        if (!enc || !State.masterKey) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(enc, State.masterKey);
            return bytes.toString(CryptoJS.enc.Utf8);
        } catch(e) { return null; }
    },
    saveToken(token) {
        if (!State.masterKey) return;
        const enc = CryptoJS.AES.encrypt(token, State.masterKey).toString();
        localStorage.setItem("isukiza_cloud_token", enc);
    },
    promptToken() {
        const token = prompt("Introduce tu GitHub Personal Access Token:\n(Se guardará cifrado, no volverá a pedírsete)");
        if (token && token.startsWith("ghp_")) {
            this.saveToken(token.trim());
            UI.showToast("Token guardado — sincronización activada");
            return token.trim();
        } else if (token) { alert("Token no válido. Debe empezar por ghp_"); }
        return null;
    },
    _headers() {
        const token = this.getToken();
        if (!token) return null;
        return { "Authorization": `token ${token}`, "Content-Type": "application/json", "User-Agent": "isukiza-app" };
    },
    async getSHA() {
        try {
            const headers = this._headers();
            if (!headers) return null;
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?t=${Date.now()}`, { headers });
            if (r.status === 404) return null;
            const d = await r.json();
            return d.sha;
        } catch(e) { return null; }
    },

    // ── Guardar (cifrado) ──────────────────────────
    async guardar() {
        let headers = this._headers();
        if (!headers) { const token = this.promptToken(); if (!token) return; headers = this._headers(); }
        if (!State.masterKey) { UI.showToast("Falta la clave maestra", "#7c2d12", "#f97316"); return; }
        UI.setStatus("Cifrando y guardando en nube...", "amber");
        try {
            const d = Storage._load("isukiza_v4_enc") || {};
            const exportData = {
                _version: 3, _fecha: new Date().toISOString(),
                _device: navigator.userAgent.includes("Mobile") ? "movil" : "escritorio",
                historial: State.historial, acciones: State.acciones,
                f1_vl: d.f1_vl, f1_part: d.f1_part, f1_coste: d.f1_coste,
                f2_vl: d.f2_vl, f2_part: d.f2_part, f2_coste: d.f2_coste,
                indie_mer: d.indie_mer, indie_inv: d.indie_inv, indie_ef: d.indie_ef,
                p1: d.p1, p2: d.p2, vlp: d.vlp,
                ef_abanca: d.ef_abanca, ef_santander: d.ef_santander,
                ef_kutxa: d.ef_kutxa, ef_myinvestor: d.ef_myinvestor,
                ef_traderepublic: d.ef_traderepublic, ef_casa: d.ef_casa
            };
            const envelope = this._encrypt(exportData);
            const sha  = await this.getSHA();
            const ct   = btoa(unescape(encodeURIComponent(JSON.stringify(envelope, null, 2))));
            const body = { message: `Sync ${new Date().toLocaleString("es-ES")}`, content: ct };
            if (sha) body.sha = sha;
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}`, {
                method: "PUT", headers, body: JSON.stringify(body)
            });
            if (r.ok) {
                UI.setStatus("Guardado en nube", "green");
                UI.showToast("Sincronizado con la nube (cifrado)");
                localStorage.setItem("isukiza_last_sync", new Date().toISOString());
                this._updateSyncBadge();
            } else { throw new Error(`HTTP ${r.status}`); }
        } catch(e) {
            console.warn("[Isukiza] Cloud.guardar:", e);
            UI.setStatus("Error al guardar en nube", "red");
            UI.showToast("Error de sincronizacion", "#7c2d12", "#f97316");
        }
    },

    // ── Cargar (descifra; acepta también el formato antiguo) ──
    async cargar() {
        let headers = this._headers();
        if (!headers) { const token = this.promptToken(); if (!token) return; headers = this._headers(); }
        UI.setStatus("Cargando desde nube...", "amber");
        try {
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?t=${Date.now()}`, { headers });
            if (r.status === 404) { UI.showToast("Sin datos en la nube todavia", "#1e293b", "#94a3b8"); return; }
            const d       = await r.json();
            const raw     = decodeURIComponent(escape(atob(d.content)));
            const jsonStr = this._unwrap(raw);
            App.importarJSON(jsonStr);
            UI.setStatus("Datos cargados desde nube", "green");
            UI.showToast("Datos sincronizados desde la nube");
            localStorage.setItem("isukiza_last_sync", new Date().toISOString());
            localStorage.setItem("isukiza_last_loaded", new Date().toISOString());
            this._updateSyncBadge();
        } catch(e) {
            console.warn("[Isukiza] Cloud.cargar:", e);
            UI.setStatus("Error al cargar desde nube", "red");
            UI.showToast("Error al cargar (¿clave maestra distinta?)", "#7c2d12", "#f97316");
        }
    },

    _updateSyncBadge() {
        const el = document.getElementById("syncBadge");
        if (!el) return;
        const last = localStorage.getItem("isukiza_last_sync");
        if (last) {
            const d = new Date(last);
            el.innerText = d.toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
            el.style.display = "inline";
        }
    },

    async autoSync() {
        const headers = this._headers();
        if (!headers) return;
        try {
            const r = await fetch(`https://api.github.com/repos/${this.REPO}/contents/${this.FILE}?t=${Date.now()}`, { headers });
            if (r.status === 404) return;
            const d         = await r.json();
            const raw       = decodeURIComponent(escape(atob(d.content)));
            const cloudMeta = JSON.parse(raw);               // _fecha y _device están en claro
            const cloudDate = new Date(cloudMeta._fecha);
            const lastLoaded = localStorage.getItem("isukiza_last_loaded");
            if (!lastLoaded || cloudDate > new Date(lastLoaded)) {
                const device = cloudMeta._device || "otro dispositivo";
                const fecha  = cloudDate.toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
                if (confirm("Hay datos mas recientes en la nube (" + fecha + " desde " + device + ").\n\nCargar datos de la nube?")) {
                    App.importarJSON(this._unwrap(raw));
                    localStorage.setItem("isukiza_last_loaded", cloudMeta._fecha);
                    localStorage.setItem("isukiza_last_sync", new Date().toISOString());
                    this._updateSyncBadge();
                }
            }
        } catch(e) { console.warn("[Isukiza] autoSync:", e); }
    }
};

// ══════════════════════════════════════════════════
// 2. ESTADO GLOBAL
// ══════════════════════════════════════════════════
let State = {
    acciones: [],
    precios: {},
    cambios: {},
    usd_eur: 0.92,
    historial: [],
    tabActiva: "total",
    colapsado: {},
    panelActivo: null,
    _modalEditIdx: -1,
    masterKey: null
};

// ══════════════════════════════════════════════════
// 3. MÓDULO DE SEGURIDAD (Crypto)
// ══════════════════════════════════════════════════
const Crypto = {
    encrypt(data) {
        if (!State.masterKey) return data;
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return CryptoJS.AES.encrypt(str, State.masterKey).toString();
    },
    decrypt(ciphertext) {
        if (!State.masterKey || !ciphertext) return null;
        try {
            const bytes = CryptoJS.AES.decrypt(ciphertext, State.masterKey);
            const decrypted = bytes.toString(CryptoJS.enc.Utf8);
            if (!decrypted) return null;
            return JSON.parse(decrypted);
        } catch (e) { return null; }
    }
};

// ══════════════════════════════════════════════════
// 4. MÓDULO DE PERSISTENCIA (Storage)
// ══════════════════════════════════════════════════
const Storage = {
    _save(key, data) {
        const encrypted = Crypto.encrypt(data);
        localStorage.setItem(key, encrypted);
    },
    _load(key) {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;
        return Crypto.decrypt(encrypted);
    },

    saveData() {
        const g = id => { const el = document.getElementById(id); return el ? el.value : ""; };
        const ts = document.getElementById("fondosTimestamp");
        const data = {
            f1_vl: g("f1_vl"), f1_part: g("f1_part"), f1_coste: g("f1_coste"),
            f2_vl: g("f2_vl"), f2_part: g("f2_part"), f2_coste: g("f2_coste"),
            indie_mer: g("indie_mer"), indie_inv: g("indie_inv"), indie_ef: g("indie_ef"),
            p1: g("p1"), p2: g("p2"), vlp: g("vlp"),
            ef_abanca: g("ef_abanca"), ef_santander: g("ef_santander"),
            ef_kutxa: g("ef_kutxa"), ef_myinvestor: g("ef_myinvestor"),
            ef_traderepublic: g("ef_traderepublic"), ef_casa: g("ef_casa"),
            ts: ts ? ts.innerText : ""
        };
        this._save("isukiza_v4_enc", data);
    },

    saveHistorial()    { this._save("isukiza_hist_enc",     State.historial); },
    saveAcciones()     { this._save("isukiza_acciones_enc", State.acciones);  },
    saveCollapseState(){ localStorage.setItem("isukiza_collapse", JSON.stringify(State.colapsado)); },

    loadAll() {
        let d = this._load("isukiza_v4_enc");
        if (!d && localStorage.getItem("isukiza_v4")) {
            try {
                d = JSON.parse(localStorage.getItem("isukiza_v4"));
                State.historial = JSON.parse(localStorage.getItem("isukiza_hist") || "[]");
                State.acciones  = JSON.parse(localStorage.getItem("isukiza_acciones") || JSON.stringify(Config.ACCIONES_DEFAULT));
                this.saveData(); this.saveHistorial(); this.saveAcciones();
            } catch(e) {}
        } else {
            d = d || {};
            State.historial = this._load("isukiza_hist_enc") || [];
            State.acciones  = this._load("isukiza_acciones_enc") || JSON.parse(JSON.stringify(Config.ACCIONES_DEFAULT));
        }

        const setVal = (id, val) => { const el = document.getElementById(id); if (el && val !== undefined && val !== null) el.value = val; };
        setVal("f1_vl",            d.f1_vl);
        setVal("f1_part",          d.f1_part);
        setVal("f1_coste",         d.f1_coste);
        setVal("f2_vl",            d.f2_vl);
        setVal("f2_part",          d.f2_part);
        setVal("f2_coste",         d.f2_coste);
        setVal("indie_mer",        d.indie_mer);
        setVal("indie_inv",        d.indie_inv);
        setVal("indie_ef",         d.indie_ef);
        setVal("ef_abanca",        d.ef_abanca);
        setVal("ef_santander",     d.ef_santander);
        setVal("ef_kutxa",         d.ef_kutxa);
        setVal("ef_myinvestor",    d.ef_myinvestor);
        setVal("ef_traderepublic", d.ef_traderepublic);
        setVal("ef_casa",          d.ef_casa);
        setVal("p1",               d.p1  || "1376.6933");
        setVal("p2",               d.p2  || "1975.6095");
        setVal("vlp",              d.vlp);
        const vlp_m = document.getElementById("vlp_m");
        if (vlp_m) vlp_m.value = d.vlp || "";
        const tsEl = document.getElementById("fondosTimestamp");
        if (d.ts && tsEl) tsEl.innerText = d.ts;

        State.colapsado = JSON.parse(localStorage.getItem("isukiza_collapse") || "{}");
        State.acciones.forEach(a => { if (!State.precios[a.ticker]) State.precios[a.ticker] = 0; });
    }
};

// ══════════════════════════════════════════════════
// 5. MÓDULO DE FINANZAS (API)
// ══════════════════════════════════════════════════
const Finance = {
    async fetchPrice(ticker) {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`;
        for (let i = 0; i < Config.PROXIES.length; i++) {
            try {
                const proxyUrl = Config.PROXIES[i](yahooUrl);
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                const response = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                const result = this.extractPrice(data);
                if (result && result.price > 0) return result;
            } catch (e) {
                console.warn(`Proxy ${i} fallo para ${ticker}:`, e.message);
            }
        }
        throw new Error(`Fallo total para ${ticker}`);
    },
    extractPrice(data) {
        try {
            let contents = data.contents ? JSON.parse(data.contents) : data;
            const result = contents && contents.chart && contents.chart.result && contents.chart.result[0];
            if (!result) return null;
            const meta  = result.meta;
            const price = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0;
            const prev  = meta.chartPreviousClose || meta.previousClose || 0;
            const changePct = (prev > 0 && price > 0) ? (price - prev) / prev * 100 : 0;
            return { price, changePct };
        } catch (e) { return null; }
    },
    async updateAllPrices() {
        UI.setStatus("Actualizando bolsa...", "amber");
        try {
            const r = await this.fetchPrice("EURUSD=X");
            State.usd_eur = r ? 1 / (r.price || 1) : 0.92;
        } catch (e) { State.usd_eur = 0.92; }
        const promises = State.acciones.map(async a => {
            try {
                const r = await this.fetchPrice(a.ticker);
                if (r) { State.precios[a.ticker] = r.price; State.cambios[a.ticker] = r.changePct; }
            } catch (e) { State.precios[a.ticker] = 0; }
        });
        await Promise.all(promises);
        const bolsaStatusEl = document.getElementById("bolsaStatus");
        if (bolsaStatusEl) bolsaStatusEl.innerText = "live";
        UI.setStatus(`Bolsa actualizada ${new Date().toLocaleTimeString("es-ES")}`, "green");
        UI.renderBolsa();
        App.calculateAll();
    }
};

// ══════════════════════════════════════════════════
// 6. MÓDULO DE INTERFAZ (UI)
// ══════════════════════════════════════════════════
const UI = {
    fmt(n)  { return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    fmtK(n) {
        if (!n) return "0";
        if (Math.abs(n) >= 1000) return (n / 1000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
        return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
    setStatus(msg, color) {
        const s = document.getElementById("status");
        if (!s) return;
        const map = { amber: "text-amber-400", green: "text-green-400", red: "text-red-400" };
        s.className = `mono text-[10px] mt-2 ${map[color] || "text-slate-400"}`;
        s.innerText = msg;
    },
    showToast(msg, bg = "#14532d", color = "#4ade80") {
        const t = document.getElementById("snapToast");
        if (!t) return;
        t.style.background = bg; t.style.borderColor = color; t.style.color = color;
        t.innerText = msg; t.style.opacity = "1";
        setTimeout(() => { t.style.opacity = "0"; }, 2500);
    },

    toggleCard(id) {
        State.colapsado[id] = !State.colapsado[id];
        this.applyCollapse(id);
        Storage.saveCollapseState();
        this.updateGlobalBtn();
    },
    toggleAll() {
        const allCollapsed = Object.keys(Config.CARDS).every(id => State.colapsado[id]);
        Object.keys(Config.CARDS).forEach(id => {
            State.colapsado[id] = !allCollapsed;
            this.applyCollapse(id);
        });
        Storage.saveCollapseState();
        this.updateGlobalBtn();
    },
    applyCollapse(id) {
        const cfg = Config.CARDS[id];
        if (!cfg) return;
        const body = document.getElementById(cfg.body);
        const card = document.getElementById(cfg.card);
        const btn  = card ? card.querySelector(".collapse-btn") : null;
        const sum  = document.getElementById(`summary-${id}`);
        if (!body) return;
        if (State.colapsado[id]) {
            body.classList.add("collapsed");
            if (btn)  btn.textContent = "▼";
            if (sum)  { sum.style.display = "inline"; this.updateSummary(id); }
            if (card) card.style.paddingBottom = "16px";
        } else {
            body.classList.remove("collapsed");
            if (btn)  btn.textContent = "▲";
            if (sum)  sum.style.display = "none";
            if (card) card.style.paddingBottom = "";
            setTimeout(() => this.refreshCharts(), 50);
        }
    },
    summaryText(id) {
        const v = App.getValues();
        let txt = "";
        switch (id) {
            case "bolsa":     txt = v.bolsa    > 0 ? this.fmt(v.bolsa)    + " €" : "—"; break;
            case "fondos": {
                txt = v.fondos > 0 ? this.fmt(v.fondos) + " €" : "—";
                const f = App.getFondosTotals();
                if (f.tInv > 0) { const g = f.tMer - f.tInv; txt += `  ${g >= 0 ? "+" : ""}${(g / f.tInv * 100).toFixed(2)}%`; }
                break;
            }
            case "indie":     txt = v.indie    > 0 ? this.fmt(v.indie)    + " €" : "—"; break;
            case "efectivo":  txt = v.efectivo > 0 ? this.fmt(v.efectivo) + " €" : "—"; break;
            case "epsv":      txt = v.epsv     > 0 ? this.fmt(v.epsv)     + " €" : "—"; break;
            case "treemap":   txt = v.total    > 0 ? this.fmt(v.total)    + " € total" : "—"; break;
            case "evolucion": txt = `${State.historial.length} snapshot${State.historial.length !== 1 ? "s" : ""}`; break;
        }
        return txt;
    },
    updateSummary(id) {
        const txt = this.summaryText(id);
        const el  = document.getElementById(`summary-${id}`);
        if (el) el.textContent = txt;
        const nav = document.getElementById(`nav-val-${id}`);
        if (nav) nav.textContent = txt;
    },
    updateNav() { Config.PANELS.forEach(id => this.updateSummary(id)); },
    selectPanel(id) {
        if (id && !Config.PANELS.includes(id)) id = null;
        if (id && State.panelActivo === id) id = null;      // pulsar la activa = deseleccionar
        State.panelActivo = id;
        Config.PANELS.forEach(p => {
            const card = document.getElementById(`card-${p}`);
            const nav  = document.getElementById(`nav-${p}`);
            if (card) card.classList.toggle("is-hidden", p !== id);
            if (nav)  { nav.classList.toggle("active", p === id); nav.setAttribute("aria-pressed", p === id ? "true" : "false"); }
        });
        const dist = document.getElementById("card-treemap");
        if (dist) dist.classList.toggle("is-hidden", !!id);
        // los gráficos medían 0 de ancho mientras estaban ocultos: se redibujan ya visibles
        requestAnimationFrame(() => this.refreshCharts());
        if (id && window.matchMedia && window.matchMedia("(max-width: 1023px)").matches) {
            const card = document.getElementById(`card-${id}`);
            if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    },
    updateGlobalBtn() {
        const btn = document.getElementById("btnCollapseAll");
        if (!btn) return;
        const allCollapsed = Object.keys(Config.CARDS).every(id => State.colapsado[id]);
        btn.textContent = allCollapsed ? "▼ Expandir todo" : "▲ Contraer todo";
        btn.classList.toggle("all-collapsed", allCollapsed);
    },

    updateFondoDOM(id) {
        const part  = parseFloat(document.getElementById(`${id}_part`).value)  || 0;
        const coste = parseFloat(document.getElementById(`${id}_coste`).value) || 0;
        const vl    = parseFloat(document.getElementById(`${id}_vl`).value)    || 0;
        const valInv = part * coste, valMer = part * vl;
        const gan = valMer - valInv, ganPct = valInv > 0 ? gan / valInv * 100 : 0, esG = gan >= 0;
        document.getElementById(`${id}_inv`).innerText = valInv > 0 ? this.fmt(valInv) + " €" : "—";
        document.getElementById(`${id}_mer`).innerText = valMer > 0 ? this.fmt(valMer) + " €" : "—";
        const box = document.getElementById(`${id}_rent`), val = document.getElementById(`${id}_rent_val`);
        if (valInv > 0) {
            box.classList.remove("hidden"); box.classList.add("flex");
            val.className = `mono text-base font-bold ${esG ? "gain" : "loss"}`;
            val.innerText = `${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${ganPct.toFixed(2)}%)`;
        } else { box.classList.add("hidden"); box.classList.remove("flex"); }
    },
    updateTotalFondosDOM() {
        const f = App.getFondosTotals(), gan = f.tMer - f.tInv, pct = f.tInv > 0 ? gan / f.tInv * 100 : 0, esG = gan >= 0;
        document.getElementById("totalFondosValor").innerText = f.tMer > 0 ? this.fmt(f.tMer) + " €" : "—";
        const el = document.getElementById("totalFondosRentab");
        el.className = `mono text-[10px] ${f.tInv > 0 ? (esG ? "gain" : "loss") : "text-slate-600"}`;
        el.innerText = f.tInv > 0 ? `${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${pct.toFixed(2)}%)` : "";
    },
    updateIndieDOM() {
        const mer = parseFloat(document.getElementById("indie_mer").value) || 0;
        const inv = parseFloat(document.getElementById("indie_inv").value) || 0;
        const ef  = parseFloat(document.getElementById("indie_ef").value)  || 0;
        const gan = mer - inv, pct = inv > 0 ? gan / inv * 100 : 0, esG = gan >= 0, tot = mer + ef;
        const el  = document.getElementById("indie_rent");
        if (inv > 0) { el.className = `mono text-base font-bold ${esG ? "gain" : "loss"}`; el.innerText = `${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${pct.toFixed(2)}%)`; }
        else { el.className = "mono text-base font-bold text-slate-500"; el.innerText = "—"; }
        document.getElementById("indie_total").innerText = tot > 0 ? this.fmt(tot) + " €" : "—";
    },
    updateEPSVDOM() {
        const vlp = parseFloat(document.getElementById("vlp").value) || 0;
        const r1  = (parseFloat(document.getElementById("p1").value) || 0) * vlp;
        const r2  = (parseFloat(document.getElementById("p2").value) || 0) * vlp;
        document.getElementById("res1").innerText      = this.fmt(r1)      + " €";
        document.getElementById("res2").innerText      = this.fmt(r2)      + " €";
        document.getElementById("totalEPSV").innerText = this.fmt(r1 + r2) + " €";
    },
    updateEfectivoDOM() {
        const campos = [
            { id: "ef_abanca",        label: "Abanca"         },
            { id: "ef_santander",     label: "Santander"      },
            { id: "ef_kutxa",         label: "Kutxabank"      },
            { id: "ef_myinvestor",    label: "MyInvestor"     },
            { id: "ef_traderepublic", label: "Trade Republic" },
            { id: "ef_casa",          label: "Casa"           }
        ];
        let total = 0;
        const filas = [];
        campos.forEach(c => {
            const el = document.getElementById(c.id);
            const v = el ? (parseFloat(el.value) || 0) : 0;
            total += v;
            if (v > 0) filas.push(`<div class="flex justify-between"><span class="mono text-[11px] text-slate-500">${c.label}</span><span class="mono text-[11px] text-cyan-400">${this.fmt(v)} €</span></div>`);
        });
        const desglose = document.getElementById("ef_desglose");
        if (desglose) {
            if (filas.length > 1) { desglose.innerHTML = filas.join(""); desglose.classList.remove("hidden"); }
            else { desglose.classList.add("hidden"); }
        }
        const totalEl = document.getElementById("ef_total");
        if (totalEl) totalEl.innerText = total > 0 ? this.fmt(total) + " €" : "—";
    },

    renderBolsa() {
        const list = document.getElementById("listaAcciones");
        if (!list) return;
        if (!State.acciones.length) {
            list.innerHTML = '<p class="mono text-[9px] text-slate-600 text-center py-4">Sin valores. Pulsa + para añadir.</p>';
            return;
        }
        const items = State.acciones.map((a, idx) => {
            const price  = State.precios[a.ticker] || 0;
            const sub    = price * a.cant;
            const subEur = a.mon === "USD" ? sub * State.usd_eur : sub;
            const invRaw = parseFloat(a.inv) || (parseFloat(a.coste) * a.cant) || 0;
            const invEur = a.mon === "USD" ? invRaw * State.usd_eur : invRaw;
            const gan    = subEur - invEur, ganPct = invEur > 0 ? gan / invEur * 100 : 0, esG = gan >= 0;
            const esPorEncima = invEur === 0 || subEur >= invEur;
            const rawPct  = State.cambios[a.ticker];
            const dayPct  = (rawPct !== undefined && rawPct !== null) ? rawPct : null;
            const dayEsG  = dayPct === null ? true : dayPct >= 0;
            const badgeColor = esPorEncima ? "background:#052e16;border:1px solid #166534;color:#4ade80;" : "background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171;";
            const dayStr  = dayPct !== null ? `<span style="color:${dayEsG ? "#4ade80" : "#f87171"}">${dayEsG ? "+" : ""}${dayPct.toFixed(2)}% hoy</span>` : "";
            const badgeHTML = price > 0 ? `<div style="${badgeColor}border-radius:8px;padding:3px 8px;display:inline-flex;align-items:center;gap:5px;font-family:JetBrains Mono,monospace;font-size:10px;font-weight:700;white-space:nowrap;"><span>${esPorEncima ? "🟢" : "🔴"}</span>${dayStr}</div>` : "";
            const rentHTML = invEur > 0 ? `<div class="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-1 mt-2"><span class="mono text-[11px] text-slate-500">Rentabilidad</span><span class="mono text-sm font-bold ${esG ? "gain" : "loss"}">${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${ganPct.toFixed(2)}%)</span></div>` : "";
            return { subEur, invEur, html: `
                <div class="bg-slate-900/40 p-3 rounded-xl border border-slate-800 hover:border-blue-700/40 transition-all">
                    <div class="flex justify-between items-center">
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <a href="https://finance.yahoo.com/quote/${a.ticker}" target="_blank" class="font-bold text-slate-200 hover:text-blue-400 text-sm">${a.nombre} <span class="text-blue-500 text-[9px]">&#8599;</span></a>
                                ${badgeHTML}
                            </div>
                            <p class="mono text-[9px] text-slate-500 mt-0.5">${a.cant} uds · ${price.toFixed(2)} ${a.mon}</p>
                            PESO_BAR_PLACEHOLDER
                        </div>
                        <div class="flex items-center gap-2 ml-3">
                            <div class="text-right">
                                <p class="mono text-base font-bold text-blue-300">${this.fmt(subEur)} &euro;</p>
                                ${a.mon === "USD" ? `<p class="mono text-[8px] text-slate-600">${this.fmt(sub)} ${a.mon}</p>` : ""}
                            </div>
                            <button onclick="UI.abrirModal(${idx})" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;flex-shrink:0;">✏️</button>
                        </div>
                    </div>
                    ${rentHTML}
                </div>`};
        });

        const totalBolsaReal = items.reduce((s, i) => s + (i.subEur || 0), 0);
        list.innerHTML = items.map(item => {
            const pesoPct = totalBolsaReal > 0 ? (item.subEur / totalBolsaReal * 100) : 0;
            return item.html.replace('PESO_BAR_PLACEHOLDER',
                `<div class="flex items-center gap-2 mt-1"><div style="flex:1;height:3px;background:#1e293b;border-radius:2px;overflow:hidden;"><div style="height:100%;width:${pesoPct.toFixed(1)}%;background:#3b82f6;border-radius:2px;opacity:0.7;"></div></div><span class="mono" style="font-size:9px;color:#3b82f6;font-weight:700;">${pesoPct.toFixed(1)}%</span></div>`
            );
        }).join("");

        const totalBolsaMer = totalBolsaReal;
        const totalBolsaInv = items.reduce((s, i) => s + (i.invEur || 0), 0);
        const ganT = totalBolsaMer - totalBolsaInv, esGT = ganT >= 0;
        const footer = document.getElementById("bolsaFooter");
        if (footer) {
            footer.className = "mt-3 pt-3 border-t border-slate-800 flex justify-between items-center";
            footer.innerHTML = `<span class="mono text-[9px] text-slate-600 uppercase">Total bolsa</span><div class="text-right"><p class="mono text-base font-bold text-blue-300">${this.fmt(totalBolsaMer)} €</p>${totalBolsaInv > 0 ? `<p class="mono text-[9px] ${esGT ? "gain" : "loss"}">${esGT ? "+" : ""}${this.fmt(ganT)} € (${esGT ? "+" : ""}${(ganT / totalBolsaInv * 100).toFixed(2)}%)</p>` : ""}</div>`;
        }
        this.updateSummary("bolsa");
    },

    abrirModal(idx) {
        State._modalEditIdx = idx;
        const a = idx === -1 ? { nombre: "", ticker: "", mon: "EUR", cant: "", coste: "", inv: "" } : State.acciones[idx];
        document.getElementById("modalTitle").innerText = idx === -1 ? "Añadir valor" : `Editar: ${a.nombre}`;
        document.getElementById("m_nombre").value = a.nombre;
        document.getElementById("m_ticker").value = a.ticker;
        document.getElementById("m_mon").value    = a.mon;
        document.getElementById("m_cant").value   = a.cant;
        document.getElementById("m_coste").value  = a.coste;
        document.getElementById("m_inv").value    = a.inv;
        document.getElementById("m_eliminar").style.display = idx === -1 ? "none" : "block";
        document.getElementById("modalBolsa").classList.add("open");
    },
    cerrarModal() { document.getElementById("modalBolsa").classList.remove("open"); },

    refreshCharts() {
        Charts.drawHeaderDonut();
        Charts.drawTreemap();
        Charts.drawSparkline("spark-fondos", "fondos",   Config.COLORES.fondos,   "tip-fondos");
        Charts.drawSparkline("spark-indie",  "indie",    Config.COLORES.indie,    "tip-indie");
        Charts.drawSparkline("spark-epsv",   "epsv",     Config.COLORES.epsv,     "tip-epsv");
        Charts.drawSparkline("spark-ef",     "efectivo", Config.COLORES.efectivo, "tip-ef");
        Charts.drawBigChart();
        Charts.drawSnapTable();
        Charts.drawPulse();
    }
};

// ══════════════════════════════════════════════════
// 7. MÓDULO DE GRÁFICAS (Charts)
// ══════════════════════════════════════════════════
const Charts = {
    makePath(data, W, H, color, filled, times) {
        if (data.length < 2) return "";
        const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1, pad = 4, h = H - pad * 2;
        let xs;
        if (times && times.length === data.length) {
            const tmin = Math.min(...times), tr = (Math.max(...times) - tmin) || 1;
            xs = times.map(t => pad + (t - tmin) / tr * (W - pad * 2));
        } else {
            xs = data.map((_, i) => pad + i * (W - pad * 2) / (data.length - 1));
        }
        const ys = data.map(v => pad + h - (v - min) / rng * h);
        const order = data.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
        const px = order.map(i => xs[i]), py = order.map(i => ys[i]);
        let d = `M ${px[0]} ${py[0]}`;
        for (let i = 1; i < px.length; i++) { const mx = (px[i-1]+px[i])/2; d += ` C ${mx} ${py[i-1]} ${mx} ${py[i]} ${px[i]} ${py[i]}`; }
        let path = `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
        if (filled) { const area = `${d} L ${px[px.length-1]} ${H-pad} L ${px[0]} ${H-pad} Z`; path = `<path d="${area}" fill="${color}" fill-opacity="0.08"/>${path}`; }
        return { svg: path, xs, ys };
    },

    drawSparkline(svgId, field, color, tipId) {
        const svg = document.getElementById(svgId);
        if (!svg) return;
        const W = svg.clientWidth || svg.parentElement.clientWidth || 300, H = 48;
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        svg.innerHTML = "";
        const data = State.historial.map(s => s[field] || 0);
        if (data.length < 2 || data.every(v => v === 0)) {
            svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="JetBrains Mono" font-size="9">Sin datos</text>';
            return;
        }
        const r = this.makePath(data, W, H, color, true, State.historial.map(s => new Date(s.fecha).getTime()));
        if (!r) return;
        svg.innerHTML = r.svg;
        r.xs.forEach((x, i) => {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", x); circle.setAttribute("cy", r.ys[i]); circle.setAttribute("r", "3"); circle.setAttribute("fill", color); circle.style.cursor = "pointer";
            const snap = State.historial[i];
            circle.addEventListener("mouseenter", () => { const tip = document.getElementById(tipId); if (!tip) return; const fStr = new Date(snap.fecha).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" }); tip.innerText = `${fStr}  ${UI.fmt(snap[field])} €`; tip.style.display = "block"; tip.style.left = (x+6)+"px"; tip.style.top = (r.ys[i]-28)+"px"; });
            circle.addEventListener("mouseleave", () => { const tip = document.getElementById(tipId); if (tip) tip.style.display = "none"; });
            svg.appendChild(circle);
        });
    },

    drawHeaderDonut() {
        const svg    = document.getElementById('header-donut-svg');
        const legend = document.getElementById('header-donut-legend');
        if (!svg) return;
        svg.innerHTML = '';
        if (legend) legend.innerHTML = '';
        const v = App.getValues(), total = v.total;
        if (total <= 0) return;
        const items = Config.TREEMAP_CATS.map(c => ({ ...c, value: v[c.key] || 0 })).filter(i => i.value > 0);
        const CX = 80, CY = 80, R = 68, ri = 44, GAP = 0.025;
        let angle = -Math.PI / 2;
        items.forEach(item => {
            const slice = (item.value / total) * Math.PI * 2, end = angle + slice - GAP;
            const x1 = CX+R*Math.cos(angle), y1 = CY+R*Math.sin(angle), x2 = CX+R*Math.cos(end), y2 = CY+R*Math.sin(end);
            const x3 = CX+ri*Math.cos(end),  y3 = CY+ri*Math.sin(end),  x4 = CX+ri*Math.cos(angle), y4 = CY+ri*Math.sin(angle);
            const lg = slice > Math.PI ? 1 : 0, d = `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${lg} 0 ${x4} ${y4} Z`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d); path.setAttribute('fill', item.color); path.setAttribute('fill-opacity', '0.82'); path.style.cursor = 'pointer';
            const pct = (item.value / total * 100).toFixed(1);
            path.addEventListener('mouseenter', () => { path.setAttribute('fill-opacity', '1'); const cp = document.getElementById('header-donut-pct'), cl = document.getElementById('header-donut-label'); if (cp) { cp.style.color = item.color; cp.innerText = pct + '%'; } if (cl) cl.innerText = item.label; });
            path.addEventListener('mouseleave', () => { path.setAttribute('fill-opacity', '0.82'); const cp = document.getElementById('header-donut-pct'), cl = document.getElementById('header-donut-label'); if (cp) cp.innerText = ''; if (cl) cl.innerText = ''; });
            svg.appendChild(path); angle += slice;
            if (legend) { const el = document.createElement('div'); el.className = 'flex items-center gap-1'; el.innerHTML = `<span style="width:7px;height:7px;border-radius:2px;background:${item.color};display:inline-block;flex-shrink:0;"></span><span class="mono" style="font-size:9px;color:#94a3b8;">${item.label}</span><span class="mono font-bold" style="font-size:9px;color:${item.color};">${pct}%</span>`; legend.appendChild(el); }
        });
    },

    drawTreemap() {
        const svg = document.getElementById('treemap-svg'), tipEl = document.getElementById('treemap-tip'), legend = document.getElementById('treemap-legend');
        if (!svg) return;
        svg.innerHTML = ''; if (legend) legend.innerHTML = '';
        const v = App.getValues(), total = v.total;
        const totalEl = document.getElementById('treemap-total');
        if (totalEl) totalEl.innerText = total > 0 ? total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }) : '';
        if (total <= 0) { svg.innerHTML = '<text x="110" y="110" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="JetBrains Mono" font-size="10">Sin datos</text>'; return; }
        const items = Config.TREEMAP_CATS.map(c => ({ ...c, value: v[c.key] || 0 })).filter(i => i.value > 0);
        const CX = 110, CY = 110, R = 90, ri = 54, GAP = 0.022;
        let angle = -Math.PI / 2;
        items.forEach(item => {
            const slice = (item.value / total) * Math.PI * 2, end = angle + slice - GAP;
            const x1 = CX+R*Math.cos(angle), y1 = CY+R*Math.sin(angle), x2 = CX+R*Math.cos(end), y2 = CY+R*Math.sin(end);
            const x3 = CX+ri*Math.cos(end),  y3 = CY+ri*Math.sin(end),  x4 = CX+ri*Math.cos(angle), y4 = CY+ri*Math.sin(angle);
            const lg = slice > Math.PI ? 1 : 0, d = `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${lg} 0 ${x4} ${y4} Z`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d); path.setAttribute('fill', item.color); path.setAttribute('fill-opacity', '0.82'); path.style.cursor = 'pointer'; path.style.transition = 'fill-opacity 0.15s';
            const pct = (item.value / total * 100).toFixed(1), midA = angle + slice / 2;
            path.addEventListener('mouseenter', () => {
                path.setAttribute('fill-opacity', '1');
                if (tipEl) { tipEl.style.display = 'block'; tipEl.innerHTML = `<b style="color:${item.color}">${item.label}</b><br>${UI.fmt(item.value)} € &nbsp;<b>${pct}%</b>`; tipEl.style.left = Math.max(0, CX+(R+10)*Math.cos(midA)-55)+'px'; tipEl.style.top = Math.max(0, CY+(R+10)*Math.sin(midA)-38)+'px'; }
                const cp = document.getElementById('donut-center-pct'), cl = document.getElementById('donut-center-label'), cv = document.getElementById('donut-center-val');
                if (cp) { cp.style.color = item.color; cp.innerText = pct + '%'; } if (cl) cl.innerText = item.label; if (cv) cv.innerText = UI.fmt(item.value) + ' €';
            });
            path.addEventListener('mouseleave', () => {
                path.setAttribute('fill-opacity', '0.82'); if (tipEl) tipEl.style.display = 'none';
                const cp = document.getElementById('donut-center-pct'), cl = document.getElementById('donut-center-label'), cv = document.getElementById('donut-center-val');
                if (cp) cp.innerText = ''; if (cl) cl.innerText = ''; if (cv) cv.innerText = '';
            });
            svg.appendChild(path); angle += slice;
            if (legend) {
                const row = document.createElement('div'); row.className = 'flex items-center justify-between gap-3 w-full';
                row.innerHTML = `<div class="flex items-center gap-2" style="min-width:90px;"><span style="width:10px;height:10px;border-radius:3px;background:${item.color};display:inline-block;flex-shrink:0;"></span><span class="mono text-[11px] text-slate-300 font-bold">${item.label}</span></div><div class="flex-1 mx-2" style="height:5px;background:#1e293b;border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${item.color};border-radius:3px;opacity:0.8;"></div></div><span class="mono text-[11px] font-bold" style="color:${item.color};min-width:42px;text-align:right;">${pct}%</span><span class="mono text-[10px] text-slate-500" style="min-width:90px;text-align:right;">${UI.fmt(item.value)} €</span>`;
                legend.appendChild(row);
            }
        });
    },

    timeTicks(tmin, tmax) {
        const DAY = 864e5; let out = [];
        if ((tmax - tmin) / DAY >= 75) {
            const d = new Date(tmin); d.setDate(1); d.setHours(0, 0, 0, 0);
            if (d.getTime() <= tmin) d.setMonth(d.getMonth() + 1);
            while (d.getTime() < tmax) {
                const lbl = d.toLocaleDateString("es-ES", { month: "short" }).replace(".", "");
                out.push({ t: d.getTime(), label: d.getMonth() === 0 ? `${lbl} '${String(d.getFullYear()).slice(2)}` : lbl });
                d.setMonth(d.getMonth() + 1);
            }
            if (out.length > 12) { const k = Math.ceil(out.length / 12); out = out.filter((_, i) => i % k === 0); }
        } else {
            for (let i = 1; i <= 4; i++) { const t = tmin + (tmax - tmin) * i / 5; out.push({ t, label: new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }) }); }
        }
        return out;
    },

    drawBigChart() {
        const svg = document.getElementById("chart-big"), tip = document.getElementById("tip-big");
        if (!svg) return;
        const xaxis = document.getElementById("chart-xaxis");
        const W = svg.clientWidth || svg.parentElement.clientWidth || 600, H = 200;
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.innerHTML = "";
        const data = State.historial.map(s => s[State.tabActiva] || 0);
        if (data.length < 2) { svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="JetBrains Mono" font-size="11">Registra al menos 2 snapshots</text>'; if (xaxis) xaxis.innerHTML = ""; return; }
        const color = Config.COLORES[State.tabActiva], pad = 8, padL = 44, padR = 12;
        const times = State.historial.map(s => new Date(s.fecha).getTime());
        const tmin = Math.min(...times), tmax = Math.max(...times), trng = (tmax - tmin) || 1;
        const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1, h = H - pad*2 - 20;
        const xOf = t => padL + (t - tmin) / trng * (W - padL - padR);
        const xs = times.map(xOf);
        const ys = data.map(v => pad + h - (v - min) / rng * h);
        const order = data.map((_, i) => i).sort((a, b) => times[a] - times[b]);
        const px = order.map(i => xs[i]), py = order.map(i => ys[i]);
        const ticks = this.timeTicks(tmin, tmax);
        let gridSvg = "";
        ticks.forEach(tk => { const x = xOf(tk.t); gridSvg += `<line x1="${x}" y1="${pad}" x2="${x}" y2="${pad+h}" stroke="#1e293b" stroke-width="1" stroke-dasharray="2 4"/>`; });
        for (let g = 0; g <= 4; g++) { const yg = pad + h/4*g, val = max - (max-min)/4*g; gridSvg += `<line x1="${padL}" y1="${yg}" x2="${W-padR}" y2="${yg}" stroke="#1e293b" stroke-width="1"/><text x="${padL-6}" y="${yg+3}" text-anchor="end" fill="#64748b" font-family="JetBrains Mono" font-size="10">${UI.fmtK(val)}</text>`; }
        svg.innerHTML = gridSvg;
        let d = `M ${px[0]} ${py[0]}`; for (let i = 1; i < px.length; i++) { const mx = (px[i-1]+px[i])/2; d += ` C ${mx} ${py[i-1]} ${mx} ${py[i]} ${px[i]} ${py[i]}`; }
        svg.innerHTML += `<path d="${d} L ${px[px.length-1]} ${pad+h} L ${px[0]} ${pad+h} Z" fill="${color}" fill-opacity="0.07"/>`;
        svg.innerHTML += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>`;
        xs.forEach((x, i) => {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", x); circle.setAttribute("cy", ys[i]); circle.setAttribute("r", "4"); circle.setAttribute("fill", color); circle.setAttribute("stroke", "#080e1a"); circle.setAttribute("stroke-width", "2"); circle.style.cursor = "pointer";
            const snap = State.historial[i];
            circle.addEventListener("mouseenter", () => { if (!tip) return; const fStr = new Date(snap.fecha).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" }); tip.innerText = `${fStr}  ${UI.fmt(snap[State.tabActiva])} €`; tip.style.display = "block"; tip.style.left = (x+8)+"px"; tip.style.top = (ys[i]-36)+"px"; });
            circle.addEventListener("mouseleave", () => { if (tip) tip.style.display = "none"; });
            svg.appendChild(circle);
        });
        if (xaxis) {
            xaxis.classList.remove("flex", "justify-between");
            xaxis.style.position = "relative"; xaxis.style.height = "16px";
            const lab = (x, txt) => `<span class="mono text-[8px] text-slate-600" style="position:absolute;top:0;left:${x}px;transform:translateX(-50%);white-space:nowrap;">${txt}</span>`;
            const fD = t => new Date(t).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
            const x0 = xOf(tmin), x1 = xOf(tmax);
            let html = lab(x0, fD(tmin)) + lab(x1, fD(tmax));
            ticks.forEach(tk => { const x = xOf(tk.t); if (x - x0 > 34 && x1 - x > 34) html += lab(x, tk.label); });
            xaxis.innerHTML = html;
        }
    },

    drawPulse() {
        const el = document.getElementById("pulse-body"); if (!el) return;
        try {
            const H = State.historial;
            if (!H || H.length < 2) { el.innerHTML = '<p class="pulse-note">Registra al menos 2 snapshots para ver el pulso.</p>'; return; }
            const now = App.getValues(), nowT = Date.now(), DAY = 864e5;
            const refAt = d => { for (let i = H.length - 1; i >= 0; i--) if (nowT - new Date(H[i].fecha) >= d * DAY) return H[i]; return null; };
            const sgn = n => n >= 0 ? "+" : "−";
            const cls = n => n >= 0 ? "gain" : "loss";
            const ageOf = r => Math.round((nowT - new Date(r.fecha)) / DAY);
            const row = (label, ref, target) => {
                if (!ref || !(ref.total > 0)) return `<div class="pulse-row"><span>${label}</span><b>—</b></div>`;
                const age = ageOf(ref);
                if (target && age > target * 2) return `<div class="pulse-row"><span>${label}</span><small>sin snapshot</small></div>`;
                if (target && age > target * 1.25) label = `~${age} días`;
                const d = now.total - ref.total, p = d / ref.total * 100;
                return `<div class="pulse-row"><span>${label}</span><span class="${cls(d)}"><b>${sgn(d)}${UI.fmt(Math.abs(d))} €</b><small>${sgn(p)}${UI.fmt(Math.abs(p))}%</small></span></div>`;
            };
            let html = row("7 días", refAt(7), 7) + row("30 días", refAt(30), 30) + row("Desde inicio", H[0]);

            // Motor y lastre: qué cartera ha movido más el saldo en el periodo
            const ref = refAt(30) || H[0];
            const dias = Math.max(1, Math.round((nowT - new Date(ref.fecha)) / DAY));
            const labels = { bolsa: "Bolsa", fondos: "Fondos", indie: "Indie", epsv: "EPSV", efectivo: "Efectivo" };
            const deltas = Object.keys(labels).filter(k => ref[k] > 0).map(k => ({ k, d: (now[k] || 0) - ref[k] }));
            if (deltas.length) {
                deltas.sort((a, b) => b.d - a.d);
                const best = deltas[0], worst = deltas[deltas.length - 1];
                const chip = x => `<span class="${cls(x.d)}"><span class="pulse-dot" style="background:${Config.COLORES[x.k]}"></span>${labels[x.k]} <b>${sgn(x.d)}${UI.fmtK(Math.abs(x.d))} €</b></span>`;
                html += '<div class="pulse-sep"></div>';
                html += `<div class="pulse-row"><span>Motor · ${dias} d</span>${best.d > 0 ? chip(best) : "<b>—</b>"}</div>`;
                html += `<div class="pulse-row"><span>Lastre · ${dias} d</span>${worst.d < 0 ? chip(worst) : "<b>—</b>"}</div>`;
            }

            // Distancia al máximo histórico
            const peak = H.reduce((m, s) => s.total > m.total ? s : m, H[0]);
            html += '<div class="pulse-sep"></div>';
            if (now.total >= peak.total) {
                html += '<div class="pulse-row"><span>Máximo</span><span class="gain"><b>▲ En máximos</b></span></div>';
            } else {
                const gap = (now.total - peak.total) / peak.total * 100;
                const f = new Date(peak.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit" });
                html += `<div class="pulse-row"><span>Máximo</span><span><b class="loss">${UI.fmt(gap)}%</b><small>${UI.fmtK(peak.total)} · ${f}</small></span></div>`;
            }
            html += '<p class="pulse-note">Variación del saldo: incluye aportaciones y retiradas, no solo rentabilidad.</p>';
            el.innerHTML = html;
        } catch (e) { console.error("[Isukiza] drawPulse:", e); }
    },

    drawSnapTable() {
        const el = document.getElementById("snapTable"); if (!el) return;
        const histCount = document.getElementById("histCount");
        if (State.historial.length === 0) { el.innerHTML = '<p class="mono text-[9px] text-slate-700">Ningun registro todavia.</p>'; if (histCount) histCount.innerText = "0 registros guardados"; return; }
        if (histCount) histCount.innerText = `${State.historial.length} registro${State.historial.length !== 1 ? "s" : ""} guardado${State.historial.length !== 1 ? "s" : ""}`;
        el.innerHTML = State.historial.slice().reverse().map((s, idx) => {
            const realIdx = State.historial.length - 1 - idx;
            const fStr = new Date(s.fecha).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
            const bolsaHtml = (s.bolsa > 0) ? `<span class="mono text-[11px] text-blue-400">B: ${UI.fmtK(s.bolsa)}</span>` : "";
            return `<div class="flex items-center bg-slate-900/40 px-3 py-2 rounded-lg gap-2"><span class="mono text-[9px] text-slate-500 flex-shrink-0">${fStr}</span><div class="flex gap-3 flex-wrap flex-1 justify-end"><span class="mono text-[11px] text-cyan-400">C: ${UI.fmtK(s.efectivo||0)}</span>${bolsaHtml}<span class="mono text-[11px] text-violet-400">F: ${UI.fmtK(s.fondos)}</span><span class="mono text-[11px] text-emerald-400">I: ${UI.fmtK(s.indie)}</span><span class="mono text-[11px] text-rose-400">E: ${UI.fmtK(s.epsv)}</span><span class="mono text-[11px] text-green-400 font-bold">${UI.fmtK(s.total)} €</span></div><button onclick="App.borrarSnapshot(${realIdx})" style="background:transparent;border:1px solid #450a0a;color:#f87171;border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:JetBrains Mono,monospace;flex-shrink:0;">×</button></div>`;
        }).join("");
    }
};

// ══════════════════════════════════════════════════
// 8. MÓDULO PRINCIPAL (App)
// ══════════════════════════════════════════════════
const App = {
    init() {
        const pw = document.getElementById("masterPassword");
        if (pw) pw.addEventListener("keypress", e => { if (e.key === "Enter") this.unlock(); });
        const savedKey = localStorage.getItem("isukiza_master_key");
        if (savedKey) {
            State.masterKey = savedKey;
            const hasEncData = localStorage.getItem("isukiza_v4_enc");
            if (!hasEncData || Storage._load("isukiza_v4_enc") !== null) {
                try {
                    Storage.loadAll();
                    const modalAuth = document.getElementById("modalAuth");
                    if (modalAuth) modalAuth.style.display = "none";
                    setTimeout(() => {
                        try {
                            this.calculateAll();
                            UI.updateGlobalBtn();
                            Object.keys(Config.CARDS).forEach(id => UI.applyCollapse(id));
                            Finance.updateAllPrices();
                            setInterval(() => Finance.updateAllPrices(), 5 * 60 * 1000);
                            window.addEventListener("resize", () => UI.refreshCharts());
                            document.addEventListener("click", e => { if (e.target.id === "modalBolsa") UI.cerrarModal(); });
                            Cloud._updateSyncBadge();
                            setTimeout(() => Cloud.autoSync(), 1500);
                        } catch (e) { console.error("[Isukiza] Error init:", e); }
                    }, 50);
                } catch (e) {
                    localStorage.removeItem("isukiza_master_key");
                    State.masterKey = null;
                }
                return;
            }
            localStorage.removeItem("isukiza_master_key");
            State.masterKey = null;
        }
    },

    unlock() {
        const pass = document.getElementById("masterPassword").value;
        if (!pass) return;
        State.masterKey = pass;
        const hasEncData = localStorage.getItem("isukiza_v4_enc");
        if (hasEncData) {
            const testLoad = Storage._load("isukiza_v4_enc");
            if (!testLoad) { document.getElementById("authError").classList.remove("hidden"); State.masterKey = null; return; }
        }
        const remember = document.getElementById("rememberKey");
        if (remember && remember.checked) localStorage.setItem("isukiza_master_key", pass);
        else localStorage.removeItem("isukiza_master_key");
        Storage.loadAll();
        document.getElementById("modalAuth").style.display = "none";
        setTimeout(() => {
            this.calculateAll();
            UI.updateGlobalBtn();
            Object.keys(Config.CARDS).forEach(id => UI.applyCollapse(id));
            Finance.updateAllPrices();
            setInterval(() => Finance.updateAllPrices(), 5 * 60 * 1000);
            window.addEventListener("resize", () => UI.refreshCharts());
            document.addEventListener("click", e => { if (e.target.id === "modalBolsa") UI.cerrarModal(); });
            Cloud._updateSyncBadge();
            setTimeout(() => Cloud.autoSync(), 1500);
        }, 50);
    },

    getValues() {
        let bolsa = 0;
        State.acciones.forEach(a => { const sub = (State.precios[a.ticker]||0)*a.cant; bolsa += a.mon==="USD" ? sub*State.usd_eur : sub; });
        const f = this.getFondosTotals();
        const indie = (parseFloat(document.getElementById("indie_mer").value)||0) + (parseFloat(document.getElementById("indie_ef").value)||0);
        const vlp = parseFloat(document.getElementById("vlp").value)||0;
        const epsv = ((parseFloat(document.getElementById("p1").value)||0) + (parseFloat(document.getElementById("p2").value)||0)) * vlp;
        const efectivo = ["ef_abanca","ef_santander","ef_kutxa","ef_myinvestor","ef_traderepublic","ef_casa"]
            .reduce((acc, id) => { const el = document.getElementById(id); return acc + (el ? (parseFloat(el.value)||0) : 0); }, 0);
        return { bolsa, fondos: f.tMer, indie, epsv, efectivo, total: bolsa + f.tMer + indie + epsv + efectivo };
    },

    getFondosTotals() {
        let tInv = 0, tMer = 0;
        ["f1","f2"].forEach(id => {
            const part = parseFloat(document.getElementById(`${id}_part`).value)||0;
            tInv += part * (parseFloat(document.getElementById(`${id}_coste`).value)||0);
            tMer += part * (parseFloat(document.getElementById(`${id}_vl`).value)||0);
        });
        return { tInv, tMer };
    },

    calculateAll() {
        UI.updateFondoDOM("f1"); UI.updateFondoDOM("f2"); UI.updateTotalFondosDOM();
        UI.updateIndieDOM(); UI.updateEPSVDOM(); UI.updateEfectivoDOM();
        const v = this.getValues();
        document.getElementById("totalPatrimonio").innerText = v.total.toLocaleString("es-ES", { style:"currency", currency:"EUR" });
        const f = this.getFondosTotals(), ganF = f.tMer - f.tInv, rEl = document.getElementById("totalRentab");
        if (State.historial.length > 0) {
            const last = State.historial[State.historial.length-1], diff = v.total - last.total, diffPct = last.total > 0 ? diff/last.total*100 : 0, esG = diff >= 0;
            const lastFStr = new Date(last.fecha).toLocaleDateString("es-ES", { day:"2-digit", month:"2-digit", year:"2-digit" });
            rEl.className = `mono text-[10px] mt-1 ${esG ? "gain" : "loss"}`;
            rEl.innerText = `vs ${lastFStr}  ${esG?"+":""}${UI.fmt(diff)} € (${esG?"+":""}${diffPct.toFixed(2)}%)`;
        } else if (f.tInv > 0) {
            rEl.className = `mono text-[10px] mt-1 ${ganF>=0?"gain":"loss"}`;
            rEl.innerText = `Fondos: ${ganF>=0?"+":""}${UI.fmt(ganF)} € (${(ganF/f.tInv*100).toFixed(2)}%)`;
        } else { rEl.className = "mono text-[10px] mt-1 text-slate-600"; rEl.innerText = "Introduce VL y participaciones"; }
        UI.refreshCharts();
        UI.updateNav();
        if (State.colapsado["evolucion"]) UI.updateSummary("evolucion");
        Storage.saveData();
    },

    registrarSnapshot() {
        const v = this.getValues();
        if (v.total === 0) { UI.showToast("Introduce datos primero", "#7c2d12", "#f97316"); return; }
        State.historial.push({ fecha: new Date().toISOString(), total: v.total, bolsa: v.bolsa, fondos: v.fondos, indie: v.indie, epsv: v.epsv, efectivo: v.efectivo });
        Storage.saveHistorial(); UI.refreshCharts(); UI.showToast("Snapshot registrado");
        const card = document.querySelector("header .card");
        if (card) { card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash"); }
        const last = State.historial[State.historial.length-1];
        const ts = new Date(last.fecha).toLocaleString("es-ES", { day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit" });
        const sm = document.getElementById("snapMsg"); if (sm) sm.innerText = "Ultimo: " + ts;
        if (State.colapsado["evolucion"]) UI.updateSummary("evolucion");
    },

    borrarSnapshot(idx) {
        if (!confirm("Borrar este registro?")) return;
        State.historial.splice(idx, 1); Storage.saveHistorial(); UI.refreshCharts();
    },

    guardarModal() {
        const a = { nombre: document.getElementById("m_nombre").value.trim(), ticker: document.getElementById("m_ticker").value.trim().toUpperCase(), mon: document.getElementById("m_mon").value, cant: parseFloat(document.getElementById("m_cant").value)||0, coste: parseFloat(document.getElementById("m_coste").value)||0, inv: parseFloat(document.getElementById("m_inv").value)||0 };
        if (!a.nombre || !a.ticker) { alert("Introduce nombre y ticker."); return; }
        if (State._modalEditIdx === -1) { State.acciones.push(a); State.precios[a.ticker] = 0; }
        else { const old = State.acciones[State._modalEditIdx]; if (old.ticker !== a.ticker) { State.precios[a.ticker] = 0; delete State.precios[old.ticker]; } State.acciones[State._modalEditIdx] = a; }
        Storage.saveAcciones(); UI.cerrarModal(); Finance.updateAllPrices();
    },

    eliminarValor() {
        if (State._modalEditIdx < 0) return;
        if (!confirm(`Eliminar ${State.acciones[State._modalEditIdx].nombre}?`)) return;
        delete State.precios[State.acciones[State._modalEditIdx].ticker];
        State.acciones.splice(State._modalEditIdx, 1); Storage.saveAcciones(); UI.cerrarModal(); UI.renderBolsa(); this.calculateAll();
    },

    importarHistorialEvent(event) {
        const file = event.target.files[0]; if (!file) return;
        const reader = new FileReader(); reader.onload = (e) => this.importarJSON(e.target.result); reader.readAsText(file);
    },

    importarJSON(jsonStr) {
        try {
            let data = JSON.parse(jsonStr);
            const processHistorial = hist => hist.map(s => ({ fecha: s.fecha||new Date().toISOString(), total: parseFloat(s.total)||0, bolsa: parseFloat(s.bolsa)||0, fondos: parseFloat(s.fondos)||0, indie: parseFloat(s.indie)||0, epsv: parseFloat(s.epsv)||0, efectivo: parseFloat(s.efectivo)||0 }));
            const allKeys = ["f1_vl","f1_part","f1_coste","f2_vl","f2_part","f2_coste","indie_mer","indie_inv","indie_ef","p1","p2","vlp","ef_abanca","ef_santander","ef_kutxa","ef_myinvestor","ef_traderepublic","ef_casa"];
            if (Array.isArray(data)) {
                State.historial = processHistorial(data); Storage.saveHistorial(); UI.showToast("Historial importado");
            } else {
                if (data.acciones)  State.acciones  = data.acciones;
                if (data.historial) State.historial = processHistorial(data.historial);
                allKeys.forEach(k => { if (data[k] !== undefined && data[k] !== null) { const el = document.getElementById(k); if (el) el.value = data[k]; } });
                if (data.vlp) { const vlp_m = document.getElementById("vlp_m"); if (vlp_m) vlp_m.value = data.vlp; }
                Storage.saveData(); Storage.saveHistorial(); Storage.saveAcciones();
                const fecha = data._fecha ? new Date(data._fecha).toLocaleDateString("es-ES") : "";
                UI.showToast(fecha ? `Backup importado (${fecha})` : "Configuracion importada");
            }
            Storage.loadAll();
            UI.updateEfectivoDOM(); UI.updateFondoDOM("f1"); UI.updateFondoDOM("f2"); UI.updateIndieDOM(); UI.updateEPSVDOM();
            this.calculateAll(); UI.renderBolsa(); UI.refreshCharts();
            const imp = document.getElementById("importFile"); if (imp) imp.value = "";
        } catch (e) { alert("Error al importar JSON: " + e.message); }
    },

    exportarHistorial() {
        const d = Storage._load("isukiza_v4_enc") || {};
        const exportData = { _version: 2, _fecha: new Date().toISOString(), _device: navigator.userAgent.includes("Mobile") ? "movil" : "escritorio", historial: State.historial, acciones: State.acciones, f1_vl: d.f1_vl, f1_part: d.f1_part, f1_coste: d.f1_coste, f2_vl: d.f2_vl, f2_part: d.f2_part, f2_coste: d.f2_coste, indie_mer: d.indie_mer, indie_inv: d.indie_inv, indie_ef: d.indie_ef, p1: d.p1, p2: d.p2, vlp: d.vlp, ef_abanca: d.ef_abanca, ef_santander: d.ef_santander, ef_kutxa: d.ef_kutxa, ef_myinvestor: d.ef_myinvestor, ef_traderepublic: d.ef_traderepublic, ef_casa: d.ef_casa };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob), a = document.createElement("a");
        a.href = url; a.download = `isukiza_backup_${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(url);
        UI.showToast("Backup exportado");
    },

    borrarHistorial() {
        if (!confirm("Borrar TODO el historial? Esta accion no se puede deshacer.")) return;
        State.historial = []; Storage.saveHistorial(); this.calculateAll(); UI.showToast("Historial borrado", "#450a0a", "#f87171");
    },

    olvidarDispositivo() {
        localStorage.removeItem("isukiza_master_key");
        UI.showToast("Dispositivo olvidado", "#1e293b", "#94a3b8");
    }
};

// ══════════════════════════════════════════════════
// Inicialización + exponer al window
// ══════════════════════════════════════════════════
window.onload = () => App.init();

window.toggleCard        = id  => UI.toggleCard(id);
window.toggleAll         = ()  => UI.toggleAll();
window.selectPanel       = id  => UI.selectPanel(id);
window.registrarSnapshot = ()  => App.registrarSnapshot();
window.abrirModal        = idx => UI.abrirModal(idx);
window.cerrarModal       = ()  => UI.cerrarModal();
window.guardarModal      = ()  => App.guardarModal();
window.eliminarValor     = ()  => App.eliminarValor();
window.calcFondo         = ()  => App.calculateAll();
window.calcIndie         = ()  => App.calculateAll();
window.calcEPSV          = ()  => App.calculateAll();
window.calcEfectivo      = ()  => App.calculateAll();
window.syncVLP = val => { document.getElementById("vlp").value = val; document.getElementById("vlp_m").value = val; App.calculateAll(); };
window.marcarTS = () => { document.getElementById("fondosTimestamp").innerText = "VL " + new Date().toLocaleString("es-ES", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" }); Storage.saveData(); };
window.setTab = tab => { State.tabActiva = tab; ["total","bolsa","fondos","indie","epsv","efectivo"].forEach(t => { const el = document.getElementById(`tab-${t}`); if (el) el.classList.toggle("active", t===tab); }); Charts.drawBigChart(); };
window.modalSyncCosteToInv = () => { const c = parseFloat(document.getElementById("m_coste").value)||0, n = parseFloat(document.getElementById("m_cant").value)||0; if (c&&n) document.getElementById("m_inv").value = (c*n).toFixed(2); };
window.modalSyncInvToCoste = () => { const inv = parseFloat(document.getElementById("m_inv").value)||0, n = parseFloat(document.getElementById("m_cant").value)||0; if (inv&&n) document.getElementById("m_coste").value = (inv/n).toFixed(4); };
window.modalSyncCantCoste  = () => { const c = parseFloat(document.getElementById("m_coste").value)||0, n = parseFloat(document.getElementById("m_cant").value)||0; if (c&&n) document.getElementById("m_inv").value = (c*n).toFixed(2); };

window.App   = App;
window.UI    = UI;
window.Cloud = Cloud;
window.olvidarDispositivo = () => App.olvidarDispositivo();

// Esc cierra la cartera abierta y vuelve a mostrar la distribución
document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || !State.panelActivo) return;
    if (document.querySelector(".modal-overlay.open")) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    UI.selectPanel(null);
});

// ── Historial de snapshots plegable (se recuerda la preferencia) ──
window.toggleHistorial = function (force) {
    const el = document.getElementById("snapTable"), b = document.getElementById("histToggle");
    if (!el || !b) return;
    const open = typeof force === "boolean" ? force : el.classList.contains("is-hidden");
    el.classList.toggle("is-hidden", !open);
    b.classList.toggle("closed", !open);
    b.setAttribute("aria-expanded", String(open));
    try { localStorage.setItem("isukiza_hist_open", open ? "1" : "0"); } catch (e) {}
};
try { if (localStorage.getItem("isukiza_hist_open") === "0") window.toggleHistorial(false); } catch (e) {}
