import {
  BarElement,
  BarController,
  BubbleController,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  ScatterController,
  Title,
  Tooltip,
} from "chart.js";

let registered = false;

export function registerSpacebogamChartBasics(): void {
  if (registered) return;

  Chart.register(
    BarController,
    BubbleController,
    CategoryScale,
    LineController,
    LinearScale,
    ScatterController,
    BarElement,
    LineElement,
    PointElement,
    Title,
    Tooltip,
    Legend,
  );
  registered = true;
}
