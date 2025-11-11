// main.js
// Loads the dataset, fills dropdowns, and navigates to map.html or state.html
// Data persistence is handled via localStorage for faster subsequent page loads.

const DATA_PATH = "assets/data/complete_disease_data.csv";
const DATA_STORAGE_KEY = "phd_disease_data"; // Key for localStorage

/**
 * Tolerantly picks a value from an object using a list of possible keys.
 * @param {object} obj - The object to search within.
 * @param {string[]} keys - Array of possible keys to check.
 * @returns {*} The found value or undefined.
 */
function _pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
      return obj[k];
    }
  }
  return undefined;
}

/**
 * Converts a raw row object into a canonical data structure.
 * @param {object} r - The raw data row.
 * @returns {object} The normalized row.
 */
function normalizeRow(r) {
  if (!r) return null;
  return {
    state: String(_pick(r, ["state", "State", "STATE", "location", "province"]) || "").trim(),
    year: String(_pick(r, ["year", "Year", "YEAR", "yr"]) || "").trim(),
    disease: String(_pick(r, ["disease", "Disease", "condition"]) || "").trim(),
    cases: Number(_pick(r, ["cases", "Cases", "value", "count"]) || 0),
    population: Number(_pick(r, ["population", "Population", "pop"]) || 0),
    population_density: Number(
      _pick(r, ["population_density", "population density", "density", "pop_density"]) || 0
    ),
    // Pre-calculate per 100k rate (important for map/state pages)
    per100k: (Number(_pick(r, ["cases", "Cases", "value", "count"]) || 0) / Number(_pick(r, ["population", "Population", "pop"]) || 0)) * 100000,
  };
}

/**
 * Returns a unique, sorted array of non-null/non-empty values.
 * Sorts numerically if possible, otherwise alphabetically.
 * @param {Array<string|number>} arr - Array of values.
 * @returns {Array<string|number>} Sorted unique array.
 */
function uniqueSorted(arr) {
  return Array.from(new Set(arr))
    .filter((x) => x && x !== "NA" && String(x).trim() !== "")
    .sort((a, b) => {
      const numA = Number(a);
      const numB = Number(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return String(a).localeCompare(String(b));
    });
}

/**
 * Loads and processes data, prioritizing localStorage cache.
 * @returns {Promise<object[]>} A promise that resolves with the normalized data array.
 */
async function loadData() {
  console.log("Attempting to load data...");

  // 1. Check Local Storage
  const cachedData = localStorage.getItem(DATA_STORAGE_KEY);
  if (cachedData) {
    try {
      const data = JSON.parse(cachedData);
      console.log(`Loaded ${data.length} rows from localStorage.`);
      // IMPORTANT: Ensure required functions are available globally for other scripts
      window.PHD_DATA = data;
      window._pick = _pick;
      window.uniqueSorted = uniqueSorted;
      window.normalizeRow = normalizeRow;
      return data;
    } catch (e) {
      console.error("Failed to parse cached data:", e);
      localStorage.removeItem(DATA_STORAGE_KEY); // Clear bad cache
    }
  }

  // 2. Fetch and Parse CSV
  console.log("Fetching CSV file...");
  try {
    const response = await fetch(DATA_PATH);
    const csvText = await response.text();

    const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    
    // Normalize and filter out rows where state or disease is empty
    const normalizedData = result.data
      .map(normalizeRow)
      .filter(r => r && r.state && r.disease && r.year);

    console.log(`Successfully parsed and normalized ${normalizedData.length} rows from CSV.`);

    // 3. Store in Local Storage
    localStorage.setItem(DATA_STORAGE_KEY, JSON.stringify(normalizedData));
    
    // IMPORTANT: Ensure required functions are available globally for other scripts
    window.PHD_DATA = normalizedData;
    window._pick = _pick;
    window.uniqueSorted = uniqueSorted;
    window.normalizeRow = normalizeRow;
    return normalizedData;
    
  } catch (error) {
    console.error("Error loading or parsing data:", error);
    // Display error message on the page if possible
    document.querySelector('main .cards').innerHTML = `<article class="card">
        <h3>Data Load Error</h3>
        <p>Could not load primary dataset. Please check the console for details on ${DATA_PATH}.</p>
      </article>`;
    return [];
  }
}

// Attach loadData globally so map.js and state.js can call it
window.loadData = loadData;


document.addEventListener("DOMContentLoaded", async () => {
  const diseaseSelect = document.getElementById("diseaseSelect");
  const yearSelect = document.getElementById("yearSelect");
  const searchBtn = document.getElementById("searchBtn");
  const openExample = document.getElementById("openExample");

  // Load data and wait for it to be ready
  const data = await loadData();
  
  if (!data || data.length === 0) {
    // Already handled error display in loadData, just return.
    return;
  }
  
  // --- Populate Disease Dropdown ---
  const diseases = uniqueSorted(data.map((r) => r.disease));
  diseaseSelect.innerHTML =
    '<option value="">-- Select Disease --</option>' +
    diseases.map((d) => `<option value="${d}">${d}</option>`).join("");

  // --- Disease Change Listener ---
  diseaseSelect.addEventListener("change", () => {
    const d = diseaseSelect.value;
    yearSelect.value = ""; // Clear year when disease changes
    
    if (!d) {
      yearSelect.innerHTML = '<option value="">-- Select Year --</option>';
      yearSelect.disabled = true;
      searchBtn.disabled = true;
      return;
    }
    
    // Populate Year dropdown based on selected disease
    const years = uniqueSorted(data.filter((r) => r.disease === d).map((r) => r.year));
    yearSelect.innerHTML =
      '<option value="">-- Select Year --</option>' +
      years.map((y) => `<option value="${y}">${y}</option>`).join("");
    yearSelect.disabled = false;
    searchBtn.disabled = true;
  });

  // --- Year Change Listener ---
  yearSelect.addEventListener("change", () => {
    searchBtn.disabled = !yearSelect.value;
  });

  // --- Search Button Click Listener (Open Map) ---
  searchBtn.addEventListener("click", () => {
    const d = diseaseSelect.value;
    const y = yearSelect.value;
    if (!d || !y) {
        // Use a simple, non-blocking notification or console log instead of alert
        console.warn("Select a disease and year to open the map.");
        return;
    }
    const q = new URLSearchParams({ disease: d, year: y });
    location.href = `map.html?${q.toString()}`;
  });

  // --- Example Button Click Listener (Open State) ---
  openExample.addEventListener("click", () => {
    // Find a state, disease, and year combo that exists in the data
    const d = diseases[0] || "";
    // Find the first year for that disease
    const yearsForExample = uniqueSorted(data.filter((r) => r.disease === d).map((r) => r.year));
    const y = yearsForExample[0] || "";

    // Find the first state for that disease/year combo
    const stateRow = data.find(r => r.disease === d && r.year === y);
    const s = stateRow ? stateRow.state : "California"; // Fallback state

    if (!d || !y || !s) {
        // If data is too sparse, just fallback to a generic example
        const q = new URLSearchParams({ state: "California", disease: "Influenza", year: "2018" });
        location.href = `state.html?${q.toString()}`;
        return;
    }

    const q = new URLSearchParams({ state: s, disease: d, year: y });
    location.href = `state.html?${q.toString()}`;
  });
});
