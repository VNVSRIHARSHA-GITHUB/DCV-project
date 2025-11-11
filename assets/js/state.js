// assets/js/state.js (defensive rewrite)
// State page script — robust loading, normalization, graceful failures and helpful console messages.
// Includes logic for the Public Health Resource Summarizer using the Gemini API.

const DATA_PATH = 'assets/data/complete_disease_data.csv';
const GEOJSON_PATH = 'usa_states.geojson'; // <-- confirm this path is where your us states geojson is

// read query params
function qParam(name){ const p = new URLSearchParams(location.search); return p.get(name); }
const Q = { state: qParam('state') || 'California', disease: qParam('disease') || null, year: qParam('year') || null };

// Global elements for the summarizer feature
const summaryBtn = document.getElementById('generateSummaryBtn');
const summaryLoading = document.getElementById('summaryLoading');
const summaryText = document.getElementById('summaryText');
const summaryError = document.getElementById('summaryError');
const citationsList = document.getElementById('citationsList');
const citationsContainer = document.getElementById('citations');

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
    cases: Number(_pick(r, ['cases','Cases','value','count','Count']) || 0),
    population: Number(_pick(r, ['population','Population','pop','Pop']) || 0),
    population_density: Number(_pick(r, ['population_density','population density','density','pop_density','Density']) || 0),
    per100k: (Number(_pick(r, ['cases','Cases','value','count','Count']) || 0) / Math.max(1, Number(_pick(r, ['population','Population','pop','Pop']) || 0))) * 100000
  };
}

function formatNum(n) {
  if (n === null || n === undefined) return '—';
  if (typeof n !== 'number') n = Number(n);
  return n.toLocaleString('en-US');
}


// --- GEMINI API INTEGRATION START ---

/**
 * Sets the UI state for the summarizer card (loading, error, or ready).
 * @param {('loading'|'ready'|'error')} state
 * @param {string} [message=''] - Error message or initial ready text.
 */
function setSummaryState(state, message = '') {
    summaryBtn.disabled = (state === 'loading');
    summaryLoading.style.display = (state === 'loading') ? 'block' : 'none';
    summaryError.style.display = (state === 'error') ? 'block' : 'none';
    
    if (state === 'error') {
        summaryError.textContent = message;
        summaryText.style.display = 'none';
        citationsContainer.style.display = 'none';
    } else {
        summaryError.textContent = '';
        summaryText.style.display = 'block';
    }

    if (state === 'ready') {
        if (!message) {
             // If ready but no message, show default text
             summaryText.innerHTML = '<p class="muted">Click **\'Generate Summary\'** to get relevant public health information.</p>';
        }
    }
}

/**
 * Handles the API call to Gemini with Google Search grounding and exponential backoff.
 * @param {string} userQuery - The main query text.
 * @param {string} systemPrompt - Instructions for the model's persona and output.
 * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>}
 */
async function callGeminiAPI(userQuery, systemPrompt) {
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    let response;
    let delay = 1000;
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
        try {
            response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.status === 429 && i < maxRetries - 1) {
                // Rate limit hit, wait and retry
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // Exponential backoff
                continue; // Skip processing and retry
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const text = candidate.content.parts[0].text;
                let sources = [];
                const groundingMetadata = candidate.groundingMetadata;
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title,
                        }))
                        .filter(source => source.uri && source.title);
                }
                return { text, sources };
            } else {
                throw new Error("API response was empty or malformed.");
            }

        } catch (e) {
            console.error("Gemini API call failed:", e);
            if (i === maxRetries - 1) {
                throw new Error("Failed to get response after multiple retries.");
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }
    throw new Error("Exceeded maximum API retries.");
}


