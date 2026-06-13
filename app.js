function parseNum(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  return parseFloat(val.toString().replace(/[^0-9.-]+/g, ""));
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.split('/');
  if (parts.length === 3) {
    // Assuming DD/MM/YYYY
    return new Date(parts[2], parts[1] - 1, parts[0]);
  }
  return new Date(str);
}

function computeSummary(data) {
  const totalSales = d3.sum(data, d => d.Sales);
  const totalProfit = d3.sum(data, d => d.Profit);
  const totalQty = d3.sum(data, d => d.Qty);
  
  const uniqueOrders = new Set();
  data.forEach(d => { if(d.OrderID) uniqueOrders.add(d.OrderID); });
  const totalOrders = uniqueOrders.size;
  
  const profitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
  return { totalSales, totalProfit, profitMargin, totalQty, totalOrders };
}

function formatCurrency(val) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val);
}

function renderKPIs(summary) {
  const container = document.getElementById('summary-cards');
  const formatNum = (val) => new Intl.NumberFormat('id-ID').format(val);
  
  container.innerHTML = `
    <div class="kpi-card">
      <div class="kpi-title">Total Sales</div>
      <div class="kpi-value">${formatCurrency(summary.totalSales)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Total Profit</div>
      <div class="kpi-value ${summary.totalProfit >= 0 ? 'text-profit' : 'text-deficit'}">${formatCurrency(summary.totalProfit)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Profit Margin</div>
      <div class="kpi-value ${summary.profitMargin >= 0 ? 'text-profit' : 'text-deficit'}">${summary.profitMargin.toFixed(2)}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Total Qty</div>
      <div class="kpi-value">${formatNum(summary.totalQty)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Total Orders</div>
      <div class="kpi-value">${formatNum(summary.totalOrders)}</div>
    </div>
  `;
}

function renderAlerts(anomalies) {
  const list = document.getElementById('alert-list');
  list.innerHTML = '';
  
  const severeBadge = document.getElementById('badge-severe');
  const warningBadge = document.getElementById('badge-warning');
  if (severeBadge && anomalies.severityCount) {
    severeBadge.innerText = `${anomalies.severityCount.severe} Kritis`;
    warningBadge.innerText = `${anomalies.severityCount.warning + anomalies.severityCount.info} Peringatan`;
  }
  
  const allAlerts = [
    ...anomalies.profitOutliers, 
    ...anomalies.momSpikes,
    ...(anomalies.iqrOutliers?.bySubcat || [])
  ];

  if (allAlerts.length === 0) {
    list.innerHTML = '<li style="color: var(--color-pewter-rule); padding-bottom: 1rem;">Tidak ada anomali terdeteksi.</li>';
    return;
  }

  allAlerts.forEach((alert, index) => {
    const li = document.createElement('li');
    li.className = 'alert-list-item';
    
    let dotColor = 'var(--color-ink)';
    if (alert.severity === 'severe') {
      dotColor = 'var(--color-chart-red)';
    } else if (alert.severity === 'warning') {
      dotColor = 'var(--color-chart-orange)';
    }
    
    let title = '';
    let subtitle = '';
    
    if (alert.type === 'profit_outlier') {
      title = `Profit Margin Anomali: ${alert.name}`;
      subtitle = `margin ${alert.margin}% | Z-score ${alert.zScore} | jauh di ${alert.direction === 'high' ? 'atas' : 'bawah'} rata-rata`;
    } else if (alert.type === 'mom_spike') {
      title = `Revenue ${alert.direction === 'spike' ? 'Naik' : 'Turun'} Drastis: ${alert.month}`;
      const formatVal = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
      subtitle = `${alert.changePct}% MoM | ${formatVal(alert.current)} vs ${formatVal(alert.previous)} bulan lalu`;
    } else if (alert.type === 'iqr_outlier') {
      title = `Distribusi Tidak Normal: ${alert.subcat}`;
      const formatVal = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
      subtitle = `${alert.count} transaksi outlier | rata-rata ${formatVal(alert.avgSales)} | nilai sangat ${alert.direction === 'high' ? 'tinggi' : 'rendah'}`;
    }
    
    li.innerHTML = `
      <div class="alert-item-title">
        <span class="signal-dot" style="background-color: ${dotColor};"></span>
        <strong>${title}</strong>
      </div>
      <div class="mono-text alert-item-subtitle">
        ${subtitle}
      </div>
    `;
    list.appendChild(li);
  });
}

function drawChart(containerId, data, xAccessor, yAccessor, xLabel, isHorizontal = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 250;
  const margin = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();

  const svg = d3.select(`#${containerId}`)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  let x, y;

  if (isHorizontal) {
    y = d3.scaleBand().domain(data.map(xAccessor)).range([0, innerHeight]).padding(0.2);
    x = d3.scaleLinear().domain([0, d3.max(data, yAccessor) * 1.1]).range([0, innerWidth]);
  } else {
    x = d3.scaleBand().domain(data.map(xAccessor)).range([0, innerWidth]).padding(0.2);
    const yMin = Math.min(0, d3.min(data, yAccessor));
    y = d3.scaleLinear().domain([yMin, d3.max(data, yAccessor) * 1.1]).range([innerHeight, 0]);
  }

  // Layer 1: Gridlines
  if (isHorizontal) {
    svg.append('g')
      .attr('class', 'd3-gridline')
      .call(d3.axisBottom(x).tickSize(innerHeight).tickFormat(''));
  } else {
    svg.append('g')
      .attr('class', 'd3-gridline')
      .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));
  }

  // Layer 1: Axes
  const xAxis = isHorizontal ? d3.axisBottom(x).ticks(5).tickFormat(d3.format("~s")) : d3.axisBottom(x);
  const yAxis = isHorizontal ? d3.axisLeft(y) : d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s"));

  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(xAxis)
    .selectAll("text")
    .style("text-anchor", isHorizontal ? "middle" : "end")
    .attr("dx", isHorizontal ? "0" : "-.8em")
    .attr("dy", isHorizontal ? "1em" : ".15em")
    .attr("transform", isHorizontal ? "" : "rotate(-45)");

  svg.append('g')
    .attr('class', 'd3-axis')
    .call(yAxis);

  // Layer 1: Zero line if needed
  if (!isHorizontal) {
    svg.append('line')
      .attr('x1', 0).attr('x2', innerWidth)
      .attr('y1', y(0)).attr('y2', y(0))
      .attr('stroke', 'var(--color-pewter-rule)')
      .attr('stroke-width', 1);
  }

  const tooltip = d3.select('#d3-tooltip');

  // Layer 3 & 4: Bars
  const bars = svg.selectAll('.bar').data(data).enter().append('rect');

  if (isHorizontal) {
    bars.attr('y', d => y(xAccessor(d)))
        .attr('height', y.bandwidth())
        .attr('x', 0)
        .attr('width', d => x(yAccessor(d)));
  } else {
    bars.attr('x', d => x(xAccessor(d)))
        .attr('width', x.bandwidth())
        .attr('y', d => Math.min(y(yAccessor(d)), y(0)))
        .attr('height', d => Math.abs(y(0) - y(yAccessor(d))));
  }

  bars.attr('fill', d => {
        if (yAccessor(d) < 0) return 'var(--color-chart-orange)';
        if (d.anomalous) return 'var(--color-chart-orange)';
        return 'var(--color-chart-blue)';
      })
      .attr('stroke', d => {
        if (yAccessor(d) < 0) return 'var(--color-chart-red)';
        if (d.anomalous) return 'var(--color-chart-red)';
        return 'var(--color-chart-blue)';
      })
      .attr('stroke-width', 1.5)
      .on('mouseover', function(event, d) {
        const isAnomaly = yAccessor(d) < 0 || d.anomalous;
        d3.select(this).attr('fill', isAnomaly ? 'var(--color-chart-red)' : 'var(--color-chart-blue)');
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`<strong>${xAccessor(d)}</strong><br/>${new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(yAccessor(d))}`)
               .style('left', (event.pageX + 10) + 'px')
               .style('top', (event.pageY - 28) + 'px');
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 10) + 'px')
               .style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        const isAnomaly = yAccessor(d) < 0 || d.anomalous;
        d3.select(this).attr('fill', isAnomaly ? 'var(--color-chart-orange)' : 'var(--color-chart-blue)');
        tooltip.transition().duration(150).style('opacity', 0);
      });
}

