// state.js - builds the state-level page with multiple independent charts and dropdowns
const DATA_PATH = 'assets/data/usa_disease_data_sample.csv';
const GEOJSON_PATH = 'usa_states.geojson';

let stateMap;

function parseQuery(){
  const p = new URLSearchParams(location.search);
  return { state: p.get('state') || 'California', disease: p.get('disease') || null, year: p.get('year') || null };
}

async function init(){
  const q = parseQuery();

  // bind theme buttons
  document.getElementById('backToHome').addEventListener('click', ()=> location.href='index.html');

  // load CSV
  const data = await new Promise(resolve=>{
    Papa.parse(DATA_PATH, { download:true, header:true, complete: (res)=> resolve(res.data.filter(r=>r.state)) });
  });

  // display header text
  document.getElementById('stateTitle').innerText = q.state;
  document.getElementById('diseaseYearText').innerText = (q.disease? q.disease : 'All diseases') + (q.year ? ' · ' + q.year : '');

  // compute simple state stats
  const stateAll = data.filter(r => r.state === q.state);
  const stateFiltered = stateAll.filter(r => (!q.disease || r.disease === q.disease) && (!q.year || r.year === q.year));

  const totalCases = stateFiltered.reduce((a,b)=> a + (Number(b.cases)||0), 0);
  const population = stateAll.length ? Number(stateAll[0].population) || 0 : 0;
  const density = stateAll.length ? Number(stateAll[0].population_density) || 0 : 0;

  document.getElementById('stateTotalCases').innerText = totalCases.toLocaleString();
  document.getElementById('statePopulation').innerText = population ? population.toLocaleString() : '—';
  document.getElementById('stateDensity').innerText = density || '—';

  // build map centered on state (attempt to find state geometry)
  fetch(GEOJSON_PATH).then(r=> r.json()).then(geo => {
    const f = geo.features.find(fe => {
      const n = fe.properties.name || fe.properties.NAME || fe.properties.STATE_NAME;
      return n === q.state;
    });
    const center = f ? getFeatureCenter(f) : [37.8, -96];
    if(!stateMap){
      stateMap = L.map('stateMap', { zoomControl:true }).setView(center, f?6:4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(stateMap);
    } else {
      stateMap.setView(center, f?6:4);
    }

    if(f){
      L.geoJSON(f, { style:{ fillColor:'#ffcc33', weight:2, color:'#333', fillOpacity:0.6 } }).addTo(stateMap);
    }
  });

  // CHART A
  const chartACtx = document.getElementById('chartA').getContext('2d');
  let chartA;
  function drawChartA(mode){
    if(chartA) chartA.destroy();
    if(mode === 'scatter_year'){
      const points = stateAll.reduce((acc, r) => {
        acc.push({ x: Number(r.population||0), y: Number(r.cases||0), label:r.year + ' ' + r.disease});
        return acc;
      }, []);
      chartA = ChartHelpers.createScatter(chartACtx, points, { xLabel:'Population', yLabel:'Cases', label:'Population vs Cases' });
    } else { // bar by year for filtered disease
      const byYear = {};
      stateAll.forEach(r => {
        if(q.disease && r.disease !== q.disease) return;
        byYear[r.year] = (byYear[r.year] || 0) + (Number(r.cases)||0);
      });
      const years = Object.keys(byYear).sort();
      chartA = ChartHelpers.createBar(chartACtx, years, [{ label:'Cases', data: years.map(y => byYear[y]) }]);
    }
  }

  // CHART B
  const chartBCtx = document.getElementById('chartB').getContext('2d');
  let chartB;
  function drawChartB(mode){
    if(chartB) chartB.destroy();
    const byYear = {};
    stateAll.forEach(r => {
      if(q.disease && r.disease !== q.disease) return;
      byYear[r.year] = byYear[r.year] || {cases:0, density: Number(r.population_density)||0};
      byYear[r.year].cases += Number(r.cases)||0;
    });
    const years = Object.keys(byYear).sort();
    const cases = years.map(y => byYear[y].cases);
    const density = years.map(y => byYear[y].density);
    if(mode === 'dual_line'){
      chartB = new Chart(chartBCtx, {
        type:'line',
        data: { labels: years, datasets: [
          { label:'Cases', data: cases, yAxisID:'y1', borderWidth:2, fill:false },
          { label:'Density', data: density, yAxisID:'y2', borderWidth:2, fill:false }
        ]},
        options: { responsive:true, scales: { y1:{ position:'left' }, y2:{ position:'right' } } }
      });
    } else {
      chartB = ChartHelpers.createLine(chartBCtx, years, [{ label:'Cumulative Cases', data: cases, fill:true }]);
    }
  }

  // CHART C (multi-disease)
  const chartCCtx = document.getElementById('chartC').getContext('2d');
  let chartC;
  function drawChartC(mode){
    if(chartC) chartC.destroy();
    // group by disease and year
    const diseases = Array.from(new Set(stateAll.map(r=>r.disease)));
    const years = Array.from(new Set(stateAll.map(r=>r.year))).sort();
    const datasets = diseases.map(d => {
      const dataByYear = years.map(y => {
        return stateAll.filter(r => r.disease===d && r.year===y).reduce((s,x)=> s + (Number(x.cases)||0), 0);
      });
      return { label:d, data: dataByYear, borderWidth:1, fill: mode==='stacked' };
    });
    chartC = new Chart(chartCCtx, {
      type: mode === 'stacked' ? 'bar' : 'bar',
      data: { labels: years, datasets },
      options: { responsive:true, scales:{ x:{ stacked: mode==='stacked' }, y:{ stacked: mode==='stacked' } } }
    });
  }

  // CHART D (two options)
  const chartDCtx = document.getElementById('chartD').getContext('2d');
  let chartD;
  function drawChartD(mode){
    if(chartD) chartD.destroy();
    const points = stateAll.map(r => ({ x: mode==='scatter_density_cases' ? Number(r.population_density||0) : Number(r.population||0), y: Number(r.cases||0) }));
    chartD = ChartHelpers.createScatter(chartDCtx, points, { xLabel: mode==='scatter_density_cases' ? 'Density' : 'Population', yLabel:'Cases' });
  }

  // initial draws
  drawChartA(document.getElementById('chartA_select').value || 'scatter_year');
  drawChartB(document.getElementById('chartB_select').value || 'dual_line');
  drawChartC(document.getElementById('chartC_select').value || 'multi_bar');
  drawChartD(document.getElementById('chartD_select').value || 'scatter_density_cases');

  // bind select listeners
  document.getElementById('chartA_select').addEventListener('change', (e)=> drawChartA(e.target.value));
  document.getElementById('chartB_select').addEventListener('change', (e)=> drawChartB(e.target.value));
  document.getElementById('chartC_select').addEventListener('change', (e)=> drawChartC(e.target.value));
  document.getElementById('chartD_select').addEventListener('change', (e)=> drawChartD(e.target.value));
}

function getFeatureCenter(feature){
  // compute approximate centroid from bbox / geometry
  const coords = feature.geometry.coordinates;
  // For MultiPolygon use first polygon
  let c = [37.8, -96];
  try {
    if(feature.bbox){
      const [minx,miny,maxx,maxy] = feature.bbox;
      c = [(miny+maxy)/2,(minx+maxx)/2];
    } else {
      // fallback for polygon
      const flat = feature.geometry.coordinates.flat(3);
      const longSum = flat.reduce((a,b,i)=> a + (i%2===0?b:0), 0);
      // not perfect; we'll fallback to general center
      c = [37.8, -96];
    }
  } catch (e) {
    c = [37.8, -96];
  }
  return c;
}

document.addEventListener('DOMContentLoaded', init);