async function generateSummary() {
    if (!Q.disease || !Q.year || !Q.state) {
        setSummaryState('error', 'Missing State, Disease, or Year in URL parameters.');
        return;
    }

    const state = Q.state;
    const disease = Q.disease;
    const year = Q.year;

    const userQuery = `Find public health resources, prevention advice, and key information about ${disease} in ${state} for the year ${year}. Focus the answer on state-specific or official resources.`;
    const systemPrompt = "You are a public health education specialist. Provide a concise, single-paragraph summary (max 150 words) of the most relevant public health resources and information for a general audience. Do not list sources in the output text; list them separately using the provided citation links.";

    setSummaryState('loading');
    summaryText.innerHTML = '';
    citationsList.innerHTML = '';
    citationsContainer.style.display = 'none';

    try {
        const result = await callGeminiAPI(userQuery, systemPrompt);

        // Display summary text
        summaryText.innerHTML = `<p>${result.text}</p>`;
        
        // Display citations
        if (result.sources && result.sources.length > 0) {
            result.sources.forEach(source => {
                const li = document.createElement('li');
                li.innerHTML = `<a href="${source.uri}" target="_blank" rel="noopener noreferrer" style="color:var(--accent); text-decoration:underline;">${source.title}</a>`;
                citationsList.appendChild(li);
            });
            citationsContainer.style.display = 'block';
        } else {
            citationsList.innerHTML = '<li>No specific web sources were cited by the grounding service for this query.</li>';
            citationsContainer.style.display = 'block';
        }

        setSummaryState('ready', 'Summary generated successfully.');
    } catch (error) {
        console.error("Summary generation error:", error);
        setSummaryState('error', `Failed to generate summary. Please try again. (${error.message || 'Unknown error'})`);
    }
}

// --- GEMINI API INTEGRATION END ---


// --- EXISTING CHART/MAP LOGIC (kept for completeness) ---

function initMap(stateData) {
  if (window.stateMap) {
    window.stateMap.remove();
  }
  
  const mapCenter = [stateData.latitude || 39.8283, stateData.longitude || -98.5795];

  window.stateMap = L.map('stateMap', {
    zoomControl: false,
    scrollWheelZoom: false,
    attributionControl: false,
    dragging: false,
    doubleClickZoom: false,
    boxZoom: false
  }).setView(mapCenter, 4); 

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    minZoom: 2,
  }).addTo(window.stateMap);

  // Simple marker for the state
  const marker = L.marker(mapCenter).addTo(window.stateMap);
  marker.bindPopup(`<b>${stateData.state}</b><br>Cases: ${formatNum(stateData.cases)}`).openPopup();
  document.getElementById('stateMapTitle').textContent = `Location of ${stateData.state}`;
  window.stateMap.setView(mapCenter, 6); // Zoom in a bit on the state
}

// Chart E: Sunburst (Using Sunburst.js)
function drawSunburst(allRows, Qobj) {
    const canvas = document.getElementById('chartE_stateSunburst');
    if (!canvas) return;

    const data = allRows.filter(r => r.state === Qobj.state).map(r => ({
        id: `${r.disease}-${r.year}`,
        parent: r.disease,
        value: r.cases,
        disease: r.disease,
        year: r.year
    }));

    // Generate hierarchical data structure (Disease -> Year)
    const diseases = Array.from(new Set(data.map(d => d.disease)));
    const rootData = [];
    diseases.forEach(d => {
        rootData.push({ id: d, parent: '', value: data.filter(r => r.disease === d).reduce((sum, r) => sum + r.value, 0) });
    });

    const finalData = [...rootData, ...data];

    if (window.chartE) try { window.chartE.destroy(); } catch (e) { }
    window.chartE = ChartHelpers.createSunburst(canvas.getContext('2d'), finalData, {
        plugins: {
            title: { display: false },
            tooltip: {
                callbacks: {
                    title: (context) => context[0].raw.id,
                    label: (context) => `Cases: ${formatNum(context.raw.value)}`
                }
            }
        }
    });
}