function drawScatterPlot(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 300;
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();

  const svg = d3.select(`#${containerId}`)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.Sales) * 1.05])
    .range([0, innerWidth]);

  const yMin = Math.min(0, d3.min(data, d => d.Profit) * 1.1);
  const yMax = Math.max(0, d3.max(data, d => d.Profit) * 1.1);
  const y = d3.scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]);

  // Layer 1: Gridlines
  svg.append('g')
    .attr('class', 'd3-gridline')
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  svg.append('g')
    .attr('class', 'd3-gridline')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickSize(-innerHeight).tickFormat(''));

  // Layer 1: Axes
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("~s")));

  svg.append('g')
    .attr('class', 'd3-axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("~s")));

  // Layer 1: Zero line
  svg.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', 'var(--color-pewter-rule)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4 4');

  const tooltip = d3.select('#d3-tooltip');
  const medianSales = d3.median(data, d => d.Sales);

  // Layer 3 & 4: Dots
  svg.selectAll('.dot')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.Sales))
    .attr('cy', d => y(d.Profit))
    .attr('r', 5)
    .attr('fill', d => {
      if (d.anomalous || (d.Sales > medianSales && d.Profit < 0)) return 'var(--color-chart-orange)';
      return 'var(--color-chart-blue)';
    })
    .attr('stroke', d => {
      if (d.anomalous || (d.Sales > medianSales && d.Profit < 0)) return 'var(--color-chart-red)';
      return 'var(--color-chart-blue)';
    })
    .attr('stroke-width', 1.5)
    .on('mouseover', function(event, d) {
      const isAnomaly = d.anomalous || (d.Sales > medianSales && d.Profit < 0);
      d3.select(this).attr('fill', isAnomaly ? 'var(--color-chart-red)' : 'var(--color-chart-blue)');
      tooltip.transition().duration(150).style('opacity', 1);
      const format = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
      const marginPct = d.Sales > 0 ? ((d.Profit / d.Sales) * 100).toFixed(1) : 0;
      tooltip.html(`<strong>${d.key}</strong><br/>Sales: ${format.format(d.Sales)}<br/>Profit: ${format.format(d.Profit)} (${marginPct}%)`)
             .style('left', (event.pageX + 10) + 'px')
             .style('top', (event.pageY - 28) + 'px');
    })
    .on('mousemove', function(event) {
      tooltip.style('left', (event.pageX + 10) + 'px')
             .style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', function(event, d) {
      const isAnomaly = d.anomalous || (d.Sales > medianSales && d.Profit < 0);
      d3.select(this).attr('fill', isAnomaly ? 'var(--color-chart-orange)' : 'var(--color-chart-blue)');
      tooltip.transition().duration(150).style('opacity', 0);
    });
}

function drawDualAreaChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 300;
  const margin = { top: 20, right: 60, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('width', width).attr('height', height)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const parseTime = d3.timeParse("%Y-%m");
  const x = d3.scaleTime().domain(d3.extent(data, d => parseTime(d.month))).range([0, innerWidth]);
  const yLeft = d3.scaleLinear().domain([0, d3.max(data, d => d.Sales) * 1.1]).range([innerHeight, 0]);
  const minProfit = Math.min(0, d3.min(data, d => d.Profit));
  const yRight = d3.scaleLinear().domain([minProfit, d3.max(data, d => d.Profit) * 1.1]).range([innerHeight, 0]);

  // Layer 1: Gridlines
  svg.append('g')
    .attr('class', 'd3-gridline')
    .call(d3.axisLeft(yLeft).tickSize(-innerWidth).tickFormat(''));

  // Layer 1: Axes
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%b %y")));

  svg.append('g')
    .attr('class', 'd3-axis')
    .call(d3.axisLeft(yLeft).ticks(5).tickFormat(d3.format("~s")));

  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(${innerWidth},0)`)
    .call(d3.axisRight(yRight).ticks(5).tickFormat(d3.format("~s")));

  // Layer 1: Zero line for profit
  svg.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('y1', yRight(0)).attr('y2', yRight(0))
    .attr('stroke', 'var(--color-ash-hairline)')
    .attr('stroke-dasharray', '4 4');

  // Layer 3: Sales area & line
  const areaSales = d3.area().x(d => x(parseTime(d.month))).y0(innerHeight).y1(d => yLeft(d.Sales));
  svg.append('path').datum(data)
    .attr('fill', 'var(--color-chart-blue)')
    .attr('opacity', 0.2)
    .attr('d', areaSales);

  const lineSales = d3.line().x(d => x(parseTime(d.month))).y(d => yLeft(d.Sales));
  svg.append('path').datum(data)
    .attr('fill', 'none')
    .attr('stroke', 'var(--color-chart-blue)')
    .attr('stroke-width', 2)
    .attr('d', lineSales);

  // Layer 4: Profit area & line
  const areaProfit = d3.area().x(d => x(parseTime(d.month))).y0(yRight(0)).y1(d => yRight(d.Profit));
  svg.append('path').datum(data)
    .attr('fill', 'var(--color-chart-green)')
    .attr('opacity', 0.15)
    .attr('d', areaProfit);

  const lineProfit = d3.line().x(d => x(parseTime(d.month))).y(d => yRight(d.Profit));
  svg.append('path').datum(data)
    .attr('fill', 'none')
    .attr('stroke', 'var(--color-chart-green)')
    .attr('stroke-width', 2)
    .attr('d', lineProfit);

  // Layer 2: Average reference lines
  const avgSales = d3.mean(data, d => d.Sales);
  const avgProfit = d3.mean(data, d => d.Profit);

  svg.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('y1', yLeft(avgSales)).attr('y2', yLeft(avgSales))
    .attr('stroke', 'var(--color-chart-blue)')
    .attr('stroke-dasharray', '4 4')
    .attr('opacity', 0.5)
    .style('pointer-events', 'none');

  svg.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('y1', yRight(avgProfit)).attr('y2', yRight(avgProfit))
    .attr('stroke', 'var(--color-chart-green)')
    .attr('stroke-dasharray', '4 4')
    .attr('opacity', 0.5)
    .style('pointer-events', 'none');

  // Layer 2: Min/Max highlights
  const maxSales = data.reduce((a, b) => a.Sales > b.Sales ? a : b);
  const minSales = data.reduce((a, b) => a.Sales < b.Sales ? a : b);
  const maxProfit = data.reduce((a, b) => a.Profit > b.Profit ? a : b);
  const minProfitObj = data.reduce((a, b) => a.Profit < b.Profit ? a : b);

  svg.selectAll('.highlight-sales').data([maxSales, minSales]).enter().append('circle')
    .attr('cx', d => x(parseTime(d.month))).attr('cy', d => yLeft(d.Sales))
    .attr('r', 4)
    .attr('fill', 'var(--color-paper-white)')
    .attr('stroke', 'var(--color-chart-blue)')
    .attr('stroke-width', 1.5)
    .style('pointer-events', 'none');

  svg.selectAll('.highlight-profit').data([maxProfit, minProfitObj]).enter().append('circle')
    .attr('cx', d => x(parseTime(d.month))).attr('cy', d => yRight(d.Profit))
    .attr('r', 4)
    .attr('fill', 'var(--color-paper-white)')
    .attr('stroke', 'var(--color-chart-green)')
    .attr('stroke-width', 1.5)
    .style('pointer-events', 'none');

  // Layer 5: Interaction overlay
  const tooltip = d3.select('#d3-tooltip');
  const formatCur = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

  svg.selectAll('.dot-interact').data(data).enter().append('circle')
    .attr('cx', d => x(parseTime(d.month))).attr('cy', d => yLeft(d.Sales))
    .attr('r', 12).attr('fill', 'transparent').attr('stroke', 'none')
    .on('mouseover', function(event, d) {
      tooltip.transition().duration(150).style('opacity', 1);
      tooltip.html(`<strong>${d.month}</strong><br/>Sales: ${formatCur(d.Sales)}<br/>Profit: ${formatCur(d.Profit)}`)
        .style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mousemove', function(event) {
      tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', function() {
      tooltip.transition().duration(150).style('opacity', 0);
    });

  // HTML legend: Sales (blue) + Profit (green)
  d3.select(`#${containerId} .chart-legend`).remove();
  const legendItems = [
    { color: 'var(--color-chart-blue)',  label: 'Sales' },
    { color: 'var(--color-chart-green)', label: 'Profit' }
  ];
  const legend = d3.select(`#${containerId}`).append('div').attr('class', 'chart-legend');
  legendItems.forEach(({ color, label }) => {
    const item = legend.append('div').attr('class', 'chart-legend-item');
    item.append('span').attr('class', 'chart-legend-swatch').style('background-color', color);
    item.append('span').attr('class', 'chart-legend-label').text(label);
  });
}

function drawDivergingBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 400;
  const margin = { top: 20, right: 20, bottom: 40, left: 120 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('width', width).attr('height', height)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const xMin = Math.min(-2, d3.min(data, d => d.zScore) * 1.1);
  const xMax = Math.max(2, d3.max(data, d => d.zScore) * 1.1);
  const x = d3.scaleLinear().domain([xMin, xMax]).range([0, innerWidth]);
  const y = d3.scaleBand().domain(data.map(d => d.key)).range([0, innerHeight]).padding(0.2);

  // Layer 1: Gridlines
  svg.append('g')
    .attr('class', 'd3-gridline')
    .call(d3.axisBottom(x).tickSize(innerHeight).tickFormat(''))
    .attr('transform', `translate(0,0)`);

  // Layer 1: Axes
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(5));

  svg.append('g')
    .attr('class', 'd3-axis')
    .call(d3.axisLeft(y).tickSize(0))
    .select('.domain').remove();

  // Zero line
  svg.append('line')
    .attr('x1', x(0)).attr('x2', x(0))
    .attr('y1', 0).attr('y2', innerHeight)
    .attr('stroke', 'var(--color-pewter-rule)')
    .attr('stroke-width', 1);

  // Layer 3 & 4: Bars
  const tooltip = d3.select('#d3-tooltip');
  // Color helper: 3-tier severity based on z-score
  // z <= -1.5 -> red (kritis), -1.5 < z <= -1.0 -> orange (warning), else -> blue (normal)
  const zFillColor = (z) => {
    if (z <= -1.0) return 'var(--color-chart-red)';
    if (z <= 0) return 'var(--color-chart-orange)';
    return 'var(--color-chart-blue)';
  };
  const zFillColorHover = (z) => {
    if (z <= -1.0) return 'var(--color-chart-red-light)';
    if (z <= 0) return 'var(--color-chart-orange-light)';
    return 'var(--color-chart-blue-light)';
  };
  const zStrokeColor = (z) => {
    if (z <= -1.0) return 'var(--color-chart-red)';
    if (z <= 0) return 'var(--color-chart-orange)';
    return 'var(--color-chart-blue)';
  };

  const bars = svg.selectAll('.bar').data(data).enter().append('rect');

  bars.attr('y', d => y(d.key))
      .attr('height', y.bandwidth())
      .attr('x', d => Math.min(x(0), x(d.zScore)))
      .attr('width', d => Math.abs(x(d.zScore) - x(0)))
      .attr('fill', d => zFillColor(d.zScore))
      .attr('stroke', d => zStrokeColor(d.zScore))
      .attr('stroke-width', 1.5)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('fill', zFillColorHover(d.zScore));
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`<strong>${d.key}</strong><br/>Margin: ${d.marginPct.toFixed(2)}%<br/>Z-Score: ${d.zScore.toFixed(2)}`)
               .style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        d3.select(this).attr('fill', zFillColor(d.zScore));
        tooltip.transition().duration(150).style('opacity', 0);
      });

  // Layer 2: Annotation — threshold lines at -1.5 and 1.5
  [-1.5, 1.5].forEach(threshold => {
    if (x(threshold) >= 0 && x(threshold) <= innerWidth) {
      svg.append('line')
        .attr('x1', x(threshold)).attr('x2', x(threshold))
        .attr('y1', 0).attr('y2', innerHeight)
        .attr('stroke', 'var(--color-ash-hairline)')
        .attr('stroke-dasharray', '4 4');
      svg.append('text')
        .attr('x', x(threshold)).attr('y', -6)
        .attr('text-anchor', 'middle')
        .attr('fill', 'var(--color-iron-caption)')
        .attr('font-size', '10px')
        .text(threshold > 0 ? '+1.5s' : '-1.5s');
    }
  });

  // HTML legend: 3-tier color scale
  d3.select(`#${containerId} .chart-legend`).remove();
  const legend = d3.select(`#${containerId}`).append('div').attr('class', 'chart-legend');
  [
    { color: 'var(--color-chart-blue)',   label: 'Normal (z > -1.0)' },
    { color: 'var(--color-chart-orange)', label: 'Peringatan (-1.5 < z <= -1.0)' },
    { color: 'var(--color-chart-red)',    label: 'Kritis (z <= -1.5)' }
  ].forEach(({ color, label }) => {
    const item = legend.append('div').attr('class', 'chart-legend-item');
    item.append('span').attr('class', 'chart-legend-swatch').style('background-color', color);
    item.append('span').attr('class', 'chart-legend-label').text(label);
  });
}

function drawProductScatterPlot(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 400;
  const margin = { top: 20, right: 30, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('width', width).attr('height', height)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.Sales) * 1.05]).range([0, innerWidth]);
  const yMin = d3.min(data, d => d.Margin) * 1.1;
  const yMax = Math.max(0, d3.max(data, d => d.Margin) * 1.1);
  const y = d3.scaleLinear().domain([yMin, yMax]).range([innerHeight, 0]);

  // Layer 1: Gridlines
  svg.append('g')
    .attr('class', 'd3-gridline')
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  svg.append('g')
    .attr('class', 'd3-gridline')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickSize(-innerHeight).tickFormat(''));

  // Layer 1: Axes
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).ticks(6).tickFormat(d3.format("~s")));

  svg.append('g')
    .attr('class', 'd3-axis')
    .call(d3.axisLeft(y).ticks(6).tickFormat(d => d + '%'));

  // Layer 1: Zero line for margin = 0
  svg.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', 'var(--color-pewter-rule)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4 4');

  // Layer 2: Axis labels
  svg.append('text')
    .attr('x', innerWidth / 2).attr('y', innerHeight + 34)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--color-iron-caption)')
    .attr('font-size', '10px')
    .text('Sales');

  svg.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -innerHeight / 2).attr('y', -44)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--color-iron-caption)')
    .attr('font-size', '10px')
    .text('Profit Margin %');

  // Quadrant logic: median sales as threshold
  const medianSales = d3.median(data, d => d.Sales);

  // Layer 2: Quadrant reference line (median sales)
  svg.append('line')
    .attr('x1', x(medianSales)).attr('x2', x(medianSales))
    .attr('y1', 0).attr('y2', innerHeight)
    .attr('stroke', 'var(--color-ash-hairline)')
    .attr('stroke-dasharray', '4 4');

  const tooltip = d3.select('#d3-tooltip');
  const format = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

  // Layer 3 & 4: Dots
  svg.selectAll('.dot').data(data).enter().append('circle')
    .attr('cx', d => x(d.Sales))
    .attr('cy', d => y(d.Margin))
    .attr('r', 5)
    .attr('fill', d => (d.Sales > medianSales && d.Margin < 0)
      ? 'var(--color-chart-orange)'
      : 'var(--color-chart-blue)')
    .attr('stroke', d => (d.Sales > medianSales && d.Margin < 0)
      ? 'var(--color-chart-red)'
      : 'var(--color-chart-blue)')
    .attr('stroke-width', 1.5)
    .on('mouseover', function(event, d) {
      const isAnomaly = d.Sales > medianSales && d.Margin < 0;
      d3.select(this)
        .attr('fill', isAnomaly ? 'var(--color-chart-red)' : 'var(--color-chart-blue)');
      tooltip.transition().duration(150).style('opacity', 1);
      tooltip.html(`<strong>${d.key}</strong><br/>Sales: ${format.format(d.Sales)}<br/>Margin: ${d.Margin.toFixed(1)}%`)
             .style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mousemove', function(event) {
      tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', function(event, d) {
      const isAnomaly = d.Sales > medianSales && d.Margin < 0;
      d3.select(this)
        .attr('fill', isAnomaly ? 'var(--color-chart-orange)' : 'var(--color-chart-blue)');
      tooltip.transition().duration(150).style('opacity', 0);
    });
}

function drawGroupedBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 350;
  const margin = { top: 30, right: 20, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('width', width).attr('height', height)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  const subgroups = ['UnitPrice', 'ProductCost'];
  const groups = data.map(d => d.Territory);

  const x = d3.scaleBand().domain(groups).range([0, innerWidth]).padding([0.2]);
  const xSubgroup = d3.scaleBand().domain(subgroups).range([0, x.bandwidth()]).padding([0.05]);

  const yMax = d3.max(data, d => Math.max(d.UnitPrice, d.ProductCost)) * 1.1;
  const y = d3.scaleLinear().domain([0, yMax]).range([innerHeight, 0]);

  // Layer 1: Gridlines
  svg.append('g')
    .attr('class', 'd3-gridline')
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  // Layer 1: Axes
  svg.append('g')
    .attr('class', 'd3-axis')
    .attr('transform', `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x))
    .selectAll("text").attr("transform", "translate(-10,0)rotate(-45)").style("text-anchor", "end");

  svg.append('g')
    .attr('class', 'd3-axis')
    .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("~s")));

  // Layer 3: Bars with semantic coloring
  const color = d3.scaleOrdinal().domain(subgroups).range(['var(--color-chart-blue)', 'var(--color-chart-green)']);
  const colorLight = d3.scaleOrdinal().domain(subgroups).range(['var(--color-chart-blue-light)', 'var(--color-chart-green-light)']);
  const tooltip = d3.select('#d3-tooltip');
  const formatCur = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

  svg.append("g").selectAll("g").data(data).enter().append("g")
    .attr("transform", d => `translate(${x(d.Territory)},0)`)
    .selectAll("rect").data(d => subgroups.map(key => ({key, value: d[key], Territory: d.Territory}))).enter().append("rect")
      .attr("x", d => xSubgroup(d.key))
      .attr("y", d => y(d.value))
      .attr("width", xSubgroup.bandwidth())
      .attr("height", d => innerHeight - y(d.value))
      .attr("fill", d => color(d.key))
      .attr("stroke", d => color(d.key))
      .attr("stroke-width", 1.5)
      .on('mouseover', function(event, d) {
        d3.select(this).attr('fill', colorLight(d.key));
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`<strong>${d.Territory}</strong><br/>${d.key}: ${formatCur(d.value)}`)
               .style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        d3.select(this).attr('fill', color(d.key));
        tooltip.transition().duration(150).style('opacity', 0);
      });

  // Layer 2: Legend
  const legend = svg.append("g").attr("transform", `translate(${innerWidth - 150}, -20)`);
  subgroups.forEach((key, i) => {
    legend.append("rect").attr("x", 0).attr("y", i * 20).attr("width", 12).attr("height", 12).style("fill", color(key));
    legend.append("text").attr("x", 20).attr("y", i * 20 + 10).text(key)
      .style("font-size", "10px").style("fill", "var(--color-granite-mute)")
      .attr("font-family", "var(--font-geist-mono)").attr("alignment-baseline", "middle");
  });
}

function renderConflictComparisons(data, metric) {
  const isSales = metric === 'Sales';
  const getAgg = (groupKey) => {
    const map = d3.rollup(data, v => d3.sum(v, d => d[metric]), d => d[groupKey]);
    return Array.from(map, ([key, value]) => ({ key: key || 'Unknown', value }));
  };

  const catData     = getAgg('ProductName');
  const segData     = getAgg('Segment');
  const subcatData  = getAgg('SubCategory');

  // ── Narrative titles per metric ──────────────────────────
  const titles = isSales
    ? {
        category : 'Produk Mana yang Mendominasi Omzet?',
        segment  : 'Segmen Mana yang Paling Banyak Membeli?',
        subcat   : 'Sub-Kategori dengan Kontribusi Sales Terbesar'
      }
    : {
        category : 'Produk Mana yang Benar-Benar Menghasilkan Profit?',
        segment  : 'Segmen Paling Profitable vs yang Menguras Margin',
        subcat   : 'Sub-Kategori Pendorong vs Penekan Profit'
      };

  const setTitle = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setTitle('title-comp-category', titles.category);
  setTitle('title-comp-segment',  titles.segment);
  setTitle('title-comp-subcat',   titles.subcat);

  if (isSales) {
    drawDonutChart('chart-comp-category', catData);
    drawDonutChart('chart-comp-segment', segData);
    drawDonutChart('chart-comp-subcat', subcatData);
  } else {
    drawVerticalBarChart('chart-comp-category', catData);
    drawVerticalBarChart('chart-comp-segment', segData);
    drawVerticalBarChart('chart-comp-subcat', subcatData);
  }

  // Generate narrative insights answering each chart's title question
  generateCompInsight('insight-comp-category', catData,    isSales, 'product');
  generateCompInsight('insight-comp-segment',  segData,    isSales, 'segment');
  generateCompInsight('insight-comp-subcat',   subcatData, isSales, 'subcat');
}

function drawDonutChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 240;
  const margin = 10;
  const radius = Math.min(width, height) / 2 - margin;

  d3.select(`#${containerId} svg`).remove();
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('width', width).attr('height', height)
    .append('g').attr('transform', `translate(${width/2},${height/2})`);

  data.sort((a, b) => b.value - a.value);
  let plotData = data;
  if (data.length > 5) {
    const top = data.slice(0, 4);
    const otherVal = d3.sum(data.slice(4), d => d.value);
    top.push({ key: 'Other', value: otherVal });
    plotData = top;
  }

  // Layer 3: Base palette using semantic tones
  const color = d3.scaleOrdinal()
    .domain(plotData.map(d => d.key))
    .range(['var(--color-chart-blue)', 'var(--color-chart-green)', 'var(--color-chart-yellow)', 'var(--color-chart-orange)', 'var(--color-pewter-rule)']);

  const colorLight = d3.scaleOrdinal()
    .domain(plotData.map(d => d.key))
    .range(['var(--color-chart-blue-light)', 'var(--color-chart-green-light)', 'var(--color-chart-yellow-light)', 'var(--color-chart-orange-light)', 'var(--color-ash-hairline)']);

  const pie = d3.pie().value(d => d.value).sort(null);
  const data_ready = pie(plotData);
  const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);
  const arcHover = d3.arc().innerRadius(radius * 0.5).outerRadius(radius * 1.05);

  const tooltip = d3.select('#d3-tooltip');
  const formatCur = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

  svg.selectAll('path').data(data_ready).enter().append('path')
    .attr('d', arc)
    .attr('fill', d => color(d.data.key))
    .attr('stroke', 'var(--color-paper-white)')
    .attr('stroke-width', 2)
    .on('mouseover', function(event, d) {
      d3.select(this)
        .attr('d', arcHover)
        .attr('fill', colorLight(d.data.key));
      tooltip.transition().duration(150).style('opacity', 1);
      tooltip.html(`<strong>${d.data.key}</strong><br/>${formatCur(d.data.value)}`)
             .style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mousemove', function(event) {
      tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
    })
    .on('mouseout', function(event, d) {
      d3.select(this)
        .attr('d', arc)
        .attr('fill', color(d.data.key));
      tooltip.transition().duration(150).style('opacity', 0);
    });

  // HTML legend below the donut
  d3.select(`#${containerId} .chart-legend`).remove();
  const legend = d3.select(`#${containerId}`)
    .append('div')
    .attr('class', 'chart-legend');

  const colors = ['var(--color-chart-blue)', 'var(--color-chart-green)', 'var(--color-chart-yellow)', 'var(--color-chart-orange)', 'var(--color-pewter-rule)'];
  plotData.forEach((d, i) => {
    const item = legend.append('div').attr('class', 'chart-legend-item');
    item.append('span')
      .attr('class', 'chart-legend-swatch')
      .style('background-color', colors[i] || 'var(--color-pewter-rule)');
    item.append('span')
      .attr('class', 'chart-legend-label')
      .text(d.key);
  });
}

function drawVerticalBarChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const width = container.clientWidth - 32;
  const height = 240;
  const margin = { top: 20, right: 10, bottom: 40, left: 50 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  d3.select(`#${containerId} svg`).remove();
  const svg = d3.select(`#${containerId}`).append('svg')
    .attr('width', width).attr('height', height)
    .append('g').attr('transform', `translate(${margin.left},${margin.top})`);

  data.sort((a, b) => b.value - a.value);
  let plotData = data;
  if (data.length > 5) {
    const top = data.slice(0, 4);
    const otherVal = d3.sum(data.slice(4), d => d.value);
    top.push({ key: 'Other', value: otherVal });
    plotData = top;
  }

  const x = d3.scaleBand().range([0, innerWidth]).domain(plotData.map(d => d.key)).padding(0.2);
  const yMin = Math.min(0, d3.min(plotData, d => d.value));
  const y = d3.scaleLinear().domain([yMin, d3.max(plotData, d => d.value) * 1.1]).range([innerHeight, 0]);

  // Layer 1: Gridlines
  svg.append('g')
    .attr('class', 'd3-gridline')
    .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(''));

  // Layer 1: Axes
  svg.append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .attr('class', 'd3-axis')
    .call(d3.axisBottom(x))
    .selectAll("text").attr("transform", "translate(-10,0)rotate(-45)").style("text-anchor", "end").style("font-size", "9px");

  svg.append("g")
    .attr('class', 'd3-axis')
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")));

  // Layer 1: Zero line
  svg.append('line')
    .attr('x1', 0).attr('x2', innerWidth)
    .attr('y1', y(0)).attr('y2', y(0))
    .attr('stroke', 'var(--color-pewter-rule)')
    .attr('stroke-width', 1);

  // Layer 3 & 4: Bars
  const tooltip = d3.select('#d3-tooltip');
  const formatCur = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v);

  const bars = svg.selectAll("rect").data(plotData).enter().append("rect");
  bars.attr("x", d => x(d.key))
      .attr("y", d => Math.min(y(d.value), y(0)))
      .attr("width", x.bandwidth())
      .attr("height", d => Math.abs(y(0) - y(d.value)))
      .attr("fill", d => d.value < 0 ? 'var(--color-chart-orange)' : 'var(--color-chart-blue)')
      .attr("stroke", d => d.value < 0 ? 'var(--color-chart-red)' : 'var(--color-chart-blue)')
      .attr("stroke-width", 1.5)
      .on('mouseover', function(event, d) {
        const isAnomaly = d.value < 0;
        d3.select(this).attr('fill', isAnomaly ? 'var(--color-chart-orange-light)' : 'var(--color-chart-blue-light)');
        tooltip.transition().duration(150).style('opacity', 1);
        tooltip.html(`<strong>${d.key}</strong><br/>${formatCur(d.value)}`)
               .style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
      })
      .on('mousemove', function(event) {
        tooltip.style('left', (event.pageX + 10) + 'px').style('top', (event.pageY - 28) + 'px');
      })
      .on('mouseout', function(event, d) {
        const isAnomaly = d.value < 0;
        d3.select(this).attr('fill', isAnomaly ? 'var(--color-chart-orange)' : 'var(--color-chart-blue)');
        tooltip.transition().duration(150).style('opacity', 0);
      });

  // HTML legend below the bar chart
  d3.select(`#${containerId} .chart-legend`).remove();
  const legend = d3.select(`#${containerId}`).append('div').attr('class', 'chart-legend');

  const hasNegative = plotData.some(d => d.value < 0);
  if (hasNegative) {
    // Show both: positive = blue, negative = orange
    [
      { color: 'var(--color-chart-blue)',   label: 'Profit positif' },
      { color: 'var(--color-chart-orange)', label: 'Profit negatif (defisit)' }
    ].forEach(({ color, label }) => {
      const item = legend.append('div').attr('class', 'chart-legend-item');
      item.append('span').attr('class', 'chart-legend-swatch').style('background-color', color);
      item.append('span').attr('class', 'chart-legend-label').text(label);
    });
  } else {
    const item = legend.append('div').attr('class', 'chart-legend-item');
    item.append('span').attr('class', 'chart-legend-swatch').style('background-color', 'var(--color-chart-blue)');
    item.append('span').attr('class', 'chart-legend-label').text('Profit');
  }
}

// ── Region Cost Chart Insight Generator ─────────────────────
// Builds a data-driven narrative for the Unit Price vs Product Cost by Territory chart.
// Focus: efficiency gap (UnitPrice - ProductCost), best/worst territory, replication angle.
function generateRegionInsight(territoryData) {
  const el = document.getElementById('region-insight');
  if (!el || !territoryData || territoryData.length === 0) return;

  const fmtCur = (v) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(v);
  const fmtPct = (n) => n.toFixed(1) + '%';

  // Compute margin gap = (UnitPrice - ProductCost) / UnitPrice * 100
  const withGap = territoryData
    .filter(d => d.UnitPrice > 0)
    .map(d => ({
      ...d,
      gap: d.UnitPrice - d.ProductCost,
      gapPct: ((d.UnitPrice - d.ProductCost) / d.UnitPrice) * 100
    }));

  if (withGap.length === 0) { el.textContent = ''; return; }

  // Best = highest gap %, worst = lowest gap %
  const best  = withGap.reduce((a, b) => a.gapPct > b.gapPct ? a : b);
  const worst = withGap.reduce((a, b) => a.gapPct < b.gapPct ? a : b);

  // Territories with cost exceeding or nearly matching unit price (gap < 10%)
  const atRisk = withGap.filter(d => d.gapPct < 10);

  let insight = '';

  if (worst.gapPct < 0) {
    // At least one territory where cost exceeds price
    insight =
      `"${worst.Territory}" mencatat biaya produk ${fmtCur(worst.ProductCost)} ` +
      `melampaui harga jual ${fmtCur(worst.UnitPrice)} — margin gross negatif ${fmtPct(worst.gapPct)}. ` +
      `Sementara "${best.Territory}" mempertahankan efisiensi terbaik dengan gap ${fmtPct(best.gapPct)}, ` +
      `struktur biaya di wilayah bermasalah perlu direstrukturisasi mengikuti model tersebut.`;
  } else if (atRisk.length > 0) {
    const atRiskNames = atRisk.map(d => d.Territory).join(', ');
    insight =
      `"${best.Territory}" menjadi benchmark efisiensi dengan selisih harga-biaya ${fmtPct(best.gapPct)} ` +
      `(${fmtCur(best.gap)} per unit). ` +
      `${atRisk.length} wilayah (${atRiskNames}) memiliki gap di bawah 10% — ` +
      `rentan terhadap kerugian jika ada tekanan biaya tambahan seperti logistik atau diskon.`;
  } else {
    insight =
      `"${best.Territory}" memimpin efisiensi dengan gap harga-biaya ${fmtPct(best.gapPct)} ` +
      `(${fmtCur(best.gap)} per unit), sementara "${worst.Territory}" berada di posisi paling tipis ${fmtPct(worst.gapPct)}. ` +
      `Replikasi model operasional ${best.Territory} ke wilayah lain berpotensi meningkatkan margin gross secara merata.`;
  }

  el.textContent = insight;
}

