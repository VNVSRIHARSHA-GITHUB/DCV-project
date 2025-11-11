// map.js (complete replacement)
// - Robust column-name handling (common alternative names)
// - Cases choropleth uses blue->green->violet ramp (no red)
// - Density choropleth overlay added (toggleable via layer control)
// - Popups appear on mouseover and on click
// - Removes previous layers before adding new ones (prevents double stacking)
// - Uses cached window.__PHdata if available (main.js sets it); otherwise loads CSV
// - Hooks UI controls to redraw charts and maps

const DATA_PATH = 'assets/data/complete_disease_data.csv';
const GEOJSON_PATH = 'usa_states.geojson';

let casesMap;
let geojsonData;
let byStateAgg = {};
let casesLayer = null;
let densityLayer = null;

let casesByStateChart, histChart, scatterChart, multiChart, boxChart;

function _pick(obj, keys){
  for(const k of keys) if(obj[k] !== undefined) return obj[k];
  return undefined;
}

function normaliseRow(r){
  // robust field selection - map likely variants to standard keys
  return {
    state: _pick(r, ['state','State','STATE','location','province']) || '',
    year: _pick(r, ['year','Year','YEAR']) || '',
    disease: _pick(r, ['disease','Disease','condition']) || '',
    cases: Number(_pick(r, ['cases','Cases','value','count']) || 0),
    population: Number(_pick(r, ['population','Population','pop']) || 0),
    population_density: Number(_pick(r, ['population_density','population density','density','pop_density']) || 0)
  };
}

function fetchAll(){
  return Promise.all([
    fetch(GEOJSON_PATH).then(r=>r.json()),
    new Promise(res=> Papa.parse(DATA_PATH,{download:true,header:true,complete(r){ res(r.data); }}))
  ]);
}

function formatNum(n){ if(n===null||n===undefined) return '—'; return Number(n).toLocaleString(); }

function aggregateByState(data, disease, year){
  const map = {};
  data.forEach(raw => {
    const r = normaliseRow(raw);
    if(!r.state) return;
    if(disease && r.disease !== disease) return;
    if(year && String(r.year) !== String(year)) return;
    const s = r.state;
    map[s] = map[s] || {cases:0, population: r.population || 0, density: r.population_density || 0};
    map[s].cases += Number(r.cases)||0;
    map[s].population = map[s].population || Number(r.population)||0;
    map[s].density = map[s].density || Number(r.population_density)||0;
  });
  Object.values(map).forEach(v => v.per100k = v.population ? (v.cases / Math.max(v.population,1))*100000 : 0);
  return map;
}

function init(){
  const params = new URLSearchParams(location.search);
  const currentDisease = params.get('disease') || null;
  const currentYear = params.get('year') || null;

  document.getElementById('homeBtn').addEventListener('click', ()=> location.href='index.html');

  // load geo + csv (use any cached window.__PHdata if present)
  const csvPromise = window.__PHdata ? Promise.resolve(window.__PHdata) :
    new Promise(res=> Papa.parse(DATA_PATH,{download:true,header:true,complete(r)=> res(r.data)}));

  Promise.all([ fetch(GEOJSON_PATH).then(r=>r.json()), csvPromise ])
    .then(([geojson, csvData]) => {
      geojsonData = geojson;
      // normalise CSV rows once and cache to window for other pages
      window.__PHdata = (csvData||[]).map(normaliseRow).filter(x=> x.state && x.year);
      const data = window.__PHdata;

      // header text
      const header = document.querySelector('.map-card .small');
      if(header) header.innerText = `Dataset: ${currentDisease || 'All'} · Year: ${currentYear || 'All'}`;

      byStateAgg = aggregateByState(data, currentDisease, currentYear);
      buildMaps(geojson, byStateAgg);
      buildAllCharts(data, byStateAgg);
      renderSummaryTable(byStateAgg);
      populateMultiDiseaseSelector(data);
    }).catch(err=> console.error('Load error', err));

  // controls
  document.getElementById('casesSortSelect').addEventListener('change', (e)=> buildCasesByStateBar(byStateAgg, e.target.value));
  document.getElementById('histNorm').addEventListener('change', ()=> buildHistogram(byStateAgg));
  document.getElementById('scatterColorBy').addEventListener('change', ()=> buildScatter(byStateAgg));
  document.getElementById('scatterPerCapita').addEventListener('change', ()=> buildScatter(byStateAgg));
  document.getElementById('diseaseMultiSelect').addEventListener('change', ()=> buildMultiSeries());
  document.getElementById('boxGroup').addEventListener('change', ()=> buildBoxPlot());
  document.getElementById('boxNorm').addEventListener('change', ()=> buildBoxPlot());
  document.getElementById('boxAxis').addEventListener('change', ()=> buildBoxPlot());
}

