// ══════════════════════════════════════════════════
// CONFIG
// ══════════════════════════════════════════════════
var ACCIONES_DEFAULT = [
    { ticker: "AMZN",    nombre: "Amazon",    cant: 20,   mon: "USD", coste: 0, inv: 0 },
    { ticker: "SAN.MC",  nombre: "Santander", cant: 1080, mon: "EUR", coste: 0, inv: 0 },
    { ticker: "OHLA.MC", nombre: "OHLA",      cant: 300,  mon: "EUR", coste: 0, inv: 0 }
];
var acciones = [];
var precios  = {};
var usd_eur  = 0.92;
var historial = [];
var tabActiva = "total";

// ══════════════════════════════════════════════════
// COLLAPSIBLE CARDS
// ══════════════════════════════════════════════════
// IDs lógicos → ID del body y del card
var CARDS = {
    bolsa:     { body: "body-bolsa",     card: "card-bolsa"    },
    fondos:    { body: "body-fondos",    card: "card-fondos"   },
    indie:     { body: "body-indie",     card: "card-indie"    },
    efectivo:  { body: "body-efectivo",  card: "card-efectivo" },
    epsv:      { body: "body-epsv",      card: "card-epsv"     },
    treemap:   { body: "body-treemap",   card: "card-treemap"  },
    evolucion: { body: "body-evolucion", card: "card-total"    }
};
// Estado: true = colapsado
var colapsado = {};

function toggleCard(id) {
    colapsado[id] = !colapsado[id];
    applyCollapse(id);
    saveCollapseState();
    updateGlobalBtn();
}

function applyCollapse(id) {
    var cfg = CARDS[id];
    if (!cfg) return;
    var body = document.getElementById(cfg.body);
    var card = document.getElementById(cfg.card);
    var btn  = card ? card.querySelector(".collapse-btn") : null;
    var sum  = document.getElementById("summary-" + id);
    if (!body) return;

    if (colapsado[id]) {
        body.classList.add("collapsed");
        if (btn)  btn.textContent = "▼";
        if (sum)  { sum.style.display = "inline"; updateSummary(id); }
        // Reduce padding del card cuando colapsado
        if (card) card.style.paddingBottom = "16px";
    } else {
        body.classList.remove("collapsed");
        if (btn)  btn.textContent = "▲";
        if (sum)  sum.style.display = "none";
        if (card) card.style.paddingBottom = "";
        // Redibujar sparklines si se expande
        setTimeout(function(){ actualizarGraficas(); }, 50);
    }
}

function updateSummary(id) {
    var el = document.getElementById("summary-" + id);
    if (!el) return;
    var v = getValues();
    var txt = "";
    switch(id) {
        case "bolsa":
            txt = v.bolsa > 0 ? fmt(v.bolsa) + " €" : "—";
            break;
        case "fondos":
            txt = v.fondos > 0 ? fmt(v.fondos) + " €" : "—";
            // añadir rentabilidad si existe
            var tInv=0, tMer=0;
            ["f1","f2"].forEach(function(fid){
                tInv += (parseFloat(document.getElementById(fid+"_part").value)||0)*(parseFloat(document.getElementById(fid+"_coste").value)||0);
                tMer += (parseFloat(document.getElementById(fid+"_part").value)||0)*(parseFloat(document.getElementById(fid+"_vl").value)||0);
            });
            if (tInv > 0) {
                var ganF = tMer-tInv, pctF = ganF/tInv*100;
                txt += "  " + (ganF>=0?"+":"") + pctF.toFixed(2) + "%";
            }
            break;
        case "indie":
            txt = v.indie > 0 ? fmt(v.indie) + " €" : "—";
            break;
        case "efectivo":
            txt = v.efectivo > 0 ? fmt(v.efectivo) + " €" : "—";
            break;
        case "epsv":
            txt = v.epsv > 0 ? fmt(v.epsv) + " €" : "—";
            break;
        case "treemap":
            txt = v.total > 0 ? fmt(v.total) + " € total" : "—";
            break;
        case "evolucion":
            txt = historial.length + " snapshot" + (historial.length!==1?"s":"");
            break;
    }
    el.textContent = txt;
}

function toggleAll() {
    var allCollapsed = Object.keys(CARDS).every(function(id){ return colapsado[id]; });
    Object.keys(CARDS).forEach(function(id){
        colapsado[id] = !allCollapsed;
        applyCollapse(id);
    });
    saveCollapseState();
    updateGlobalBtn();
}

function updateGlobalBtn() {
    var btn = document.getElementById("btnCollapseAll");
    if (!btn) return;
    var allCollapsed = Object.keys(CARDS).every(function(id){ return colapsado[id]; });
    if (allCollapsed) {
        btn.textContent = "▼ Expandir todo";
        btn.classList.add("all-collapsed");
    } else {
        btn.textContent = "▲ Contraer todo";
        btn.classList.remove("all-collapsed");
    }
}

function saveCollapseState() {
    localStorage.setItem("isukiza_collapse", JSON.stringify(colapsado));
}

function loadCollapseState() {
    var raw = localStorage.getItem("isukiza_collapse");
    colapsado = raw ? JSON.parse(raw) : {};
    // Por defecto todo expandido — solo aplicar si hay algo guardado
    Object.keys(CARDS).forEach(function(id){
        if (colapsado[id] === undefined) colapsado[id] = false;
        applyCollapse(id);
    });
    updateGlobalBtn();
}

// ══════════════════════════════════════════════════
// FETCH BOLSA
// ══════════════════════════════════════════════════
var PROXIES = [
    function(url){ return "https://api.allorigins.win/get?url=" + encodeURIComponent(url); },
    function(url){ return "https://corsproxy.io/?" + encodeURIComponent(url); },
    function(url){ return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url); }
];

