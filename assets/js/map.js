// assets/js/map.js
// Logic for the dual-map national dashboard page.

const GEOJSON_PATH = 'usa_states.geojson'; 

// Global variables for maps and data
let casesMap, rateMap; // Two Leaflet map instances
let geojsonData; // Raw GeoJSON data
let currentYearData = {}; // Data for the selected year/disease: { stateName: {cases, population, per100k} }
let allData = []; // All normalized CSV rows
let Qobj = {}; // Query parameters

// Chart instances
let lineChartTotalCases, barChartTopStates, boxplotCases, scatterDensity;

// --- Helper Functions (defined in main.js, but re-aliased for clarity) ---
const qParam = (name) => new URLSearchParams(location.search).get(name);
const formatNum = (n, dec=0) => new Intl.NumberFormat('en-US', {maximumFractionDigits: dec}).format(n);
const destroyChart = (chartInstance) => { if(chartInstance) try{ chartInstance.destroy(); }catch(e){} };

// --- MAP STYLING AND COLORING ---

// Color schemes and breaks for the choropleth maps
const casesColors = ['#f7fbff', '#c6dbef', '#9ecae1', '#6baed6', '#3182bd', '#08519c']; // Blue gradient
const casesBreaks = [0, 100, 1000, 10000, 50000]; // Total Cases
const rateColors = ['#fef0d9', '#fdcc8a', '#fc8d59', '#e34a33', '#b30000']; // Red/Orange gradient
const rateBreaks = [0, 5, 20, 50, 100]; // Rate per 100k

/**
 * Returns color based on value and defined breaks/colors
 */
function getColor(value, breaks, colors) {
  if (value <= 0) return '#cccccc'; // Special color for zero/no data
  for (let i = breaks.length - 1; i >= 0; i--) {
    if (value >= breaks[i]) return colors[i + 1] || colors[i];
  }
  return colors[0];
}

/**
 * Styles a GeoJSON feature for coloring the map
 */
function styleFeature(feature, metric) {
  const stateName = feature.properties.NAME; // GeoJSON properties might use NAME
  const data = currentYearData[stateName];
  let value = 0;
  let colors, breaks;

  if (metric === 'cases') {
    value = data ? data.cases : 0;
    colors = casesColors;
    breaks = casesBreaks;
  } else { // 'rate'
    value = data ? data.per100k : 0;
    colors = rateColors;
    breaks = rateBreaks;
  }

  return {
    fillColor: getColor(value, breaks, colors),
    weight: 1.5,
    opacity: 1,
    color: 'white', // White borders between states
    dashArray: '3',
    fillOpacity: 0.8,
    metric: metric // Store the metric type for hover reset
  };
}

// --- MAP INTERACTION (CRITICAL) ---

/**
 * Handles hover (mouseover/mouseout) and click events for map features.
 */
function onEachFeature(feature, layer) {
  const stateName = feature.properties.NAME;
  const data = currentYearData[stateName];

  // 1. Tooltip (Hover)
  let tooltipContent = `<strong>${stateName}</strong>`;
  if (data) {
    tooltipContent += `<br>Cases: ${formatNum(data.cases)}
                       <br>Rate / 100k: ${formatNum(data.per100k, 1)}`;
  } else {
    tooltipContent += `<br>No data available`;
  }
  layer.bindTooltip(tooltipContent, {
      sticky: true,
      className: 'map-tooltip', // Use this class if you want custom tooltip styles
  });

  // 2. Click (Redirect)
  layer.on('click', (e) => {
    if (!data) return; // Don't redirect if there's no data
    
    const q = new URLSearchParams({ 
      state: stateName, 
      disease: Qobj.disease, 
      year: Qobj.year 
    });
    // Redirects the user to the state.html page
    window.location.href = `state.html?${q.toString()}`;
  });

  // 3. Highlight
  layer.on({
    mouseover: (e) => {
      e.target.setStyle({ weight: 3, color: '#333', dashArray: '', fillOpacity: 0.95 });
      e.target.bringToFront();
    },
    mouseout: (e) => {
      // Revert to original style (using the stored metric)
      const metric = e.target.options.metric;
      if (metric) {
          e.target.setStyle(styleFeature(feature, metric));
      }
    }
  });
}

/**
 * Draws the GeoJSON layer for a specific map instance with a specific metric
 */