function styleHighlight(feature){
  return { weight:2, color:'#222', fillOpacity:0.95 };
}

function buildMaps(geojson, byState){
  // colour ramps: gentle green -> blue -> violet -> deep purple (no red)
  const getColorCases = v => {
    if(v > 2000000) return '#3b0d6b';
    if(v > 500000) return '#7b4bd6';
    if(v > 100000) return '#4f9bd6';
    if(v > 20000) return '#7fe3a3';
    return '#e6fbf0';
  };

  const getColorDensity = d => {
    if(d > 1000) return '#3b0d6b';
    if(d > 300) return '#7b4bd6';
    if(d > 100) return '#4f9bd6';
    if(d > 20) return '#7fe3a3';
    return '#e6fbf0';
  };

  // init map once
  if(!casesMap){
    casesMap = L.map('casesMap', {preferCanvas:true}).setView([37.8,-96],4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(casesMap);
  }

  // remove old layers
  if(casesLayer) { casesMap.removeLayer(casesLayer); casesLayer = null; }
  if(densityLayer) { casesMap.removeLayer(densityLayer); densityLayer = null; }

  // build cases layer
  casesLayer = L.geoJSON(geojson, {
    style: feature => {
      const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
      const val = (byState[name] && byState[name].cases) || 0;
      return { fillColor: getColorCases(val), weight:1, color:'#fff', fillOpacity:0.95 };
    },
    onEachFeature: function(feature, layer){
      const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
      const s = byState[name] || {cases:0,population:0,density:0, per100k:0};

      const popupHtml = `<strong>${name}</strong><br/>Cases: ${formatNum(s.cases)}<br/>Population: ${formatNum(s.population)}<br/>Density: ${s.density || '—'}<br/>Per 100k: ${Math.round(s.per100k)}`;

      layer.bindPopup(popupHtml);

      layer.on('mouseover', function(e){
        this.openPopup();
        this.setStyle(styleHighlight(feature));
      });

      layer.on('mouseout', function(e){
        this.closePopup();
        // reset style - leaflet will reapply the style function when needed; simpler to reset by removing and re-adding?
        casesLayer.resetStyle(this);
      });

      layer.on('click', ()=> {
        // navigate to state page (preserve disease/year from header)
        const params = new URLSearchParams(location.search);
        const disease = params.get('disease') || '';
        const year = params.get('year') || '';
        location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(disease)}&year=${encodeURIComponent(year)}`;
      });
    }
  }).addTo(casesMap);

  // build density layer (separate style, but same geojson)
  densityLayer = L.geoJSON(geojson, {
    style: feature => {
      const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
      const val = (byState[name] && byState[name].density) || 0;
      return { fillColor: getColorDensity(val), weight:1, color:'#fff', fillOpacity:0.95 };
    },
    onEachFeature: function(feature, layer){
      const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
      const s = byState[name] || {cases:0,population:0,density:0, per100k:0};
      const popupHtml = `<strong>${name}</strong><br/>Density: ${formatNum(s.density)}<br/>Cases: ${formatNum(s.cases)}<br/>Per 100k: ${Math.round(s.per100k)}`;
      layer.bindPopup(popupHtml);
      layer.on('mouseover', function(){ this.openPopup(); this.setStyle(styleHighlight(feature)); });
      layer.on('mouseout', function(){ this.closePopup(); densityLayer.resetStyle(this); });
      layer.on('click', ()=> {
        const params = new URLSearchParams(location.search);
        const disease = params.get('disease') || '';
        const year = params.get('year') || '';
        location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(disease)}&year=${encodeURIComponent(year)}`;
      });
    }
  });

  // Add both layers to a layer control so user can toggle
  const overlays = {
    "Cases": casesLayer,
    "Density": densityLayer
  };
  // Add layer control (remove existing first)
  if(window._ph_layer_control) { window._ph_layer_control.remove(); window._ph_layer_control = null; }
  window._ph_layer_control = L.control.layers(null, overlays, { collapsed:false }).addTo(casesMap);

  // default: show cases, keep density available via control
  // casesLayer already added; density layer is left off map (control will toggle)
}

