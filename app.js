/**
 * PATRIMONIO FAMILIAR ISUKIZA - MODULAR JS + ENCRYPTION + FAITHFUL IMPORT
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
    CARDS: {
        bolsa:     { body: "body-bolsa",     card: "card-bolsa"    },
        fondos:    { body: "body-fondos",    card: "card-fondos"   },
        indie:     { body: "body-indie",     card: "card-indie"    },
        efectivo:  { body: "body-efectivo",  card: "card-efectivo" },
        epsv:      { body: "body-epsv",      card: "card-epsv"     },
        treemap:   { body: "body-treemap",   card: "card-treemap"  },
        evolucion: { body: "body-evolucion", card: "card-total"    }
    },
    COLORES: {
        total: "#4ade80", efectivo: "#22d3ee", fondos: "#a78bfa", indie: "#34d399", epsv: "#fb7185"
    },
    TREEMAP_CATS: [
        { key: 'bolsa',    label: 'Bolsa',    color: '#3b82f6' },
        { key: 'fondos',   label: 'Fondos',   color: '#8b5cf6' },
        { key: 'indie',    label: 'Indie',    color: '#10b981' },
        { key: 'epsv',     label: 'EPSV',     color: '#f43f5e' },
        { key: 'efectivo', label: 'Efectivo', color: '#06b6d4' }
    ],
    PROXIES: [
        url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ]
};

// ══════════════════════════════════════════════════
// 2. ESTADO GLOBAL
// ══════════════════════════════════════════════════
let State = {
    acciones: [],
    precios: {},
    usd_eur: 0.92,
    historial: [],
    tabActiva: "total",
    colapsado: {},
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
        const data = {
            f1_vl: document.getElementById("f1_vl").value,
            f1_part: document.getElementById("f1_part").value,
            f1_coste: document.getElementById("f1_coste").value,
            f2_vl: document.getElementById("f2_vl").value,
            f2_part: document.getElementById("f2_part").value,
            f2_coste: document.getElementById("f2_coste").value,
            indie_mer: document.getElementById("indie_mer").value,
            indie_inv: document.getElementById("indie_inv").value,
            indie_ef:  document.getElementById("indie_ef").value,
            p1: document.getElementById("p1").value,
            p2: document.getElementById("p2").value,
            vlp: document.getElementById("vlp").value,
            ef_abanca:    document.getElementById("ef_abanca").value,
            ef_santander: document.getElementById("ef_santander").value,
            ef_kutxa:     document.getElementById("ef_kutxa").value,
            ef_myinvestor:document.getElementById("ef_myinvestor").value,
            ef_casa:      document.getElementById("ef_casa").value,
            ts:  document.getElementById("fondosTimestamp").innerText
        };
        this._save("isukiza_v4_enc", data);
    },

    saveHistorial() { this._save("isukiza_hist_enc", State.historial); },
    saveAcciones() { this._save("isukiza_acciones_enc", State.acciones); },
    saveCollapseState() { localStorage.setItem("isukiza_collapse", JSON.stringify(State.colapsado)); },

    loadAll() {
        let d = this._load("isukiza_v4_enc");
        if (!d && localStorage.getItem("isukiza_v4")) {
            try {
                d = JSON.parse(localStorage.getItem("isukiza_v4"));
                State.historial = JSON.parse(localStorage.getItem("isukiza_hist") || "[]");
                State.acciones = JSON.parse(localStorage.getItem("isukiza_acciones") || JSON.stringify(Config.ACCIONES_DEFAULT));
                this.saveData(); this.saveHistorial(); this.saveAcciones();
            } catch(e) {}
        } else {
            d = d || {};
            State.historial = this._load("isukiza_hist_enc") || [];
            State.acciones = this._load("isukiza_acciones_enc") || Config.ACCIONES_DEFAULT;
        }

        const setVal = (id, val) => { const el = document.getElementById(id); if(el && val !== undefined) el.value = val; };
        setVal("f1_vl", d.f1_vl); setVal("f1_part", d.f1_part); setVal("f1_coste", d.f1_coste);
        setVal("f2_vl", d.f2_vl); setVal("f2_part", d.f2_part); setVal("f2_coste", d.f2_coste);
        setVal("indie_mer", d.indie_mer); setVal("indie_inv", d.indie_inv); setVal("indie_ef", d.indie_ef);
        setVal("ef_abanca", d.ef_abanca); setVal("ef_santander", d.ef_santander);
        setVal("ef_kutxa", d.ef_kutxa); setVal("ef_myinvestor", d.ef_myinvestor); setVal("ef_casa", d.ef_casa);
        setVal("p1", d.p1 || "1376.6933"); setVal("p2", d.p2 || "1975.6095"); setVal("vlp", d.vlp);
        if (document.getElementById("vlp_m")) document.getElementById("vlp_m").value = d.vlp || "";
        if (d.ts) document.getElementById("fondosTimestamp").innerText = d.ts;

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
                const response = await fetch(proxyUrl);
                const data = await response.json();
                return this.extractPrice(data);
            } catch (e) { }
        }
        throw new Error(`Fallo total para ${ticker}`);
    },
    extractPrice(data) {
        let contents = data.contents ? JSON.parse(data.contents) : data;
        const meta = contents.chart.result[0].meta;
        let p = meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose || 0;
        return p || 0;
    },
    async updateAllPrices() {
        UI.setStatus("Actualizando bolsa...", "amber");
        try { const v = await this.fetchPrice("EURUSD=X"); State.usd_eur = 1 / v; } catch (e) { State.usd_eur = 0.92; }
        const promises = State.acciones.map(async a => {
            try { State.precios[a.ticker] = await this.fetchPrice(a.ticker); } catch (e) {}
        });
        await Promise.all(promises);
        document.getElementById("bolsaStatus").innerText = "live";
        UI.setStatus(`Bolsa actualizada ${new Date().toLocaleTimeString("es-ES")}`, "green");
        UI.renderBolsa();
        App.calculateAll();
    }
};

// ══════════════════════════════════════════════════
// 6. MÓDULO DE INTERFAZ (UI)
// ══════════════════════════════════════════════════
const UI = {
    fmt(n) { return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
    fmtK(n) {
        if (!n) return "0";
        if (Math.abs(n) >= 1000) return (n / 1000).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "k";
        return (n || 0).toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    },
    setStatus(msg, color) {
        const s = document.getElementById("status");
        const map = { amber: "text-amber-400", green: "text-green-400", red: "text-red-400" };
        s.className = `mono text-[10px] mt-2 ${map[color] || "text-slate-400"}`;
        s.innerText = msg;
    },
    showToast(msg, bg = "#14532d", color = "#4ade80") {
        const t = document.getElementById("snapToast");
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
    applyCollapse(id) {
        const cfg = Config.CARDS[id];
        if (!cfg) return;
        const body = document.getElementById(cfg.body);
        const card = document.getElementById(cfg.card);
        const btn = card ? card.querySelector(".collapse-btn") : null;
        const sum = document.getElementById(`summary-${id}`);
        if (!body) return;
        if (State.colapsado[id]) {
            body.classList.add("collapsed");
            if (btn) btn.textContent = "▼";
            if (sum) { sum.style.display = "inline"; this.updateSummary(id); }
            if (card) card.style.paddingBottom = "16px";
        } else {
            body.classList.remove("collapsed");
            if (btn) btn.textContent = "▲";
            if (sum) sum.style.display = "none";
            if (card) card.style.paddingBottom = "";
            setTimeout(() => { this.refreshCharts(); }, 50);
        }
    },
    updateSummary(id) {
        const el = document.getElementById(`summary-${id}`);
        if (!el) return;
        const v = App.getValues();
        let txt = "";
        switch (id) {
            case "bolsa": txt = v.bolsa > 0 ? this.fmt(v.bolsa) + " €" : "—"; break;
            case "fondos":
                txt = v.fondos > 0 ? this.fmt(v.fondos) + " €" : "—";
                const fTotals = App.getFondosTotals();
                if (fTotals.tInv > 0) {
                    const ganF = fTotals.tMer - fTotals.tInv;
                    txt += `  ${ganF >= 0 ? "+" : ""}${(ganF / fTotals.tInv * 100).toFixed(2)}%`;
                }
                break;
            case "indie": txt = v.indie > 0 ? this.fmt(v.indie) + " €" : "—"; break;
            case "efectivo": txt = v.efectivo > 0 ? this.fmt(v.efectivo) + " €" : "—"; break;
            case "epsv": txt = v.epsv > 0 ? this.fmt(v.epsv) + " €" : "—"; break;
            case "treemap": txt = v.total > 0 ? this.fmt(v.total) + " € total" : "—"; break;
            case "evolucion": txt = `${State.historial.length} snapshot${State.historial.length !== 1 ? "s" : ""}`; break;
        }
        el.textContent = txt;
    },
    updateGlobalBtn() {
        const btn = document.getElementById("btnCollapseAll");
        if (!btn) return;
        const allCollapsed = Object.keys(Config.CARDS).every(id => State.colapsado[id]);
        btn.textContent = allCollapsed ? "▼ Expandir todo" : "▲ Contraer todo";
        btn.classList.toggle("all-collapsed", allCollapsed);
    },
    renderBolsa() {
        const list = document.getElementById("listaAcciones");
        if (!State.acciones.length) {
            list.innerHTML = '<p class="mono text-[9px] text-slate-600 text-center py-4">Sin valores. Pulsa + para añadir.</p>';
            return;
        }
        let totalBolsaInv = 0, totalBolsaMer = 0;
        list.innerHTML = State.acciones.map((a, idx) => {
            const price = State.precios[a.ticker] || 0;
            const sub = price * a.cant;
            const subEur = a.mon === "USD" ? sub * State.usd_eur : sub;
            const invRaw = parseFloat(a.inv) || (parseFloat(a.coste) * a.cant) || 0;
            const invEur = a.mon === "USD" ? invRaw * State.usd_eur : invRaw;
            const gan = subEur - invEur;
            const ganPct = invEur > 0 ? gan / invEur * 100 : 0;
            const esG = gan >= 0;
            totalBolsaInv += invEur; totalBolsaMer += subEur;
            const rentHTML = invEur > 0 ? `
                <div class="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-1 mt-2">
                    <span class="mono text-[11px] text-slate-500">Rentabilidad</span>
                    <span class="mono text-sm font-bold ${esG ? "gain" : "loss"}">
                        ${esG ? "+" : ""}${this.fmt(gan)} € (${esG ? "+" : ""}${ganPct.toFixed(2)}%)
                    </span>
                </div>` : "";
            return `
                <div class="bg-slate-900/40 p-3 rounded-xl border border-slate-800 hover:border-blue-700/40 transition-all">
                    <div class="flex justify-between items-center">
                        <div>
                            <a href="https://finance.yahoo.com/quote/${a.ticker}" target="_blank" class="font-bold text-slate-200 hover:text-blue-400 text-sm">
                                ${a.nombre} <span class="text-blue-500 text-[9px]">&#8599;</span>
                            </a>
                            <p class="mono text-[9px] text-slate-500 mt-0.5">${a.cant} uds · ${price.toFixed(2)} ${a.mon}</p>
                        </div>
                        <div class="flex items-center gap-2">
                            <div class="text-right">
                                <p class="mono text-base font-bold text-blue-300">${this.fmt(subEur)} &euro;</p>
                                ${a.mon === "USD" ? `<p class="mono text-[8px] text-slate-600">${this.fmt(sub)} ${a.mon}</p>` : ""}
                            </div>
                            <button onclick="UI.abrirModal(${idx})" style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;flex-shrink:0;">✏️</button>
                        </div>
                    </div>
                    ${rentHTML}
                </div>`;
        }).join("");
        const ganT = totalBolsaMer - totalBolsaInv;
        const esGT = ganT >= 0;
        const footer = document.getElementById("bolsaFooter");
        if (footer) {
            footer.innerHTML = `
                <span class="mono text-[9px] text-slate-600 uppercase">Total bolsa</span>
                <div class="text-right">
                    <p class="mono text-base font-bold text-blue-300">${this.fmt(totalBolsaMer)} €</p>
                    ${totalBolsaInv > 0 ? `<p class="mono text-[9px] ${esGT ? "gain" : "loss"}">${esGT ? "+" : ""}${this.fmt(ganT)} € (${esGT ? "+" : ""}${(ganT / totalBolsaInv * 100).toFixed(2)}%)</p>` : ""}
                </div>`;
        }
    },
    abrirModal(idx) {
        State._modalEditIdx = idx;
        const a = idx === -1 ? { nombre: "", ticker: "", mon: "EUR", cant: "", coste: "", inv: "" } : State.acciones[idx];
        document.getElementById("modalTitle").innerText = idx === -1 ? "Añadir valor" : `Editar: ${a.nombre}`;
        document.getElementById("m_nombre").value = a.nombre;
        document.getElementById("m_ticker").value = a.ticker;
        document.getElementById("m_mon").value = a.mon;
        document.getElementById("m_cant").value = a.cant;
        document.getElementById("m_coste").value = a.coste;
        document.getElementById("m_inv").value = a.inv;
        document.getElementById("m_eliminar").style.display = idx === -1 ? "none" : "block";
        document.getElementById("modalBolsa").classList.add("open");
    },
    cerrarModal() { document.getElementById("modalBolsa").classList.remove("open"); },
    refreshCharts() {
        Charts.drawTreemap();
        Charts.drawSparkline("spark-fondos", "fondos", Config.COLORES.fondos, "tip-fondos");
        Charts.drawSparkline("spark-indie",  "indie",  Config.COLORES.indie,  "tip-indie");
        Charts.drawSparkline("spark-epsv",   "epsv",   Config.COLORES.epsv,   "tip-epsv");
        Charts.drawSparkline("spark-ef",     "efectivo", Config.COLORES.efectivo, "tip-ef");
        Charts.drawBigChart();
        Charts.drawSnapTable();
    }
};

// ══════════════════════════════════════════════════
// 7. MÓDULO DE GRÁFICAS (Charts)
// ══════════════════════════════════════════════════
const Charts = {
    makePath(data, W, H, color, filled) {
        if (data.length < 2) return "";
        const min = Math.min(...data); const max = Math.max(...data);
        const rng = max - min || 1; const pad = 4; const h = H - pad * 2;
        const xs = data.map((_, i) => pad + i * (W - pad * 2) / (data.length - 1));
        const ys = data.map(v => pad + h - (v - min) / rng * h);
        let d = `M ${xs[0]} ${ys[0]}`;
        for (let i = 1; i < xs.length; i++) {
            const mx = (xs[i - 1] + xs[i]) / 2;
            d += ` C ${mx} ${ys[i - 1]} ${mx} ${ys[i]} ${xs[i]} ${ys[i]}`;
        }
        let path = `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
        if (filled) {
            const area = `${d} L ${xs[xs.length - 1]} ${H - pad} L ${xs[0]} ${H - pad} Z`;
            path = `<path d="${area}" fill="${color}" fill-opacity="0.08"/>${path}`;
        }
        return { svg: path, xs, ys };
    },
    drawSparkline(svgId, field, color, tipId) {
        const svg = document.getElementById(svgId);
        if (!svg) return;
        const W = svg.clientWidth || svg.parentElement.clientWidth || 300;
        const H = 48;
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        const data = State.historial.map(s => s[field] || 0);
        // Solo dibujamos si hay datos y no son todos cero
        if (data.length < 2 || data.every(v => v === 0)) {
            svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#334155" font-size="9">Sin datos</text>';
            return;
        }
        const r = this.makePath(data, W, H, color, true);
        svg.innerHTML = r.svg;
    },
    drawTreemap() {
        const svg = document.getElementById('treemap-svg');
        if (!svg) return;
        svg.innerHTML = '';
        const v = App.getValues();
        if (v.total <= 0) return;
        const items = Config.TREEMAP_CATS.map(c => ({ ...c, value: v[c.key] || 0 })).filter(i => i.value > 0);
        const CX = 110, CY = 110, R = 90, ri = 54, GAP = 0.022;
        let angle = -Math.PI / 2;
        items.forEach(item => {
            const slice = (item.value / v.total) * Math.PI * 2;
            const end = angle + slice - GAP;
            const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
            const x2 = CX + R * Math.cos(end), y2 = CY + R * Math.sin(end);
            const x3 = CX + ri * Math.cos(end), y3 = CY + ri * Math.sin(end);
            const x4 = CX + ri * Math.cos(angle), y4 = CY + ri * Math.sin(angle);
            const lg = slice > Math.PI ? 1 : 0;
            const d = `M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${x3} ${y3} A ${ri} ${ri} 0 ${lg} 0 ${x4} ${y4} Z`;
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d); path.setAttribute('fill', item.color);
            path.setAttribute('fill-opacity', '0.82');
            svg.appendChild(path);
            angle += slice;
        });
    },
    drawBigChart() {
        const svg = document.getElementById("chart-big");
        if (!svg) return;
        const W = svg.clientWidth || 600; const H = 200;
        svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
        const data = State.historial.map(s => s[State.tabActiva] || 0);
        if (data.length < 2) {
            svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" fill="#334155">Registra snapshots</text>';
            return;
        }
        const r = this.makePath(data, W, H, Config.COLORES[State.tabActiva], true);
        svg.innerHTML = r.svg;
    },
    drawSnapTable() {
        const el = document.getElementById("snapTable");
        if (!el) return;
        if (State.historial.length === 0) {
            el.innerHTML = '<p class="mono text-[9px] text-slate-700">Ningún registro todavía.</p>';
            return;
        }
        const rows = State.historial.slice().reverse().map((s, idx) => {
            const realIdx = State.historial.length - 1 - idx;
            const fStr = new Date(s.fecha).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
            // Aseguramos que el total se lea correctamente del objeto
            const totalVal = parseFloat(s.total) || 0;
            return `
                <div class="flex items-center bg-slate-900/40 px-3 py-2 rounded-lg gap-2">
                    <span class="mono text-[9px] text-slate-500">${fStr}</span>
                    <div class="flex gap-3 flex-1 justify-end">
                        <span class="mono text-[11px] text-green-400 font-bold">${UI.fmt(totalVal)} €</span>
                    </div>
                    <button onclick="App.borrarSnapshot(${realIdx})" style="background:transparent;border:1px solid #450a0a;color:#f87171;border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:JetBrains Mono,monospace;flex-shrink:0;">×</button>
                </div>`;
        });
        el.innerHTML = rows.join("");
    }
};

// ══════════════════════════════════════════════════
// 8. MÓDULO PRINCIPAL (App)
// ══════════════════════════════════════════════════
const App = {
    init() {
        document.getElementById("masterPassword").addEventListener("keypress", e => { if (e.key === "Enter") this.unlock(); });
    },

    unlock() {
        const pass = document.getElementById("masterPassword").value;
        if (!pass) return;
        State.masterKey = pass;
        const hasEncData = localStorage.getItem("isukiza_v4_enc");
        if (hasEncData) {
            const testLoad = Storage._load("isukiza_v4_enc");
            if (!testLoad) {
                document.getElementById("authError").classList.remove("hidden");
                State.masterKey = null;
                return;
            }
        }
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
        }, 50);
    },

    getValues() {
        let bolsa = 0;
        State.acciones.forEach(a => {
            const sub = (State.precios[a.ticker] || 0) * a.cant;
            bolsa += a.mon === "USD" ? sub * State.usd_eur : sub;
        });
        const f = this.getFondosTotals();
        const indie = (parseFloat(document.getElementById("indie_mer").value) || 0) + (parseFloat(document.getElementById("indie_ef").value) || 0);
        const vlp = parseFloat(document.getElementById("vlp").value) || 0;
        const epsv = ((parseFloat(document.getElementById("p1").value) || 0) + (parseFloat(document.getElementById("p2").value) || 0)) * vlp;
        const efectivo = ["ef_abanca", "ef_santander", "ef_kutxa", "ef_myinvestor", "ef_casa"]
            .reduce((acc, id) => acc + (parseFloat(document.getElementById(id).value) || 0), 0);
        return { bolsa, fondos: f.tMer, indie, epsv, efectivo, total: bolsa + f.tMer + indie + epsv + efectivo };
    },

    getFondosTotals() {
        let tInv = 0, tMer = 0;
        ["f1", "f2"].forEach(id => {
            const part = parseFloat(document.getElementById(`${id}_part`).value) || 0;
            tInv += part * (parseFloat(document.getElementById(`${id}_coste`).value) || 0);
            tMer += part * (parseFloat(document.getElementById(`${id}_vl`).value) || 0);
        });
        return { tInv, tMer };
    },

    calculateAll() {
        const v = this.getValues();
        document.getElementById("totalPatrimonio").innerText = v.total.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
        const f = this.getFondosTotals();
        const ganF = f.tMer - f.tInv;
        const rEl = document.getElementById("totalRentab");
        if (f.tInv > 0) {
            rEl.className = `mono text-[10px] mt-1 ${ganF >= 0 ? "gain" : "loss"}`;
            rEl.innerText = `Fondos: ${ganF >= 0 ? "+" : ""}${UI.fmt(ganF)} € (${(ganF / f.tInv * 100).toFixed(2)}%)`;
        }
        UI.refreshCharts();
        Object.keys(Config.CARDS).forEach(id => { if (State.colapsado[id]) UI.updateSummary(id); });
        Storage.saveData();
    },

    registrarSnapshot() {
        const v = this.getValues();
        if (v.total === 0) { UI.showToast("Introduce datos primero", "#7c2d12", "#f97316"); return; }
        State.historial.push({
            fecha: new Date().toISOString(),
            total: v.total, fondos: v.fondos, indie: v.indie, epsv: v.epsv, bolsa: v.bolsa, efectivo: v.efectivo
        });
        Storage.saveHistorial();
        UI.refreshCharts();
        UI.showToast("✓ Snapshot registrado");
    },

    borrarSnapshot(idx) {
        if (!confirm("¿Borrar este registro?")) return;
        State.historial.splice(idx, 1);
        Storage.saveHistorial();
        UI.refreshCharts();
    },

    guardarModal() {
        const a = {
            nombre: document.getElementById("m_nombre").value,
            ticker: document.getElementById("m_ticker").value.toUpperCase(),
            mon: document.getElementById("m_mon").value,
            cant: parseFloat(document.getElementById("m_cant").value) || 0,
            coste: parseFloat(document.getElementById("m_coste").value) || 0,
            inv: parseFloat(document.getElementById("m_inv").value) || 0
        };
        if (State._modalEditIdx === -1) State.acciones.push(a);
        else State.acciones[State._modalEditIdx] = a;
        Storage.saveAcciones();
        UI.cerrarModal();
        Finance.updateAllPrices();
    },

    eliminarValor() {
        if (State._modalEditIdx < 0) return;
        if (!confirm(`¿Eliminar ${State.acciones[State._modalEditIdx].nombre}?`)) return;
        State.acciones.splice(State._modalEditIdx, 1);
        Storage.saveAcciones();
        UI.cerrarModal();
        UI.renderBolsa();
        this.calculateAll();
    },

    importarHistorialEvent(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => this.importarJSON(e.target.result);
        reader.readAsText(file);
    },

    importarJSON(jsonStr) {
        try {
            let data = JSON.parse(jsonStr);
            
            const processHistorial = (hist) => {
                return hist.map(s => {
                    // Importación fiel: si el dato existe en el JSON, se usa. Si no, se pone 0.
                    return {
                        fecha: s.fecha || new Date().toISOString(),
                        total: parseFloat(s.total) || 0,
                        fondos: parseFloat(s.fondos) || 0,
                        indie: parseFloat(s.indie) || 0,
                        epsv: parseFloat(s.epsv) || 0,
                        bolsa: parseFloat(s.bolsa) || 0,
                        efectivo: parseFloat(s.efectivo) || 0
                    };
                });
            };

            if (Array.isArray(data)) {
                State.historial = processHistorial(data);
                Storage.saveHistorial();
                UI.showToast("✓ Historial importado fielmente");
            } else {
                if (data.acciones) State.acciones = data.acciones;
                if (data.historial) State.historial = processHistorial(data.historial);
                const keys = ["f1_vl", "f1_part", "f1_coste", "f2_vl", "f2_part", "f2_coste", "indie_mer", "indie_inv", "indie_ef", "p1", "p2", "vlp", "ef_abanca", "ef_santander", "ef_kutxa", "ef_myinvestor", "ef_casa"];
                keys.forEach(k => {
                    if (data[k] !== undefined) {
                        const el = document.getElementById(k);
                        if (el) el.value = data[k];
                    }
                });
                Storage.saveData();
                Storage.saveHistorial();
                Storage.saveAcciones();
                UI.showToast("✓ Configuración importada");
            }
            this.calculateAll();
            UI.renderBolsa();
            UI.refreshCharts();
            document.getElementById("importFile").value = "";
        } catch (e) { alert("Error al importar JSON: " + e.message); }
    },

    exportarHistorial() {
        const data = JSON.stringify(State.historial, null, 2);
        const blob = new Blob([data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `isukiza_historial_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    borrarHistorial() {
        if (!confirm("¿Borrar TODO el historial? Esta acción no se puede deshacer.")) return;
        State.historial = [];
        Storage.saveHistorial();
        this.calculateAll();
        UI.showToast("Historial borrado", "#450a0a", "#f87171");
    }
};

// Inicialización
window.onload = () => App.init();

// Exponer funciones al objeto window
window.toggleCard = (id) => UI.toggleCard(id);
window.toggleAll = () => UI.toggleAll();
window.registrarSnapshot = () => App.registrarSnapshot();
window.abrirModal = (idx) => UI.abrirModal(idx);
window.cerrarModal = () => UI.cerrarModal();
window.guardarModal = () => App.guardarModal();
window.eliminarValor = () => App.eliminarValor();
window.calcFondo = () => App.calculateAll();
window.calcIndie = () => App.calculateAll();
window.calcEPSV = () => App.calculateAll();
window.calcEfectivo = () => App.calculateAll();
window.marcarTS = () => {
    document.getElementById("fondosTimestamp").innerText = "VL " + new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    Storage.saveData();
};
window.setTab = (tab) => {
    State.tabActiva = tab;
    ["total", "fondos", "indie", "epsv", "efectivo"].forEach(t => {
        document.getElementById(`tab-${t}`).classList.toggle("active", t === tab);
    });
    Charts.drawBigChart();
};
window.App = App;
window.UI = UI;
