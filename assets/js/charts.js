// charts.js - helpers for Chart.js charts used across the app
const ChartHelpers = (function(){
  function paddedMax(values, padding = 0.14){
    const clean = values.filter(v=>isFinite(v) && v !== null);
    if(!clean.length) return 1;
    const maxv = Math.max(...clean);
    if(maxv <= 0) return 1;
    return Math.max(1, Math.pow(10, Math.ceil(Math.log10(maxv))) * (1 + padding) * (maxv / Math.pow(10, Math.floor(Math.log10(maxv)))));
  }

  const baseOptions = {
    responsive:true,
    maintainAspectRatio:false,
    plugins:{legend:{position:'top'},tooltip:{mode:'nearest',intersect:false}},
    scales:{x:{ticks:{autoSkip:true,maxRotation:45,minRotation:0}},y:{beginAtZero:true}}
  };

  function createLine(ctx, labels, datasets, opts = {}){
    const cfg = {type:'line',data:{labels, datasets}, options: Object.assign({}, baseOptions, opts)};
    if(opts.yAxisType) cfg.options.scales = Object.assign({}, cfg.options.scales, { y:{ type: opts.yAxisType }});
    return new Chart(ctx, cfg);
  }

  function createBar(ctx, labels, datasets, opts = {}){
    const cfg = {type:'bar', data:{labels, datasets}, options: Object.assign({}, baseOptions, opts)};
    return new Chart(ctx, cfg);
  }

  function createScatter(ctx, dataPoints, opts = {}){
    const cfg = {type:'scatter', data:{datasets:[{label: opts.label||'points', data: dataPoints, backgroundColor: opts.backgroundColor || 'rgba(30,144,255,0.6)'}]}, options: Object.assign({}, baseOptions, opts)};
    return new Chart(ctx, cfg);
  }

  function createBox(ctx, labels, datasets, opts = {}){
    return new Chart(ctx, { type:'boxplot', data:{labels, datasets}, options: Object.assign({}, baseOptions, opts) });
  }

  return { paddedMax, createLine, createBar, createScatter, createBox };
})();

