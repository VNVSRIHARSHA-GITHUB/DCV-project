const DATA_PATH = 'assets/data/complete_disease_data.csv';
document.addEventListener('DOMContentLoaded', ()=>{
  const diseaseSelect = document.getElementById('diseaseSelect');
  const yearSelect = document.getElementById('yearSelect');
  const searchBtn = document.getElementById('searchBtn');
  const openExample = document.getElementById('openExample');

  Papa.parse(DATA_PATH, {download:true,header:true,complete(res){
    const data = res.data.filter(r=>r.state && r.disease);
    window.__PHdata = data;
    const diseases = Array.from(new Set(data.map(r=>r.disease))).sort();
    diseaseSelect.innerHTML = '<option value="">-- select disease --</option>' + diseases.map(d=>`<option value="${d}">${d}</option>`).join('');
  }});

  diseaseSelect.addEventListener('change', ()=>{
    const d = diseaseSelect.value;
    yearSelect.disabled = true; searchBtn.disabled = true; yearSelect.innerHTML = '';
    if(!d) return;
    const data = window.__PHdata || [];
    const years = Array.from(new Set(data.filter(r=>r.disease===d).map(r=>r.year))).sort();
    yearSelect.innerHTML = '<option value="">-- select year --</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
    yearSelect.disabled = false;
  });

  yearSelect.addEventListener('change', ()=> searchBtn.disabled = !yearSelect.value);

  searchBtn.addEventListener('click', ()=>{
    const d = diseaseSelect.value, y = yearSelect.value;
    if(!d||!y) return alert('Select disease and year');
    const q = new URLSearchParams({disease:d, year:y});
    location.href = `map.html?${q.toString()}`;
  });

  openExample.addEventListener('click', ()=> {
    const q = new URLSearchParams({state:'New York', disease:'HIV', year:'2010'});
    location.href = `state.html?${q.toString()}`;
  });
});
