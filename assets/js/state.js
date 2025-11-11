// assets/js/state.js
// State page script — robust loading, normalization, and chart generation using ChartHelpers.

const DATA_PATH = 'assets/data/complete_disease_data.csv';
const GEOJSON_PATH = 'usa_states.geojson'; 

// --- Global Chart Instances for Destruction ---
let chartA, chartB, chartC, chartD, chartE, chartF, stateMapInstance;

// --- Query Parameters and Helper Functions ---
function qParam(name){ 
  const p = new URLSearchParams(location.search); 
  return p.get(name); 
}

const Q = { 
  state: qParam('state') || 'California', 
  disease: qParam('disease') || null, 
  year: qParam('year') || null 
};

// Use helper functions from main.js if available, or define fallbacks
const _pick = window._pick || function(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined) return obj[k]; return undefined;
};
const normaliseRow = window.normaliseRow || function(r) { return r; }; // Fallback
const uniqueSorted = window.uniqueSorted || function(arr) { return [...new Set(arr)].sort(); };
const formatNum = (n, dec=0) => new Intl.NumberFormat('en-US', {maximumFractionDigits: dec}).format(n);

function destroyChart(chartInstance) {
  if(chartInstance) try{ chartInstance.destroy(); }catch(e){}
}

// --- Chart Generation Functions ---

// Plot A: Annual Cases Trend (Time Series)
function drawStateTrend(allRows) {
    if (typeof ChartHelpers === 'undefined') { console.error('ChartHelpers not loaded. Skipping chart A.'); return; }
    const data = allRows
        .filter(r => r.state === Q.state && r.disease === Q.disease)
        .sort((a, b) => Number(a.year) - Number(b.year));
    
    const labels = data.map(r => r.year);
    const cases = data.map(r => r.cases);
    const rates = data.map(r => r.population > 0 ? (r.cases / r.population) * 100000 : 0);

    const ctx = document.getElementById('chartA_stateTrend').getContext('2d');
    destroyChart(chartA);

    chartA = ChartHelpers.createLine(ctx, labels, [
        {
            label: 'Total Cases',
            data: cases,
            yAxisID: 'y1',
            borderColor: ChartHelpers.getColor(0),
            backgroundColor: ChartHelpers.getColor(0).replace('1)', '0.2'),
            tension: 0.3,
            fill: true,
        },
        {
            label: 'Rate / 100k',
            data: rates,
            yAxisID: 'y2',
            borderColor: ChartHelpers.getColor(1),
            backgroundColor: 'transparent',
            tension: 0.3,
            pointStyle: 'circle',
            pointRadius: 4,
        }
    ], {
        scales: {
            y1: { type: 'linear', position: 'left', title: { display: true, text: 'Cases' } },
            y2: { type: 'linear', position: 'right', title: { display: true, text: 'Rate / 100k' }, grid: { drawOnChartArea: false } }
        },
        plugins: { 
            legend: { position: 'bottom' },
            tooltip: { mode: 'index', intersect: false }
        }
    });
}

// Plot B: State Rate vs. National Average
function drawStateNationalComparison(allRows) {
    if (typeof ChartHelpers === 'undefined') { console.error('ChartHelpers not loaded. Skipping chart B.'); return; }
    
    const stateData = allRows
        .filter(r => r.state === Q.state && r.disease === Q.disease)
        .map(r => ({ year: r.year, rate: r.population > 0 ? (r.cases / r.population) * 100000 : 0 }));

    // Calculate national average rate for the same disease
    const nationalData = allRows
        .filter(r => r.disease === Q.disease)
        .reduce((acc, r) => {
            if (!acc[r.year]) acc[r.year] = { cases: 0, pop: 0 };
            acc[r.year].cases += r.cases;
            acc[r.year].pop += r.population;
            return acc;
        }, {});
    
    const years = uniqueSorted(stateData.map(r => r.year));
    const stateRates = years.map(y => stateData.find(d => d.year === y)?.rate || 0);
    const nationalRates = years.map(y => (nationalData[y]?.pop > 0) ? (nationalData[y].cases / nationalData[y].pop) * 100000 : 0);

    const ctx = document.getElementById('chartB_stateNational').getContext('2d');
    destroyChart(chartB);

    chartB = ChartHelpers.createBar(ctx, years, [
        {
            label: `${Q.state} Rate`,
            data: stateRates,
            backgroundColor: ChartHelpers.getColor(0),
        },
        {
            label: 'National Avg. Rate',
            data: nationalRates,
            backgroundColor: ChartHelpers.getColor(1),
        }
    ], {
        scales: { y: { title: { display: true, text: 'Rate per 100k' } } },
        plugins: { 
            legend: { position: 'bottom' },
            tooltip: { mode: 'index', intersect: false }
        }
    });
}