function extraerPrecio(text) {
    var data = typeof text === "string" ? JSON.parse(text) : text;
    if (data.contents) data = JSON.parse(data.contents);
    var meta = data.chart.result[0].meta;
    var p = meta.regularMarketPrice;
    if (!p || p === 0) p = meta.previousClose || meta.chartPreviousClose || 0;
    if (!p || p === 0) throw new Error("Precio cero");
    return p;
}

function fetchConTimeout(url, ms) {
    ms = ms || 6000;
    return new Promise(function(resolve, reject) {
        var timer = setTimeout(function(){ reject(new Error("timeout")); }, ms);
        fetch(url).then(function(r){
            clearTimeout(timer);
            resolve(r);
        }).catch(function(e){
            clearTimeout(timer);
            reject(e);
        });
    });
}

function fetchPrice(ticker) {
    var yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker;
    function intentar(idx) {
        if (idx >= PROXIES.length) return Promise.reject(new Error("Todos los proxies fallaron para " + ticker));
        var proxyUrl = PROXIES[idx](yahooUrl);
        return fetchConTimeout(proxyUrl, 7000)
            .then(function(r){ return r.json(); })
            .then(function(j){ return extraerPrecio(j); })
            .catch(function(e){
                console.warn("Proxy " + idx + " fallo para " + ticker + ": " + e.message);
                return intentar(idx + 1);
            });
    }
    return intentar(0);
}

function fetchAllPrices() {
    setStatus("Actualizando bolsa...", "amber");
    fetchPrice("EURUSD=X")
        .then(function(v){ usd_eur = 1 / v; })
        .catch(function(){ usd_eur = 0.92; })
        .then(function(){
            return Promise.all(acciones.map(function(a){
                return fetchPrice(a.ticker)
                    .then(function(p){ precios[a.ticker] = p; })
                    .catch(function(e){ console.warn("Sin precio para " + a.ticker + ": " + e.message); });
            }));
        })
        .then(function(){
            document.getElementById("bolsaStatus").innerText = "live";
            setStatus("Bolsa actualizada  " + new Date().toLocaleTimeString("es-ES"), "green");
            try { renderBolsa(); } catch(e){ console.error("renderBolsa error:", e); }
            try { calcTotal();   } catch(e){ console.error("calcTotal error:",   e); }
        })
        .catch(function(e){
            console.warn("fetchAllPrices error:", e);
            try { renderBolsa(); } catch(e2){}
            try { calcTotal();   } catch(e2){}
            document.getElementById("bolsaStatus").innerText = "parcial";
            setStatus("Bolsa: algunos precios no disponibles", "amber");
        });
}

// ══════════════════════════════════════════════════
// RENDER BOLSA
// ══════════════════════════════════════════════════
function renderBolsa() {
    var list = document.getElementById("listaAcciones");
    if (!acciones.length) {
        list.innerHTML = '<p class="mono text-[9px] text-slate-600 text-center py-4">Sin valores. Pulsa + para añadir.</p>';
        return;
    }
    var totalBolsaInv = 0, totalBolsaMer = 0;
    list.innerHTML = acciones.map(function(a, idx){
        var price   = precios[a.ticker] || 0;
        var sub     = price * a.cant;
        var subEur  = a.mon === "USD" ? sub * usd_eur : sub;
        var invRaw  = parseFloat(a.inv) || (parseFloat(a.coste) * a.cant) || 0;
        var invEur  = a.mon === "USD" ? invRaw * usd_eur : invRaw;
        var gan     = subEur - invEur;
        var ganPct  = invEur > 0 ? gan / invEur * 100 : 0;
        var esG     = gan >= 0;
        totalBolsaInv += invEur;
        totalBolsaMer += subEur;
        var link = "https://finance.yahoo.com/quote/" + a.ticker;
        var rentHTML = invEur > 0
            ? '<div class="flex justify-between items-center bg-slate-800/50 rounded-lg px-3 py-1 mt-2">'
              + '<span class="mono text-[11px] text-slate-500">Rentabilidad</span>'
              + '<span class="mono text-sm font-bold ' + (esG?"gain":"loss") + '">'
              + (esG?"+":"") + fmt(gan) + " € (" + (esG?"+":"") + ganPct.toFixed(2) + "%)</span></div>"
            : "";
        return '<div class="bg-slate-900/40 p-3 rounded-xl border border-slate-800 hover:border-blue-700/40 transition-all">'
            + '<div class="flex justify-between items-center">'
            + '<div><a href="' + link + '" target="_blank" class="font-bold text-slate-200 hover:text-blue-400 text-sm">'
            + a.nombre + ' <span class="text-blue-500 text-[9px]">&#8599;</span></a>'
            + '<p class="mono text-[9px] text-slate-500 mt-0.5">' + a.cant + ' uds · ' + price.toFixed(2) + ' ' + a.mon + '</p></div>'
            + '<div class="flex items-center gap-2">'
            + '<div class="text-right"><p class="mono text-base font-bold text-blue-300">' + fmt(subEur) + ' &euro;</p>'
            + (a.mon === "USD" ? '<p class="mono text-[8px] text-slate-600">' + fmt(sub) + ' ' + a.mon + '</p>' : "")
            + '</div>'
            + '<button onclick="abrirModal(' + idx + ')" title="Editar"'
            + ' style="background:#1e293b;border:1px solid #334155;color:#94a3b8;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;flex-shrink:0;">✏️</button>'
            + '</div></div>'
            + rentHTML
            + '</div>';
    }).join("");
    var ganT    = totalBolsaMer - totalBolsaInv;
    var ganPctT = totalBolsaInv > 0 ? ganT / totalBolsaInv * 100 : 0;
    var esGT    = ganT >= 0;
    var footer  = document.getElementById("bolsaFooter");
    if (footer) {
        footer.className = "mt-3 pt-3 border-t border-slate-800 flex justify-between items-center";
        footer.innerHTML = '<span class="mono text-[9px] text-slate-600 uppercase">Total bolsa</span>'
            + '<div class="text-right">'
            + '<p class="mono text-base font-bold text-blue-300">' + fmt(totalBolsaMer) + ' €</p>'
            + (totalBolsaInv > 0 ? '<p class="mono text-[9px] ' + (esGT?"gain":"loss") + '">'
               + (esGT?"+":"") + fmt(ganT) + " € (" + (esGT?"+":"") + ganPctT.toFixed(2) + "%)</p>" : "")
            + '</div>';
    }
    // Actualizar summary bolsa si está colapsada
    if (colapsado["bolsa"]) updateSummary("bolsa");
}

