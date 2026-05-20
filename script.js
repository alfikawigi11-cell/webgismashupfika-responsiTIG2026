/* ============================================================
   script.js — WebGIS Produksi Jeruk Kabupaten Karo
   Teknologi Informasi Geospasial 2026
   Menggunakan: Leaflet.js + Chart.js + GeoJSON asli
   ============================================================ */

// ============================================================
// 1. KONSTANTA & VARIABEL GLOBAL
// ============================================================

// Sentroid tiap kecamatan (dihitung dari data asli, digunakan untuk label & buffer)
const CENTROIDS = {
  'Kabanjahe':     [3.10291, 98.47044],
  'Berastagi':     [3.18072, 98.51608],
  'Barusjahe':     [3.12271, 98.56630],
  'Tigapanah':     [3.09770, 98.50869],
  'Merek':         [2.95691, 98.50436],
  'Munte':         [3.08295, 98.36179],
  'Juhar':         [3.01048, 98.30667],
  'Tigabinanga':   [3.08581, 98.21306],
  'Laubaleng':     [3.11644, 98.06840],
  'Mardingding':   [3.24978, 97.97229],
  'Payung':        [3.11820, 98.36892],
  'Simpang Empat': [3.13635, 98.45666],
  'Kutabuluh':     [3.18618, 98.22780],
  'Dolat Rayat':   [3.15556, 98.54111],
  'Merdeka':       [3.20337, 98.47598],
  'Naman Teran':   [3.22192, 98.41178],
  'Tiganderket':   [3.13730, 98.34086]
};

// Luas kecamatan (km²) — dari data BPS Karo
const LUAS_KEC = {
  'Kabanjahe': 44.65, 'Berastagi': 30.50, 'Barusjahe': 126.53,
  'Tigapanah': 148.76, 'Merek': 191.20, 'Munte': 110.30,
  'Juhar': 285.40, 'Tigabinanga': 150.20, 'Laubaleng': 230.50,
  'Mardingding': 405.80, 'Payung': 53.60, 'Simpang Empat': 97.40,
  'Kutabuluh': 318.60, 'Dolat Rayat': 53.20, 'Merdeka': 32.80,
  'Naman Teran': 95.60, 'Tiganderket': 124.90
};

// Status toggle layer
const layerOn = {
  jeruk: true,
  ladang: false,
  buffer: false,
  label: true,
  centroid: false
};

// Layer references
let geojsonJeruk, layerLadang, layerBuffer, layerLabel, layerCentroid;
let mapMain, mapMini;
let totalProduksi = 0;
let sortedFeatures = [];
let chartBar, chartDonut;
let selectedLayer = null;

// ============================================================
// 2. FUNGSI WARNA CHOROPLETH (tema oranye jeruk)
// ============================================================

function getColor(val) {
  return val > 200000 ? '#9a3412'  // sangat tinggi — coklat tua
       : val > 90000  ? '#ea580c'  // tinggi       — oranye tua
       : val > 30000  ? '#f97316'  // sedang-tinggi — oranye
       : val > 5000   ? '#fbbf24'  // sedang       — kuning-oranye
       :                '#fef3c7'; // rendah        — kuning muda
}

function styleJeruk(feature) {
  return {
    fillColor: getColor(feature.properties.JerukSiam_Jeruk),
    weight: 1.5,
    color: 'white',
    dashArray: '',
    fillOpacity: 0.80
  };
}

// ============================================================
// 3. KALKULASI STATISTIK
// ============================================================

function calcStats() {
  const features = produksiJeruk.features;
  totalProduksi = features.reduce((s, f) => s + f.properties.JerukSiam_Jeruk, 0);
  sortedFeatures = [...features].sort((a, b) =>
    b.properties.JerukSiam_Jeruk - a.properties.JerukSiam_Jeruk
  );

  // Isi sidebar stat cards
  document.getElementById('sv-prod').textContent =
    (totalProduksi / 1000000).toFixed(2);
  document.getElementById('sv-top').textContent =
    sortedFeatures[0].properties.NAMOBJ_2;

  const top3sum = sortedFeatures.slice(0, 3)
    .reduce((s, f) => s + f.properties.JerukSiam_Jeruk, 0);
  document.getElementById('sv-pct').textContent =
    ((top3sum / totalProduksi) * 100).toFixed(0) + '%';
}

