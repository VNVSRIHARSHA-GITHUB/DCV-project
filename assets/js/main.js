// main.js - index page: populate disease list and years, redirect to map page
const DATA_PATH = 'assets/data/usa_disease_data_sample.csv'; // replace with full CSV name if needed

function unique(arr) {
  return [...new Set(arr)];
}

document.addEventListener('DOMContentLoaded', () => {
  const diseaseSelect = document.getElementById('diseaseSelect');
  const yearSelect = document.getElementById('yearSelect');
  const searchBtn = document.getElementById('searchBtn');
  const openExample = document.getElementById('openExample');
  const openMapBtn = document.getElementById('viewMapBtn');

  // theme icon init
  const themeIconHeader = document.getElementById('themeIconHeader');
  if(localStorage.getItem('phd_theme') === 'dark') themeIconHeader.className = 'fa fa-sun';

  Papa.parse(DATA_PATH, {
    download: true,
    header: true,
    complete: (results) => {
      const data = results.data.filter(r => r.state && r.disease);
      const diseases = unique(data.map(r => r.disease)).sort();
      diseaseSelect.innerHTML = `<option value="">-- select disease --</option>` +
          diseases.map(d => `<option value="${d}">${d}</option>`).join('');
      // store parsed data for later pages
      window.__PHdata = data;
    }
  });

  diseaseSelect.addEventListener('change', () => {
    const chosen = diseaseSelect.value;
    yearSelect.innerHTML = '';
    yearSelect.disabled = true;
    searchBtn.disabled = true;
    if(!chosen) return;
    const data = window.__PHdata || [];
    const years = unique(data.filter(r => r.disease === chosen).map(r => r.year)).sort();
    if(years.length){
      yearSelect.innerHTML = `<option value="">-- select year --</option>` + years.map(y => `<option value="${y}">${y}</option>`).join('');
      yearSelect.disabled = false;
    }
  });

  yearSelect.addEventListener('change', () => {
    searchBtn.disabled = !yearSelect.value;
  });

  searchBtn.addEventListener('click', () => {
    const disease = diseaseSelect.value;
    const year = yearSelect.value;
    if(!disease || !year) return alert('Select disease and year first');
    const q = new URLSearchParams({disease, year});
    location.href = `map.html?${q.toString()}`;
  });

  openExample.addEventListener('click', () => {
    // open a sample state page for demo (New York)
    const q = new URLSearchParams({state:'New York', disease:'HIV', year:'2010'});
    location.href = `state.html?${q.toString()}`;
  });

  openMapBtn.addEventListener('click', () => {
    // Open national map without selections
    location.href = 'map.html';
  });
});
