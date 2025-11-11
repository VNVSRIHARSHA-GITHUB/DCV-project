// assets/js/state.js (defensive rewrite)
// State page script — robust loading, normalization, graceful failures and helpful console messages.

const DATA_PATH = 'assets/data/complete_disease_data.csv';
const GEOJSON_PATH = 'usa_states.geojson';

// read query params
function qParam(name){ const p = new URLSearchParams(location.search); return p.get(name); }
const Q = { state: qParam('state') || 'California', disease: qParam('disease') || null, year: qParam('year') || null };

// tolerant pick helper
function _pick(obj, keys){
  if(!obj) return undefined;
  for(const k of keys) if(Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) return obj[k];
  // try case-insensitive fallback
  const lower = Object.keys(obj).reduce((acc, key)=> (acc[key.toLowerCase()] = obj[key], acc), {});
  for(const k of keys){
    const low = k.toLowerCase();
    if(lower[low] !== undefined) return lower[low];
  }
  return undefined;
}

function normaliseRow(r){
  return {
    state: _pick(r, ['state','State','STATE','location','Location','province','Province']) || '',
    year: String(_pick(r, ['year','Year','YEAR','yr','YearInt']) || '').trim(),
    disease: _pick(r, ['disease','Disease','condition','Condition','illness']) || '',
    cases: Number(_pick(r, ['cases','Cases','value','count','Count']) || 0) || 0,
    population: Number(_pick(r, ['population','Population','pop','Pop']) || 0) || 0,
    population_density: Number(_pick(r, ['population_density','population density','density','pop_density','pop density']) || 0) || 0
  };
}

// Helper to safely get element and show message in page
function el(id){ return document.getElementById(id); }
function showPageMessage(msg){
  const main = document.querySelector('main') || document.body;
  const notice = document.createElement('div');
  notice.style.margin = '12px';
  notice.style.padding = '12px';
  notice.style.border = '1px solid #f2c';
  notice.style.background = '#fff7f7';
  notice.textContent = msg;
  main.prepend(notice);
}

// Promise wrapper for Papa.parse
function parseCSV(path){
  return new Promise((resolve, reject)=>{
    if(!window.Papa) return reject(new Error('PapaParse not loaded'));
    try{
      Papa.parse(path, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          if(res && res.data) resolve(res.data);
          else resolve([]);
        },
        error: (err) => reject(err)
      });
    }catch(err){
      reject(err);
    }
  });
}

// Safe fetch for geojson
async function fetchGeo(path){
  const r = await fetch(path);
  if(!r.ok) throw new Error('GeoJSON fetch failed: ' + r.statusText);
  return r.json();
}