// ============================================================
// 4. INISIALISASI PETA UTAMA
// ============================================================

function initMap() {
  mapMain = L.map('map', { center: [3.10, 98.40], zoom: 9, zoomControl: false });
  L.control.zoom({ position: 'bottomright' }).addTo(mapMain);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapMain);

  // Basemaps
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>'
  });
  const satellite = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18, attribution: '© Esri, Maxar'
  });
  const terrain = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, attribution: '© OpenTopoMap'
  });

  osm.addTo(mapMain);

  L.control.layers(
    { 'OpenStreetMap': osm, 'Satelit (Esri)': satellite, 'Terrain': terrain },
    {},
    { position: 'topright', collapsed: true }
  ).addTo(mapMain);

  // Layer choropleth produksi jeruk
  buildJerukLayer();

  // Layer ladang (default OFF — toggle manual)
  buildLadangLayer();

  // Label kecamatan
  buildLabelLayer();

  // Sentra produksi jeruk
  buildCentroidLayer();

}

// ============================================================
// 5. LAYER CHOROPLETH PRODUKSI JERUK
// ============================================================

function buildJerukLayer() {
  geojsonJeruk = L.geoJSON(produksiJeruk, {
    style: styleJeruk,
    onEachFeature: function (feature, layer) {
      const p = feature.properties;
      const nama = p.NAMOBJ_2;
      const prod = p.JerukSiam_Jeruk;
      const pct  = ((prod / totalProduksi) * 100).toFixed(1);
      const rank = sortedFeatures.findIndex(f => f.properties.NAMOBJ_2 === nama) + 1;
      const luas = LUAS_KEC[nama] || '-';

      // Tooltip hover
      layer.bindTooltip(nama, {
        permanent: false, direction: 'top',
        className: 'label-kec', offset: [0, -4]
      });

      // Popup klik
      //layer.bindPopup(buildPopupHTML(nama, prod, pct, rank, luas), {
        //maxWidth: 260, closeButton: true
      //});

      // Event
      layer.on('mouseover', function (e) {
        if (layer !== selectedLayer) {
          layer.setStyle({ weight: 2.5, color: '#fff7ed', fillOpacity: 0.95 });
          layer.bringToFront();
        }
      });
      layer.on('mouseout', function (e) {
        if (layer !== selectedLayer) geojsonJeruk.resetStyle(layer);
      });
      layer.on('click', function (e) {
        // Reset layer sebelumnya
        if (selectedLayer) geojsonJeruk.resetStyle(selectedLayer);
        selectedLayer = layer;
        layer.setStyle({ weight: 3, color: '#fbbf24', fillOpacity: 0.98 });
        layer.bringToFront();
        showInfoPanel(nama, prod, pct, rank, luas);
      });
    }
  });

  if (layerOn.jeruk) geojsonJeruk.addTo(mapMain);
}

function buildPopupHTML(nama, prod, pct, rank, luas) {
  const ton = (prod / 10).toFixed(0);
  return `<div class="popup-head">
    <h3>Kec. ${nama}</h3>
    <p>Kabupaten Karo, Sumatera Utara</p>
  </div>
  <div class="popup-body">
    <div class="popup-row"><span class="popup-lbl">🍊 Produksi Jeruk</span><span class="popup-val or">${prod.toLocaleString('id-ID')} kw</span></div>
    <div class="popup-row"><span class="popup-lbl">📦 Setara Ton</span><span class="popup-val">${Number(ton).toLocaleString('id-ID')} ton</span></div>
    <div class="popup-row"><span class="popup-lbl">📊 % dari Total</span><span class="popup-val">${pct}%</span></div>
    <div class="popup-row"><span class="popup-lbl">🏆 Peringkat</span><span class="popup-val">#${rank} dari 17</span></div>
    <div class="popup-row"><span class="popup-lbl">🗺 Luas Kec.</span><span class="popup-val">${luas} km²</span></div>
  </div>`;
}