// Plot C: Age Group Distribution (Bar Chart) - MOCKED DATA
function drawStateBar(allRows) {
    if (typeof ChartHelpers === 'undefined') { console.error('ChartHelpers not loaded. Skipping chart C.'); return; }
    
    const currentYearStateData = allRows.filter(r => r.state === Q.state && r.disease === Q.disease && r.year === Q.year);
    const ctx = document.getElementById('chartC_stateBar').getContext('2d');
    destroyChart(chartC);

    if (currentYearStateData.length === 0) {
        ctx.canvas.parentNode.innerHTML = '<div style="text-align:center; padding:50px;" class="muted">Age distribution data not available for this selection.</div>';
        return;
    }
    
    // MOCKING: Distribute total cases across age groups
    const totalCases = currentYearStateData.reduce((sum, r) => sum + r.cases, 0);
    const mockDistribution = { '0-14 Yrs': 0.15, '15-44 Yrs': 0.40, '45-64 Yrs': 0.30, '65+ Yrs': 0.15 };
    
    const labels = Object.keys(mockDistribution);
    const data = labels.map(key => totalCases * mockDistribution[key]);

    chartC = ChartHelpers.createBar(ctx, labels, [{
        label: `Cases in ${Q.year}`,
        data: data,
        backgroundColor: ChartHelpers.getColor(2),
        borderRadius: 5,
    }], {
        scales: { y: { title: { display: true, text: 'Cases (Mocked)' } } },
        plugins: { 
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false }
        }
    });
}

// Plot D: Cases vs. Population Density (Scatter)
function drawStateScatter(allRows) {
    if (typeof ChartHelpers === 'undefined') { console.error('ChartHelpers not loaded. Skipping chart D.'); return; }
    
    // Compare all states for the current disease/year
    const scatterData = allRows
        .filter(r => r.year === Q.year && r.disease === Q.disease)
        .map(r => ({
            x: r.population_density,
            y: r.cases,
            state: r.state
        }));

    const ctx = document.getElementById('chartD_stateScatter').getContext('2d');
    destroyChart(chartD);

    // Highlight the current state
    const statePoint = scatterData.find(p => p.state === Q.state);
    const otherPoints = scatterData.filter(p => p.state !== Q.state);

    chartD = ChartHelpers.createScatter(ctx, [
        {
            label: 'Other States',
            data: otherPoints,
            backgroundColor: ChartHelpers.getColor(3),
        },
        {
            label: Q.state,
            data: statePoint ? [statePoint] : [],
            backgroundColor: ChartHelpers.getColor(1), // Use a contrasting color
            pointRadius: 8,
            pointHoverRadius: 10,
        }
    ], {
        scales: {
            x: { title: { display: true, text: 'Population Density' }, type: 'logarithmic' },
            y: { title: { display: true, text: 'Cases' }, type: 'logarithmic' }
        },
        plugins: {
            legend: { position: 'bottom' },
            tooltip: {
                mode: 'point', // Use point mode for scatter
                intersect: true,
                callbacks: {
                    label: (context) => {
                        const point = context.raw;
                        return `${point.state}: ${formatNum(point.y)} cases (Density: ${formatNum(point.x, 1)})`;
                    }
                }
            }
        }
    });
}