function buildAllCharts(allData, byState){
  buildCasesByStateBar(byState);
  buildHistogram(byState);
  buildScatter(byState);
  populateMultiDiseaseSelector(allData);
  buildMultiSeries(allData);
  buildBoxPlot();
}

function buildCasesByStateBar(byState, sortMode='cases_desc'){
  const rows = Object.entries(byState).map(([state,v])=> ({state, cases:v.cases||0, population:v.population||0, density:v.density||0, per100k: v.per100k||0}));
  switch(sortMode){
    case 'cases_asc': rows.sort((a,b)=> a.cases - b.cases); break;
    case 'cases_desc': rows.sort((a,b)=> b.cases - a.cases); break;
    case 'alpha_asc': rows.sort((a,b)=> a.state.localeCompare(b.state)); break;
    case 'alpha_desc': rows.sort((a,b)=> b.state.localeCompare(a.state)); break;
    case 'pop_desc': rows.sort((a,b)=> b.population - a.population); break;
    case 'density_desc': rows.sort((a,b)=> b.density - a.density); break;
    case 'per100k_desc': rows.sort((a,b)=> b.per100k - a.per100k); break;
    default: rows.sort((a,b)=> b.cases - a.cases);
  }
  const labels = rows.map(r=>r.state);
  const data = rows.map(r=>r.cases);
  const maxCases = data.length ? Math.max(...data) : 0;
  const bg = rows.map(r=> r.cases === maxCases ? '#3b4b7b' : 'rgba(95,220,200,0.9)');

  const ctx = document.getElementById('casesByStateBar').getContext('2d');
  if(casesByStateChart) casesByStateChart.destroy();
  casesByStateChart = new Chart(ctx, {
    type:'bar',
    data:{labels, datasets:[{label:`Cases`, data, backgroundColor:bg}]},
    options:{maintainAspectRatio:false,scales:{x:{ticks:{maxRotation:45}},y:{beginAtZero:true}},plugins:{tooltip:{callbacks:{label:c=> `${c.raw.toLocaleString()} cases`}}}}
  });
}

function roundBinWidth(width){
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1,width))));
  const v = Math.round(width / p) * p;
  if(v === 0) return p;
  return v;
}

function buildHistogram(byState){
  const norm = document.getElementById('histNorm').value;
  const arr = Object.entries(byState).map(([s,v]) => {
    if(norm === 'per100k') return v.per100k || 0;
    return v.cases || 0;
  });
  if(!arr.length) return;
  const min = Math.min(...arr), max = Math.max(...arr);
  let width = (max - min) / 4 || 1;
  width = roundBinWidth(width);
  const bins = [];
  let start = Math.floor(min);
  for(let i=0;i<4;i++){
    const end = start + width - 1;
    bins.push({ start, end, count:0, states:[] });
    start = end + 1;
  }
  Object.entries(byState).forEach(([s,v])=>{
    const val = norm === 'per100k' ? v.per100k || 0 : v.cases || 0;
    for(const b of bins){
      if(val >= b.start && val <= b.end){ b.count++; b.states.push({state:s, val}); return; }
    }
    bins[bins.length-1].count++;
    bins[bins.length-1].states.push({state:s, val});
  });

  const labels = bins.map(b=> `${b.start.toLocaleString()}–${b.end.toLocaleString()}`);
  const data = bins.map(b=> b.count);
  const ctx = document.getElementById('casesHistogram').getContext('2d');
  if(histChart) histChart.destroy();
  histChart = new Chart(ctx, { type:'bar', data:{labels, datasets:[{label:'# states', data}]}, options:{
    maintainAspectRatio:false,
    plugins:{tooltip:{callbacks:{label: (ctx)=>{
      const b = bins[ctx.dataIndex];
      const top = b.states.sort((a,b)=>b.val - a.val).slice(0,3).map(x=>`${x.state} (${Math.round(x.val).toLocaleString()})`).join(', ');
      return `${b.count} states — Top: ${top}`;
    }}}}
  }});
}