async function init(){
  try{
    // check required DOM elements exist
    const required = ['stateMap','stateTitle','diseaseYearText','stateTotalCases','statePopulation','stateDensity','chartA_stateTS','chartB_statePer100k','chartC_stateCompare','chartD_stateScatter','chartE_stateSunburst','chartF_stateHeatmap','backToMap'];
    const missing = required.filter(id => !el(id));
    if(missing.length){
      console.warn('State page missing some DOM elements:', missing);
      showPageMessage('Some UI elements are missing from the page: ' + missing.join(', '));
      // continue anyway but be defensive
    }

    // wire back button if present
    const back = el('backToMap');
    if(back) back.addEventListener('click', ()=> {
      const q = new URLSearchParams({ disease: Q.disease || '', year: Q.year || ''});
      location.href = `map.html?${q.toString()}`;
    });

    // load data (use cached if present)
    let rawRows = [];
    if(window.__PHdata && Array.isArray(window.__PHdata) && window.__PHdata.length){
      rawRows = window.__PHdata;
    } else {
      try{
        const parsed = await parseCSV(DATA_PATH);
        rawRows = parsed;
        // normalize and cache
        window.__PHdata = (parsed || []).map(normaliseRow);
      }catch(err){
        console.error('CSV parse failed:', err);
        showPageMessage('Failed to load dataset. See console for details.');
        return;
      }
    }

    // ensure normalized rows available
    if(!window.stateAll){
      window.stateAll = (window.__PHdata || []).map(normaliseRow).filter(r => r.state);
    }

    if(!window.stateAll.length){
      showPageMessage('Dataset appears empty or missing state rows.');
      return;
    }

    // update header / meta
    if(el('stateTitle')) el('stateTitle').innerText = Q.state;
    if(el('diseaseYearText')) el('diseaseYearText').innerText = (Q.disease ? Q.disease : 'All diseases') + (Q.year ? ' · ' + Q.year : '');

    // filter for this state's rows (but keep full dataset for cross-year charts)
    const filtered = window.stateAll.filter(r=> r.state === Q.state && (!Q.disease || r.disease === Q.disease) && (!Q.year || String(r.year) === String(Q.year)));

    const totalCases = filtered.reduce((s,r)=> s + (Number(r.cases)||0), 0);
    if(el('stateTotalCases')) el('stateTotalCases').innerText = totalCases ? totalCases.toLocaleString() : '—';

    // population/density: try to find latest or any row for this state
    const anyRow = window.stateAll.find(r=> r.state === Q.state) || {};
    if(el('statePopulation')) el('statePopulation').innerText = anyRow.population ? Number(anyRow.population).toLocaleString() : '—';
    if(el('stateDensity')) el('stateDensity').innerText = anyRow.population_density ? anyRow.population_density : '—';
    if(el('stateLatest')) el('stateLatest').innerText = `Latest (${Q.year||'all'}): ${totalCases ? totalCases.toLocaleString() : '—'}`;

    // load geojson and draw polygon
    let geo = null;
    try{
      geo = await fetchGeo(GEOJSON_PATH);
      const feat = geo.features.find(f => {
        const name = f.properties && (f.properties.name || f.properties.NAME || f.properties.STATE_NAME);
        return name === Q.state;
      });
      const center = feat ? computeCentroid(feat) : [37.8, -96];
      if(!window.stateMap){
        window.stateMap = L.map('stateMap', {preferCanvas:true}).setView(center, feat?6:4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors'}).addTo(window.stateMap);
      } else {
        try{ window.stateMap.setView(center, feat?6:4); }catch(e){}
      }
      if(feat){
        L.geoJSON(feat, {style:{fillColor:'#7fe3a3', fillOpacity:0.6, color:'#fff', weight:1}}).addTo(window.stateMap);
      }
    }catch(err){
      console.warn('GeoJSON load failed:', err);
    }

    // draw charts (defensive: only if canvas exists)
    drawStateTimeSeries(window.stateAll, Q);
    drawStatePer100k(window.stateAll, Q);
    drawStateCompare(window.stateAll, Q);
    drawStateScatter(window.stateAll, Q);
    drawSunburst(window.stateAll, Q);
    drawHeatmap(window.stateAll, Q);

    // attach control listeners (only if present)
    const normA = el('chartA_norm'), axisA = el('chartA_axis');
    if(normA) normA.addEventListener('change', ()=> drawStateTimeSeries(window.stateAll, Q));
    if(axisA) axisA.addEventListener('change', ()=> drawStateTimeSeries(window.stateAll, Q));

    const diseaseSel = el('stateDiseaseSelect');
    if(diseaseSel) diseaseSel.addEventListener('change', ()=> drawStateCompare(window.stateAll, Q));

    const scatterX = el('stateScatterX'), scatterY = el('stateScatterY');
    if(scatterX) scatterX.addEventListener('change', ()=> drawStateScatter(window.stateAll, Q));
    if(scatterY) scatterY.addEventListener('change', ()=> drawStateScatter(window.stateAll, Q));

  }catch(err){
    console.error('State init error', err);
    showPageMessage('Unexpected error initializing state page. See console for details.');
  }
}

// small centroid helper (average of coordinates) — handles polygons/have bbox fallback
function computeCentroid(feature){
  try{
    if(feature.bbox){
      const [minx,miny,maxx,maxy] = feature.bbox;
      return [(miny+maxy)/2, (minx+maxx)/2];
    }
    // try coordinates
    const coords = feature.geometry && feature.geometry.coordinates;
    if(!coords) return [37.8, -96];
    // dive in for common polygons: coords[0][0]...
    let pts = [];
    function collect(c){
      if(typeof c[0] === 'number' && typeof c[1] === 'number') pts.push(c);
      else c.forEach(collect);
    }
    collect(coords);
    if(!pts.length) return [37.8, -96];
    const avgLat = pts.reduce((s,p)=> s + p[1], 0) / pts.length;
    const avgLng = pts.reduce((s,p)=> s + p[0], 0) / pts.length;
    return [avgLat, avgLng];
  }catch(e){
    return [37.8, -96];
  }
}

/* ------------------ Charts ------------------ */
// Each draw function is defensive and will not throw if data or canvas missing

function drawStateTimeSeries(allRows, Qobj){
  try{
    const canvas = el('chartA_stateTS');
    if(!canvas) return;
    const norm = (el('chartA_norm') || {}).value || 'absolute';
    const axis = (el('chartA_axis') || {}).value || 'linear';
    // years present for this state
    const years = Array.from(new Set(allRows.filter(r=> r.state === Qobj.state).map(r=> r.year))).sort();
    const values = years.map(y => allRows.filter(r=> r.state === Qobj.state && r.year === y && (!Qobj.disease || r.disease === Qobj.disease)).reduce((s,r)=> s + (Number(r.cases)||0), 0));
    const pop = (allRows.find(r=> r.state === Qobj.state) || {}).population || 1;
    const dataVals = norm === 'per100k' ? values.map(v => (v / Math.max(pop,1)) * 100000) : values;
    if(window.chartA) try{ window.chartA.destroy(); }catch(e){}
    window.chartA = new Chart(canvas.getContext('2d'), { type: 'line', data:{ labels: years, datasets:[{ label:'Cases', data: dataVals, borderWidth:2 }] }, options:{ maintainAspectRatio:false, scales:{ y:{ type: axis } } } });
  }catch(e){ console.error('drawStateTimeSeries failed', e); }
}

function drawStatePer100k(allRows, Qobj){
  try{
    const canvas = el('chartB_statePer100k');
    if(!canvas) return;
    const years = Array.from(new Set(allRows.filter(r=> r.state === Qobj.state).map(r=> r.year))).sort();
    const values = years.map(y => allRows.filter(r=> r.state === Qobj.state && r.year === y && (!Qobj.disease || r.disease === Qobj.disease)).reduce((s,r)=> s + (Number(r.cases)||0), 0));
    const pop = (allRows.find(r=> r.state === Qobj.state) || {}).population || 1;
    const per100k = values.map(v => (v / Math.max(pop,1)) * 100000);
    if(window.chartB) try{ window.chartB.destroy(); }catch(e){}
    window.chartB = new Chart(canvas.getContext('2d'), { type:'bar', data:{ labels: years, datasets:[{ label:'Cases per 100k', data: per100k, backgroundColor:'rgba(30,144,255,0.8)'}]}, options:{ maintainAspectRatio:false }});
  }catch(e){ console.error('drawStatePer100k failed', e); }
}

function drawStateCompare(allRows, Qobj){
  try{
    const canvas = el('chartC_stateCompare');
    const sel = el('stateDiseaseSelect');
    if(!canvas) return;
    // fill selector if empty
    const diseases = Array.from(new Set(allRows.filter(r=> r.state === Qobj.state).map(r=> r.disease))).sort();
    if(sel && !sel.options.length){
      sel.innerHTML = diseases.map(d=> `<option value="${d}">${d}</option>`).join('');
      // select first 2 by default
      for(let i=0;i<Math.min(2, sel.options.length); i++) sel.options[i].selected = true;
    }
    const selected = sel ? Array.from(sel.selectedOptions).map(o=>o.value) : diseases.slice(0,2);
    const years = Array.from(new Set(allRows.filter(r=> r.state === Qobj.state).map(r=> r.year))).sort();
    const datasets = selected.map(d => ({ label: d, data: years.map(y => allRows.filter(r=> r.state === Qobj.state && r.disease === d && r.year === y).reduce((s,r)=> s + (Number(r.cases)||0),0)), borderWidth:2, fill:false }));
    if(window.chartC) try{ window.chartC.destroy(); }catch(e){}
    window.chartC = new Chart(canvas.getContext('2d'), { type:'line', data:{ labels: years, datasets }, options:{ maintainAspectRatio:false } });
  }catch(e){ console.error('drawStateCompare failed', e); }
}

function drawStateScatter(allRows, Qobj){
  try{
    const canvas = el('chartD_stateScatter');
    if(!canvas) return;
    const x = (el('stateScatterX') || {}).value || 'population';
    const ySel = (el('stateScatterY') || {}).value || 'cases';
    const pts = allRows.filter(r=> r.state === Qobj.state).map(r => {
      const pop = Number(r.population)||0;
      return {
        x: x === 'population' ? Number(pop) : x === 'population_density' ? Number(r.population_density)||0 : Number(r.year)||0,
        y: ySel === 'cases' ? Number(r.cases)||0 : ((Number(r.cases)||0) / Math.max(pop,1)) * 100000,
        label: r.disease, year: r.year
      };
    });
    if(window.chartD) try{ window.chartD.destroy(); }catch(e){}
    window.chartD = new Chart(canvas.getContext('2d'), { type:'scatter', data:{ datasets:[{ label:'Points', data: pts, backgroundColor:'rgba(95,220,200,0.9)' }]}, options:{ maintainAspectRatio:false, scales:{ x:{ title:{ display:true, text: x }}, y:{ title:{ display:true, text: ySel }}} }});
  }catch(e){ console.error('drawStateScatter failed', e); }
}
function drawSunburst(allRows, Qobj){
  try{
    const canvas = document.getElementById('chartE_stateSunburst');
    if(!canvas) return;

    // check for sunburst controller
    const hasSun = Chart && Chart.registry && Chart.registry.controllers && Object.keys(Chart.registry.controllers).some(k=>k.toLowerCase().includes('sunburst'));
    // build data
    const byYear = {};
    allRows.filter(r=> r.state === Qobj.state).forEach(r=>{
      const year = r.year || 'Unknown';
      byYear[year] = byYear[year] || {};
      byYear[year][r.disease || 'Unknown'] = (byYear[year][r.disease] || 0) + (Number(r.cases)||0);
    });

    if(!hasSun){
      // fallback: create a simple stacked bar (years on x, top 5 diseases)
      const years = Object.keys(byYear).sort();
      const allDiseases = {};
      for(const y of years) for(const d of Object.keys(byYear[y])) allDiseases[d] = (allDiseases[d]||0) + byYear[y][d];
      const topDiseases = Object.entries(allDiseases).sort((a,b)=>b[1]-a[1]).slice(0,5).map(x=>x[0]);
      const datasets = topDiseases.map((d,i)=> ({
        label:d,
        data: years.map(y => byYear[y][d] || 0),
        backgroundColor: `rgba(${50+i*30}, ${130+i*20}, ${200-i*20}, 0.7)`
      }));
      if(window.chartE) try{ window.chartE.destroy(); }catch(e){}
      window.chartE = new Chart(canvas.getContext('2d'), { type:'bar', data:{ labels: years, datasets }, options:{ maintainAspectRatio:false, plugins:{title:{display:true,text:'Sunburst fallback: top diseases over years'}} }});
      console.warn('Sunburst plugin missing — drew stacked bar fallback.');
      return;
    }

    // plugin available -> draw the sunburst
    const children = Object.entries(byYear).map(([year, diseases]) => ({ name: year, children: Object.entries(diseases).map(([d,v])=>({name:d, value:v})) }));
    const tree = { name: Q.state, children };
    if(window.chartE) try{ window.chartE.destroy(); }catch(e){}
    window.chartE = new Chart(canvas.getContext('2d'), { type:'sunburst', data:{datasets:[{tree, key:'value', groups:['name'], borderWidth:1, borderColor:'#fff'}]}, options:{maintainAspectRatio:false}});
  }catch(e){ console.error('drawSunburst failed', e); }
}


function drawHeatmap(allRows, Qobj){
  try{
    const canvas = document.getElementById('chartF_stateHeatmap');
    if(!canvas) return;

    const hasMatrix = Chart && Chart.registry && Chart.registry.controllers && Object.keys(Chart.registry.controllers).some(k=>k.toLowerCase().includes('matrix'));
    const diseases = Array.from(new Set(allRows.filter(r=> r.state === Qobj.state).map(r=> r.disease))).sort();
    const years = Array.from(new Set(allRows.filter(r=> r.state === Qobj.state).map(r=> r.year))).sort();

    if(!hasMatrix){
      // fallback: create a small HTML table inside container adjacent to canvas
      const container = canvas.parentElement;
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headRow.appendChild(document.createElement('th')); // empty corner
      years.forEach(y=> { const th = document.createElement('th'); th.innerText = y; th.style.border='1px solid #eee'; th.style.padding='6px'; headRow.appendChild(th); });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      diseases.forEach(d=>{
        const tr = document.createElement('tr');
        const th = document.createElement('th'); th.innerText = d; th.style.padding='6px'; th.style.border='1px solid #eee'; tr.appendChild(th);
        years.forEach(y=>{
          const td = document.createElement('td'); td.style.padding='6px'; td.style.border='1px solid #f7f7f7';
          const v = allRows.filter(r=> r.state===Qobj.state && r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0),0);
          td.innerText = v ? v.toLocaleString() : '-';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      // clear canvas and insert table
      canvas.style.display = 'none';
      const existing = container.querySelector('.heatmap-fallback');
      if(existing) existing.remove();
      const wrap = document.createElement('div');
      wrap.className = 'heatmap-fallback';
      wrap.appendChild(table);
      container.appendChild(wrap);
      console.warn('Matrix plugin missing — inserted table fallback for heatmap.');
      return;
    }

    // normal matrix plugin path
    const data = [];
    diseases.forEach((d,i)=> years.forEach((y,j)=> {
      const v = allRows.filter(r=> r.state===Qobj.state && r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0),0);
      data.push({x: y, y: d, v});
    }));
    if(window.chartF) try{ window.chartF.destroy(); }catch(e){}
    window.chartF = new Chart(canvas.getContext('2d'), {
      type:'matrix',
      data:{datasets:[{label:'Cases', data, backgroundColor: ctx => {
        const val = ctx.raw.v || 0; const alpha = Math.min(0.95, val / 100000); return `rgba(30,144,255,${alpha})`;
      }, width: ({chart}) => (chart.chartArea.width / Math.max(1, years.length)) - 6, height: ({chart}) => (chart.chartArea.height / Math.max(1, diseases.length)) - 6 }]},
      options:{ maintainAspectRatio:false, scales:{ x:{ type:'category', labels: years, title:{ display:true, text:'Year' } }, y:{ type:'category', labels: diseases }}}
    });
  }catch(e){ console.error('drawHeatmap failed', e); }
}





