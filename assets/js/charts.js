// charts.js
// Helper utilities for creating charts consistently across the dashboard.
// Includes functions for standard types (Line, Bar) and specialized types 
// (Boxplot, Scatter, Matrix/Heatmap, Sunburst, Polar Area).

const ChartHelpers = (function () {
  
  // --- Theme & Color Utilities ---
  
  /** Reads a CSS variable for dynamic theme support. */
  function getCssVariable(prop) {
    // Fallback to a default if property is not found
    try {
        return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || '#212529';
    } catch(e) {
        return '#212529';
    }
  }

  const chartColors = [
    () => getCssVariable('--accent'),      // Primary accent
    () => getCssVariable('--accent-2'),    // Secondary accent
    '#FF6384', // Red (for error/warning states if needed)
    '#FFCE56', // Yellow
    '#36A2EB', // Blue
    '#9966FF', // Purple
    '#4BC0C0', // Teal
  ];

  /** Get a color from the predefined palette */
  function getColor(index) {
    const colorGetter = chartColors[index % chartColors.length];
    return typeof colorGetter === 'function' ? colorGetter() : colorGetter;
  }
  
  /** Get an array of colors */
  function getPalette(count) {
      const palette = [];
      for(let i = 0; i < count; i++) {
          palette.push(getColor(i));
      }
      return palette;
  }

  // --- Base Chart Configuration ---

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    // Global font setting for consistency with Inter font from CSS
    font: {
      family: 'Inter, system-ui, sans-serif',
      color: getCssVariable('--text'),
    },
    plugins: {
      legend: { 
        position: "top",
        labels: {
            color: getCssVariable('--text'),
            font: { weight: 'bold' }
        }
      },
      tooltip: { mode: "nearest", intersect: false },
    },
    scales: {
      x: { 
        // Use autoSkip for dynamic label management
        ticks: { autoSkip: true, maxRotation: 45, minRotation: 0, color: getCssVariable('--muted') },
        grid: { color: getCssVariable('--border') },
      },
      y: { 
        beginAtZero: true,
        ticks: { color: getCssVariable('--muted') },
        grid: { color: getCssVariable('--border') },
      },
    },
  };

  // --- Chart Creation Functions ---

  function createLine(ctx, labels, datasets, opts = {}) {
    // Ensure line datasets have dynamic border/background colors
    const formattedDatasets = datasets.map((d, i) => ({
        ...d,
        borderColor: d.borderColor || getColor(i),
        backgroundColor: d.backgroundColor || getColor(i).replace(/[^,]+(?=\))/, '0.2'), // Light fill
    }));

    const cfg = {
      type: "line",
      data: { labels, datasets: formattedDatasets },
      options: Object.assign({}, baseOptions, opts),
    };
    return new Chart(ctx, cfg);
  }

  function createBar(ctx, labels, datasets, opts = {}) {
    // Ensure bar datasets have dynamic background colors
    const formattedDatasets = datasets.map((d, i) => ({
        ...d,
        backgroundColor: d.backgroundColor || getColor(i),
        borderColor: d.borderColor || getColor(i),
        borderWidth: d.borderWidth || 1,
    }));
    
    const cfg = {
      type: "bar",
      data: { labels, datasets: formattedDatasets },
      options: Object.assign({}, baseOptions, opts),
    };
    return new Chart(ctx, cfg);
  }

  function createScatter(ctx, datasets, opts = {}) {
    // Ensure scatter datasets have dynamic colors
    const formattedDatasets = datasets.map((d, i) => ({
        ...d,
        backgroundColor: d.backgroundColor || getColor(i),
        borderColor: d.borderColor || getColor(i),
    }));
    
    const cfg = {
      type: "scatter",
      data: { datasets: formattedDatasets },
      options: Object.assign({}, baseOptions, opts),
    };
    return new Chart(ctx, cfg);
  }
  
  function createPolar(ctx, labels, data, opts = {}) {
    const cfg = {
        type: "polarArea",
        data: {
            labels,
            datasets: [{
                label: opts.label || 'Values',
                data,
                // Use semi-transparent colors from the palette
                backgroundColor: getPalette(labels.length).map(c => c.replace(/[^,]+(?=\))/, '0.7')), 
                // Card background border for visibility, especially in dark mode
                borderColor: getCssVariable('--card-bg'), 
                borderWidth: 1,
            }]
        },
        options: Object.assign({}, baseOptions, {
            scales: {
                r: {
                    angleLines: { color: getCssVariable('--border') },
                    pointLabels: { color: getCssVariable('--text') },
                    // Make ticks readable against the background
                    ticks: { backdropColor: getCssVariable('--card-bg'), color: getCssVariable('--muted') },
                    grid: { color: getCssVariable('--border') },
                }
            },
            plugins: {
                legend: { position: 'right' }
            }
        }, opts)
    };
    return new Chart(ctx, cfg);
  }

  function createBox(ctx, labels, datasets, opts = {}) {
    // Requires chartjs-chart-boxplot plugin
    
    // Check for plugin availability
    if (typeof Chart.controllers.boxplot === 'undefined') {
        console.error("Chart.js Boxplot plugin is missing. Cannot create boxplot chart.");
        return null;
    }

    // Ensure boxplot datasets have dynamic colors
    const formattedDatasets = datasets.map((d, i) => ({
        ...d,
        backgroundColor: d.backgroundColor || getColor(i).replace(/[^,]+(?=\))/, '0.5'),
        borderColor: d.borderColor || getColor(i),
        // Whiskers and median line should be dark/visible
        medianColor: d.medianColor || getCssVariable('--text'),
        whiskerColor: d.whiskerColor || getCssVariable('--muted'),
        itemStyle: 'circle',
        itemRadius: 3,
    }));
    
    const cfg = {
      type: "boxplot",
      data: { labels, datasets: formattedDatasets },
      options: Object.assign({}, baseOptions, {
        // Specific Boxplot options, like ensuring the X-scale is categorical
        scales: {
            x: { type: 'category', ticks: { color: getCssVariable('--muted') } },
            y: { ticks: { color: getCssVariable('--muted') } },
        }
      }, opts),
    };
    return new Chart(ctx, cfg);
  }
  
  function createMatrix(ctx, dataPoints, labels, opts = {}) {
    // Requires chartjs-chart-matrix plugin
    // dataPoints should be {x: x_label, y: y_label, v: value_for_color}
    
    // Check for plugin availability
    if (typeof Chart.controllers.matrix === 'undefined') {
        console.error("Chart.js Matrix plugin is missing. Cannot create matrix/heatmap chart.");
        return null;
    }

    const cfg = {
        type: 'matrix',
        data: {
            datasets: [{
                label: opts.label || 'Intensity',
                data: dataPoints,
                backgroundColor: opts.backgroundColor || ((context) => {
                    const value = context.raw.v || 0;
                    // Simple scaling for color intensity using the primary accent color
                    const maxVal = opts.maxVal || 1;
                    const alpha = Math.min(1.0, value / maxVal);
                    // Use CSS variable and adjust alpha based on data value
                    const baseColor = getColor(0);
                    // Dynamically set the alpha channel for the heatmap effect
                    return baseColor.replace(/[^,]+(?=\))/, alpha); 
                }),
                // Ensure cells don't touch edges or each other
                width: ({chart}) => (chart.chartArea.width / Math.max(1, labels.x.length)) - 6,
                height: ({chart}) => (chart.chartArea.height / Math.max(1, labels.y.length)) - 6,
                // Add border styling for dark mode visibility
                borderColor: getCssVariable('--card-bg'), 
                borderWidth: 1,
                borderRadius: 4,
                hoverBackgroundColor: getColor(0).replace(/[^,]+(?=\))/, '0.6'),
            }]
        },
        options: Object.assign({}, baseOptions, {
            plugins: {
                tooltip: {
                    callbacks: {
                        title: (items) => `Year: ${items[0].parsed.x}`,
                        label: (item) => `${item.dataset.label}: ${item.parsed.v}`,
                    }
                },
                legend: { display: false },
            },
            scales: {
                // X and Y must be categorical for matrix
                x: { type: 'category', labels: labels.x, ticks: { display: true, color: getCssVariable('--muted') }, grid: { display: false, drawBorder: false }},
                y: { type: 'category', labels: labels.y, ticks: { display: true, color: getCssVariable('--muted') }, grid: { display: false, drawBorder: false }},
            },
        }, opts)
    };
    return new Chart(ctx, cfg);
  }
  
  function createSunburst(ctx, dataPoints, opts = {}) {
    // Requires chartjs-chart-sunburst plugin
    // dataPoints must be an array of objects like { key: 'Group/Subgroup', value: 10 }
    
    // Check for plugin availability
    if (typeof Chart.controllers.sunburst === 'undefined') {
        console.error("Chart.js Sunburst plugin is missing. Cannot create sunburst chart.");
        return null;
    }

    const cfg = {
        type: 'sunburst',
        data: {
            datasets: [{
                label: opts.label || 'Data Distribution',
                key: 'key', // key in the data object for hierarchy path
                value: 'value', // key in the data object for the value
                data: dataPoints,
                // Automatically assign colors based on the default palette
                backgroundColor: getPalette(chartColors.length).map(c => c.replace(/[^,]+(?=\))/, '0.9')),
                borderWidth: 1,
                borderColor: getCssVariable('--card-bg'),
                // Define the groups based on the key paths (Example structure)
                groups: opts.groups || [
                    { key: 'group1', label: 'Group 1' },
                    { key: 'group2', label: 'Group 2' },
                ]
            }]
        },
        options: Object.assign({}, baseOptions, {
            rotation: 0,
            animation: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        // Display the full path in the tooltip title
                        title: (items) => items[0].element.$groups.join(' / '),
                        label: (item) => `${item.label}: ${item.formattedValue}`,
                    }
                },
            },
            // Remove scales for sunburst charts
            scales: {}, 
        }, opts)
    };
    return new Chart(ctx, cfg);
  }
  
  // --- Module Return ---

  return {
    createLine,
    createBar,
    createScatter,
    createBox,
    createMatrix,
    createSunburst,
    createPolar,
    getColor,
    getPalette,
    getCssVariable,
  };
})();