function drawMapLayer(mapInstance, metric) {
    if (!geojsonData) return;
    
    // Determine the style function
    const currentStyle = (feature) => styleFeature(feature, metric);
    
    // Clear previous layers
    mapInstance.eachLayer(layer => {
        if (layer.options.metric) mapInstance.removeLayer(layer);
    });

    // Add new GeoJSON layer
    const layer = L.geoJson(geojsonData, {
        style: currentStyle,
        onEachFeature: onEachFeature
    }).addTo(mapInstance);
    
    // Zoom to bounds of the US
    if (mapInstance.fitBoundsCount === 0) { // Only fit bounds on the first load
        mapInstance.fitBounds(layer.getBounds());
        mapInstance.fitBoundsCount = 1;
    }
}

/**
 * Adds a custom legend to the map container
 */
function addMapLegend(metric, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let colors, breaks, title;
    if (metric === 'cases') {
        colors = casesColors; breaks = casesBreaks; title = 'Cases';
    } else {
        colors = rateColors; breaks = rateBreaks; title = 'Rate / 100k';
    }

    let html = `<strong>${title} Legend:</strong><div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:5px;">`;

    for (let i = 0; i < breaks.length; i++) {
        const start = breaks[i];
        const end = breaks[i + 1];
        const color = colors[i + 1] || colors[i];
        
        let label = (i === breaks.length - 1) ? `${formatNum(start)}+` : `${formatNum(start)}-${formatNum(end - 1)}`;
        
        html += `<div style="display:flex; align-items:center; font-size:0.8rem; color:var(--muted);">
            <span style="width:14px; height:14px; background-color:${color}; margin-right:4px; border:1px solid #ccc; border-radius:3px;"></span>
            ${label}
        </div>`;
    }
    
    html += `<div style="display:flex; align-items:center; font-size:0.8rem; color:var(--muted);">
        <span style="width:14px; height:14px; background-color:#cccccc; margin-right:4px; border:1px solid #ccc; border-radius:3px;"></span>
        No Data
    </div>`;
    
    html += '</div>';
    container.innerHTML = html;
}

/**
 * Initializes Leaflet maps for the Cases and Rate metrics
 */
function initializeMaps() {
  const mapOptions = {
      center: [39.8283, -98.5795],
      zoom: 4,
      scrollWheelZoom: false,
      attributionControl: false,
      zoomControl: true,
  };
  
  casesMap = L.map('casesMap', mapOptions);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 10, minZoom: 2 }).addTo(casesMap);
  casesMap.fitBoundsCount = 0; // Custom flag to prevent re-zooming

  rateMap = L.map('rateMap', mapOptions);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 10, minZoom: 2 }).addTo(rateMap);
  rateMap.fitBoundsCount = 0;
  
  // Synchronize the two maps
  if (L.Map.Sync) {
      casesMap.sync(rateMap);
      rateMap.sync(casesMap);
  } else {
      console.warn("Leaflet.Sync plugin not found. Maps will not be synchronized.");
  }
}

// --- CHART RENDERING ---

/**
 * Generates the Line Chart (Plot A) showing National Cases Trend
 */
function drawLineChart() {
  destroyChart(lineChartTotalCases);
  const nationalTrends = allData.reduce((acc, row) => {
    if (row.disease === Qobj.disease) {
      acc[row.year] = (acc[row.year] || 0) + row.cases;
    }
    return acc;
  }, {});
  
  const labels = Object.keys(nationalTrends).sort();
  const dataPoints = labels.map(year => nationalTrends[year]);
  
  const ctx = document.getElementById('lineChartTotalCases').getContext('2d');
  lineChartTotalCases = ChartHelpers.createLine(ctx, labels, [
    { label: 'Total National Cases', data: dataPoints, tension: 0.3, fill: true }
  ], {
      scales: { 
          y: { title: { display: true, text: 'Total Cases' } },
          x: { title: { display: true, text: 'Year' } }
      }
  });
}

/**
 * Generates the Bar Chart (Plot B) showing Top/Bottom 5 States
 */
