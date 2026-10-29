export function vehicleMarkerWidth(lineNumber: string | number): number {
  return 32 + Math.max(0, String(lineNumber).length - 1) * 6;
}
