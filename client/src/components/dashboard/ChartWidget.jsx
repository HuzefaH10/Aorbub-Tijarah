import React, { useRef, useState, useEffect, useCallback } from 'react';
import ReactApexChart from 'react-apexcharts';

const PRIMARY_COLOR  = '#c9a84c'; // brand gold
const COMPARE_COLOR  = '#5b8dee'; // muted blue for comparison

const baseTheme = {
  chart: {
    background: 'transparent',
    foreColor: '#9a9080',
    toolbar: { show: false },
    animations: { enabled: true, easing: 'easeinout', speed: 700 }
  },
  grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
  tooltip: { theme: 'dark', style: { fontSize: '12px', fontFamily: 'Inter' } },
  colors: [PRIMARY_COLOR, '#5b8dee', '#4caf7d', '#e05c5c', '#d4a843', '#8b5cf6', '#06b6d4'],
  xaxis: { labels: { style: { colors: '#9a9080' } } },
  yaxis: { labels: { style: { colors: '#9a9080' } } },
  legend: { labels: { colors: '#9a9080' }, position: 'bottom' }
};

// ── Wrapper that measures its container and renders ApexCharts with pixel dimensions ──
function SizedApexChart({ options, series, type }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setSize(prev => {
        if (prev.w !== clientWidth || prev.h !== clientHeight) {
          return { w: clientWidth, h: clientHeight };
        }
        return prev;
      });
    }
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div ref={containerRef} className="w-full h-full">
      {size.w > 10 && size.h > 10 && (
        <ReactApexChart
          options={options}
          series={series}
          type={type}
          width={size.w}
          height={size.h}
        />
      )}
    </div>
  );
}

