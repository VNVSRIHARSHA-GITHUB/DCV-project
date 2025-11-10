// map.js - builds two choropleths (cases & population density) and two summary plots below
const DATA_PATH = 'assets/data/usa_disease_data_sample.csv';
const GEOJSON_PATH = 'usa_states.geojson';

let casesMap, densityMap, geojsonLayer;

async function init(){
  const params = new URLSearchParams(location.search);
  const disease = params.get('disease') || null;
  const year = params.get('year') || null;

  // load CSV
  const data = await new Promise(resolve=>{
    Papa.parse(DATA_PATH, { download:true, header:true, complete: (res)=> resolve(res.data.filter(r=>r.state)) });
  });

  // compute aggregations by state for given disease & year if provided, otherwise for all years/diseases
  const filtered = data.filter(r => {
    if(disease && r.disease !== disease) return false;
    if(year && r.year !== year) return false;
    return true;
  });

  // map by state
  const byState = {};
  filtered.forEach(r=>{
    const s = r.state;
    byState[s] = byState[s] || {cases:0, population: Number(r.population) || 0, density: Number(r.population_density) || 0};
    byState[s].cases += Number(r.cases) || 0;
    // keep population/density from last row if present
  });

  // compute totals
  const totalCases = Object.values(byState).reduce((a,b)=>a + (b.cases||0),0);
  const totalPop = Object.values(byState).reduce((a,b)=>a + (b.population||0),0);
  const avgDensity = Object.values(byState).length ? (Object.values(byState).reduce((a,b)=>a + (b.density||0),0)/Object.values(byState).length).toFixed(1) : '—';

  document.getElementById('totalCasesUSA').innerText = totalCases.toLocaleString();
  document.getElementById('totalPopulationUSA').innerText = totalPop ? totalPop.toLocaleString() : '—';
  document.getElementById('avgDensityUSA').innerText = avgDensity;

  // load geojson
  fetch(GEOJSON_PATH).then(r => r.json()).then(geojson => {
    buildMaps(geojson, byState, disease, year);
    buildPlots(filtered);
  }).catch(err => {
    console.error('geojson load error', err);
    alert('Please add usa_states.geojson file to the repo root.');
  });

  // Home button
  document.getElementById('homeBtn').addEventListener('click', ()=> location.href='index.html');
}

function buildMaps(geojson, byState, disease, year){
  // helper color function
  function getColorCases(d) {
    return d > 10000 ? '#081b6e' :
           d > 5000 ? '#0b3db3' :
           d > 2000 ? '#1081ff' :
           d > 500  ? '#3fb8ff' :
           d > 100  ? '#a7e2ff' :
                      '#e6f7ff';
  }
  function getColorDensity(d){
    return d > 1000 ? '#4a0b0b' :
           d > 500 ? '#8b1f1f' :
           d > 200 ? '#c92a2a' :
           d > 50 ? '#ff7b7b' :
           d > 10 ? '#ffcfcf' :
                    '#fff5f5';
  }

  // create maps if not exist
  if(!casesMap) {
    casesMap = L.map('casesMap', { zoomControl:true }).setView([37.8, -96], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap contributors' }).addTo(casesMap);
  } else {
    casesMap.eachLayer(l => { if(l.options && l.options.pane !== 'tilePane') casesMap.removeLayer(l); });
  }

  if(!densityMap) {
    densityMap = L.map('densityMap', { zoomControl:true }).setView([37.8, -96], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap contributors' }).addTo(densityMap);
  } else {
    densityMap.eachLayer(l => { if(l.options && l.options.pane !== 'tilePane') densityMap.removeLayer(l); });
  }

  // add geojson to both maps with coloring and tooltips
  function styleCases(feature){
    const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
    const val = (byState[name] && byState[name].cases) || 0;
    return { fillColor: getColorCases(val), weight:1, opacity:1, color:'#fff', fillOpacity:0.9 };
  }
  function styleDensity(feature){
    const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
    const val = (byState[name] && byState[name].density) || 0;
    return { fillColor: getColorDensity(val), weight:1, opacity:1, color:'#fff', fillOpacity:0.9 };
  }

  function onEach(feature, layer){
    const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
    const st = byState[name] || {cases:0, population:0, density:0};
    layer.bindPopup(`<strong>${name}</strong><br/>Cases: ${st.cases}<br/>Population: ${st.population || '—'}<br/>Density: ${st.density || '—' }`);
    layer.on('click', ()=>{
      const q = new URLSearchParams({state: name, disease: disease || '', year: year || ''});
      location.href = `state.html?${q.toString()}`;
    });
  }

  L.geoJSON(geojson, { style: styleCases, onEachFeature: onEach }).addTo(casesMap);
  L.geoJSON(geojson, { style: styleDensity, onEachFeature: onEach }).addTo(densityMap);
}

function buildPlots(filtered){
  // Bivariate scatter: cases vs density (state-level points)
  const byState = {};
  filtered.forEach(r=>{
    const s = r.state;
    byState[s] = byState[s] || {cases:0, density: Number(r.population_density) || 0};
    byState[s].cases += Number(r.cases) || 0;
  });
  const points = Object.entries(byState).map(([s, v]) => ({ x: v.density || 0, y: v.cases || 0, label:s }));

  const bivarCtx = document.getElementById('bivarPlot').getContext('2d');
  const bivarData = points.map(p => ({ x:p.x, y:p.y }));
  ChartHelpers.createScatter(bivarCtx, bivarData, { xLabel: 'Population density', yLabel: 'Cases' });

  // Time series national trend (aggregate by year)
  const agg = {};
  filtered.forEach(r=>{
    agg[r.year] = agg[r.year] || 0;
    agg[r.year] += Number(r.cases) || 0;
  });
  const years = Object.keys(agg).sort();
  const values = years.map(y => agg[y]);
  const tsCtx = document.getElementById('timeSeriesPlot').getContext('2d');
  ChartHelpers.createLine(tsCtx, years, [{ label:'Cases', data: values, borderWidth:2, fill:false }]);
}

document.addEventListener('DOMContentLoaded', init);
