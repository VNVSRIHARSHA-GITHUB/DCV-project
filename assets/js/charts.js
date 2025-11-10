// charts.js - simple helper wrappers around Chart.js
const ChartHelpers = (function(){
    function createLine(ctx, labels, datasets, opts = {}) {
      return new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: Object.assign({
          responsive:true,
          maintainAspectRatio:false,
          plugins: { legend: { position: 'top' } }
        }, opts)
      });
    }
  
    function createBar(ctx, labels, datasets, opts = {}) {
      return new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets },
        options: Object.assign({
          responsive:true,
          maintainAspectRatio:false,
          plugins: { legend: { position: 'top' } }
        }, opts)
      });
    }
  
    function createScatter(ctx, dataPoints, opts = {}) {
      return new Chart(ctx, {
        type: 'scatter',
        data: { datasets: [{ label: opts.label || 'scatter', data: dataPoints }] },
        options: Object.assign({
          responsive:true,
          maintainAspectRatio:false,
          scales: { x: { title: { display:true, text: opts.xLabel || '' } }, y: { title: { display:true, text: opts.yLabel || '' } } }
        }, opts)
      });
    }
  
    return { createLine, createBar, createScatter };
  })();
  