// charts.js - improved helpers for sensible scaling, per-capita normalization, and linear/log axis
// Replaces previous ChartHelpers. Designed for Chart.js v3+.

const ChartHelpers = (function(){
  // helper: compute a "nice" max with padding
  function paddedMax(values, padding = 0.12) {
    if(!values || values.length === 0) return 1;
    const maxv = Math.max(...values.filter(v => isFinite(v) && v !== null));
    if(!isFinite(maxv) || maxv <= 0) return 1;
    // if values span many orders, don't pad too aggressively
    return maxv * (1 + padding);
  }

  // helper: convert absolute counts to per-100k if population provided
  function toPerCapita(value, population, per = 100000){
    if(!population || population === 0) return null;
    return (value / population) * per;
  }

  // default base options used everywhere
  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12 } },
      tooltip: { mode: 'nearest', intersect: false }
    },
    scales: {
      x: {
        ticks: { autoSkip: true, maxRotation: 45, minRotation: 0 }
      },
      y: {
        beginAtZero: true,
        ticks: { callback: (v)=> v } // default, can be overridden
      }
    }
  };

  // create generic line with auto-scaling options
  function createLine(ctx, labels, datasets, opts = {}) {
    // opts can contain: yAxisType ('linear'|'log'), normalize ('absolute'|'per100k'|'perMillion'), populationMap (optional)
    const yAxisType = opts.yAxisType || 'linear';
    const normalize = opts.normalize || 'absolute';

    // apply normalization if needed (datasets is array of {label, data, populationMap?})
    const datasetsProcessed = datasets.map(ds => {
      if(normalize !== 'absolute' && ds._hasPopulation) {
        // ds._hasPopulation indicates data arrays carry per-point population in ds._population (parallel array)
        const per = normalize === 'per100k' ? 100000 : (normalize === 'perMillion' ? 1000000 : 1);
        const newData = ds.data.map((v, i) => {
          const pop = (ds._population && ds._population[i]) || null;
          const val = (v === null || v === undefined) ? null : Number(v);
          return (pop ? (val / pop) * per : null);
        });
        return Object.assign({}, ds, { data: newData });
      } else {
        return ds;
      }
    });

    // compute y-axis nice max from datasetsProcessed
    const allYs = datasetsProcessed.flatMap(d => d.data ? d.data.filter(v => v !== null && isFinite(v)) : []);
    const suggestedMax = paddedMax(allYs, 0.14);

    const config = {
      type: 'line',
      data: { labels, datasets: datasetsProcessed },
      options: structuredClone(baseOptions)
    };

    // configure y axis type and suggested max
    config.options.scales = config.options.scales || {};
    config.options.scales.y = Object.assign({}, config.options.scales.y, {
      type: yAxisType,
      suggestedMax: (yAxisType === 'linear') ? suggestedMax : undefined,
      ticks: Object.assign({}, config.options.scales.y.ticks, {
        // for log scale, provide friendly tick callback
        callback: function(value) {
          if(yAxisType === 'log') {
            // show integer powers nicely
            if(value >= 1) return Number(value).toLocaleString();
            return Number(value);
          }
          return Number(value).toLocaleString();
        }
      })
    });

    // nice default tooltip label formatting
    config.options.plugins.tooltip = config.options.plugins.tooltip || {};
    config.options.plugins.tooltip.callbacks = config.options.plugins.tooltip.callbacks || {};
    config.options.plugins.tooltip.callbacks.label = function(context) {
      const v = context.parsed.y;
      if(v === null || v === undefined) return `${context.dataset.label}: —`;
      // if normalized, show per-100k suffix
      if(normalize === 'per100k') return `${context.dataset.label}: ${Number(v).toFixed(2)} per 100k`;
      if(normalize === 'perMillion') return `${context.dataset.label}: ${Number(v).toFixed(2)} per 1M`;
      return `${context.dataset.label}: ${Number(v).toLocaleString()}`;
    };

    return new Chart(ctx, config);
  }

  // createBar with similar normalization and scaling
  function createBar(ctx, labels, datasets, opts = {}) {
    const yAxisType = opts.yAxisType || 'linear';
    const normalize = opts.normalize || 'absolute';

    // apply normalization as in createLine
    const datasetsProcessed = datasets.map(ds => {
      if(normalize !== 'absolute' && ds._hasPopulation) {
        const per = normalize === 'per100k' ? 100000 : (normalize === 'perMillion' ? 1000000 : 1);
        const newData = ds.data.map((v, i) => {
          const pop = (ds._population && ds._population[i]) || null;
          const val = (v === null || v === undefined) ? null : Number(v);
          return (pop ? (val / pop) * per : null);
        });
        return Object.assign({}, ds, { data: newData });
      } else {
        return ds;
      }
    });

    const allYs = datasetsProcessed.flatMap(d => d.data ? d.data.filter(v => v !== null && isFinite(v)) : []);
    const suggestedMax = paddedMax(allYs, 0.14);

    const config = {
      type: 'bar',
      data: { labels, datasets: datasetsProcessed },
      options: structuredClone(baseOptions)
    };

    config.options.scales.y = Object.assign({}, config.options.scales.y, {
      type: yAxisType,
      suggestedMax: (yAxisType === 'linear') ? suggestedMax : undefined
    });

    // small default bar thickness for large categories
    config.options.plugins.tooltip = config.options.plugins.tooltip || {};
    return new Chart(ctx, config);
  }

  // createScatter: expects dataPoints array of {x, y, label} — will compute nice scales
  function createScatter(ctx, dataPoints, opts = {}) {
    const yAxisType = opts.yAxisType || 'linear';
    const xLabel = opts.xLabel || '';
    const yLabel = opts.yLabel || '';
    const valuesY = dataPoints.map(p=>p.y).filter(v => isFinite(v));
    const suggestedMax = paddedMax(valuesY, 0.12);

    const config = {
      type: 'scatter',
      data: {
        datasets: [{
          label: opts.label || 'points',
          data: dataPoints.map(p => ({ x: p.x, y: p.y, r: opts.pointRadius || 4 }))
        }]
      },
      options: structuredClone(baseOptions)
    };

    config.options.scales.x = Object.assign({}, config.options.scales.x, {
      title: { display: !!xLabel, text: xLabel }
    });
    config.options.scales.y = Object.assign({}, config.options.scales.y, {
      title: { display: !!yLabel, text: yLabel },
      type: yAxisType,
      suggestedMax: (yAxisType === 'linear') ? suggestedMax : undefined
    });

    return new Chart(ctx, config);
  }

  return { createLine, createBar, createScatter, toPerCapita };
})();
