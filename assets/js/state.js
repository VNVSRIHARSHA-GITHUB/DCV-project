// state.js
const DATA_PATH = 'assets/data/usa_disease_data.csv';
const GEOJSON_PATH = 'usa_states.geojson';
let stateMap;
let q = (new URLSearchParams(location.search));
q = { state: q.get('state') || 'California', disease: q.get('disease') || null, year: q.get('year') || null };

function formatN(n){ return n ? Number(n).toLocaleString() : '—'; }

async function init(){
  document.getElementById('backToMap').addEventListener('click', ()=> location.href = `map.html?disease=${encodeURIComponent(q.disease||'')}&year=${encodeURIComponent(q.year||'')}`);
  // load CSV
  const data = await new Promise(res=> Papa.parse(DATA_PATH, {download:true, header:true, complete: r=>res(r.data)}));
  window.stateAll = data.filter(r=> r.state === q.state);
  const stateFiltered = window.stateAll.filter(r=> (!q.disease || r.disease===q.disease) && (!q.year || r.year===q.year));
  document.getElementById('stateTitle').innerText = q.state;
  document.getElementById('diseaseYearText').innerText = (q.disease? q.disease : 'All diseases') + (q.year ? ' · ' + q.year : '');
  const totalCases = stateFiltered.reduce((a,b)=> a + (Number(b.cases)||0), 0);
  document.getElementById('stateTotalCases').innerText = totalCases.toLocaleString();
  const pop = window.stateAll.length ? Number(window.stateAll[0].population) || 0 : 0;
  const dens = window.stateAll.length ? Number(window.stateAll[0].population_density) || 0 : 0;
  document.getElementById('statePopulation').innerText = formatN(pop);
  document.getElementById('stateDensity').innerText = dens;

  // map
  const geo = await fetch(GEOJSON_PATH).then(r=>r.json());
  const feat = geo.features.find(f => (f.properties.name || f.properties.NAME) === q.state);
  const center = feat ? getFeatureCenter(feat) : [37.8,-96];
  if(!stateMap){ stateMap = L.map('stateMap').setView(center, feat?6:4); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(stateMap); }
  if(feat) L.geoJSON(feat, {style:{fillColor:'#ff6b6b', fillOpacity:0.5, color:'#fff'}}).addTo(stateMap);
  document.getElementById('stateLatest').innerText = `Latest (${q.year||'all'}): ${formatN(totalCases)} cases`;

  // charts
  drawStateTimeSeries();
  drawStatePer100k();
  drawStateCompare();
  drawStateScatter();
  drawSunburst();
  drawHeatmap();
  // bind controls
  document.getElementById('chartA_norm').addEventListener('change', drawStateTimeSeries);
  document.getElementById('chartA_axis').addEventListener('change', drawStateTimeSeries);
  Array.from(document.getElementById('stateDiseaseSelect').options).forEach(o=> o.selected = true);
}

function getFeatureCenter(feature){
  try{
    if(feature.bbox){ const [minx,miny,maxx,maxy] = feature.bbox; return [(miny+maxy)/2,(minx+maxx)/2];}
  }catch(e){}
  return [37.8,-96];
}

function drawStateTimeSeries(){
  const norm = document.getElementById('chartA_norm').value;
  const axis = document.getElementById('chartA_axis').value;
  const years = Array.from(new Set(window.stateAll.map(r=>r.year))).sort();
  const values = years.map(y => window.stateAll.filter(r=> r.year===y && (!q.disease || r.disease===q.disease)).reduce((s,r)=> s + (Number(r.cases)||0),0));
  const pop = window.stateAll.length ? Number(window.stateAll[0].population)||1 : 1;
  const dataVals = norm==='per100k' ? values.map(v => (v/pop)*100000) : values;
  const ctx = document.getElementById('chartA_stateTS').getContext('2d');
  if(window.chartA) window.chartA.destroy();
  window.chartA = new Chart(ctx, {type:'line', data:{labels:years, datasets:[{label: 'Cases', data: dataVals, borderWidth:2}]}, options:{maintainAspectRatio:false, scales:{y:{type:axis}}}});
}

function drawStatePer100k(){
  const years = Array.from(new Set(window.stateAll.map(r=>r.year))).sort();
  const values = years.map(y => window.stateAll.filter(r=> r.year===y && (!q.disease || r.disease===q.disease)).reduce((s,r)=> s + (Number(r.cases)||0),0));
  const pop = window.stateAll.length ? Number(window.stateAll[0].population)||1 : 1;
  const per100k = values.map(v => (v/pop)*100000);
  const ctx = document.getElementById('chartB_statePer100k').getContext('2d');
  if(window.chartB) window.chartB.destroy();
  window.chartB = new Chart(ctx, {type:'bar', data:{labels:years, datasets:[{label:'Cases per 100k', data:per100k, backgroundColor:'rgba(30,144,255,0.8)'}]}, options:{maintainAspectRatio:false}});
}