// ── Scatter Plot Insight Generator ──────────────────────────
// Builds a data-driven narrative subtitle for the Sales vs Profit Margin scatter chart.
// Format: [Apa yang terjadi] + [Mengapa ini penting] + [Apa implikasinya]
function generateScatterInsight(productData) {
  const el = document.getElementById('scatter-insight');
  if (!el || !productData || productData.length === 0) return;

  const medianSales = d3.median(productData, d => d.Sales);

  // Products in "danger quadrant": high sales but negative margin
  const dangerProducts = productData
    .filter(d => d.Sales > medianSales && d.Margin < 0)
    .sort((a, b) => a.Margin - b.Margin); // worst margin first

  const totalProducts = productData.length;
  const fmt = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  const fmtCur = (v) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(v);

  let insight = '';

  if (dangerProducts.length > 0) {
    const worst = dangerProducts[0];
    const dangerPct = ((dangerProducts.length / totalProducts) * 100).toFixed(0);
    const totalDangerSales = d3.sum(dangerProducts, d => d.Sales);

    insight =
      `${dangerProducts.length} produk (${dangerPct}% portofolio) mencetak sales di atas median ` +
      `namun margin negatif — dipimpin "${worst.key}" dengan margin ${fmt(worst.Margin)} ` +
      `dan sales ${fmtCur(worst.Sales)}. ` +
      `Produk-produk ini mengakumulasi omzet ${fmtCur(totalDangerSales)} yang justru menggerus kas, ` +
      `bukan menambahnya. Evaluasi struktur harga atau diskon diperlukan segera.`;
  } else {
    // No danger quadrant — show best and worst margin
    const best  = productData.reduce((a, b) => a.Margin > b.Margin ? a : b);
    const worst = productData.reduce((a, b) => a.Margin < b.Margin ? a : b);
    const avgMargin = d3.mean(productData, d => d.Margin);

    insight =
      `Tidak ada produk high-sales dengan margin negatif — portofolio relatif sehat. ` +
      `"${best.key}" memimpin dengan margin ${fmt(best.Margin)}, ` +
      `sementara "${worst.key}" berada di posisi terendah ${fmt(worst.Margin)}. ` +
      `Rata-rata margin portofolio: ${fmt(avgMargin)}.`;
  }

  el.textContent = insight;
}

// ── Comparison Chart Insight Generator ──────────────────────
// Generates a narrative insight that directly answers the chart title question.
// type: 'product' | 'segment' | 'subcat'
// isSales: true = Sales mode, false = Profit mode
function generateCompInsight(elId, aggData, isSales, type) {
  const el = document.getElementById(elId);
  if (!el || !aggData || aggData.length === 0) return;

  const fmtCur = (v) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(v);
  const fmtPct = (n) => n.toFixed(1) + '%';

  const sorted     = [...aggData].sort((a, b) => b.value - a.value);
  const top        = sorted[0];
  const bottom     = sorted[sorted.length - 1];
  const total      = d3.sum(aggData, d => d.value);
  const topShare   = total > 0 ? (top.value / total) * 100 : 0;
  const negCount   = aggData.filter(d => d.value < 0).length;

  let text = '';

  if (isSales) {
    // ── Sales mode ────────────────────────────────────────
    if (type === 'product') {
      text = `"${top.key}" memimpin omzet dengan ${fmtCur(top.value)} — ` +
             `menyumbang ${fmtPct(topShare)} dari total sales. ` +
             `Konsentrasi tinggi pada satu produk meningkatkan risiko jika demand bergeser.`;
    } else if (type === 'segment') {
      text = `Segmen "${top.key}" mendominasi dengan ${fmtCur(top.value)} (${fmtPct(topShare)} total sales). ` +
             `Segmen "${bottom.key}" berkontribusi paling kecil — ` +
             `peluang ekspansi atau risiko underserved market.`;
    } else {
      text = `"${top.key}" menjadi sub-kategori dengan sales tertinggi ${fmtCur(top.value)} ` +
             `(${fmtPct(topShare)} total). ` +
             `Diversifikasi ke sub-kategori lain dapat mengurangi ketergantungan pada satu lini produk.`;
    }
  } else {
    // ── Profit mode ───────────────────────────────────────
    if (negCount > 0) {
      const worst = sorted[sorted.length - 1];
      if (type === 'product') {
        text = `"${top.key}" menjadi produk paling profitable dengan ${fmtCur(top.value)}. ` +
               `Namun "${worst.key}" mencatat defisit ${fmtCur(worst.value)} — ` +
               `produk ini justru menguras profit keseluruhan portofolio.`;
      } else if (type === 'segment') {
        text = `"${top.key}" adalah segmen paling menguntungkan (${fmtCur(top.value)}). ` +
               `"${worst.key}" merugi ${fmtCur(worst.value)} — ` +
               `evaluasi struktur harga atau biaya layanan di segmen ini diperlukan.`;
      } else {
        text = `"${top.key}" mendorong profit dengan ${fmtCur(top.value)}, ` +
               `sementara "${worst.key}" menekan margin dengan defisit ${fmtCur(worst.value)}. ` +
               `Sub-kategori merugi perlu dievaluasi atau dihentikan jika tidak strategis.`;
      }
    } else {
      if (type === 'product') {
        text = `"${top.key}" adalah produk paling profitable dengan ${fmtCur(top.value)} ` +
               `(${fmtPct(topShare)} dari total profit). ` +
               `"${bottom.key}" berkontribusi paling kecil — perlu ditinjau relevansinya.`;
      } else if (type === 'segment') {
        text = `"${top.key}" menghasilkan profit terbesar ${fmtCur(top.value)} (${fmtPct(topShare)}). ` +
               `Semua segmen positif — fokus pada replikasi strategi "${top.key}" ke segmen lain.`;
      } else {
        text = `"${top.key}" menjadi kontributor profit terbesar ${fmtCur(top.value)} (${fmtPct(topShare)}). ` +
               `"${bottom.key}" berada di posisi terendah — ` +
               `perlu analisis apakah sub-kategori ini masih layak dipertahankan.`;
      }
    }
  }

  el.textContent = text;
}

