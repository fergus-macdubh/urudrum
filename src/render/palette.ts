/**
 * Warm saturated storybook palette.
 *
 * The rules that hold this style together, applied consistently everywhere:
 *  - outlines are very dark warm brown, never pure black
 *  - every form is lighter at the top-left and darker at the bottom-right
 *  - greens run in a four-step ramp so foliage can stack and still read as separate masses
 *  - the road is pale sand, not brown, so units silhouette against it
 */
export const C = {
  outline: "#241C12",
  outlineSoft: "#3E2F1D",

  // Ground cover
  grassLight: "#8FC94A",
  grassMid: "#74B33B",
  grassDark: "#57922E",
  grassDeep: "#3F7223",
  grassShadow: "#2F5A1B",

  // The lane
  sandLight: "#F0E2AE",
  sand: "#E3CE8E",
  sandMid: "#D3BB76",
  sandDark: "#B9995A",
  sandEdge: "#9A7C46",

  // Foliage — deliberately distinct from ground greens
  leafLight: "#7CC043",
  leafMid: "#589B2F",
  leafDark: "#3D7A25",
  leafDeep: "#2A5719",

  stoneLight: "#CFC9BC",
  stoneMid: "#A29B8C",
  stoneDark: "#756E60",

  wood: "#9A6A41",
  woodMid: "#7B5231",
  woodDark: "#573922",

  canvasLight: "#F2EAD6",
  canvasMid: "#DCD0B4",
  canvasBlue: "#5B86B8",

  thatch: "#D9B461",
  thatchDark: "#B08C41",

  gruntLight: "#8FC257",
  gruntMid: "#6FA23F",
  gruntDark: "#4F7A2C",

  bruteLight: "#9C8BA8",
  bruteMid: "#7B6B88",
  bruteDark: "#584B63",

  gold: "#F5C542",
  goldDark: "#C4972A",

  hpGood: "#5FBF48",
  hpBad: "#D9482F",
  hpBack: "#2A2018",

  panel: "#3D2F22",
  panelLight: "#5C4630",
  parchment: "#EBD9AE",

  sky: "#1A1410",
  accent: "#4FA3D9",
  danger: "#D9482F",
  wool: "#F3EDE0",
} as const;

/** Hex string -> 0xRRGGBB, for the Phaser APIs that want a number. */
export function hex(color: string): number {
  return parseInt(color.slice(1), 16);
}