// Chart F: Heatmap (Matrix Plot of Disease vs. Year)
function drawHeatmap(allRows, Qobj) {
    const canvas = document.getElementById('chartF_stateHeatmap');
    if (!canvas) return;
    const container = canvas.parentNode;

    const relevantRows = allRows.filter(r => r.state === Qobj.state);
    const diseases = Array.from(new Set(relevantRows.map(r => r.disease))).sort();
    const years = Array.from(new Set(relevantRows.map(r => r.year))).sort();

    if (!window.Chart || typeof Chart.registry.getScale('matrix') === 'undefined') {
      const table = document.createElement('table');
      table.style.width='100%'; table.style.fontSize='0.85rem'; table.style.borderCollapse='collapse';
      let html = '<thead><tr><th>Disease</th>';
      years.forEach(y => html += `<th style="text-align:right">${y}</th>`);
      html += '</tr></thead><tbody>';

      diseases.forEach(d => {
        html += `<tr><td>${d}</td>`;
        years.forEach(y => {
          const v = relevantRows.filter(r=> r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0),0);
          html += `<td style="text-align:right">${formatNum(v)}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody>';
      table.innerHTML = html;

      // Check if a fallback table already exists to prevent duplication
      const existing = container.querySelector('.heatmap-fallback');
      if(existing) existing.remove();
      canvas.style.display = 'none';
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
      const v = relevantRows.filter(r=> r.state===Qobj.state && r.disease===d && r.year===y).reduce((s,r)=> s + (Number(r.cases)||0),0);
      data.push({x: y, y: d, v});
    }));
    
    if(window.chartF) try{ window.chartF.destroy(); }catch(e){}
    window.chartF = new Chart(canvas.getContext('2d'), {
      type:'matrix',
      data:{datasets:[{label:'Cases', data, backgroundColor: ctx => {
        const val = ctx.raw.v || 0; 
        const maxVal = data.reduce((max, item) => Math.max(max, item.v), 0) || 1;
        const alpha = Math.min(0.95, val / maxVal); 
        return `rgba(30,144,255,${alpha})`;
      }, width: ({chart}) => (chart.chartArea.width / Math.max(1, years.length)) - 6, height: ({chart}) => (chart.chartArea.height / Math.max(1, diseases.length)) - 6 }]
      },
      options:{ 
        maintainAspectRatio:false,
        parsing: false, 
        scales: {
          x: { labels: years, type: 'category', offset: true, grid: { drawOnChartArea: false } },
          y: { labels: diseases, type: 'category', offset: true, grid: { drawOnChartArea: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (context) => `Cases: ${formatNum(context.raw.v)}` } }
        }
      }
    });
}


// Chart A: Line Chart
function drawLineChart(allRows, Qobj) {
  const canvas = document.getElementById('chartA_stateLine');
  if (!canvas) return;

  const groupBy = document.getElementById('lineGroup').value; // 'state' or 'disease'
  const filterBy = groupBy === 'state' ? Qobj.disease : Qobj.state;
  const filterKey = groupBy === 'state' ? 'disease' : 'state';
  const labelKey = groupBy === 'state' ? 'state' : 'disease';

  const comparisonRows = allRows.filter(r => r[filterKey] === filterBy);

  // Group by the key to plot (state or disease)
  const groups = Array.from(new Set(comparisonRows.map(r => r[labelKey]))).sort();
  const years = Array.from(new Set(comparisonRows.map(r => r.year))).sort();

  const datasets = groups.map(group => {
    const data = years.map(year => {
      // Sum cases for the group in that year
      return comparisonRows.filter(r => r[labelKey] === group && r.year === year)
        .reduce((sum, r) => sum + r.cases, 0);
    });

    // Custom color function to generate distinct colors for comparison
    const baseHue = Math.floor(Math.random() * 360); 
    const color = `hsl(${baseHue}, 70%, 50%)`;

    return {
      label: group,
      data: data,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 6,
      fill: false,
      tension: 0.3
    };
  });

  if (window.chartA) try { window.chartA.destroy(); } catch (e) { }
  window.chartA = ChartHelpers.createLine(canvas.getContext('2d'), years, datasets, {
    plugins: {
      title: { display: true, text: `Annual Cases Trend grouped by ${groupBy}` }
    },
    scales: {
      y: { 
        title: { display: true, text: 'Total Cases' },
        ticks: { callback: (value) => formatNum(value) }
      }
    }
  });
}


// Chart B: Disease Comparison Bar Chart
function drawDiseaseBarChart(allRows, Qobj) {
  const canvas = document.getElementById('chartB_stateBar');
  if (!canvas) return;

  const comparisonRows = allRows.filter(r => r.state === Qobj.state && r.year === Qobj.year);
  const diseases = Array.from(new Set(comparisonRows.map(r => r.disease))).sort();

  const data = diseases.map(d => 
    comparisonRows.filter(r => r.disease === d).reduce((sum, r) => sum + r.cases, 0)
  );

  const datasets = [{
    label: 'Total Cases',
    data: data,
    backgroundColor: 'rgba(31, 127, 224, 0.7)', // var(--accent)
    borderColor: 'rgba(31, 127, 224, 1)',
    borderWidth: 1
  }];

  if (window.chartB) try { window.chartB.destroy(); } catch (e) { }
  window.chartB = ChartHelpers.createBar(canvas.getContext('2d'), diseases, datasets, {
    indexAxis: 'y', // Horizontal bars for better disease name readability
    plugins: {
      title: { display: true, text: `Disease Cases in ${Qobj.state} (${Qobj.year})` }
    },
    scales: {
      x: {
        title: { display: true, text: 'Total Cases' },
        ticks: { callback: (value) => formatNum(value) }
      }
    }
  });
}

// Chart C: Cases by Year Bar Chart
function drawYearBarChart(allRows, Qobj) {
  const canvas = document.getElementById('chartC_stateBar2');
  if (!canvas) return;

  const stateRows = allRows.filter(r => r.state === Qobj.state && r.disease === Qobj.disease);
  const years = Array.from(new Set(stateRows.map(r => r.year))).sort();

  const data = years.map(year => 
    stateRows.filter(r => r.year === year).reduce((sum, r) => sum + r.cases, 0)
  );

  const datasets = [{
    label: 'Total Cases',
    data: data,
    backgroundColor: 'rgba(127, 227, 163, 0.7)', // var(--accent-2)
    borderColor: 'rgba(127, 227, 163, 1)',
    borderWidth: 1
  }];

  if (window.chartC) try { window.chartC.destroy(); } catch (e) { }
  window.chartC = ChartHelpers.createBar(canvas.getContext('2d'), years, datasets, {
    plugins: {
      title: { display: true, text: `${Qobj.disease} Cases in ${Qobj.state} Over Time` }
    },
    scales: {
      y: {
        title: { display: true, text: 'Total Cases' },
        ticks: { callback: (value) => formatNum(value) }
      }
    }
  });
}

// Chart D: Scatter Plot (Rate vs. Population Density)
function drawScatterPlot(allRows, Qobj) {
  const canvas = document.getElementById('chartD_stateScatter');
  if (!canvas) return;
  const yAxisSelect = document.getElementById('scatterYAxis');
  const yAxisType = yAxisSelect.value; // 'cases' or 'per100k'

  const comparisonRows = allRows.filter(r => r.year === Qobj.year && r.disease === Qobj.disease);

  const dataPoints = comparisonRows.map(r => ({
    x: r.population_density,
    y: yAxisType === 'cases' ? r.cases : r.per100k,
    state: r.state
  }));

  const statePoint = dataPoints.find(p => p.state === Qobj.state) || null;

  // Split into two datasets to highlight the selected state
  const otherStatesData = dataPoints.filter(p => p.state !== Qobj.state);

  const datasets = [{
    label: 'Other States',
    data: otherStatesData,
    backgroundColor: 'rgba(31, 127, 224, 0.4)',
    pointRadius: 5,
    pointHoverRadius: 8,
  }];

  if (statePoint) {
    datasets.push({
      label: Qobj.state,
      data: [statePoint],
      backgroundColor: 'red',
      pointRadius: 8,
      pointHoverRadius: 10,
      borderColor: 'white',
      borderWidth: 2,
    });
  }

  if (window.chartD) try { window.chartD.destroy(); } catch (e) { }
  window.chartD = ChartHelpers.createScatter(canvas.getContext('2d'), datasets, {
    type: 'scatter',
    data: { datasets: datasets },
    options: {
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: `${Qobj.disease} (${Qobj.year}): ${yAxisType === 'cases' ? 'Cases' : 'Rate / 100k'} vs. Population Density` },
        tooltip: {
          callbacks: {
            label: (context) => {
              const state = context.raw.state;
              const yVal = formatNum(Math.round(context.raw.y));
              const xVal = formatNum(Math.round(context.raw.x));
              return `${state}: Y=${yVal}, Density=${xVal}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          title: { display: true, text: 'Population Density' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: yAxisType === 'cases' ? 'Total Cases' : 'Rate per 100k' },
          ticks: { callback: (value) => formatNum(value) }
        }
      }
    }
  });

  // Re-draw on select change
  yAxisSelect.onchange = () => drawScatterPlot(allRows, Qobj);
}