export default function ChartWidget({ widget, data, compareData, primaryLabel, compareLabel }) {
  const { dataset } = widget;
  const hasCompare = !!compareData;
  
  let series = [];
  let options = JSON.parse(JSON.stringify(baseTheme));
  let type = 'bar';

  // ── CSV widget: use embedded data directly ──────────────────────────────
  if (widget.isCSV && widget.csvData) {
    const { labels, values } = widget.csvData;
    const csvType = widget.type === 'donut' ? 'donut' : widget.type === 'area' ? 'area' : 'bar';
    type = csvType;

    if (csvType === 'donut') {
      options.labels = labels || [];
      options.stroke = { show: false };
      options.plotOptions = { pie: { donut: { labels: { show: true, total: { show: true, color: '#fff' }, value: { color: '#fff' } } } } };
      series = values || [];
    } else if (csvType === 'area') {
      options.xaxis.categories = labels || [];
      options.stroke = { curve: 'smooth', width: 2 };
      options.fill = { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } };
      options.dataLabels = { enabled: false };
      series = [{ name: 'Value', data: values || [] }];
    } else {
      options.xaxis.categories = labels || [];
      options.plotOptions = { bar: { borderRadius: 4, distributed: labels?.length <= 12 } };
      options.dataLabels = { enabled: false };
      options.legend.show = false;
      series = [{ name: 'Value', data: values || [] }];
    }

    const isEmpty = !values || values.length === 0;
    if (isEmpty) return <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm italic">No data for this period</div>;
    return (
      <div className="w-full h-full px-2 pb-2 pt-1">
        <SizedApexChart options={options} series={series} type={type} />
      </div>
    );
  }
  // ── End CSV branch ──────────────────────────────────────────────────────

  if (dataset === 'revenueByDate') {
    type = 'area';
    const primaryLabels = data.revenueByDate?.labels || [];
    const compareLabels = hasCompare ? (compareData.revenueByDate?.labels || []) : [];
    const allLabels = hasCompare
      ? [...new Set([...primaryLabels, ...compareLabels])].sort()
      : primaryLabels;

    const toValueMap = (labels, values) => {
      const m = {};
      labels.forEach((l, i) => { m[l] = values[i]; });
      return m;
    };

    options.xaxis.categories = allLabels;
    options.stroke = { curve: 'smooth', width: hasCompare ? [2, 2] : 2 };
    options.fill = hasCompare
      ? { type: 'solid', opacity: [0.12, 0.06] }
      : { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } };
    options.dataLabels = { enabled: false };
    options.colors = hasCompare ? [PRIMARY_COLOR, COMPARE_COLOR] : [PRIMARY_COLOR];
    options.legend = { ...options.legend, show: hasCompare, labels: { colors: '#9a9080' } };

    const primaryMap = toValueMap(primaryLabels, data.revenueByDate?.values || []);
    series = [{ name: primaryLabel || 'Primary', data: allLabels.map(l => primaryMap[l] || 0) }];
    if (hasCompare) {
      const compareMap = toValueMap(compareLabels, compareData.revenueByDate?.values || []);
      series.push({ name: compareLabel || 'Compare', data: allLabels.map(l => compareMap[l] || 0) });
    }
  }
  else if (dataset === 'salesByProduct') {
    type = 'bar';
    const primaryLabels = data.revenueByProduct?.labels || [];
    const primaryValues = data.revenueByProduct?.values || [];

    if (hasCompare) {
      options.plotOptions = { bar: { horizontal: true, borderRadius: 4, distributed: false, barHeight: '60%' } };
      options.xaxis.categories = primaryLabels;
      options.dataLabels = { enabled: false };
      options.legend = { ...options.legend, show: true };
      options.colors = [PRIMARY_COLOR, COMPARE_COLOR];

      const compareMap = {};
      (compareData.revenueByProduct?.labels || []).forEach((l, i) => { compareMap[l] = compareData.revenueByProduct?.values?.[i] || 0; });
      series = [
        { name: primaryLabel || 'Primary', data: primaryValues },
        { name: compareLabel || 'Compare', data: primaryLabels.map(l => compareMap[l] || 0) }
      ];
    } else {
      options.plotOptions = { bar: { horizontal: true, borderRadius: 4, distributed: true } };
      options.xaxis.categories = primaryLabels;
      options.dataLabels = { enabled: false };
      options.legend.show = false;
      series = [{ name: 'Quantity Sold', data: primaryValues }];
    }
  }
  else if (dataset === 'categorySplit') {
    type = 'donut';
    options.labels = data.categorySplit?.labels || [];
    options.plotOptions = { pie: { donut: { labels: { show: true, total: { show: true, label: 'Total', color: '#fff' }, value: { color: '#fff' } } } } };
    options.stroke = { show: false };
    series = data.categorySplit?.values || [];
  }
  else if (dataset === 'dailyOrderVolume') {
    type = 'bar';
    options.xaxis.categories = data.ordersByDate?.labels || [];
    options.plotOptions = { bar: { borderRadius: 4 } };
    options.dataLabels = { enabled: false };
    series = [{ name: 'Orders', data: data.ordersByDate?.values || [] }];
  }
  else if (dataset === 'revenueVsCostVsProfit') {
    type = 'bar';
    options.xaxis.categories = data.profitByProduct?.labels || [];
    options.plotOptions = { bar: { borderRadius: 2, columnWidth: '60%' } };
    options.dataLabels = { enabled: false };
    options.colors = ['#c9a84c', '#e05c5c', '#4caf7d'];
    series = [
      { name: 'Revenue', data: data.profitByProduct?.revenue || [] },
      { name: 'Cost',    data: data.profitByProduct?.cost    || [] },
      { name: 'Profit',  data: data.profitByProduct?.profit  || [] }
    ];
  }
  else if (dataset === 'topProductPerformance') {
    type = 'radialBar';
    options.labels = data.topProducts?.labels || [];
    options.plotOptions = { radialBar: { dataLabels: { name: { fontSize: '14px', color: '#fff' }, value: { fontSize: '16px', color: '#9a9080' }, total: { show: true, label: 'Top Product', color: '#c9a84c' } } } };
    series = data.topProducts?.percentages || [];
  }
  else if (dataset === 'revenueVsQuantity') {
    type = 'scatter';
    options.xaxis = { ...options.xaxis, type: 'numeric', title: { text: 'Quantity Sold', style: { color: '#9a9080' } } };
    options.yaxis = { ...options.yaxis, title: { text: 'Revenue', style: { color: '#9a9080' } } };
    series = data.scatterPlot?.series || [];
  }
  else if (dataset === 'weeklyHeatmap') {
    type = 'heatmap';
    options.plotOptions = { heatmap: { shadeIntensity: 0.5, radius: 4, useFillColorAsStroke: false, colorScale: { ranges: [{ from: 0, to: 0, color: '#1a1a1a' }, { from: 1, to: 100000, color: '#c9a84c' }] } } };
    options.dataLabels = { enabled: false };
    series = data.weeklyHeatmap?.series || [];
  }
  else if (dataset === 'profitMarginTrend') {
    type = 'line';
    options.xaxis.categories = data.profitTrend?.labels || [];
    options.stroke = { width: [3, 3], dashArray: [0, 5], curve: 'smooth' };
    options.colors = ['#4caf7d', '#c9a84c'];
    options.yaxis = [
      { title: { text: 'Profit', style: { color: '#4caf7d' } }, labels: { style: { colors: '#4caf7d' } } },
      { opposite: true, title: { text: 'Margin %', style: { color: '#c9a84c' } }, labels: { style: { colors: '#c9a84c' } } }
    ];
    options.dataLabels = { enabled: false };
    series = [
      { name: 'Profit',   type: 'line', data: data.profitTrend?.profit  || [] },
      { name: 'Margin %', type: 'line', data: data.profitTrend?.margin  || [] }
    ];
  }
  else {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-gray-700 text-sm gap-1.5">
        <span className="text-2xl">📊</span>
        <p className="font-semibold text-gray-500">No data available</p>
        <p className="text-xs text-gray-700">This widget's data source is unavailable</p>
      </div>
    );
  }

  // Handle empty state gracefully
  const isEmpty = !series || series.length === 0 ||
    (Array.isArray(series[0]?.data) && series[0].data.length === 0) ||
    (type === 'donut'     && series.length === 0) ||
    (type === 'radialBar' && series.length === 0);

  if (isEmpty) {
    if (type === 'donut' || type === 'radialBar') {
      series = [0]; options.labels = ['No Data'];
    } else if (type === 'scatter') {
      series = [{ name: 'No Data', data: [[0, 0]] }];
    } else if (type === 'heatmap') {
      series = [{ name: 'No Data', data: [{ x: 'None', y: 0 }] }];
    } else if (dataset === 'revenueVsCostVsProfit') {
      options.xaxis.categories = ['No Data'];
      series = [{ name: 'Revenue', data: [0] }, { name: 'Cost', data: [0] }, { name: 'Profit', data: [0] }];
    } else if (dataset === 'profitMarginTrend') {
      options.xaxis.categories = ['No Data'];
      series = [{ name: 'Profit', type: 'line', data: [0] }, { name: 'Margin %', type: 'line', data: [0] }];
    } else {
      options.xaxis.categories = ['No Data'];
      series = [{ name: 'No Data', data: [0] }];
    }
  }

  return (
    <div className="w-full h-full px-2 pb-2 pt-1">
      <SizedApexChart options={options} series={series} type={type} />
    </div>
  );
}
