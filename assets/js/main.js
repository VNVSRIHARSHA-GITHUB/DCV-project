// main.js
// Loads the dataset, fills dropdowns, and navigates to map.html or state.html

const DATA_PATH = "assets/data/complete_disease_data.csv";

function _pick(obj, keys) {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

function normalizeRow(r) {
  return {
    state: _pick(r, ["state", "State", "STATE", "location", "province"]) || "",
    year: _pick(r, ["year", "Year", "YEAR"]) || "",
    disease: _pick(r, ["disease", "Disease", "condition"]) || "",
    cases: Number(_pick(r, ["cases", "Cases", "value", "count"]) || 0),
    population: Number(_pick(r, ["population", "Population", "pop"]) || 0),
    population_density: Number(
      _pick(r, ["population_density", "population density", "density", "pop_density"]) || 0
    ),
  };
}

function uniqueSorted(arr) {
  return Array.from(new Set(arr))
    .filter((x) => x && x !== "NA")
    .sort((a, b) => {
      if (!isNaN(Number(a)) && !isNaN(Number(b))) return Number(a) - Number(b);
      return String(a).localeCompare(String(b));
    });
}

document.addEventListener("DOMContentLoaded", () => {
  const diseaseSelect = document.getElementById("diseaseSelect");
  const yearSelect = document.getElementById("yearSelect");
  const searchBtn = document.getElementById("searchBtn");
  const openExample = document.getElementById("openExample");

  yearSelect.disabled = true;
  searchBtn.disabled = true;

  if (window.__PHdata && Array.isArray(window.__PHdata) && window.__PHdata.length) {
    initFromData(window.__PHdata);
  } else {
    Papa.parse(DATA_PATH, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const normalized = res.data.map(normalizeRow).filter((r) => r.state && r.year);
        window.__PHdata = normalized;
        initFromData(normalized);
      },
      error: (err) => {
        console.error("CSV load error:", err);
        alert("Error loading dataset.");
      },
    });
  }

  function initFromData(data) {
    const diseases = uniqueSorted(data.map((r) => r.disease));
    diseaseSelect.innerHTML =
      '<option value="">-- Select Disease --</option>' +
      diseases.map((d) => `<option value="${d}">${d}</option>`).join("");

    diseaseSelect.addEventListener("change", () => {
      const d = diseaseSelect.value;
      if (!d) {
        yearSelect.innerHTML = '<option value="">-- Select Year --</option>';
        yearSelect.disabled = true;
        searchBtn.disabled = true;
        return;
      }
      const years = uniqueSorted(data.filter((r) => r.disease === d).map((r) => r.year));
      yearSelect.innerHTML =
        '<option value="">-- Select Year --</option>' +
        years.map((y) => `<option value="${y}">${y}</option>`).join("");
      yearSelect.disabled = false;
    });

    yearSelect.addEventListener("change", () => {
      searchBtn.disabled = !yearSelect.value;
    });

    searchBtn.addEventListener("click", () => {
      const d = diseaseSelect.value;
      const y = yearSelect.value;
      if (!d || !y) return alert("Select a disease and year.");
      const q = new URLSearchParams({ disease: d, year: y });
      location.href = `map.html?${q.toString()}`;
    });

    openExample.addEventListener("click", () => {
      const d = diseases[0] || "";
      const y = uniqueSorted(data.filter((r) => r.disease === d).map((r) => r.year))[0] || "";
      const q = new URLSearchParams({ state: "California", disease: d, year: y });
      location.href = `state.html?${q.toString()}`;
    });
  }
});
