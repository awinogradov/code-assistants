/**
 * Convert a CSS-style length to PDF points.
 *
 * PDF uses points; CSS design tokens are usually px or rem. Using the CSS
 * convention 1rem = 16px and 1px = 0.75pt gives 1rem = 12pt. Bare numbers are
 * treated as points. `em` is resolved against `basePt` (the element's own size).
 */
export function cssLengthToPt(value: string | number, basePt = 12): number {
  if (typeof value === "number") return value;
  const match = /^(-?\d*\.?\d+)\s*(px|pt|rem|em)?$/.exec(value.trim());
  if (!match) throw new Error(`Unrecognized length: "${value}"`);
  const amount = Number(match[1]);
  const unit = match[2] ?? "pt";
  switch (unit) {
    case "pt":
      return amount;
    case "px":
      return amount * 0.75;
    case "rem":
      return amount * 12;
    case "em":
      return amount * basePt;
    default:
      throw new Error(`Unsupported unit: ${unit}`);
  }
}