// Plot E: Sunburst (All Diseases, All Years for this State)
function drawStateSunburst(allRows) {
    if (typeof ChartHelpers === 'undefined' || typeof Chart.controllers.sunburst === 'undefined') {
        console.warn('Sunburst plugin not loaded. Skipping chart E.'); 
        document.getElementById('chartE_stateSunburst').getContext('2d').canvas.parentNode.innerHTML = '<div style="text-align:center; padding:50px;" class="muted">Sunburst chart plugin not loaded.</div>';
        return; 
    }

    const stateData = allRows.filter(r => r.state === Q.state && r.cases > 0);
    const ctx = document.getElementById('chartE_stateSunburst').getContext('2d');
    destroyChart(chartE);
    
    // MOCK: Generate hierarchical structure: Disease > Year
    const sunburstData = [];
    const diseases = uniqueSorted(stateData.map(r => r.disease));
    
    diseases.forEach(disease => {
        const diseaseTotal = stateData.filter(r => r.disease === disease).reduce((sum, r) => sum + r.cases, 0);
        sunburstData.push({
            id: disease,
            parent: '',
            value: diseaseTotal,
        });
        
        const years = uniqueSorted(stateData.filter(r => r.disease === disease).map(r => r.year));
        years.forEach(year => {
            const yearTotal = stateData.filter(r => r.disease === disease && r.year === year).reduce((sum, r) => sum + r.cases, 0);
            sunburstData.push({
                id: `${disease}-${year}`,
                parent: disease,
                value: yearTotal,
            });
        });
    });

    chartE = ChartHelpers.createSunburst(ctx, sunburstData, {
        plugins: { 
            legend: { display: false },
            title: { display: true, text: `Case Distribution in ${Q.state} (All Time)`}
        },
    });
}

// Plot F: Heatmap (Disease vs. Year for this State)
function drawStateHeatmap(allRows) {
    if (typeof ChartHelpers === 'undefined' || typeof Chart.controllers.matrix === 'undefined') {
        console.warn('Matrix plugin not loaded. Skipping chart F.'); 
        document.getElementById('chartF_stateHeatmap').getContext('2d').canvas.parentNode.innerHTML = '<div style="text-align:center; padding:50px;" class="muted">Matrix (Heatmap) chart plugin not loaded.</div>';
        return; 
    }
    
    const stateData = allRows.filter(r => r.state === Q.state && r.cases > 0);
    const diseases = uniqueSorted(stateData.map(r => r.disease));
    const years = uniqueSorted(stateData.map(r => r.year));
    
    const data = [];
    let maxCases = 0;
    diseases.forEach(d => years.forEach(y => {
        const v = stateData.filter(r=> r.disease===d && r.year===y).reduce((s,r)=> s + r.cases, 0);
        data.push({x: y, y: d, v});
        if(v > maxCases) maxCases = v;
    }));

    const ctx = document.getElementById('chartF_stateHeatmap').getContext('2d');
    destroyChart(chartF);

    chartF = ChartHelpers.createMatrix(ctx, data, { x: years, y: diseases }, {
        label: 'Cases',
        maxVal: maxCases, // Pass max value for color scaling
        plugins: {
            title: { display: true, text: `Case Intensity in ${Q.state}` },
            tooltip: {
                callbacks: {
                    title: (context) => `${context[0].raw.y}`,
                    label: (context) => `Year ${context[0].raw.x}: ${formatNum(context[0].raw.v)} cases`
                }
            }
        },
        scales: {
            x: { title: { display: true, text: 'Year' } },
            y: { title: { display: true, text: 'Disease' } }
        }
    });
}


// --- MAP (Mini-map for context) ---

async function drawStateMap(allRows) {
    try {
        const res = await fetch(GEOJSON_PATH);
        const geojson = await res.json();
        
        const stateFeature = geojson.features.find(f => f.properties.NAME === Q.state);
        if (!stateFeature) {
            document.getElementById('stateMap').innerHTML = `<div class="muted" style="padding:20px;">Geographic data for ${Q.state} not found.</div>`;
            return;
        }

        if(stateMapInstance) stateMapInstance.remove();
        
        stateMapInstance = L.map('stateMap', {
            zoomControl: false,
            scrollWheelZoom: false,
            dragging: false,
            attributionControl: false
        }).setView([39.8283, -98.5795], 4); // Default center

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap, &copy; CartoDB'
        }).addTo(stateMapInstance);

        const layer = L.geoJson(stateFeature, {
            style: {
                fillColor: ChartHelpers.getColor(0),
                weight: 2,
                opacity: 1,
                color: 'white',
                fillOpacity: 0.7
            }
        }).addTo(stateMapInstance);
        
        stateMapInstance.fitBounds(layer.getBounds(), { padding: [10, 10] });

    } catch (e) {
        console.error("Error drawing state map:", e);
        document.getElementById('stateMap').innerHTML = `<div class="muted" style="padding:20px;">Error loading map.</div>`;
    }
}