// Modal helpers
var _modalEditIdx = -1;
function abrirModal(idx) {
    _modalEditIdx = idx;
    var a = idx === -1
        ? { nombre:"", ticker:"", mon:"EUR", cant:0, coste:0, inv:0 }
        : acciones[idx];
    document.getElementById("modalTitle").innerText = idx === -1 ? "Añadir valor" : "Editar: " + a.nombre;
    document.getElementById("m_nombre").value = a.nombre || "";
    document.getElementById("m_ticker").value = a.ticker || "";
    document.getElementById("m_mon").value    = a.mon    || "EUR";
    document.getElementById("m_cant").value   = a.cant   || "";
    document.getElementById("m_coste").value  = a.coste  || "";
    document.getElementById("m_inv").value    = a.inv    || "";
    document.getElementById("m_idx").value    = idx;
    document.getElementById("m_eliminar").style.display = idx === -1 ? "none" : "block";
    document.getElementById("modalBolsa").classList.add("open");
}
function cerrarModal() { document.getElementById("modalBolsa").classList.remove("open"); }
function modalSyncCosteToInv() {
    var c = parseFloat(document.getElementById("m_coste").value)||0;
    var n = parseFloat(document.getElementById("m_cant").value)||0;
    if (c && n) document.getElementById("m_inv").value = (c * n).toFixed(2);
}
function modalSyncInvToCoste() {
    var inv = parseFloat(document.getElementById("m_inv").value)||0;
    var n   = parseFloat(document.getElementById("m_cant").value)||0;
    if (inv && n) document.getElementById("m_coste").value = (inv / n).toFixed(4);
}
function modalSyncCantCoste() {
    var c = parseFloat(document.getElementById("m_coste").value)||0;
    var n = parseFloat(document.getElementById("m_cant").value)||0;
    if (c && n) document.getElementById("m_inv").value = (c * n).toFixed(2);
}
function guardarModal() {
    var nombre = document.getElementById("m_nombre").value.trim();
    var ticker = document.getElementById("m_ticker").value.trim().toUpperCase();
    if (!nombre || !ticker) { alert("Introduce nombre y ticker."); return; }
    var a = {
        nombre: nombre, ticker: ticker,
        mon:    document.getElementById("m_mon").value,
        cant:   parseFloat(document.getElementById("m_cant").value)||0,
        coste:  parseFloat(document.getElementById("m_coste").value)||0,
        inv:    parseFloat(document.getElementById("m_inv").value)||0
    };
    var idx = parseInt(document.getElementById("m_idx").value);
    if (idx === -1) { acciones.push(a); precios[a.ticker] = 0; }
    else {
        var oldTicker = acciones[idx].ticker;
        if (oldTicker !== a.ticker) { precios[a.ticker] = 0; delete precios[oldTicker]; }
        acciones[idx] = a;
    }
    cerrarModal(); saveAcciones(); fetchAllPrices();
}
function eliminarValor() {
    var idx = parseInt(document.getElementById("m_idx").value);
    if (idx < 0) return;
    if (!confirm("Eliminar " + acciones[idx].nombre + "?")) return;
    delete precios[acciones[idx].ticker];
    acciones.splice(idx, 1);
    cerrarModal(); saveAcciones(); renderBolsa(); calcTotal();
}
function saveAcciones() { localStorage.setItem("isukiza_acciones", JSON.stringify(acciones)); }
document.addEventListener("click", function(e){ if (e.target.id === "modalBolsa") cerrarModal(); });

// ══════════════════════════════════════════════════
// FONDOS
// ══════════════════════════════════════════════════
function calcFondo(id) {
    var part  = parseFloat(document.getElementById(id+"_part").value)  || 0;
    var coste = parseFloat(document.getElementById(id+"_coste").value) || 0;
    var vl    = parseFloat(document.getElementById(id+"_vl").value)    || 0;
    var valInv = part * coste;
    var valMer = part * vl;
    var gan    = valMer - valInv;
    var ganPct = valInv > 0 ? gan/valInv*100 : 0;
    var esG    = gan >= 0;
    document.getElementById(id+"_inv").innerText = valInv > 0 ? fmt(valInv)+" \u20AC" : "\u2014";
    document.getElementById(id+"_mer").innerText = valMer > 0 ? fmt(valMer)+" \u20AC" : "\u2014";
    var box = document.getElementById(id+"_rent");
    var val = document.getElementById(id+"_rent_val");
    if (valInv > 0) {
        box.classList.remove("hidden"); box.classList.add("flex");
        val.className = "mono text-sm font-bold " + (esG?"gain":"loss");
        val.innerText = (esG?"+":"") + fmt(gan) + " \u20AC (" + (esG?"+":"") + ganPct.toFixed(2) + "%)";
    } else {
        box.classList.add("hidden"); box.classList.remove("flex");
    }
    calcTotalFondos(); calcTotal(); save();
}