function drawStateCompare(){
  // fill disease selector
  const diseases = Array.from(new Set(window.stateAll.map(r=>r.disease))).sort();
  const sel = document.getElementById('stateDiseaseSelect');
  sel.innerHTML = diseases.map(d=>`<option value="${d}">${d}</option>`).join('');
  const selected = Array.from(sel.selectedOptions).map(o=>o.value) || diseases.slice(0,3);
  const years = Array.from(new Set(window.stateAll.map(r=>r.year))).sort();
  const datasets = selected.map((d,i)=> {
    const data = years.map(y => window.stateAll.filter(r=>r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0),0));
    return { label:d, data, borderWidth:2, fill:false };
  });
  const ctx = document.getElementById('chartC_stateCompare').getContext('2d');
  if(window.chartC) window.chartC.destroy();
  window.chartC = new Chart(ctx,{type:'line', data:{labels:years, datasets}, options:{maintainAspectRatio:false}});
  sel.addEventListener('change', ()=> drawStateCompare());
}

function drawStateScatter(){
  const x = document.getElementById('stateScatterX').value;
  const y = document.getElementById('stateScatterY').value;
  const points = window.stateAll.map(r=>{
    const pop = Number(r.population)||0;
    return { x: x === 'population' ? pop : x === 'population_density' ? Number(r.population_density)||0 : Number(r.year)||0,
             y: y === 'cases' ? Number(r.cases)||0 : ( (Number(r.cases)||0)/ (pop||1) )*100000,
             year:r.year
    };
  });
  const ctx = document.getElementById('chartD_stateScatter').getContext('2d');
  if(window.chartD) window.chartD.destroy();
  window.chartD = new Chart(ctx, {type:'scatter', data:{datasets:[{label:'Points', data:points, backgroundColor:'rgba(95,220,200,0.9)'}]}, options:{maintainAspectRatio:false, scales:{x:{title:{display:true,text:x}}, y:{title:{display:true,text:y}}}}});
  document.getElementById('stateScatterX').addEventListener('change', drawStateScatter);
  document.getElementById('stateScatterY').addEventListener('change', drawStateScatter);
}

function drawSunburst(){
  const chartECtx = document.getElementById('chartE_stateSunburst').getContext('2d');
  if(window.chartE) window.chartE.destroy();
  // build tree
  const byYear = {};
  window.stateAll.forEach(r=> {
    const year = r.year || 'Unknown'; const dis = r.disease || 'Unknown'; const val = Number(r.cases)||0;
    byYear[year] = byYear[year] || {}; byYear[year][dis] = (byYear[year][dis]||0) + val;
  });
  const children = Object.entries(byYear).map(([year, diseases]) => ({ name: year, children: Object.entries(diseases).map(([d,v])=>({name:d, value:v})) }));
  const tree = { name: q.state, children };
  window.chartE = new Chart(chartECtx, { type:'sunburst', data:{datasets:[{tree, key:'value', groups:['name'], borderWidth:1, borderColor:'#fff'}]}, options:{maintainAspectRatio:false}});
}

function drawHeatmap(){
  // matrix: y=disease, x=year
  const chartFCtx = document.getElementById('chartF_stateHeatmap').getContext('2d');
  const diseases = Array.from(new Set(window.stateAll.map(r=>r.disease))).sort();
  const years = Array.from(new Set(window.stateAll.map(r=>r.year))).sort();
  const data = [];
  diseases.forEach((d,i)=> years.forEach((y,j)=> {
    const v = window.stateAll.filter(r=> r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0),0);
    data.push({x: y, y: d, v});
  }));
  if(window.chartF) window.chartF.destroy();
  window.chartF = new Chart(chartFCtx, { type:'matrix', data:{datasets:[{label:'Cases', data, backgroundColor: ctx => { const val = ctx.raw.v; const alpha = Math.min(0.95, val / 100000); return `rgba(30,144,255,${alpha})`; }, width: ({chart}) => (chart.chartArea.width / years.length)-6, height: ({chart}) => (chart.chartArea.height / diseases.length)-6}]}, options:{maintainAspectRatio:false, scales:{x:{type:'category',labels:years,title:{display:true,text:'Year'}}, y:{type:'category',labels:diseases,title:{display:true,text:'Disease'}}}}});
}

document.addEventListener('DOMContentLoaded', init);

