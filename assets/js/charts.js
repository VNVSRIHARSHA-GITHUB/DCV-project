// charts.js
// Helper utilities for creating charts consistently

const ChartHelpers = (function () {
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "top" },
      tooltip: { mode: "nearest", intersect: false },
    },
    scales: {
      x: { ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 } },
      y: { beginAtZero: true },
    },
  };

  function createLine(ctx, labels, datasets, opts = {}) {
    const cfg = {
      type: "line",
      data: { labels, datasets },
      options: Object.assign({}, baseOptions, opts),
    };
    return new Chart(ctx, cfg);
  }

  function createBar(ctx, labels, datasets, opts = {}) {
    const cfg = {
      type: "bar",
      data: { labels, datasets },
      options: Object.assign({}, baseOptions, opts),
    };
    return new Chart(ctx, cfg);
  }

  function createScatter(ctx, dataPoints, opts = {}) {
    const cfg = {
      type: "scatter",
      data: {
        datasets: [
          {
            label: opts.label || "points",
            data: dataPoints,
            backgroundColor: opts.backgroundColor || "rgba(30,144,255,0.6)",
          },
        ],
      },
      options: Object.assign({}, baseOptions, opts),
    };
    return new Chart(ctx, cfg);
  }

  function createBox(ctx, labels, datasets, opts = {}) {
    // Requires chartjs-chart-boxplot plugin
    return new Chart(ctx, {
      type: "boxplot",
      data: { labels, datasets },
      options: Object.assign({}, baseOptions, opts),
    });
  }

  return { createLine, createBar, createScatter, createBox };
})();

