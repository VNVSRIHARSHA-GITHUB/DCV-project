// map.js
const DATA_PATH = 'assets/data/complete_disease_data.csv';
const GEOJSON_PATH = 'usa_states.geojson';

let casesMap, densityMap, geojsonData;
let currentDisease, currentYear;
let byStateAgg = {}; // state -> {cases,population,density,per100k}
let casesByStateChart, histChart, scatterChart, multiChart, boxChart;

function fetchAll(){
  return Promise.all([
    fetch(GEOJSON_PATH).then(r=>r.json()),
    new Promise(res=> Papa.parse(DATA_PATH,{download:true,header:true,complete:r=>res(r.data)}))
  ]);
}

function formatNum(n){ if(n===null||n===undefined) return '—'; return Number(n).toLocaleString(); }

function aggregateByState(data, disease, year){
  const map = {};
  data.forEach(r=>{
    if(!r.state) return;
    if(disease && r.disease !== disease) return;
    if(year && r.year !== year) return;
    const s = r.state;
    map[s] = map[s] || {cases:0, population: Number(r.population)||0, density: Number(r.population_density)||0};
    map[s].cases += Number(r.cases)||0;
    map[s].population = map[s].population || Number(r.population)||0;
    map[s].density = map[s].density || Number(r.population_density)||0;
  });
  Object.values(map).forEach(v => v.per100k = v.population ? (v.cases / v.population)*100000 : 0);
  return map;
}

function init(){
  const params = new URLSearchParams(location.search);
  currentDisease = params.get('disease') || null;
  currentYear = params.get('year') || null;

  document.getElementById('homeBtn').addEventListener('click', ()=> location.href='index.html');

  // load all data
  fetchAll().then(([geojson, csvData])=>{
    geojsonData = geojson;
    const data = csvData;
    // show header selections
    const header = document.querySelector('.map-card .small');
    if(header) header.innerText = `Dataset: ${currentDisease || 'All'} · Year: ${currentYear || 'All'}`;

    byStateAgg = aggregateByState(data, currentDisease, currentYear);
    buildMaps(geojson, byStateAgg);
    buildAllCharts(data, byStateAgg);
    renderSummaryTable(byStateAgg);
    populateMultiDiseaseSelector(data);
  }).catch(err=> console.error(err));

  document.getElementById('casesSortSelect').addEventListener('change', (e)=> buildCasesByStateBar(byStateAgg, currentYear, e.target.value));
  document.getElementById('histNorm').addEventListener('change', ()=> buildHistogram(byStateAgg));
  document.getElementById('scatterColorBy').addEventListener('change', ()=> buildScatter(byStateAgg));
  document.getElementById('scatterPerCapita').addEventListener('change', ()=> buildScatter(byStateAgg));
  document.getElementById('diseaseMultiSelect').addEventListener('change', ()=> buildMultiSeries());
  document.getElementById('boxGroup').addEventListener('change', ()=> buildBoxPlot());
  document.getElementById('boxNorm').addEventListener('change', ()=> buildBoxPlot());
  document.getElementById('boxAxis').addEventListener('change', ()=> buildBoxPlot());
}

