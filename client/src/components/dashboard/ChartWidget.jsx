import React from 'react';
import ReactApexChart from 'react-apexcharts';

const baseTheme = {
  chart: {
    background: 'transparent',
    foreColor: '#9a9080',
    toolbar: { show: false },
    animations: { enabled: true, easing: 'easeinout', speed: 700 }
  },
  grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 4 },
  tooltip: { theme: 'dark', style: { fontSize: '12px', fontFamily: 'Inter' } },
  colors: ['#c9a84c', '#5b8dee', '#4caf7d', '#e05c5c', '#d4a843', '#8b5cf6', '#06b6d4'],
  xaxis: { labels: { style: { colors: '#9a9080' } } },
  yaxis: { labels: { style: { colors: '#9a9080' } } },
  legend: { labels: { colors: '#9a9080' }, position: 'bottom' }
};

export default function ChartWidget({ widget, data }) {
  const { dataset } = widget;
  
  let series = [];
  let options = JSON.parse(JSON.stringify(baseTheme)); // Deep copy to prevent mutation issues
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
    if (isEmpty) {
      return (
        <div className="w-full h-full flex items-center justify-center text-gray-600 text-sm italic">
          No data for this period
        </div>
      );
    }

    return (
      <div className="w-full h-full px-2 pb-2 pt-1" style={{ minHeight: '150px' }}>
        <ReactApexChart options={options} series={series} type={type} height="100%" width="100%" />
      </div>
    );
  }
  // ── End CSV branch ──────────────────────────────────────────────────────

  if (dataset === 'revenueByDate') {
    type = 'area';
    options.xaxis.categories = data.revenueByDate.labels || [];
    options.stroke = { curve: 'smooth', width: 2 };
    options.fill = { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } };
    options.dataLabels = { enabled: false };
    series = [{ name: 'Revenue', data: data.revenueByDate.values || [] }];
  } 
  else if (dataset === 'salesByProduct') {
    type = 'bar';
    options.plotOptions = { bar: { horizontal: true, borderRadius: 4, distributed: true } };
    options.xaxis.categories = data.revenueByProduct?.labels || [];
    options.dataLabels = { enabled: false };
    options.legend.show = false;
    series = [{ name: 'Quantity Sold', data: data.revenueByProduct?.values || [] }];
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
    options.xaxis.categories = data.ordersByDate.labels || [];
    options.plotOptions = { bar: { borderRadius: 4 } };
    options.dataLabels = { enabled: false };
    series = [{ name: 'Orders', data: data.ordersByDate.values || [] }];
  }
  else if (dataset === 'revenueVsCostVsProfit') {
    type = 'bar';
    options.xaxis.categories = data.profitByProduct.labels || [];
    options.plotOptions = { bar: { borderRadius: 2, columnWidth: '60%' } };
    options.dataLabels = { enabled: false };
    // Custom colors for this specific chart
    options.colors = ['#c9a84c', '#e05c5c', '#4caf7d'];
    series = [
      { name: 'Revenue', data: data.profitByProduct.revenue || [] },
      { name: 'Cost', data: data.profitByProduct.cost || [] },
      { name: 'Profit', data: data.profitByProduct.profit || [] }
    ];
  }
  else if (dataset === 'topProductPerformance') {
    type = 'radialBar';
    options.labels = data.topProducts.labels || [];
    options.plotOptions = { radialBar: { dataLabels: { name: { fontSize: '14px', color: '#fff' }, value: { fontSize: '16px', color: '#9a9080' }, total: { show: true, label: 'Top Product', color: '#c9a84c' } } } };
    series = data.topProducts.percentages || [];
  }
  else if (dataset === 'revenueVsQuantity') {
    type = 'scatter';
    options.xaxis = { ...options.xaxis, type: 'numeric', title: { text: 'Quantity Sold', style: { color: '#9a9080' } } };
    options.yaxis = { ...options.yaxis, title: { text: 'Revenue', style: { color: '#9a9080' } } };
    // Data needs to be [x, y]
    series = data.scatterPlot.series || [];
  }
  else if (dataset === 'weeklyHeatmap') {
    type = 'heatmap';
    options.plotOptions = { heatmap: { shadeIntensity: 0.5, radius: 4, useFillColorAsStroke: false, colorScale: { ranges: [{ from: 0, to: 0, color: '#1a1a1a' }, { from: 1, to: 100000, color: '#c9a84c' }] } } };
    options.dataLabels = { enabled: false };
    series = data.weeklyHeatmap.series || [];
  }
  else if (dataset === 'profitMarginTrend') {
    type = 'line';
    options.xaxis.categories = data.profitTrend.labels || [];
    options.stroke = { width: [3, 3], dashArray: [0, 5], curve: 'smooth' };
    options.colors = ['#4caf7d', '#c9a84c'];
    options.yaxis = [
      { title: { text: 'Profit', style: { color: '#4caf7d' } }, labels: { style: { colors: '#4caf7d' } } },
      { opposite: true, title: { text: 'Margin %', style: { color: '#c9a84c' } }, labels: { style: { colors: '#c9a84c' } } }
    ];
    options.dataLabels = { enabled: false };
    series = [
      { name: 'Profit', type: 'line', data: data.profitTrend.profit || [] },
      { name: 'Margin %', type: 'line', data: data.profitTrend.margin || [] }
    ];
  }

  // Handle empty state gracefully by providing dummy zero data
  const isEmpty = !series || series.length === 0 || 
    (Array.isArray(series[0]?.data) && series[0].data.length === 0) || 
    (type === 'donut' && series.length === 0) ||
    (type === 'radialBar' && series.length === 0);

  if (isEmpty) {
    if (type === 'donut' || type === 'radialBar') {
      series = [0];
      options.labels = ['No Data'];
    } else if (type === 'scatter') {
      series = [{ name: 'No Data', data: [[0, 0]] }];
    } else if (type === 'heatmap') {
      series = [{ name: 'No Data', data: [{ x: 'None', y: 0 }] }];
    } else if (dataset === 'revenueVsCostVsProfit') {
      options.xaxis.categories = ['No Data'];
      series = [
        { name: 'Revenue', data: [0] },
        { name: 'Cost', data: [0] },
        { name: 'Profit', data: [0] }
      ];
    } else if (dataset === 'profitMarginTrend') {
      options.xaxis.categories = ['No Data'];
      series = [
        { name: 'Profit', type: 'line', data: [0] },
        { name: 'Margin %', type: 'line', data: [0] }
      ];
    } else {
      options.xaxis.categories = ['No Data'];
      series = [{ name: 'No Data', data: [0] }];
    }
  }

  return (
    <div className="w-full h-full px-2 pb-2 pt-1" style={{ minHeight: '150px' }}>
      <ReactApexChart 
        options={options} 
        series={series} 
        type={type} 
        height="100%" 
        width="100%" 
      />
    </div>
  );
}