// ============================================================
// 6. LAYER LADANG/PERKEBUNAN
// ============================================================

function buildLadangLayer() {
  layerLadang = L.geoJSON(ladangKaro, {
    style: function () {
      return {
        color: '#5a8a2e',
        weight: 0.8,
        fillColor: '#8fbc5a',
        fillOpacity: 0.30,
        dashArray: ''
      };
    },
    onEachFeature: function (feature, layer) {
      layer.bindTooltip('Ladang/Perkebunan', { direction: 'top', sticky: true });
    }
  });
  // Default OFF — hanya ditambahkan saat toggle ON
}

// ============================================================
// 7. LAYER LABEL KECAMATAN
// ============================================================

function buildLabelLayer() {
  const markers = [];
  produksiJeruk.features.forEach(function (feature) {
    const nama = feature.properties.NAMOBJ_2;
    const center = CENTROIDS[nama];
    if (!center) return;
    const icon = L.divIcon({
      className: 'label-kec',
      html: `<span>${nama}</span>`,
      iconAnchor: [40, 8]
    });
    markers.push(L.marker(center, { icon, interactive: false }));
  });
  layerLabel = L.layerGroup(markers);
  if (layerOn.label) layerLabel.addTo(mapMain);
}
// ============================================================
// 7B. LAYER Sentra Produksi Jeruk
// ============================================================

function buildCentroidLayer() {

  const markers = [];

  produksiJeruk.features.forEach(function(feature) {

    const nama = feature.properties.NAMOBJ_2;
    const center = CENTROIDS[nama];

    if (!center) return;

    const marker = L.circleMarker(center, {

      radius: 7,
      fillColor: '#d6dc26',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 1

    });

    marker.bindTooltip(
      '<b>Sentra Produksi Jeruk</b><br>' + nama,
      {
        direction: 'top',
        offset: [0, -5]
      }
    );

    markers.push(marker);

  });

  layerCentroid = L.layerGroup(markers);

  // default OFF
}

// ============================================================
// 8. LEGENDA PETA (Leaflet control)
// ============================================================

//function buildLegend() {
  //const legend = L.control({ position: 'bottomright' });
  //legend.onAdd = function () {
    //const div = L.DomUtil.create('div', 'info legend');
    //const grades = [0, 5000, 30000, 90000, 200000];
    //const labels = ['0–5.000', '5.001–30.000', '30.001–90.000', '90.001–200.000', '>200.000'];
    //div.innerHTML = '<b>Produksi Jeruk (kw)</b><br/>';
    //grades.forEach(function (g, i) {
      //div.innerHTML +=
        //`<i style="background:${getColor(g + 1)}"></i> ${labels[i]}<br/>`;
    //});
    //return div;
  //};
  //legend.addTo(mapMain);
//}

// ============================================================
// 9. INFO PANEL (klik kecamatan)
// ============================================================

function showInfoPanel(nama, prod, pct, rank, luas) {
  document.getElementById('ip-kec').textContent = 'Kec. ' + nama;
  document.getElementById('ip-prod').textContent = prod.toLocaleString('id-ID') + ' kuintal';
  document.getElementById('ip-ton').textContent = (prod / 10).toLocaleString('id-ID') + ' ton';
  document.getElementById('ip-pct').textContent = pct + '% dari total Kab. Karo';
  document.getElementById('ip-rank').textContent = '#' + rank + ' dari 17 kecamatan';
  document.getElementById('ip-luas').textContent = (luas || '—') + ' km²';
  document.getElementById('info-panel').style.display = 'block';
}

function closeInfo() {
  document.getElementById('info-panel').style.display = 'none';
  if (selectedLayer) {
    geojsonJeruk.resetStyle(selectedLayer);
    selectedLayer = null;
  }
}