function buildScatter(byState){
  const perCap = document.getElementById('scatterPerCapita').checked;
  const points = Object.entries(byState).map(([s,v])=>{
    return { x: v.density || 0, y: perCap ? v.per100k || 0 : v.cases || 0, label:s };
  });
  const ctx = document.getElementById('scatterDensityCases').getContext('2d');
  if(scatterChart) scatterChart.destroy();
  scatterChart = new Chart(ctx,{type:'scatter',data:{datasets:[{label:'States',data:points, backgroundColor:'rgba(30,144,255,0.6)'}]},options:{
    maintainAspectRatio:false,
    plugins:{tooltip:{callbacks:{label(it){ const r = it.raw; return `${r.label}: ${perCap ? Math.round(r.y) + ' per100k' : r.y + ' cases'}` }}}},scales:{x:{title:{display:true,text:'Population density'}},y:{title:{display:true,text: perCap ? 'Cases per 100k' : 'Cases'}}}
  }});
}

function populateMultiDiseaseSelector(allData){
  const ds = Array.from(new Set(allData.map(r=>r.disease))).sort();
  const sel = document.getElementById('diseaseMultiSelect');
  sel.innerHTML = ds.map(d=>`<option value="${d}">${d}</option>`).join('');
  // default top 4
  const totals = {};
  allData.forEach(r=> totals[r.disease] = (totals[r.disease]||0) + (Number(r.cases)||0));
  const top = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
  Array.from(sel.options).forEach(o => { if(top.includes(o.value)) o.selected = true; });
}

function buildMultiSeries(allData){
  // if called without argument, use cached
  const data = allData || window.__PHdata || [];
  const selected = Array.from(document.getElementById('diseaseMultiSelect').selectedOptions).map(o=>o.value);
  if(!selected.length) return;
  const yearsPer = {};
  selected.forEach(d=>{
    yearsPer[d] = Array.from(new Set(data.filter(r=>r.disease===d).map(r=>r.year))).sort();
  });
  const common = selected.reduce((acc,d)=>{
    const arr = yearsPer[d];
    if(!acc) return arr;
    return acc.filter(y => arr.includes(y));
  }, null) || [];
  const datasets = selected.map((d, i)=>{
    const totals = common.map(y => data.filter(r=>r.disease===d && String(r.year)===String(y)).reduce((s,r)=> s + (Number(r.cases)||0), 0));
    return { label: d, data: totals, borderWidth:2, fill:false };
  });
  const ctx = document.getElementById('multiDiseaseSeries').getContext('2d');
  if(multiChart) multiChart.destroy();
  multiChart = new Chart(ctx, {type:'line', data:{labels:common, datasets}, options:{maintainAspectRatio:false, plugins:{legend:{position:'top'}}}});
}