function calcTotalFondos() {
    var tInv=0, tMer=0;
    ["f1","f2"].forEach(function(id){
        tInv += (parseFloat(document.getElementById(id+"_part").value)||0) * (parseFloat(document.getElementById(id+"_coste").value)||0);
        tMer += (parseFloat(document.getElementById(id+"_part").value)||0) * (parseFloat(document.getElementById(id+"_vl").value)||0);
    });
    var gan = tMer - tInv;
    var pct = tInv > 0 ? gan/tInv*100 : 0;
    var esG = gan >= 0;
    document.getElementById("totalFondosValor").innerText = tMer > 0 ? fmt(tMer)+" \u20AC" : "\u2014";
    var el = document.getElementById("totalFondosRentab");
    el.className = "mono text-[10px] " + (tInv>0 ? (esG?"gain":"loss") : "text-slate-600");
    el.innerText = tInv > 0 ? (esG?"+":"") + fmt(gan) + " \u20AC (" + (esG?"+":"") + pct.toFixed(2) + "%)" : "";
    if (colapsado["fondos"]) updateSummary("fondos");
}

function marcarTS() {
    var ts = new Date().toLocaleString("es-ES",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
    document.getElementById("fondosTimestamp").innerText = "VL " + ts;
    save();
}

// ══════════════════════════════════════════════════
// INDIE
// ══════════════════════════════════════════════════
function calcIndie() {
    var mer  = parseFloat(document.getElementById("indie_mer").value)||0;
    var inv  = parseFloat(document.getElementById("indie_inv").value)||0;
    var ef   = parseFloat(document.getElementById("indie_ef").value) ||0;
    var gan  = mer - inv;
    var pct  = inv > 0 ? gan/inv*100 : 0;
    var esG  = gan >= 0;
    var tot  = mer + ef;
    var el   = document.getElementById("indie_rent");
    if (inv > 0) {
        el.className = "mono text-sm font-bold "+(esG?"gain":"loss");
        el.innerText = (esG?"+":"") + fmt(gan) + " \u20AC (" + (esG?"+":"") + pct.toFixed(2) + "%)";
    } else {
        el.className = "mono text-sm font-bold text-slate-500";
        el.innerText = "\u2014";
    }
    document.getElementById("indie_total").innerText = tot > 0 ? fmt(tot)+" \u20AC" : "\u2014";
    calcTotal(); save();
    if (colapsado["indie"]) updateSummary("indie");
}

// ══════════════════════════════════════════════════
// EPSV
// ══════════════════════════════════════════════════
function calcEPSV() {
    var vlp = parseFloat(document.getElementById("vlp").value)||0;
    var r1  = (parseFloat(document.getElementById("p1").value)||0) * vlp;
    var r2  = (parseFloat(document.getElementById("p2").value)||0) * vlp;
    document.getElementById("res1").innerText    = fmt(r1)    + " \u20AC";
    document.getElementById("res2").innerText    = fmt(r2)    + " \u20AC";
    document.getElementById("totalEPSV").innerText = fmt(r1+r2) + " \u20AC";
    calcTotal(); save();
    if (colapsado["epsv"]) updateSummary("epsv");
}
function syncVLP(v) {
    document.getElementById("vlp").value   = v;
    document.getElementById("vlp_m").value = v;
    calcEPSV();
}

// ══════════════════════════════════════════════════
// EFECTIVO
// ══════════════════════════════════════════════════
function calcEfectivo() {
    var campos = [
        { id: "ef_abanca",    label: "Abanca"     },
        { id: "ef_santander", label: "Santander"  },
        { id: "ef_kutxa",     label: "Kutxabank"  },
        { id: "ef_myinvestor",label: "MyInvestor" },
        { id: "ef_casa",      label: "Casa"       }
    ];
    var total = 0;
    var filas = [];
    campos.forEach(function(c) {
        var v = parseFloat(document.getElementById(c.id).value)||0;
        total += v;
        if (v > 0) {
            filas.push('<div class="flex justify-between"><span class="mono text-[11px] text-slate-500">' + c.label + '</span><span class="mono text-[11px] text-cyan-400">' + fmt(v) + ' €</span></div>');
        }
    });
    var desglose = document.getElementById("ef_desglose");
    if (filas.length > 1) { desglose.innerHTML = filas.join(""); desglose.classList.remove("hidden"); }
    else { desglose.classList.add("hidden"); }
    document.getElementById("ef_total").innerText = total > 0 ? fmt(total)+" €" : "—";
    calcTotal(); save();
    if (colapsado["efectivo"]) updateSummary("efectivo");
}

// ══════════════════════════════════════════════════
// TOTAL GLOBAL
// ══════════════════════════════════════════════════
function getValues() {
    var bolsa = 0;
    acciones.forEach(function(a){
        var sub = precios[a.ticker] * a.cant;
        bolsa += a.mon==="USD" ? sub*usd_eur : sub;
    });
    var fondos = 0;
    ["f1","f2"].forEach(function(id){
        fondos += (parseFloat(document.getElementById(id+"_part").value)||0)
                * (parseFloat(document.getElementById(id+"_vl").value)||0);
    });
    var indieMer = parseFloat(document.getElementById("indie_mer").value)||0;
    var indieEf  = parseFloat(document.getElementById("indie_ef").value) ||0;
    var indie    = indieMer + indieEf;
    var vlp = parseFloat(document.getElementById("vlp").value)||0;
    var epsv = ((parseFloat(document.getElementById("p1").value)||0)
              + (parseFloat(document.getElementById("p2").value)||0)) * vlp;
    var efectivo = (parseFloat(document.getElementById("ef_abanca").value)||0)
                 + (parseFloat(document.getElementById("ef_santander").value)||0)
                 + (parseFloat(document.getElementById("ef_kutxa").value)||0)
                 + (parseFloat(document.getElementById("ef_myinvestor").value)||0)
                 + (parseFloat(document.getElementById("ef_casa").value)||0);
    return { bolsa: bolsa, fondos: fondos, indie: indie, epsv: epsv, efectivo: efectivo,
             total: bolsa + fondos + indie + epsv + efectivo };
}

function calcTotal() {
    var v = getValues();
    if (document.getElementById("treemap-svg")) drawTreemap();
    document.getElementById("totalPatrimonio").innerText =
        v.total.toLocaleString("es-ES",{style:"currency",currency:"EUR"});
    var tInv=0, tMer=0;
    ["f1","f2"].forEach(function(id){
        tInv += (parseFloat(document.getElementById(id+"_part").value)||0)*(parseFloat(document.getElementById(id+"_coste").value)||0);
        tMer += (parseFloat(document.getElementById(id+"_part").value)||0)*(parseFloat(document.getElementById(id+"_vl").value)||0);
    });
    var ganF = tMer - tInv;
    var esGF = ganF >= 0;
    var rEl  = document.getElementById("totalRentab");
    if (tInv > 0) {
        rEl.className = "mono text-[10px] mt-1 "+(esGF?"gain":"loss");
        rEl.innerText = "Fondos: "+(esGF?"+":"")+fmt(ganF)+" \u20AC ("+(esGF?"+":"")+(ganF/tInv*100).toFixed(2)+"%)";
    } else {
        rEl.className = "mono text-[10px] mt-1 text-slate-600";
        rEl.innerText = "Introduce VL y participaciones";
    }
    // Actualizar summaries de todos los colapsados
    Object.keys(CARDS).forEach(function(id){
        if (colapsado[id]) updateSummary(id);
    });
}

// ══════════════════════════════════════════════════
// SNAPSHOT
// ══════════════════════════════════════════════════
function registrarSnapshot() {
    var v = getValues();
    if (v.total === 0) { showToast("Introduce datos antes de registrar", "#7c2d12", "#f97316"); return; }
    var snap = {
        fecha: new Date().toISOString(),
        total: v.total, fondos: v.fondos, indie: v.indie,
        epsv: v.epsv, bolsa: v.bolsa, efectivo: v.efectivo
    };
    historial.push(snap);
    saveHistorial();
    actualizarGraficas();
    showToast("✓ Snapshot registrado", "#14532d", "#4ade80");
    var card = document.querySelector("header .card");
    card.classList.remove("flash"); void card.offsetWidth; card.classList.add("flash");
    var ts = new Date(snap.fecha).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
    document.getElementById("snapMsg").innerText = "Último: " + ts;
    if (colapsado["evolucion"]) updateSummary("evolucion");
}

function showToast(msg, bg, color) {
    var t = document.getElementById("snapToast");
    t.style.background = bg||"#14532d"; t.style.borderColor = color||"#4ade80"; t.style.color = color||"#4ade80";
    t.innerText = msg; t.style.opacity = "1";
    setTimeout(function(){ t.style.opacity = "0"; }, 2500);
}

function borrarSnapshot(idx) {
    var s = historial[idx];
    if (!s) return;
    var fStr = new Date(s.fecha).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
    if (!confirm("Borrar el registro del " + fStr + "?")) return;
    historial.splice(idx, 1); saveHistorial(); actualizarGraficas();
}

function borrarHistorial() {
    if (!confirm("¿Borrar todo el historial de snapshots?")) return;
    historial = []; saveHistorial(); actualizarGraficas();
}

function exportarHistorial() {
    if (historial.length === 0) { showToast("No hay registros que exportar", "#7c2d12", "#f97316"); return; }
    var json = JSON.stringify(historial, null, 2);
    var blob = new Blob([json], { type: "application/json" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href = url; a.download = "isukiza_historial_" + new Date().toISOString().slice(0,10) + ".json"; a.click();
    URL.revokeObjectURL(url);
    showToast("↓ Historial exportado", "#14532d", "#4ade80");
}

function importarHistorial(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error("Formato incorrecto");
            var mapaExistente = {};
            historial.forEach(function(s){ mapaExistente[s.fecha] = true; });
            var nuevos = data.filter(function(s){ return !mapaExistente[s.fecha]; });
            historial = historial.concat(nuevos);
            historial.sort(function(a,b){ return new Date(a.fecha) - new Date(b.fecha); });
            saveHistorial(); actualizarGraficas();
            showToast("↑ " + nuevos.length + " registro(s) importado(s)", "#14532d", "#4ade80");
        } catch(err) { showToast("Error al leer el archivo", "#7c2d12", "#f97316"); }
        event.target.value = "";
    };
    reader.readAsText(file);
}

// ══════════════════════════════════════════════════
// GRÁFICAS
// ══════════════════════════════════════════════════
var COLORES = {
    total:"#4ade80", efectivo:"#22d3ee", fondos:"#a78bfa", indie:"#34d399", epsv:"#fb7185"
};

function makePath(data, W, H, color, filled) {
    if (data.length < 2) return "";
    var min = Math.min.apply(null, data); var max = Math.max.apply(null, data);
    var rng = max - min || 1; var pad = 4; var h = H - pad*2;
    var xs = data.map(function(_,i){ return pad + i * (W - pad*2) / (data.length-1); });
    var ys = data.map(function(v){ return pad + h - (v - min)/rng * h; });
    var d = "M " + xs[0] + " " + ys[0];
    for (var i=1; i<xs.length; i++) {
        var mx = (xs[i-1]+xs[i])/2;
        d += " C " + mx + " " + ys[i-1] + " " + mx + " " + ys[i] + " " + xs[i] + " " + ys[i];
    }
    var path = '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round"/>';
    if (filled) {
        var area = d + " L " + xs[xs.length-1] + " " + (H-pad) + " L " + xs[0] + " " + (H-pad) + " Z";
        path = '<path d="' + area + '" fill="' + color + '" fill-opacity="0.08"/>' + path;
    }
    return { svg: path, xs: xs, ys: ys, min: min, max: max };
}

function drawDots(xs, ys, color, svgId, field, tipId) {
    var svg = document.getElementById(svgId);
    var old = svg.querySelectorAll(".snap-dot");
    old.forEach(function(el){ el.parentNode.removeChild(el); });
    xs.forEach(function(x, i) {
        var circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
        circle.setAttribute("cx", x); circle.setAttribute("cy", ys[i]);
        circle.setAttribute("r", "3"); circle.setAttribute("fill", color);
        circle.setAttribute("class", "snap-dot"); circle.style.cursor = "pointer";
        (function(snap, cx, cy){
            circle.addEventListener("mouseenter", function(){
                var tip = document.getElementById(tipId);
                tip.style.display = "block";
                var fechaStr = new Date(snap.fecha).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
                tip.innerText = fechaStr + "  " + fmt(snap[field]) + " \u20AC";
                tip.style.left = (cx + 6) + "px"; tip.style.top = (cy - 28) + "px";
            });
            circle.addEventListener("mouseleave", function(){ document.getElementById(tipId).style.display = "none"; });
        })(historial[i], x, ys[i]);
        svg.appendChild(circle);
    });
}

function drawSparkline(svgId, field, color, tipId) {
    var svg = document.getElementById(svgId);
    var W   = svg.clientWidth || svg.parentElement.clientWidth || 300;
    var H   = 48;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = "";
    var data = historial.map(function(s){ return s[field]; });
    if (data.length < 2) {
        svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="JetBrains Mono" font-size="9">Sin datos — registra snapshots</text>';
        return;
    }
    var r = makePath(data, W, H, color, true);
    if (!r) return;
    svg.innerHTML = r.svg;
    drawDots(r.xs, r.ys, color, svgId, field, tipId);
}

function drawBigChart() {
    var svg = document.getElementById("chart-big");
    var tip = document.getElementById("tip-big");
    var W   = svg.clientWidth || svg.parentElement.clientWidth || 600;
    var H   = 200;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.innerHTML = "";
    var data = historial.map(function(s){ return s[tabActiva]; });
    if (data.length < 2) {
        svg.innerHTML = '<text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="JetBrains Mono" font-size="11">Registra al menos 2 snapshots para ver la gráfica</text>';
        document.getElementById("chart-xaxis").innerHTML = ""; return;
    }
    var color = COLORES[tabActiva]; var pad = 8;
    var min = Math.min.apply(null, data); var max = Math.max.apply(null, data);
    var rng = max - min || 1; var h = H - pad*2 - 20;
    var xs = data.map(function(_,i){ return pad + i*(W-pad*2)/(data.length-1); });
    var ys = data.map(function(v){ return pad + h - (v-min)/rng*h; });
    var nGrid = 4; var gridSvg = "";
    for (var g=0; g<=nGrid; g++) {
        var yg = pad + h/nGrid*g; var val = max - (max-min)/nGrid*g;
        gridSvg += '<line x1="' + pad + '" y1="' + yg + '" x2="' + (W-pad) + '" y2="' + yg + '" stroke="#1e293b" stroke-width="1"/>';
        gridSvg += '<text x="' + (pad+2) + '" y="' + (yg-3) + '" fill="#334155" font-family="JetBrains Mono" font-size="8">' + fmtK(val) + '</text>';
    }
    svg.innerHTML = gridSvg;
    var d = "M " + xs[0] + " " + ys[0];
    for (var i=1; i<xs.length; i++) {
        var mx = (xs[i-1]+xs[i])/2;
        d += " C " + mx + " " + ys[i-1] + " " + mx + " " + ys[i] + " " + xs[i] + " " + ys[i];
    }
    var area = d + " L " + xs[xs.length-1] + " " + (pad+h) + " L " + xs[0] + " " + (pad+h) + " Z";
    svg.innerHTML += '<path d="' + area + '" fill="' + color + '" fill-opacity="0.07"/>';
    svg.innerHTML += '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"/>';
    xs.forEach(function(x, i){
        var circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
        circle.setAttribute("cx", x); circle.setAttribute("cy", ys[i]);
        circle.setAttribute("r", "4"); circle.setAttribute("fill", color);
        circle.setAttribute("stroke", "#080e1a"); circle.setAttribute("stroke-width", "2");
        circle.style.cursor = "pointer";
        (function(snap, cx, cy){
            circle.addEventListener("mouseenter", function(){
                tip.style.display = "block";
                var fechaStr = new Date(snap.fecha).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
                tip.innerText = fechaStr + "  " + fmt(snap[tabActiva]) + " \u20AC";
                tip.style.left = (cx + 8) + "px"; tip.style.top = (cy - 36) + "px";
            });
            circle.addEventListener("mouseleave", function(){ tip.style.display = "none"; });
        })(historial[i], x, ys[i]);
        svg.appendChild(circle);
    });
    var xaxis = document.getElementById("chart-xaxis");
    var step  = Math.max(1, Math.floor(historial.length / 5));
    var labels = [];
    for (var j=0; j<historial.length; j++) {
        if (j === 0 || j === historial.length-1 || j % step === 0) {
            var fStr = new Date(historial[j].fecha).toLocaleDateString("es-ES",{day:"2-digit",month:"2-digit"});
            labels.push('<span class="mono text-[8px] text-slate-600">' + fStr + '</span>');
        } else { labels.push('<span></span>'); }
    }
    xaxis.innerHTML = labels.join("");
}

function drawSnapTable() {
    var el = document.getElementById("snapTable");
    if (historial.length === 0) {
        el.innerHTML = '<p class="mono text-[9px] text-slate-700">Ningún registro todavía.</p>';
        document.getElementById("histCount").innerText = "0 registros guardados";
        return;
    }
    document.getElementById("histCount").innerText = historial.length + " registro" + (historial.length!==1?"s":"") + " guardado" + (historial.length!==1?"s":"");
    var rows = historial.slice().reverse().map(function(s, idx){
        var realIdx = historial.length - 1 - idx;
        var fStr = new Date(s.fecha).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
        return '<div class="flex items-center bg-slate-900/40 px-3 py-2 rounded-lg gap-2">'
            + '<span class="mono text-[9px] text-slate-500 flex-shrink-0">' + fStr + '</span>'
            + '<div class="flex gap-3 flex-wrap flex-1 justify-end">'
            + '<span class="mono text-[11px] text-cyan-400">C: ' + fmtK(s.efectivo||0) + '</span>'
            + '<span class="mono text-[11px] text-violet-400">F: ' + fmtK(s.fondos) + '</span>'
            + '<span class="mono text-[11px] text-emerald-400">I: ' + fmtK(s.indie) + '</span>'
            + '<span class="mono text-[11px] text-rose-400">E: ' + fmtK(s.epsv) + '</span>'
            + '<span class="mono text-[11px] text-green-400 font-bold">' + fmtK(s.total) + ' €</span>'
            + '</div>'
            + '<button onclick="borrarSnapshot(' + realIdx + ')"'
            + ' style="background:transparent;border:1px solid #450a0a;color:#f87171;border-radius:6px;padding:2px 8px;font-size:10px;cursor:pointer;font-family:JetBrains Mono,monospace;flex-shrink:0;" title="Borrar">×</button>'
            + '</div>';
    });
    el.innerHTML = rows.join("");
}

// ══════════════════════════════════════════════════
// DONUT CHART
// ══════════════════════════════════════════════════
var TREEMAP_CATS = [
    { key: 'bolsa',    label: 'Bolsa',    color: '#3b82f6' },
    { key: 'fondos',   label: 'Fondos',   color: '#8b5cf6' },
    { key: 'indie',    label: 'Indie',    color: '#10b981' },
    { key: 'epsv',     label: 'EPSV',     color: '#f43f5e' },
    { key: 'efectivo', label: 'Efectivo', color: '#06b6d4' }
];

function drawTreemap() {
    var svg    = document.getElementById('treemap-svg');
    var tip    = document.getElementById('treemap-tip');
    var legend = document.getElementById('treemap-legend');
    if (!svg) return;
    svg.innerHTML = ''; legend.innerHTML = '';
    var v = getValues(); var total = v.total;
    document.getElementById('treemap-total').innerText =
        total > 0 ? total.toLocaleString('es-ES',{style:'currency',currency:'EUR'}) : '';
    if (total <= 0) {
        svg.innerHTML = '<text x="110" y="110" text-anchor="middle" dominant-baseline="middle" fill="#334155" font-family="JetBrains Mono" font-size="10">Sin datos</text>';
        return;
    }
    var items = TREEMAP_CATS.map(function(c){ return { key:c.key, label:c.label, color:c.color, value: v[c.key]||0 }; })
                            .filter(function(i){ return i.value > 0; });
    var CX=110, CY=110, R=90, ri=54, GAP=0.022; var angle = -Math.PI / 2;
    items.forEach(function(item) {
        var slice = (item.value / total) * Math.PI * 2; var end = angle + slice - GAP;
        var x1=CX+R*Math.cos(angle),  y1=CY+R*Math.sin(angle);
        var x2=CX+R*Math.cos(end),    y2=CY+R*Math.sin(end);
        var x3=CX+ri*Math.cos(end),   y3=CY+ri*Math.sin(end);
        var x4=CX+ri*Math.cos(angle), y4=CY+ri*Math.sin(angle);
        var lg = slice > Math.PI ? 1 : 0;
        var d  = 'M '+x1+' '+y1+' A '+R+' '+R+' 0 '+lg+' 1 '+x2+' '+y2
               + ' L '+x3+' '+y3+' A '+ri+' '+ri+' 0 '+lg+' 0 '+x4+' '+y4+' Z';
        var path = document.createElementNS('http://www.w3.org/2000/svg','path');
        path.setAttribute('d', d); path.setAttribute('fill', item.color);
        path.setAttribute('fill-opacity','0.82'); path.style.cursor = 'pointer'; path.style.transition = 'fill-opacity 0.15s';
        var pct  = (item.value / total * 100).toFixed(1); var midA = angle + slice / 2;
        (function(it, p, ma){
            path.addEventListener('mouseenter', function(){
                path.setAttribute('fill-opacity','1'); tip.style.display = 'block';
                tip.innerHTML = '<b style="color:'+it.color+'">'+it.label+'</b><br>'+fmt(it.value)+' € &nbsp;<b>'+p+'%</b>';
                tip.style.left = Math.max(0, CX+(R+10)*Math.cos(ma)-55)+'px';
                tip.style.top  = Math.max(0, CY+(R+10)*Math.sin(ma)-38)+'px';
                document.getElementById('donut-center-pct').style.color = it.color;
                document.getElementById('donut-center-pct').innerText   = p+'%';
                document.getElementById('donut-center-label').innerText = it.label;
                document.getElementById('donut-center-val').innerText   = fmt(it.value)+' €';
            });
            path.addEventListener('mouseleave', function(){
                path.setAttribute('fill-opacity','0.82'); tip.style.display = 'none';
                document.getElementById('donut-center-pct').innerText   = '';
                document.getElementById('donut-center-label').innerText = '';
                document.getElementById('donut-center-val').innerText   = '';
            });
        })(item, pct, midA);
        svg.appendChild(path); angle += slice;
        var row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-3 w-full';
        row.innerHTML =
            '<div class="flex items-center gap-2" style="min-width:90px;">'
          + '<span style="width:10px;height:10px;border-radius:3px;background:'+item.color+';display:inline-block;flex-shrink:0;"></span>'
          + '<span class="mono text-[11px] text-slate-300 font-bold">'+item.label+'</span></div>'
          + '<div class="flex-1 mx-2" style="height:5px;background:#1e293b;border-radius:3px;overflow:hidden;">'
          + '<div style="height:100%;width:'+pct+'%;background:'+item.color+';border-radius:3px;opacity:0.8;"></div></div>'
          + '<span class="mono text-[11px] font-bold" style="color:'+item.color+';min-width:42px;text-align:right;">'+pct+'%</span>'
          + '<span class="mono text-[10px] text-slate-500" style="min-width:90px;text-align:right;">'+fmt(item.value)+' €</span>';
        legend.appendChild(row);
    });
}

function actualizarGraficas() {
    drawTreemap();
    drawSparkline("spark-fondos", "fondos", COLORES.fondos, "tip-fondos");
    drawSparkline("spark-indie",  "indie",  COLORES.indie,  "tip-indie");
    drawSparkline("spark-epsv",   "epsv",   COLORES.epsv,   "tip-epsv");
    drawSparkline("spark-ef",     "efectivo", COLORES.efectivo, "tip-ef");
    drawBigChart(); drawSnapTable();
}

function setTab(tab) {
    tabActiva = tab;
    ["total","fondos","indie","epsv","efectivo"].forEach(function(t){
        document.getElementById("tab-"+t).classList.toggle("active", t===tab);
    });
    drawBigChart();
}

// ══════════════════════════════════════════════════
// UTILIDADES
// ══════════════════════════════════════════════════
function fmt(n) { return (n||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function fmtK(n) {
    if (!n) return "0";
    if (Math.abs(n) >= 1000) return (n/1000).toLocaleString("es-ES",{minimumFractionDigits:1,maximumFractionDigits:1}) + "k";
    return (n||0).toLocaleString("es-ES",{minimumFractionDigits:0,maximumFractionDigits:0});
}
function setStatus(msg, color) {
    var s = document.getElementById("status");
    var map = {amber:"text-amber-400",green:"text-green-400",red:"text-red-400"};
    s.className = "mono text-[10px] mt-2 " + (map[color]||"text-slate-400");
    s.innerText = msg;
}

// ══════════════════════════════════════════════════
// PERSISTENCIA
// ══════════════════════════════════════════════════
function save() {
    localStorage.setItem("isukiza_v4", JSON.stringify({
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
    }));
}

function saveHistorial() { localStorage.setItem("isukiza_hist", JSON.stringify(historial)); }

function load() {
    var raw = localStorage.getItem("isukiza_v4");
    var d   = raw ? JSON.parse(raw) : {};
    var set = function(id, val){ var el=document.getElementById(id); if(el && val) el.value=val; };
    set("f1_vl",    d.f1_vl);   set("f1_part",  d.f1_part);  set("f1_coste", d.f1_coste);
    set("f2_vl",    d.f2_vl);   set("f2_part",  d.f2_part);  set("f2_coste", d.f2_coste);
    set("indie_mer", d.indie_mer); set("indie_inv", d.indie_inv); set("indie_ef",  d.indie_ef);
    set("ef_abanca", d.ef_abanca); set("ef_santander", d.ef_santander);
    set("ef_kutxa",  d.ef_kutxa);  set("ef_myinvestor", d.ef_myinvestor); set("ef_casa", d.ef_casa);
    set("p1",  d.p1  || "1376.6933");
    set("p2",  d.p2  || "1975.6095");
    set("vlp", d.vlp);
    document.getElementById("vlp_m").value = d.vlp || "";
    if (d.ts) document.getElementById("fondosTimestamp").innerText = d.ts;
    var rawH = localStorage.getItem("isukiza_hist");
    historial = rawH ? JSON.parse(rawH) : [];
    if (d.vlp) {
        var last = historial[historial.length-1];
        if (last) document.getElementById("snapMsg").innerText = "Último: " + new Date(last.fecha).toLocaleString("es-ES",{day:"2-digit",month:"2-digit",year:"2-digit",hour:"2-digit",minute:"2-digit"});
    }
    var rawA = localStorage.getItem("isukiza_acciones");
    acciones = rawA ? JSON.parse(rawA) : JSON.parse(JSON.stringify(ACCIONES_DEFAULT));
    acciones.forEach(function(a){ if (!precios[a.ticker]) precios[a.ticker] = 0; });
    calcFondo("f1"); calcFondo("f2"); calcIndie(); calcEPSV(); calcEfectivo();
    // Cargar estado de colapso DESPUÉS de calcular (para que summaries tengan datos)
    setTimeout(function(){
        loadCollapseState();
        actualizarGraficas();
    }, 100);
    fetchAllPrices();
    setInterval(fetchAllPrices, 5*60*1000);
}

window.onload = load;
window.addEventListener("resize", function(){ actualizarGraficas(); drawTreemap(); });