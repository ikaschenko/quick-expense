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
}

export function MtdSpendChart({ dailyAmounts, weekBoundaryPositions }: MtdSpendChartProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 100);
    gradient.addColorStop(0, "rgba(79,70,229,0.35)");
    gradient.addColorStop(1, "rgba(79,70,229,0.00)");

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

    const labels = dailyAmounts.map((_, i) => String(i + 1));

    let running = 0;
    const cumulativeAmounts = dailyAmounts.map((v) => (isNaN(v) ? NaN : (running += v)));

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            data: cumulativeAmounts,
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
                return `Day ${idx + 1}`;
              },
              label: (item) => `$${(item.raw as number).toFixed(2)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              maxTicksLimit: 6,
              font: { size: 10 },
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
      plugins: [weekBoundaryPlugin],
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
  }, [dailyAmounts, weekBoundaryPositions]);

  return (
    <div className="home-chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
