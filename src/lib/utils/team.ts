import type { CSSProperties } from "react";

/**
 * Small marks in a force's colour. In dark mode the raw colour is too
 * dim on the dark surface, so it is mixed halfway to white.
 */
export function markColour(colour: string): string {
  return `light-dark(${colour}, color-mix(in oklab, ${colour} 50%, #ffffff))`;
}

/** Style that sets a force's colour for everything inside. */
export function teamStyle(colour: string): CSSProperties {
  return {
    ["--color-team" as string]: colour,
    ["--mark" as string]: markColour(colour),
  };
}
