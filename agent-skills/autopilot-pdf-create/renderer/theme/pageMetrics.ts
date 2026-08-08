import type { Theme } from "./themeInterface";

/** Page dimensions in points for the supported page sizes. */
const pageSizes = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
} as const;

export function pageWidth(theme: Theme): number {
  return pageSizes[theme.page.size].width;
}

export function pageHeight(theme: Theme): number {
  return pageSizes[theme.page.size].height;
}

/** Width available for content between the left and right page margins. */
export function contentWidth(theme: Theme): number {
  return pageWidth(theme) - theme.page.margins.left - theme.page.margins.right;
}