function drawBarChart() {
    destroyChart(barChartTopStates);
    const states = Object.values(currentYearData).sort((a, b) => b.cases - a.cases);
    const top5 = states.slice(0, 5);
    const bottom5 = states.filter(d => d.cases > 0).slice(-5).reverse(); // Reverse to show lowest first
    const chartData = [...top5, ...bottom5];

    const labels = chartData.map(d => d.state);
    const dataPoints = chartData.map(d => d.cases);
    const backgroundColors = [
        ...Array(top5.length).fill(ChartHelpers.getColor(0)), 
        ...Array(bottom5.length).fill(ChartHelpers.getColor(1))
    ];

    const ctx = document.getElementById('barChartTopStates').getContext('2d');
    barChartTopStates = ChartHelpers.createBar(ctx, labels, [{
        label: `Cases in ${Qobj.year}`,
        data: dataPoints,
        backgroundColor: backgroundColors,
        borderRadius: 5,
    }], {
        indexAxis: 'y', // Horizontal chart
        scales: { 
            y: { title: { display: false } },
            x: { title: { display: true, text: 'Total Cases' } }
        },
        plugins: { 
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
        }
    });
}

/**
 * Generates the Box Plot (Plot C) showing Dispersion Across States
 */
function drawBoxPlot(groupBy = 'byYear') {
    destroyChart(boxplotCases);
    const ctx = document.getElementById('boxplotCases').getContext('2d');
    if (!ChartHelpers.createBox) { // Check if plugin is loaded
        ctx.canvas.parentNode.innerHTML = '<div class="muted" style="padding:20px;">Boxplot plugin not loaded.</div>';
        return;
    }
    
    const currentDiseaseData = allData.filter(r => r.disease === Qobj.disease && r.cases > 0);
    let labels = [];
    let boxData = [];

    if (groupBy === 'byYear') {
        const years = uniqueSorted(currentDiseaseData.map(r => r.year));
        labels = years;
        boxData = years.map(y => currentDiseaseData.filter(r => r.year === y).map(r => r.per100k));
    } else { // byState
        const states = uniqueSorted(currentDiseaseData.map(r => r.state));
        labels = states;
        boxData = states.map(s => currentDiseaseData.filter(r => r.state === s).map(r => r.per100k));
    }

    boxplotCases = ChartHelpers.createBox(ctx, labels, [{
        label: 'Rate per 100k Distribution',
        data: boxData,
        backgroundColor: ChartHelpers.getColor(4).replace('1)', '0.5'),
        borderColor: ChartHelpers.getColor(4),
    }], {
        scales: { y: { title: { display: true, text: 'Rate per 100k' } } },
        plugins: { legend: { display: false } }
    });
}

/**
 * Generates the Scatter Plot (Plot D) showing Rate vs. Population Density
 */
function drawScatterPlot() {
    destroyChart(scatterDensity);
    const dataPoints = Object.values(currentYearData)
        .filter(d => d.cases > 0 && d.population_density > 0)
        .map(d => ({
            x: d.population_density,
            y: d.per100k,
            state: d.state // for tooltip
        }));

    const ctx = document.getElementById('scatterDensity').getContext('2d');
    scatterDensity = ChartHelpers.createScatter(ctx, [{
        label: 'Rate per 100k',
        data: dataPoints,
        backgroundColor: ChartHelpers.getColor(3),
    }], {
        scales: {
            x: { title: { display: true, text: 'Population Density (persons/sq mi)' }, type: 'logarithmic' },
            y: { title: { display: true, text: 'Rate per 100k' }, type: 'logarithmic' }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                mode: 'point',
                intersect: true,
                callbacks: {
                    label: (context) => {
                        const point = context.raw;
                        return `${point.state}: ${formatNum(point.y, 1)} / 100k (Density: ${formatNum(point.x, 1)})`;
                    }
                }
            }
        }
    });
}

/**
 * Renders the Summary Table (min/max/median)
 */