function buildBoxPlot(){
  // Use cached CSV for boxplot computation
  const allData = window.__PHdata || [];
  const group = document.getElementById('boxGroup').value;
  const norm = document.getElementById('boxNorm').value;
  const axis = document.getElementById('boxAxis').value;

  // if byYear: for each year compute array of state values
  if(group === 'byYear'){
    const years = Array.from(new Set(allData.map(x=>x.year))).sort();
    const labels = [];
    const datasetsArr = [];
    years.forEach(y=>{
      const states = Array.from(new Set(allData.map(d=>d.state)));
      const arr = states.map(s=>{
        const sum = allData.filter(d=>d.state===s && String(d.year)===String(y)).reduce((a,b)=>a + (Number(b.cases)||0),0);
        if(norm === 'per100k'){
          const popRow = allData.find(d=>d.state===s && String(d.year)===String(y));
          const pop = popRow ? Number(popRow.population)||1 : 1;
          return (sum / Math.max(pop,1)) * 100000;
        }
        return sum;
      });
      labels.push(y);
      datasetsArr.push(arr);
    });
    const ctx = document.getElementById('boxplotCases').getContext('2d');
    if(boxChart) boxChart.destroy();
    // chartjs-boxplot expects dataset.data as array of arrays where each array corresponds to a label
    boxChart = new Chart(ctx, {type:'boxplot', data:{labels, datasets:[{label:'Distribution', backgroundColor:'rgba(30,144,255,0.6)', data: datasetsArr}]}, options:{maintainAspectRatio:false, scales:{y:{type: axis}}}});
  } else {
    // byState: each box across years
    const states = Array.from(new Set(allData.map(x=>x.state))).sort();
    const years = Array.from(new Set(allData.map(x=>x.year))).sort();
    const datasetsArr = states.map(s => {
      return years.map(y => {
        const sum = allData.filter(d=>d.state===s && String(d.year)===String(y)).reduce((a,b)=>a+(Number(b.cases)||0),0);
        if(norm === 'per100k'){
          const popRow = allData.find(d=>d.state===s && String(d.year)===String(y));
          const pop = popRow ? Number(popRow.population)||1 : 1;
          return (sum / Math.max(pop,1)) * 100000;
        }
        return sum;
      });
    });
    const ctx = document.getElementById('boxplotCases').getContext('2d');
    if(boxChart) boxChart.destroy();
    boxChart = new Chart(ctx, {type:'boxplot', data:{labels:states, datasets:[{label:'Distribution', backgroundColor:'rgba(30,144,255,0.6)', data: datasetsArr}]}, options:{maintainAspectRatio:false, scales:{y:{type: axis}}}});
  }
}

function renderSummaryTable(byState){
  // create a styled table using full width of side panel (not cramped)
  const rows = Object.entries(byState).map(([state,v])=> ({state, cases:v.cases||0, population: v.population||0, density:v.density||0, per100k: v.per100k||0}));
  if(!rows.length) return;
  rows.sort((a,b)=> b.cases - a.cases);
  const highest = rows[0];
  const lowest = rows[rows.length-1];
  const median = rows[Math.floor(rows.length/2)];

  const table = document.createElement('table');
  table.style.width='100%';
  table.style.borderCollapse='collapse';
  table.style.fontSize='0.95rem';
  table.innerHTML = `<thead>
    <tr style="text-align:left;border-bottom:1px solid #e6eefc"><th>Rank</th><th>State</th><th style="text-align:right">Cases</th><th style="text-align:right">Population</th><th style="text-align:right">Density</th><th style="text-align:right">Per 100k</th></tr>
  </thead>
  <tbody>
    <tr><td>Highest</td><td>${highest.state}</td><td style="text-align:right">${formatNum(highest.cases)}</td><td style="text-align:right">${formatNum(highest.population)}</td><td style="text-align:right">${highest.density}</td><td style="text-align:right">${Math.round(highest.per100k)}</td></tr>
    <tr><td>Median</td><td>${median.state}</td><td style="text-align:right">${formatNum(median.cases)}</td><td style="text-align:right">${formatNum(median.population)}</td><td style="text-align:right">${median.density}</td><td style="text-align:right">${Math.round(median.per100k)}</td></tr>
    <tr><td>Lowest</td><td>${lowest.state}</td><td style="text-align:right">${formatNum(lowest.cases)}</td><td style="text-align:right">${formatNum(lowest.population)}</td><td style="text-align:right">${lowest.density}</td><td style="text-align:right">${Math.round(lowest.per100k)}</td></tr>
  </tbody>`;
  const container = document.getElementById('summaryTableContainer');
  container.innerHTML = '';
  container.appendChild(table);
}

document.addEventListener('DOMContentLoaded', init);