// ============================================================
// 10. TOGGLE LAYER
// ============================================================

function toggleLayer(name) {
  layerOn[name] = !layerOn[name];
  const sw = document.getElementById('sw-' + name);
  if (layerOn[name]) sw.classList.add('on'); else sw.classList.remove('on');

  if (name === 'jeruk') {
    if (layerOn.jeruk) geojsonJeruk.addTo(mapMain);
    else mapMain.removeLayer(geojsonJeruk);

  } else if (name === 'ladang') {
    if (layerOn.ladang) layerLadang.addTo(mapMain);
    else mapMain.removeLayer(layerLadang);

  } else if (name === 'buffer') {
    if (layerOn.buffer) {
      if (!layerBuffer) buildBufferLayer();
      layerBuffer.addTo(mapMain);
      document.getElementById('buf-legend').style.display = 'block';
    } else {
      if (layerBuffer) mapMain.removeLayer(layerBuffer);
      document.getElementById('buf-legend').style.display = 'none';
    }

  } else if (name === 'label') {

  if (layerOn.label) layerLabel.addTo(mapMain);
  else mapMain.removeLayer(layerLabel);

} else if (name === 'centroid') {

  if (layerOn.centroid) {

    if (!mapMain.hasLayer(layerCentroid)) {
      layerCentroid.addTo(mapMain);
    }

    layerCentroid.eachLayer(function(layer) {
      layer.bringToFront();
    });

  } else {

    mapMain.removeLayer(layerCentroid);

  }

}
}

// ============================================================
// 11. ANALISIS SPASIAL — BUFFER ZONA PRODUKSI
// ============================================================

function buildBufferLayer() {
  const circles = [];
  // Buffer 10 km dari sentroid TIAP kecamatan (analisis zonasi distribusi)
  produksiJeruk.features.forEach(function (feature) {
    const nama = feature.properties.NAMOBJ_2;
    const prod = feature.properties.JerukSiam_Jeruk;
    const center = CENTROIDS[nama];
    if (!center) return;

    // Radius buffer proporsional terhadap produksi (min 3 km, max 10 km)
    const maxProd = sortedFeatures[0].properties.JerukSiam_Jeruk;
    const radius = 3000 + (prod / maxProd) * 7000; // 3–10 km

    const circle = L.circle(center, {
      radius: radius,
      color: '#3b82f6',
      fillColor: '#bfdbfe',
      fillOpacity: 0.18,
      weight: 1.5,
      dashArray: '5 4'
    });
    circle.bindTooltip(
      `<b>${nama}</b><br/>Buffer: ${(radius / 1000).toFixed(1)} km<br/>Produksi: ${prod.toLocaleString('id-ID')} kw`,
      { direction: 'top' }
    );
    circles.push(circle);
  });
  layerBuffer = L.layerGroup(circles);
}

// ============================================================
// 12. TOMBOL ANALISIS SPASIAL
// ============================================================

function runBufferAnalysis() {
  // Aktifkan layer buffer
  layerOn.buffer = true;
  document.getElementById('sw-buffer').classList.add('on');
  if (!layerBuffer) buildBufferLayer();
  layerBuffer.addTo(mapMain);
  document.getElementById('buf-legend').style.display = 'block';

  const top = sortedFeatures[0].properties;
  const res = document.getElementById('ana-result');
  res.style.display = 'block';
  res.innerHTML = `<strong>Hasil Buffer Analysis:</strong><br/>
    Zona buffer proporsional terhadap produksi (3–10 km).<br/>
    Buffer terluas: <strong>${top.NAMOBJ_2}</strong> (${top.JerukSiam_Jeruk.toLocaleString('id-ID')} kw).<br/>
    Kecamatan berproduksi rendah memiliki zona jangkauan lebih kecil — 
    mengindikasikan potensi perluasan lahan di area tersebut.`;
}

