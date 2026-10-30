export function vehicleMarkerLabel(lineNumber: string | number): string {
  const label = String(lineNumber);
  return label.length > 4 ? `${label.slice(0, 3).trimEnd()}.` : label;
}

export function vehicleMarkerWidth(lineNumber: string | number): number {
  return 36 + Math.max(0, vehicleMarkerLabel(lineNumber).length - 1) * 7;
}