function buildMaps(geojson, byState){
  const getColor = v => v > 100000 ? '#7f1d1d' : v>50000 ? '#cc3b3b' : v>20000 ? '#1f9bd6' : v>5000 ? '#5de1d1' : '#e6f7ff';
  // casesMap
  if(!casesMap){
    casesMap = L.map('casesMap').setView([37.8,-96],4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(casesMap);
  }
  L.geoJSON(geojson, {
    style: feature => {
      const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
      const val = (byState[name] && byState[name].cases) || 0;
      return { fillColor: getColor(val), weight:1, color:'#fff', fillOpacity:0.95 };
    },
    onEachFeature: function(feature, layer){
      const name = feature.properties.name || feature.properties.NAME || feature.properties.STATE_NAME;
      const s = byState[name] || {cases:0,population:0,density:0};
      layer.bindPopup(`<strong>${name}</strong><br/>Cases: ${formatNum(s.cases)}<br/>Population: ${formatNum(s.population)}<br/>Density: ${s.density || '—'}`);
      layer.on('click', ()=> location.href = `state.html?state=${encodeURIComponent(name)}&disease=${encodeURIComponent(currentDisease||'')}`);
    }
  }).addTo(casesMap);
}

function buildAllCharts(allData, byState){
  buildCasesByStateBar(byState, currentYear, document.getElementById('casesSortSelect').value || 'cases_desc');
  buildHistogram(byState);
  buildScatter(byState);
  buildMultiSeries(allData);
  buildBoxPlot(allData);
}

function buildCasesByStateBar(byState, year, sortMode='cases_desc'){
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
  const bg = rows.map(r=> r.cases === Math.max(...rows.map(x=>x.cases)) ? 'rgba(220,80,80,0.95)' : 'rgba(95,220,200,0.95)');

  const ctx = document.getElementById('casesByStateBar').getContext('2d');
  if(casesByStateChart) casesByStateChart.destroy();
  casesByStateChart = new Chart(ctx, {
    type:'bar',
    data:{labels, datasets:[{label:`Cases (${year||'all'})`, data, backgroundColor:bg}]},
    options:{maintainAspectRatio:false,scales:{x:{ticks:{maxRotation:45}},y:{beginAtZero:true}},plugins:{tooltip:{callbacks:{label:c=> `${c.raw.toLocaleString()} cases`}}}}
  });
}

function roundBinWidth(width){
  // round to 10/100/1000... convenience
  const p = Math.pow(10, Math.floor(Math.log10(width)));
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
  // bins
  const bins = [];
  let start = Math.floor(min);
  for(let i=0;i<4;i++){
    const end = start + width - 1;
    bins.push({ start, end, count:0, states:[] });
    start = end + 1;
  }
  // distribute
  Object.entries(byState).forEach(([s,v])=>{
    const val = norm === 'per100k' ? v.per100k || 0 : v.cases || 0;
    for(const b of bins){
      if(val >= b.start && val <= b.end){ b.count++; b.states.push({state:s, val}); return; }
    }
    // if > last bin
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
  const colorBy = document.getElementById('scatterColorBy').value;
  const points = Object.entries(byState).map(([s,v])=>{
    return { x: v.density || 0, y: perCap ? v.per100k || 0 : v.cases || 0, label:s, region: '' };
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
  // default top 4 by total cases
  const totals = {};
  allData.forEach(r=> totals[r.disease] = (totals[r.disease]||0) + (Number(r.cases)||0));
  const top = Object.entries(totals).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
  Array.from(sel.options).forEach(o => { if(top.includes(o.value)) o.selected = true; });
  buildMultiSeries(allData);
}

function buildMultiSeries(allData){
  const selected = Array.from(document.getElementById('diseaseMultiSelect').selectedOptions).map(o=>o.value);
  if(!selected.length) return;
  // find common years across selected diseases
  const yearsPer = {};
  selected.forEach(d=>{
    yearsPer[d] = Array.from(new Set(allData.filter(r=>r.disease===d).map(r=>r.year))).sort();
  });
  // compute intersection of years
  const common = selected.reduce((acc,d)=>{
    const arr = yearsPer[d];
    if(!acc) return arr;
    return acc.filter(y => arr.includes(y));
  }, null) || [];
  // build series
  const datasets = selected.map((d, i)=>{
    const totals = common.map(y => allData.filter(r=>r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0), 0));
    return { label: d, data: totals, borderWidth:2, fill:false };
  });
  const ctx = document.getElementById('multiDiseaseSeries').getContext('2d');
  if(multiChart) multiChart.destroy();
  multiChart = new Chart(ctx, {type:'line', data:{labels:common, datasets}, options:{maintainAspectRatio:false, plugins:{legend:{position:'top'}}}});
}

function buildBoxPlot(allData){
  // grouping: byYear or byState. Default: byYear (boxes = distribution across states for each year)
  const group = document.getElementById('boxGroup').value;
  const norm = document.getElementById('boxNorm').value;
  const axis = document.getElementById('boxAxis').value;

  // gather raw data
  // if byYear: for each year compute array of state values
  Papa.parse(DATA_PATH, {download:true, header:true, complete: r=>{
    const data = r.data.filter(x=>x.state && x.year);
    if(group === 'byYear'){
      const years = Array.from(new Set(data.map(x=>x.year))).sort();
      const labels = [];
      const datasets = [];
      years.forEach(y=>{
        const arr = [];
        const states = Array.from(new Set(data.map(d=>d.state)));
        states.forEach(s=>{
          const sum = data.filter(d=>d.state===s && d.year===y).reduce((a,b)=>a + (Number(b.cases)||0),0);
          arr.push(norm==='per100k' ? (data.find(d=>d.state===s && d.year===y) ? (sum / Number(data.find(d=>d.state===s && d.year===y).population || 1))*100000 : 0) : sum);
        });
        labels.push(y);
        datasets.push(arr);
      });
      const boxDataSets = labels.map((lab,i)=> ({label:lab, data:datasets[i]}));
      // Chart.js boxplot expects one dataset with array of arrays? chartjs-boxplot uses dataset.data as array of numbers per label
      const ctx = document.getElementById('boxplotCases').getContext('2d');
      if(boxChart) boxChart.destroy();
      boxChart = new Chart(ctx, {type:'boxplot', data:{labels, datasets:[{label:'Distribution', backgroundColor:'rgba(30,144,255,0.6)', data: datasets.map(a=>a)}]}, options:{maintainAspectRatio:false, scales:{y:{type: axis}}}});
    } else {
      // byState: each box across years
      const states = Array.from(new Set(data.map(x=>x.state))).sort();
      const labels = states;
      const datasetsArr = states.map(s => {
        const arr = Array.from(new Set(data.map(x=>x.year))).sort().map(y => {
          const sum = data.filter(d=>d.state===s && d.year===y).reduce((a,b)=>a+(Number(b.cases)||0),0);
          return norm==='per100k' ? (sum / (Number(data.find(d=>d.state===s && d.year===y)?.population || 1))) * 100000 : sum;
        });
        return arr;
      });
      const ctx = document.getElementById('boxplotCases').getContext('2d');
      if(boxChart) boxChart.destroy();
      boxChart = new Chart(ctx, {type:'boxplot', data:{labels, datasets:[{label:'Distribution', backgroundColor:'rgba(30,144,255,0.6)', data: datasetsArr}]}, options:{maintainAspectRatio:false, scales:{y:{type: axis}}}});
    }
  }});
}

function renderSummaryTable(byState){
  const rows = Object.entries(byState).map(([state,v])=> ({state, cases:v.cases||0, population: v.population||0, density:v.density||0, per100k: v.per100k||0}));
  if(!rows.length) return;
  rows.sort((a,b)=> b.cases - a.cases);
  const highest = rows[0];
  const lowest = rows[rows.length-1];
  const median = rows[Math.floor(rows.length/2)];
  const table = document.createElement('table');
  table.style.width='100%';
  table.style.borderCollapse='collapse';
  table.innerHTML = `<thead><tr><th>Rank</th><th>State</th><th>Cases</th><th>Population</th><th>Density</th><th>Cases per 100k</th></tr></thead><tbody>
    <tr><td>Highest</td><td>${highest.state}</td><td>${formatNum(highest.cases)}</td><td>${formatNum(highest.population)}</td><td>${highest.density}</td><td>${Math.round(highest.per100k)}</td></tr>
    <tr><td>Median</td><td>${median.state}</td><td>${formatNum(median.cases)}</td><td>${formatNum(median.population)}</td><td>${median.density}</td><td>${Math.round(median.per100k)}</td></tr>
    <tr><td>Lowest</td><td>${lowest.state}</td><td>${formatNum(lowest.cases)}</td><td>${formatNum(lowest.population)}</td><td>${lowest.density}</td><td>${Math.round(lowest.per100k)}</td></tr>
  </tbody>`;
  const container = document.getElementById('summaryTableContainer');
  container.innerHTML = '';
  container.appendChild(table);
}

document.addEventListener('DOMContentLoaded', init);