function highlightTop() {
  const topNames = sortedFeatures.slice(0, 3).map(f => f.properties.NAMOBJ_2);
  geojsonJeruk.eachLayer(function (layer) {
    const nama = layer.feature.properties.NAMOBJ_2;
    if (topNames.includes(nama)) {
      layer.setStyle({ weight: 3, color: '#fbbf24', fillOpacity: 0.98 });
      layer.bringToFront();
    } else {
      layer.setStyle({ fillOpacity: 0.25, color: 'white' });
    }
  });

  const res = document.getElementById('ana-result');
  res.style.display = 'block';
  const top3list = sortedFeatures.slice(0, 3)
    .map((f, i) => `${i + 1}. ${f.properties.NAMOBJ_2} — ${f.properties.JerukSiam_Jeruk.toLocaleString('id-ID')} kw`)
    .join('<br/>');
  const top3sum = sortedFeatures.slice(0, 3)
    .reduce((s, f) => s + f.properties.JerukSiam_Jeruk, 0);
  res.innerHTML = `<strong>Sentra Produksi Teratas:</strong><br/>
    ${top3list}<br/><br/>
    3 kecamatan ini menyumbang <strong>${((top3sum / totalProduksi) * 100).toFixed(0)}%</strong> 
    dari total produksi jeruk Kabupaten Karo.`;
}

function resetAll() {
  if (geojsonJeruk) geojsonJeruk.resetStyle();
  selectedLayer = null;
  layerOn.buffer = false;
  document.getElementById('sw-buffer').classList.remove('on');
  if (layerBuffer) mapMain.removeLayer(layerBuffer);
  layerBuffer = null;
  document.getElementById('buf-legend').style.display = 'none';
  document.getElementById('ana-result').style.display = 'none';
  closeInfo();
}

// ============================================================
// 13. TOGGLE SIDEBAR
// ============================================================

let sidebarOpen = true;
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  const sb = document.getElementById('sidebar');
  if (sidebarOpen) sb.classList.remove('collapsed');
  else             sb.classList.add('collapsed');
  // Invalidate map size setelah animasi selesai
  setTimeout(function () {
    if (mapMain) mapMain.invalidateSize();
    if (mapMini) mapMini.invalidateSize();
  }, 320);
}

// ============================================================
// 14. SWITCH VIEW — Peta / Dashboard
// ============================================================

function switchView(mode) {
  document.getElementById('btn-webgis').classList.toggle('active', mode === 'webgis');
  document.getElementById('btn-mashup').classList.toggle('active', mode === 'mashup');
  document.getElementById('view-webgis').style.display = mode === 'webgis' ? 'block' : 'none';
  document.getElementById('view-mashup').style.display = mode === 'mashup' ? 'block' : 'none';

  if (mode === 'mashup') {
    buildDashboard();
    setTimeout(function () { if (mapMini) mapMini.invalidateSize(); }, 200);
  }
}

// ============================================================
// 15. DASHBOARD / MASHUP — Chart.js + Mini Map + Ranking
// ============================================================

let dashBuilt = false;

function buildDashboard() {
  if (dashBuilt) return; // hanya build sekali
  dashBuilt = true;

  buildMiniMap();
  buildBarChart();
  buildDonutChart();
  buildRankingTable();
  buildBigStats();
}

// Mini peta di dashboard
function buildMiniMap() {
  mapMini = L.map('map-mini', { center: [3.10, 98.40], zoom: 8, zoomControl: false, attributionControl: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapMini);
  L.geoJSON(produksiJeruk, { style: styleJeruk }).addTo(mapMini);
}

// Bar Chart — produksi per kecamatan (Chart.js)
function buildBarChart() {
  // Urutkan dari tertinggi
  const labels = sortedFeatures.map(f => f.properties.NAMOBJ_2);
  const data   = sortedFeatures.map(f => f.properties.JerukSiam_Jeruk);

  // Warna bar sesuai nilai
  const colors = data.map(v => getColor(v));

  const ctx = document.getElementById('chartBar').getContext('2d');
  chartBar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Produksi Jeruk Siam (Kuintal)',
        data: data,
        backgroundColor: colors,
        borderColor: colors.map(c => c),
        borderWidth: 0,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return ' ' + ctx.raw.toLocaleString('id-ID') + ' kuintal';
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { font: { size: 10 }, maxRotation: 45, color: '#6b7280' },
          grid: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            font: { size: 10 }, color: '#6b7280',
            callback: function (v) { return (v / 1000) + 'K'; }
          },
          grid: { color: '#f3f4f6' }
        }
      }
    }
  });
}