function renderSummaryTable() {
  document.getElementById('summaryYear').textContent = Qobj.year;
  const dataArr = Object.values(currentYearData).filter(d => d.cases > 0).map(d => ({
    ...d,
    per100k: d.per100k || 0
  }));

  if (dataArr.length === 0) {
    document.getElementById('summaryTableContainer').innerHTML = '<p class="muted">No data points available for summary table.</p>';
    return;
  }

  // Calculate National Total/Rate
  const totalCases = dataArr.reduce((sum, d) => sum + d.cases, 0);
  const totalPop = dataArr.reduce((sum, d) => sum + d.population, 0);
  const nationalRate = (totalCases / totalPop) * 100000;
  
  // Find key stats (Max, Min, Median based on RATE)
  dataArr.sort((a, b) => b.per100k - a.per100k);
  const highestRate = dataArr[0];
  const lowestRate = dataArr[dataArr.length - 1];
  
  const table = document.createElement('table');
  table.className = 'summary-table';
  
  table.innerHTML = `<thead>
    <tr><th>Metric</th><th style="text-align:right">Value</th><th style="text-align:right">State</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>Total Cases (US)</td>
      <td style="text-align:right; font-weight:700;">${formatNum(totalCases)}</td>
      <td style="text-align:right">--</td>
    </tr>
    <tr>
      <td>National Rate / 100k</td>
      <td style="text-align:right; font-weight:700;">${formatNum(nationalRate, 1)}</td>
      <td style="text-align:right">--</td>
    </tr>
    <tr>
      <td>Highest Rate</td>
      <td style="text-align:right">${formatNum(highestRate.per100k, 1)}</td>
      <td style="text-align:right; color:var(--accent); font-weight:600;">${highestRate.state}</td>
    </tr>
    <tr>
      <td>Lowest Rate</td>
      <td style="text-align:right">${formatNum(lowestRate.per100k, 1)}</td>
      <td style="text-align:right; color:var(--muted);">${lowestRate.state}</td>
    </tr>
  </tbody>`;
  
  document.getElementById('summaryTableContainer').innerHTML = '';
  document.getElementById('summaryTableContainer').appendChild(table);
}

// --- MAIN CONTROL FLOW ---

async function updateDashboard() {
  document.getElementById('currentDisease').textContent = Qobj.disease;
  document.getElementById('currentYear').textContent = Qobj.year;

  // 1. Filter Data for selected year and calculate rate per 100k
  const currentYearRows = allData.filter(r => r.year === Qobj.year && r.disease === Qobj.disease);
  
  currentYearData = {};
  currentYearRows.forEach(row => {
    const state = row.state;
    // Aggregate cases and population for states
    if (!currentYearData[state]) {
        currentYearData[state] = { 
            state: state, 
            cases: 0, 
            population: 0, 
            population_density: row.population_density 
        };
    }
    currentYearData[state].cases += row.cases;
    // Use the largest population figure if data is duplicated
    currentYearData[state].population = Math.max(currentYearData[state].population, row.population); 
  });

  // Final calculations (rate per 100k)
  Object.keys(currentYearData).forEach(state => {
    const d = currentYearData[state];
    d.per100k = (d.population > 0) ? (d.cases / d.population) * 100000 : 0;
  });

  // 2. Draw Maps and Legends
  drawMapLayer(casesMap, 'cases');
  drawMapLayer(rateMap, 'per100k');
  addMapLegend('cases', 'casesLegend');
  addMapLegend('per100k', 'rateLegend');
  
  // 3. Render Summary Table
  renderSummaryTable();

  // 4. Draw Charts
  drawLineChart();
  drawBarChart();
  drawBoxPlot(document.getElementById('boxGroup').value);
  drawScatterPlot();
}


document.addEventListener('DOMContentLoaded', async () => {
  // Read query parameters
  Qobj.disease = qParam('disease');
  Qobj.year = qParam('year');
  
  if (!Qobj.disease || !Qobj.year) {
    alert("Error: Disease or Year not specified. Redirecting to home.");
    location.href = 'index.html';
    return;
  }
  
  initializeMaps();

  // 1. Load Data (using the global function from main.js)
  if (!window.loadData) {
      console.error("main.js did not load correctly. Cannot load data.");
      return;
  }
  allData = await window.loadData();
  if (allData.length === 0) return;

  // 2. Load GeoJSON
  try {
      const res = await fetch(GEOJSON_PATH);
      geojsonData = await res.json();
  } catch (e) {
      console.error("Failed to load GeoJSON:", e);
      return;
  }
  
  // 3. Add event listener for boxplot selector
  document.getElementById('boxGroup').addEventListener('change', (e) => {
      drawBoxPlot(e.target.value);
  });
  
  // 4. Add theme listener to redraw maps
  window.addEventListener('theme-change', () => {
      drawMapLayer(casesMap, 'cases');
      drawMapLayer(rateMap, 'per100k');
  });

  // 5. Run the main dashboard update
  updateDashboard();

  document.getElementById('homeBtn').addEventListener('click', () => {
    location.href = 'index.html';
  });
});

