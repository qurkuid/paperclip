export interface SpacebogamChartTheme {
  axis: string;
  border: string;
  danger: string;
  grid: string;
  muted: string;
  series: string[];
  success: string;
  text: string;
  warning: string;
}

function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

export function resolveSpacebogamChartTheme(root: Element | null = document.documentElement): SpacebogamChartTheme {
  const styles = getComputedStyle(root ?? document.documentElement);
  const text = readToken(styles, "--funnel-ink", readToken(styles, "--foreground", "currentColor"));
  const muted = readToken(styles, "--funnel-muted", readToken(styles, "--muted-foreground", text));
  const border = readToken(styles, "--funnel-line", readToken(styles, "--border", muted));

  return {
    axis: muted,
    border,
    danger: readToken(styles, "--funnel-critical", readToken(styles, "--status-task-blocked", text)),
    grid: readToken(styles, "--funnel-grid-line", border),
    muted,
    series: [
      readToken(styles, "--funnel-chart-1", readToken(styles, "--chart-1", text)),
      readToken(styles, "--funnel-chart-2", readToken(styles, "--chart-2", text)),
      readToken(styles, "--funnel-chart-3", readToken(styles, "--chart-3", text)),
      readToken(styles, "--funnel-chart-4", readToken(styles, "--chart-4", text)),
      readToken(styles, "--funnel-chart-5", readToken(styles, "--chart-5", text)),
    ],
    success: readToken(styles, "--funnel-positive", readToken(styles, "--status-task-done", text)),
    text,
    warning: readToken(styles, "--funnel-warning", readToken(styles, "--status-task-todo", text)),
  };
}