// Donut Chart — distribusi top 5 + lainnya
function buildDonutChart() {
  const top5 = sortedFeatures.slice(0, 5);
  const otherSum = sortedFeatures.slice(5)
    .reduce((s, f) => s + f.properties.JerukSiam_Jeruk, 0);

  const labels = [...top5.map(f => f.properties.NAMOBJ_2), 'Kecamatan Lain'];
  const data   = [...top5.map(f => f.properties.JerukSiam_Jeruk), otherSum];
  const COLORS  = ['#9a3412','#ea580c','#f97316','#fb923c','#fbbf24','#d1d5db'];

  const ctx = document.getElementById('chartDonut').getContext('2d');
  chartDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: COLORS,
        borderWidth: 2,
        borderColor: 'white'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { size: 10 }, color: '#374151', boxWidth: 12, padding: 8 }
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              const pct = ((ctx.raw / totalProduksi) * 100).toFixed(1);
              return ` ${ctx.raw.toLocaleString('id-ID')} kw (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// Ranking table
function buildRankingTable() {
  const container = document.getElementById('rank-table');
  const maxVal = sortedFeatures[0].properties.JerukSiam_Jeruk;
  let html = '';

  sortedFeatures.forEach(function (f, i) {
    const nama = f.properties.NAMOBJ_2;
    const prod = f.properties.JerukSiam_Jeruk;
    const pct  = ((prod / maxVal) * 100).toFixed(0);
    const isTop = i < 3;
    html += `<div class="rank-row">
      <div class="rank-no ${isTop ? 'top' : ''}">${i + 1}</div>
      <div class="rank-name">${nama}</div>
      <div class="rank-bar-wrap">
        <div class="rank-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="rank-val">${(prod / 1000).toFixed(0)}K</div>
    </div>`;
  });
  container.innerHTML = html;
}

// Big stats
function buildBigStats() {
  const maxF  = sortedFeatures[0];
  const avgProd = totalProduksi / sortedFeatures.length;
  const topName = maxF.properties.NAMOBJ_2;
  const top3pct = ((sortedFeatures.slice(0,3).reduce((s,f)=>s+f.properties.JerukSiam_Jeruk,0)/totalProduksi)*100).toFixed(0);

  document.getElementById('big-stats').innerHTML = `
    <div class="bs-item">
      <div class="bs-val">${(totalProduksi / 1000).toFixed(0)}K</div>
      <div class="bs-lbl">Total Produksi (Kuintal)</div>
    </div>
    <div class="bs-item">
      <div class="bs-val">${topName}</div>
      <div class="bs-lbl">Kecamatan Tertinggi</div>
    </div>
    <div class="bs-item">
      <div class="bs-val">${(avgProd / 1000).toFixed(0)}K</div>
      <div class="bs-lbl">Rata-rata per Kecamatan</div>
    </div>
    <div class="bs-item">
      <div class="bs-val">${top3pct}%</div>
      <div class="bs-lbl">Konsentrasi Top 3 Kec.</div>
    </div>`;
}

// ============================================================
// 16. INISIALISASI UTAMA — Dipanggil setelah loading selesai
// ============================================================

window.addEventListener('DOMContentLoaded', function () {
  // Kalkulasi statistik dari data GeoJSON asli
  calcStats();

  // Inisialisasi peta utama
  initMap();

  // Sembunyikan loading screen setelah animasi selesai (2.2 detik)
  setTimeout(function () {
    const ld = document.getElementById('loading');
    ld.style.opacity = '0';
    setTimeout(function () { ld.style.display = 'none'; }, 500);
  }, 2200);
});