// --- MAIN INITIALIZATION ---

async function initDashboard() {
    if (!Q.state || !Q.disease || !Q.year) {
        document.getElementById('stateTitle').textContent = 'Error: Missing State, Disease, or Year';
        return;
    }
    
    // 1. Load Data
    // Use window.loadData (from main.js) to get cached or fresh data
    if (!window.loadData) {
        console.error("main.js (with loadData function) must be loaded first.");
        return;
    }
    const allRows = await window.loadData();
    if (allRows.length === 0) return;

    // 2. Filter Data
    const stateDataAllTime = allRows.filter(r => r.state === Q.state);
    const currentDiseaseData = stateDataAllTime.filter(r => r.disease === Q.disease);
    const currentYearData = stateDataAllTime.filter(r => r.year === Q.year);
    // Data for scatter plot (all states, current year/disease)
    const nationalFilteredData = allRows.filter(r => r.year === Q.year && r.disease === Q.disease); 
    
    const stateRow = currentDiseaseData.find(r => r.year === Q.year);

    if (!stateRow) {
        console.error(`No data found for ${Q.disease} in ${Q.state} for ${Q.year}.`);
        document.getElementById('stateTitle').textContent = `No data found for ${Q.state}`;
        return;
    }

    // 3. Update Metadata
    document.getElementById('stateTitle').textContent = Q.state;
    document.getElementById('diseaseYearMeta').textContent = `${Q.disease} (${Q.year})`;
    document.getElementById('statCases').textContent = formatNum(stateRow.cases);
    document.getElementById('statPop').textContent = formatNum(stateRow.population);
    document.getElementById('statRate').textContent = formatNum(calculatePer100k(stateRow.cases, stateRow.population), 1);
    
    // Build historical table
    const historicalData = currentDiseaseData.sort((a,b) => b.year - a.year);
    let tableHTML = `<table style="width:100%; font-size:0.9rem;">
        <thead><tr><th>Year</th><th style="text-align:right">Cases</th><th style="text-align:right">Rate/100k</th></tr></thead>
        <tbody>`;
    historicalData.forEach(r => {
        tableHTML += `<tr>
            <td>${r.year}</td>
            <td style="text-align:right">${formatNum(r.cases)}</td>
            <td style="text-align:right">${formatNum(calculatePer100k(r.cases, r.population), 1)}</td>
        </tr>`;
    });
    tableHTML += `</tbody></table>`;
    document.getElementById('summaryTableContainer').innerHTML = tableHTML;
    document.getElementById('stateLatest').textContent = `Map shows ${Q.state}`;

    // 4. Draw Map
    drawStateMap(allRows);

    // 5. Create Charts
    // Note: Some charts use allData or nationalFilteredData for comparison
    drawStateTrend(allRows); // Plot A
    drawStateNationalComparison(allRows); // Plot B
    drawStateBar(allRows); // Plot C (Mocked Age)
    drawStateScatter(allRows); // Plot D
    drawStateSunburst(allRows); // Plot E
    drawStateHeatmap(allRows); // Plot F
}

// --- Event Listeners and Initial Load ---

document.addEventListener('DOMContentLoaded', () => {
    // Back button
    document.getElementById('backToMap').addEventListener('click', () => {
      const q = new URLSearchParams({ disease: Q.disease, year: Q.year });
      location.href = `map.html?${q.toString()}`;
    });
    
    // Initialize the dashboard
    // We must wait for main.js to load data and for ChartHelpers to be defined
    if(typeof ChartHelpers !== 'undefined' && typeof Papa !== 'undefined'){
      initDashboard();
    } else {
      console.error("Dependencies (ChartHelpers, PapaParse) are not fully loaded.");
      // Retry once after a short delay
      setTimeout(initDashboard, 500);
    }
});