// ── Trend Chart Narrative Title + Insight Generator ──────────
// Computes a narrative title and insight from monthly trendData.
// Format insight: [apa yang terjadi] + [mengapa penting] + [implikasi]
function generateTrendInsight(trendData) {
  const titleEl   = document.getElementById('trend-title');
  const insightEl = document.getElementById('trend-insight');
  if (!titleEl || !insightEl || !trendData || trendData.length < 2) return;

  const fmtMonth = (m) => {
    const [year, mon] = m.split('-');
    const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${names[parseInt(mon, 10) - 1]} ${year}`;
  };
  const fmtCur = (v) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0
  }).format(v);
  const fmtPct = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';

  // Key data points
  const peakSales   = trendData.reduce((a, b) => a.Sales  > b.Sales  ? a : b);
  const troughSales = trendData.reduce((a, b) => a.Sales  < b.Sales  ? a : b);
  const peakProfit  = trendData.reduce((a, b) => a.Profit > b.Profit ? a : b);
  const worstProfit = trendData.reduce((a, b) => a.Profit < b.Profit ? a : b);

  // Recent trend: compare last 3 months vs previous 3 months
  const recent   = trendData.slice(-3);
  const previous = trendData.slice(-6, -3);
  const recentAvgSales   = d3.mean(recent,   d => d.Sales);
  const previousAvgSales = d3.mean(previous, d => d.Sales);
  const trendPct = previousAvgSales > 0
    ? ((recentAvgSales - previousAvgSales) / previousAvgSales) * 100
    : 0;
  const isTrendUp = trendPct >= 0;

  // Count months with negative profit
  const negMonths = trendData.filter(d => d.Profit < 0);
  const totalMonths = trendData.length;

  // ── Narrative Title ──────────────────────────────────────
  let title = '';
  if (negMonths.length > 0 && !isTrendUp) {
    title = `Sales Melemah ${fmtPct(trendPct)} — Profit Negatif di ${negMonths.length} dari ${totalMonths} Bulan`;
  } else if (negMonths.length > 0 && isTrendUp) {
    title = `Sales Membaik ${fmtPct(trendPct)} Namun Profit Masih Defisit di ${negMonths.length} Bulan`;
  } else if (!isTrendUp) {
    title = `Momentum Terhenti: Sales 3 Bulan Terakhir Turun ${fmtPct(trendPct)} dari Periode Sebelumnya`;
  } else {
    title = `Sales Tumbuh ${fmtPct(trendPct)} — Puncak Tertinggi Tercatat di ${fmtMonth(peakSales.month)}`;
  }

  // ── Insight Subtitle ─────────────────────────────────────
  let insight = '';
  if (negMonths.length > 0) {
    insight =
      `Profit menyentuh titik terendah ${fmtCur(worstProfit.Profit)} di ${fmtMonth(worstProfit.month)}, ` +
      `sementara sales puncak ${fmtCur(peakSales.Sales)} terjadi di ${fmtMonth(peakSales.month)} — ` +
      `kesenjangan ini menunjukkan tekanan biaya yang tidak sebanding dengan pertumbuhan omzet. ` +
      `Tanpa perbaikan struktur margin, pertumbuhan sales tidak akan tercermin sebagai profit nyata.`;
  } else {
    insight =
      `Sales mencapai puncak ${fmtCur(peakSales.Sales)} di ${fmtMonth(peakSales.month)}, ` +
      `dengan profit terbaik ${fmtCur(peakProfit.Profit)} di ${fmtMonth(peakProfit.month)}. ` +
      `Tren 3 bulan terakhir ${isTrendUp ? 'positif' : 'melambat'} (${fmtPct(trendPct)} vs periode sebelumnya) — ` +
      `${isTrendUp
        ? 'momentum ini perlu dijaga dengan menjaga efisiensi biaya.'
        : 'perlu diwaspadai sebelum berdampak ke profitabilitas kuartal berikutnya.'}`;
  }

  titleEl.textContent   = title;
  insightEl.textContent = insight;
}

// ── Z-Score Chart Insight Generator ─────────────────────────
// Builds a data-driven narrative subtitle for the Z-Score chart.
// Format: [Apa yang terjadi] + [Mengapa ini penting] + [Apa implikasinya]
function generateZscoreInsight(subcatData) {
  const el = document.getElementById('zscore-insight');
  if (!el || !subcatData || subcatData.length === 0) return;

  // Worst (lowest z-score) and best (highest z-score) sub-categories
  const worst = subcatData[0];
  const best  = subcatData[subcatData.length - 1];

  // Count how many sub-cats are anomalously negative (z < -1.5)
  const criticalCount = subcatData.filter(d => d.zScore < -1.5).length;

  const fmt = (n) => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  const fmtZ = (z) => (z >= 0 ? '+' : '') + z.toFixed(2) + 's';

  let insight = '';

  if (criticalCount > 0) {
    // There are anomalous losers
    insight =
      `${worst.key} mencatat margin ${fmt(worst.marginPct)} (z=${fmtZ(worst.zScore)}) — ` +
      `${criticalCount} sub-kategori berada di bawah ambang batas -1.5s, jauh dari rata-rata ${fmt(d3.mean(subcatData, d => d.marginPct))}. ` +
      `Sementara ${best.key} memimpin di ${fmt(best.marginPct)}, defisit di sub-kategori bawah berpotensi menggerus total profitabilitas portofolio.`;
  } else {
    // No critical anomalies — highlight spread
    const spread = best.marginPct - worst.marginPct;
    insight =
      `${best.key} unggul dengan margin ${fmt(best.marginPct)} (z=${fmtZ(best.zScore)}), ` +
      `sedangkan ${worst.key} berada di posisi terendah ${fmt(worst.marginPct)}. ` +
      `Selisih ${spread.toFixed(1)}% antar sub-kategori mengindikasikan ketimpangan kontribusi portofolio yang perlu diperhatikan.`;
  }

  el.textContent = insight;
}

function renderVisuals(data, anomalies) {
  const formatMonth = d3.timeFormat("%Y-%m");
  const trendMap = d3.rollup(data, 
    v => ({ Sales: d3.sum(v, d => d.Sales), Profit: d3.sum(v, d => d.Profit) }),
    d => {
      let dateObj = d.Date;
      if (!dateObj && d['OrderDate']) {
        dateObj = new Date(d['OrderDate']);
      }
      return dateObj && !isNaN(dateObj) ? formatMonth(dateObj) : null;
    }
  );
  let trendData = Array.from(trendMap, ([month, value]) => ({ month, ...value })).filter(d => d.month !== null);
  trendData.sort((a, b) => d3.ascending(a.month, b.month));
  drawDualAreaChart('chart-setup-trend', trendData);

  // Generate narrative title + insight for the trend chart
  generateTrendInsight(trendData);

  const subcatMap = d3.rollup(data,
    v => {
      const sales = d3.sum(v, d => d.Sales);
      const profit = d3.sum(v, d => d.Profit);
      return { sales, profit, marginPct: sales > 0 ? (profit / sales) * 100 : 0 };
    },
    d => d['SubCategory']
  );
  let subcatData = Array.from(subcatMap, ([key, value]) => ({ key, ...value }));
  const meanMargin = d3.mean(subcatData, d => d.marginPct);
  const sdMargin = d3.deviation(subcatData, d => d.marginPct) || 1;
  subcatData.forEach(d => { d.zScore = (d.marginPct - meanMargin) / sdMargin; });
  subcatData.sort((a, b) => a.zScore - b.zScore);
  drawDivergingBarChart('chart-subcat-zscore', subcatData);

  // Generate data-driven insight for the Z-Score chart
  generateZscoreInsight(subcatData);

  const productMap = d3.rollup(data,
    v => {
      const sales = d3.sum(v, d => d.Sales);
      const profit = d3.sum(v, d => d.Profit);
      return { Sales: sales, Profit: profit, Margin: sales > 0 ? (profit / sales) * 100 : 0 };
    },
    d => d['ProductName']
  );
  let productData = Array.from(productMap, ([key, value]) => ({ key, ...value }));
  drawProductScatterPlot('chart-product-scatter', productData);

  // Generate data-driven insight for the Scatter plot chart
  generateScatterInsight(productData);

  const territoryMap = d3.rollup(data,
    v => ({ UnitPrice: d3.mean(v, d => d.UnitPrice), ProductCost: d3.mean(v, d => d.ProductCost) }),
    d => d['Territory']
  );
  let territoryData = Array.from(territoryMap, ([Territory, value]) => ({ Territory, ...value }));
  territoryData.sort((a, b) => b.UnitPrice - a.UnitPrice);
  drawGroupedBarChart('chart-region-cost', territoryData);

  // Generate data-driven insight for the Region Cost chart
  generateRegionInsight(territoryData);
}

// --- Filter State ---
let globalRawData = [];
let activeFilters = {
  Category: [],
  SubCategory: [],
  Segment: [],
  Territory: [],
  dateStart: null,
  dateEnd: null
};

function getFilteredData() {
  return globalRawData.filter(d => {
    if (activeFilters.Category.length && !activeFilters.Category.includes(d.Category)) return false;
    if (activeFilters.SubCategory.length && !activeFilters.SubCategory.includes(d.SubCategory)) return false;
    if (activeFilters.Segment.length && !activeFilters.Segment.includes(d.Segment)) return false;
    if (activeFilters.Territory.length && !activeFilters.Territory.includes(d.Territory)) return false;
    if (activeFilters.dateStart || activeFilters.dateEnd) {
      const date = d.Date;
      if (!date || isNaN(date)) return false;
      if (activeFilters.dateStart && date < activeFilters.dateStart) return false;
      if (activeFilters.dateEnd && date > activeFilters.dateEnd) return false;
    }
    return true;
  });
}

function getActiveFilterCount() {
  let count = 0;
  if (activeFilters.Category.length) count++;
  if (activeFilters.SubCategory.length) count++;
  if (activeFilters.Segment.length) count++;
  if (activeFilters.Territory.length) count++;
  if (activeFilters.dateStart || activeFilters.dateEnd) count++;
  return count;
}

function updateFilterButton() {
  const btn = document.getElementById('btn-filter');
  const count = getActiveFilterCount();
  let badge = btn.querySelector('.filter-active-count');
  if (count > 0) {
    btn.classList.add('has-filter');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'filter-active-count';
      btn.appendChild(badge);
    }
    badge.textContent = count;
  } else {
    btn.classList.remove('has-filter');
    if (badge) badge.remove();
  }
}

function populateFilterOptions() {
  const categories = [...new Set(globalRawData.map(d => d.Category).filter(Boolean))].sort();
  const subcategories = [...new Set(globalRawData.map(d => d.SubCategory).filter(Boolean))].sort();
  const segments = [...new Set(globalRawData.map(d => d.Segment).filter(Boolean))].sort();
  const territories = [...new Set(globalRawData.map(d => d.Territory).filter(Boolean))].sort();

  renderChips('filter-category', categories, 'Category');
  renderChips('filter-subcategory', subcategories, 'SubCategory');
  renderChips('filter-segment', segments, 'Segment');
  renderChips('filter-territory', territories, 'Territory');

  const dates = globalRawData.map(d => d.Date).filter(d => d && !isNaN(d));
  if (dates.length) {
    const minDate = d3.min(dates);
    const maxDate = d3.max(dates);
    const startInput = document.getElementById('filter-date-start');
    const endInput = document.getElementById('filter-date-end');
    const formatMonth = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    startInput.min = formatMonth(minDate);
    startInput.max = formatMonth(maxDate);
    endInput.min = formatMonth(minDate);
    endInput.max = formatMonth(maxDate);
  }
}

function renderChips(containerId, values, filterKey) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  values.forEach(val => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip';
    chip.textContent = val;
    if (activeFilters[filterKey].includes(val)) {
      chip.classList.add('selected');
    }
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) {
        activeFilters[filterKey].push(val);
      } else {
        activeFilters[filterKey] = activeFilters[filterKey].filter(v => v !== val);
      }
    });
    container.appendChild(chip);
  });
}

function applyFilters() {
  const startVal = document.getElementById('filter-date-start').value;
  const endVal = document.getElementById('filter-date-end').value;
  activeFilters.dateStart = startVal ? new Date(startVal + '-01') : null;
  activeFilters.dateEnd = endVal ? new Date(endVal + '-28') : null;

  const filtered = getFilteredData();
  refreshDashboard(filtered);
  updateFilterButton();
  closeFilterPanel();
}

function resetFilters() {
  activeFilters = { Category: [], SubCategory: [], Segment: [], Territory: [], dateStart: null, dateEnd: null };
  document.getElementById('filter-date-start').value = '';
  document.getElementById('filter-date-end').value = '';
  populateFilterOptions();
  refreshDashboard(globalRawData);
  updateFilterButton();
  closeFilterPanel();
}

function refreshDashboard(data) {
  const summary = computeSummary(data);
  const anomalies = detectAllAnomalies(data);
  renderKPIs(summary);
  renderAlerts(anomalies);
  renderVisuals(data, anomalies);
  const isSalesActive = document.getElementById('btn-toggle-sales')?.classList.contains('active');
  renderConflictComparisons(data, isSalesActive ? 'Sales' : 'Profit');
}

function openFilterPanel() {
  document.getElementById('filter-panel').classList.add('active');
  document.getElementById('filter-overlay').classList.add('active');
}

function closeFilterPanel() {
  document.getElementById('filter-panel').classList.remove('active');
  document.getElementById('filter-overlay').classList.remove('active');
}

function initFilterPanel() {
  document.getElementById('btn-filter').addEventListener('click', openFilterPanel);
  document.getElementById('btn-filter-close').addEventListener('click', closeFilterPanel);
  document.getElementById('filter-overlay').addEventListener('click', closeFilterPanel);
  document.getElementById('btn-filter-apply').addEventListener('click', applyFilters);
  document.getElementById('btn-filter-reset').addEventListener('click', resetFilters);
  populateFilterOptions();
}

async function init() {
  try {
    let rawData = [];
    try {
      rawData = await d3.csv('Sales_BY_Category.csv', (d) => {
        return {
          ...d,
          Sales: parseNum(d.Sales),
          Profit: parseNum(d.Profit),
          Qty: parseNum(d.Qty),
          OrderID: d.SalesOrderID,
          Date: parseDate(d['OrderDate'])
        };
      });
    } catch (err) {
      console.warn("Could not load Sales_BY_Category.csv, using fallback mock data.");
      rawData = [
        { 'OrderDate': '2023-01-01', 'Category': 'Furniture', 'SubCategory': 'Tables', 'Territory': 'East', 'Sales': 100000, 'Profit': -45000 },
        { 'OrderDate': '2023-02-01', 'Category': 'Technology', 'SubCategory': 'Phones', 'Territory': 'West', 'Sales': 500000, 'Profit': 100000 },
        { 'OrderDate': '2023-03-01', 'Category': 'Office Supplies', 'SubCategory': 'Binders', 'Territory': 'South', 'Sales': 150000, 'Profit': 45000 }
      ];
    }

    globalRawData = rawData;

    // Phase 1 (Sync)
    const summary = computeSummary(rawData);
    const anomalies = detectAllAnomalies(rawData);

    // Phase 2 (Sync Visuals)
    renderKPIs(summary);
    renderAlerts(anomalies);
    renderVisuals(rawData, anomalies);

    // Initialize Filter Panel
    initFilterPanel();

    // Render 3-grid charts
    const btnSales = document.getElementById('btn-toggle-sales');
    const btnProfit = document.getElementById('btn-toggle-profit');
    if (btnSales && btnProfit) {
      btnSales.addEventListener('click', () => {
        btnSales.classList.add('active');
        btnProfit.classList.remove('active');
        const data = getActiveFilterCount() > 0 ? getFilteredData() : globalRawData;
        renderConflictComparisons(data, 'Sales');
      });
      btnProfit.addEventListener('click', () => {
        btnProfit.classList.add('active');
        btnSales.classList.remove('active');
        const data = getActiveFilterCount() > 0 ? getFilteredData() : globalRawData;
        renderConflictComparisons(data, 'Profit');
      });
      renderConflictComparisons(rawData, 'Sales');
    }

    // Phase 3 (Async AI) — SINGLE unified call instead of 4 separate ones
    getUnifiedAIResponse(summary, anomalies).then((ai) => {
      document.getElementById('narrative-title').innerText = ai.title.replace(/['"]/g, '');
      document.getElementById('setup-text').innerText = ai.story.setup;
      document.getElementById('conflict-text').innerText = ai.story.conflict;
      document.getElementById('resolution-text').innerText = ai.story.resolution;
      document.getElementById('insight-output').innerHTML = ai.insight.replace(/\n/g, '<br>');
      const narrativeEl = document.getElementById('anomalies-narrative');
      if (narrativeEl) narrativeEl.innerHTML = ai.anomalyNarrative.replace(/\n/g, '<br>');
    }).catch((err) => {
      console.error('Unified AI call failed:', err);
    });

    // Custom Insight Question Handling
    const btnSubmit = document.getElementById('btn-submit-question');
    const inputQuestion = document.getElementById('custom-question');
    const insightOutput = document.getElementById('insight-output');

    btnSubmit.addEventListener('click', async () => {
      const q = inputQuestion.value.trim();
      if (!q) return;
      insightOutput.innerHTML = "Memproses...";
      try {
        const answer = await getInsight(summary, q);
        insightOutput.innerHTML = answer.replace(/\n/g, '<br>');
        inputQuestion.value = '';
      } catch (e) {
        insightOutput.innerHTML = "Gagal memuat jawaban AI.";
      }
    });

    // Tab Switching Logic
    const tabData = document.getElementById('tab-data');
    const tabNarasi = document.getElementById('tab-narasi');
    const contentData = document.getElementById('content-data');
    const contentNarasi = document.getElementById('content-narasi');
    const btnNarasi = document.getElementById('btn-narasi-ai');

    function switchTab(isData) {
      if (isData) {
        tabData.classList.add('active');
        tabNarasi.classList.remove('active');
        contentData.style.display = 'block';
        contentNarasi.style.display = 'none';
      } else {
        tabNarasi.classList.add('active');
        tabData.classList.remove('active');
        contentNarasi.style.display = 'block';
        contentData.style.display = 'none';
      }
    }

    if(tabData) tabData.addEventListener('click', () => switchTab(true));
    if(tabNarasi) tabNarasi.addEventListener('click', () => switchTab(false));
    if(btnNarasi) btnNarasi.addEventListener('click', () => switchTab(false));

    // Handle window resize for D3 charts
    window.addEventListener('resize', () => {
      const data = getActiveFilterCount() > 0 ? getFilteredData() : globalRawData;
      const anomalies = detectAllAnomalies(data);
      renderVisuals(data, anomalies);
      const isSalesActive = document.getElementById('btn-toggle-sales')?.classList.contains('active');
      renderConflictComparisons(data, isSalesActive ? 'Sales' : 'Profit');
    });

  } catch (error) {
    console.error("Dashboard Initialization Error:", error);
  }
}

// Start application
window.addEventListener('DOMContentLoaded', init);
