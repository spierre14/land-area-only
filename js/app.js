// ============================================================
// CONFIG
// ============================================================
mapboxgl.accessToken = 'pk.eyJ1Ijoic3BpZXJyZTE0IiwiYSI6ImNtdHg1MXFyNjAxanUyd3B0Zmppd3pldjMifQ.N_SDvISpQJo1gDuuOetnmQ';

const DATA_FILE = 'data/Land_Area_Full_Service.min.geojson';
const STATIONS_FILE = 'data/rail_transit_stations.geojson';
const COLOR_SCHEME_KEY = 'land';

// The 20 percentile bins, low to high
const CATEGORY_ORDER = [
  '0–5th percentile', '5th–10th percentile', '10th–15th percentile', '15th–20th percentile',
  '20th–25th percentile', '25th–30th percentile', '30th–35th percentile', '35th–40th percentile',
  '40th–45th percentile', '45th–50th percentile', '50th–55th percentile', '55th–60th percentile',
  '60th–65th percentile', '65th–70th percentile', '70th–75th percentile', '75th–80th percentile',
  '80th–85th percentile', '85th–90th percentile', '90th–95th percentile', '95th–100th percentile'
];

// CartoCSS-matched 20-step colormaps, low percentile -> high percentile
const COLOR_SCHEMES = {
  land: [
    '#fde725', '#dde318', '#bade28', '#95d840', '#75d054',
    '#56c667', '#3dbc74', '#29af7f', '#20a386', '#1f968b',
    '#238a8d', '#287d8e', '#2d718e', '#33638d', '#39558c',
    '#404688', '#453781', '#482576', '#481467', '#440154'
  ],
  jobs: [
    '#f0f921', '#f7e225', '#fccd25', '#feb72d', '#fca338',
    '#f79044', '#f07f4f', '#e76e5b', '#dd5e66', '#d14e72',
    '#c5407e', '#b6308b', '#a72197', '#9511a1', '#8305a7',
    '#6e00a8', '#5901a5', '#43039e', '#2c0594', '#0d0887'
  ]
};

function buildFillColorExpression(schemeKey) {
  const colors = COLOR_SCHEMES[schemeKey];
  const matchPairs = [];
  CATEGORY_ORDER.forEach((cat, i) => { matchPairs.push(cat, colors[i]); });
  return ['match', ['get', 'category'], ...matchPairs, '#cccccc'];
}

function renderLegend(schemeKey) {
  const colors = COLOR_SCHEMES[schemeKey];
  const legendEl = document.getElementById('legend');
  legendEl.innerHTML = `
    <div class="ramp-horizontal" style="background: linear-gradient(to right, ${colors.join(', ')});"></div>
    <div class="ramp-horizontal-labels">
      <span>Lower Access</span>
      <span>Higher Access</span>
    </div>
    <label class="station-toggle">
      <input type="checkbox" id="stationToggle">
      <span>Show Rail &amp; Subway Stations</span>
    </label>
  `;

  document.getElementById('stationToggle').addEventListener('change', (e) => {
    if (!map.getLayer('stations-point')) return;
    map.setLayoutProperty('stations-point', 'visibility', e.target.checked ? 'visible' : 'none');
  });
}

// ============================================================
// Map init
// ============================================================
const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-73.95, 40.70],
  zoom: 10
});

map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

const loadingEl = document.getElementById('mapLoading');
let currentPopup = null;

async function loadData(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

function addStations(geojson) {
  map.addSource('stations', { type: 'geojson', data: geojson });
  map.addLayer({
    id: 'stations-point',
    type: 'circle',
    source: 'stations',
    layout: { visibility: 'none' }, // toggle starts off
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 7],
      'circle-color': '#000000',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5
    }
  });

  map.on('click', 'stations-point', (e) => {
    const p = e.features[0].properties;
    const type = p.layer === 'Subway' ? 'Subway' : 'MNR / LIRR';
    new mapboxgl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`<div class="popup-title">${type} Station</div>`)
      .addTo(map);
  });

  map.on('mouseenter', 'stations-point', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'stations-point', () => { map.getCanvas().style.cursor = ''; });
}

async function init() {
  try {
    loadingEl.classList.add('visible');
    const [blocksData, stationsData] = await Promise.all([
      loadData(DATA_FILE),
      loadData(STATIONS_FILE)
    ]);

    map.addSource('blocks', { type: 'geojson', data: blocksData });
    map.addLayer({
      id: 'blocks-fill',
      type: 'fill',
      source: 'blocks',
      paint: { 'fill-color': buildFillColorExpression(COLOR_SCHEME_KEY), 'fill-opacity': 0.8 }
    });
    map.addLayer({
      id: 'blocks-outline',
      type: 'line',
      source: 'blocks',
      paint: { 'line-color': '#ffffff', 'line-width': 0.1, 'line-opacity': 0.5 }
    });

    map.on('click', 'blocks-fill', (e) => {
      const p = e.features[0].properties;
      const isPct = p.metric_label && p.metric_label.startsWith('%');
      const value = isPct
        ? `${Number(p.metric_value).toFixed(1)}%`
        : Number(p.metric_value).toLocaleString();

      if (currentPopup) currentPopup.remove();
      currentPopup = new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<div class="popup-title">Block ${p.blockid20}</div>
                   <div class="popup-row">${p.metric_label}: ${value}</div>
                   <div class="popup-row">${p.category}</div>`)
        .addTo(map);
    });

    map.on('mouseenter', 'blocks-fill', () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'blocks-fill', () => { map.getCanvas().style.cursor = ''; });

    addStations(stationsData);
    renderLegend(COLOR_SCHEME_KEY);
  } catch (err) {
    console.error(err);
    loadingEl.textContent = 'Could not load data — check the console for details.';
    loadingEl.classList.add('visible');
    return;
  } finally {
    loadingEl.classList.remove('visible');
  }
}

map.on('load', init);