// --- Main Load Function ---

document.addEventListener('DOMContentLoaded', () => {
    // Set initial state for summarizer
    setSummaryState('ready'); 
    
    // Add event listener for the summarizer button
    if (summaryBtn) {
        summaryBtn.addEventListener('click', generateSummary);
    }
    
    // Handle back button
    document.getElementById('backToMap').addEventListener('click', () => {
        const q = new URLSearchParams({ disease: Q.disease, year: Q.year });
        location.href = `map.html?${q.toString()}`;
    });
    
    // Set titles
    document.getElementById('stateTitle').textContent = Q.state;
    document.getElementById('diseaseYearMeta').textContent = `${Q.disease} - ${Q.year}`;

    Papa.parse(DATA_PATH, {
        download: true,
        header: true,
        dynamicTyping: true,
        complete: function(results) {
            const allRows = results.data.map(normaliseRow).filter(r => r.cases !== 0 && r.year && r.disease);

            const stateYearDiseaseRows = allRows.filter(r => 
                r.state === Q.state && 
                r.disease === Q.disease && 
                String(r.year) === String(Q.year)
            );
            
            // Aggregated data for the state/year/disease (for stats panel)
            const aggData = stateYearDiseaseRows.reduce((acc, row) => {
                acc.cases += row.cases;
                acc.population = Math.max(acc.population, row.population); // Use max as population might be repeated/same
                acc.population_density = Math.max(acc.population_density, row.population_density);
                return acc;
            }, { cases: 0, population: 0, population_density: 0 });

            aggData.per100k = (aggData.cases / Math.max(1, aggData.population)) * 100000;

            if (aggData.cases > 0) {
                // Update Stats Panel
                document.getElementById('totalCases').textContent = formatNum(aggData.cases);
                document.getElementById('rate100k').textContent = formatNum(Math.round(aggData.per100k));
                document.getElementById('populationTotal').textContent = formatNum(aggData.population);
                document.getElementById('stateLatest').textContent = `Latest: ${Q.disease} cases in ${Q.year}`;

                // Draw Map
                initMap({ 
                    state: Q.state, 
                    cases: aggData.cases,
                    latitude: 39.8283, // Placeholder coordinates, ideally from a lookup
                    longitude: -98.5795,
                    // Note: In a real app, you'd load state centroid coordinates for better map focus
                });

                // Draw Charts
                drawLineChart(allRows, Q);
                document.getElementById('lineGroup').onchange = () => drawLineChart(allRows, Q);
                
                drawDiseaseBarChart(allRows, Q);
                drawYearBarChart(allRows, Q);
                drawScatterPlot(allRows, Q);
                drawSunburst(allRows, Q);
                drawHeatmap(allRows, Q);


            } else {
                console.error('No data found for the selected state, disease, and year.');
                // Display error message on the page
                document.getElementById('diseaseYearMeta').textContent = `No data found for ${Q.disease} in ${Q.year} for ${Q.state}`;
            }

        },
        error: function(error) {
            console.error("Error loading CSV:", error);
            document.getElementById('diseaseYearMeta').textContent = 'Error loading data.';
        }
    });
});






