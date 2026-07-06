import { useRef, useEffect } from "react";
import {
  Chart,
  CategoryScale,
  LinearScale,
  LineController,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  type ChartConfiguration,
  type Plugin,
} from "chart.js";

Chart.register(CategoryScale, LinearScale, LineController, PointElement, LineElement, Filler, Tooltip);

interface MtdSpendChartProps {
  dailyAmounts: number[];
  weekBoundaryPositions: number[];
  year: number;
  month: number;
}

export function MtdSpendChart({ dailyAmounts, weekBoundaryPositions, year, month }: MtdSpendChartProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Read forecast colours from CSS design tokens via :root (reliable inheritance path)
    const cssVars = getComputedStyle(document.documentElement);
    const forecastBorderColor =
      cssVars.getPropertyValue("--color-chart-forecast-border").trim() || "rgba(107,114,128,0.7)";
    const forecastHatchColor =
      cssVars.getPropertyValue("--color-chart-forecast-hatch").trim() || "rgba(107,114,128,0.3)";

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 100);
    gradient.addColorStop(0, "rgba(79,70,229,0.35)");
    gradient.addColorStop(1, "rgba(79,70,229,0.00)");

    const totalDays = dailyAmounts.length;
    const labels = Array.from({ length: totalDays }, (_, i) => String(i + 1));

    // 0-based index of the last day with actual data (today), or -1 if none
    let todayIndex = -1;
    for (let i = totalDays - 1; i >= 0; i--) {
      if (!isNaN(dailyAmounts[i])) { todayIndex = i; break; }
    }

    let running = 0;
    const cumulativeActual = dailyAmounts.map((v) => isNaN(v) ? null : (running += v));

    const cumulativeToday = todayIndex >= 0 ? (cumulativeActual[todayIndex] as number) : 0;

    // Forecast zone: remaining days after today exist
    const hasForecast = todayIndex >= 0 && todayIndex < totalDays - 1;

    const weekBoundaryPlugin: Plugin = {
      id: "weekBoundaryPlugin",
      afterDraw(chart) {
        const { ctx: c, chartArea, scales } = chart;
        if (!chartArea) return;
        c.save();
        c.strokeStyle = "rgba(0,0,0,0.12)";
        c.lineWidth = 1;
        for (const pos of weekBoundaryPositions) {
          const x = scales["x"].getPixelForValue(pos - 0.5);
          c.beginPath();
          c.moveTo(x, chartArea.top);
          c.lineTo(x, chartArea.bottom);
          c.stroke();
        }
        c.restore();
      },
    };

    // Forecast plugin: draws directly on the canvas so it never affects the y-scale.
    // Renders a hatched overlay + dashed reference line over the future zone.
    const forecastPlugin: Plugin = {
      id: "forecastPlugin",
      afterDatasetsDraw(chart) {
        if (!hasForecast) return;
        const { ctx: c, chartArea, scales } = chart;
        if (!chartArea) return;

        // Start exactly at today's data point — no gap between the actual line and forecast zone
        const xStart = scales["x"].getPixelForValue(todayIndex);
        const zoneWidth = chartArea.right - xStart;
        const zoneHeight = chartArea.bottom - chartArea.top;

        // Reference y for today's cumulative total
        const yLine = scales["y"].getPixelForValue(cumulativeToday);

        // 1. Hatch/fill clipped to the area BELOW the reference line only
        c.save();
        c.beginPath();
        c.rect(xStart, yLine, zoneWidth, chartArea.bottom - yLine);
        c.clip();

        // Subtle gray wash
        c.fillStyle = "rgba(0,0,0,0.04)";
        c.fillRect(xStart, yLine, zoneWidth, chartArea.bottom - yLine);

        // Diagonal hatching
        c.strokeStyle = forecastHatchColor;
        c.lineWidth = 1;
        c.setLineDash([]);
        for (let d = -zoneHeight; d < zoneWidth + zoneHeight; d += 8) {
          c.beginPath();
          c.moveTo(xStart + d, chartArea.top);
          c.lineTo(xStart + d + zoneHeight, chartArea.bottom);
          c.stroke();
        }
        c.restore();

        // 2. Dashed reference line at today's cumulative total (no clip)
        c.save();
        c.setLineDash([5, 4]);
        c.strokeStyle = forecastBorderColor;
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(xStart, yLine);
        c.lineTo(chartArea.right, yLine);
        c.stroke();
        c.restore();
      },
    };

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: cumulativeActual,
            fill: true,
            backgroundColor: gradient,
            borderColor: "rgba(79,70,229,0.9)",
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.3,
            spanGaps: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                const idx = items[0].dataIndex;
                return new Date(year, month - 1, idx + 1)
                  .toLocaleDateString(undefined, { month: "short", day: "numeric" });
              },
              label: (item) => {
                const idx = item.dataIndex;
                const daily = dailyAmounts[idx];
                return [
                  `Daily:  $${daily.toFixed(2)}`,
                  `Total:  $${(item.raw as number).toFixed(2)}`,
                ];
              },
            },
          },
        },
        interaction: {
          mode: "index" as const,
          intersect: false,
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 6,
              font: { size: 12 },
              color: "var(--color-text-placeholder)",
              maxRotation: 0,
            },
            border: { display: false },
          },
          y: {
            display: false,
            beginAtZero: true,
          },
        },
      },
      plugins: [weekBoundaryPlugin, forecastPlugin],
    };

    if (chartRef.current) {
      chartRef.current.destroy();
    }
    // Guard against Strict Mode double-invoke: if the canvas still has a live
    // Chart instance (e.g. from a crashed previous run), destroy it first.
    Chart.getChart(canvas)?.destroy();
    chartRef.current = new Chart(canvas, config);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [dailyAmounts, weekBoundaryPositions, year, month]);

  return (
    <div className="home-chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
