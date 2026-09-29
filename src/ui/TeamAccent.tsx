import type { ReactNode } from 'react';
import { AccentProvider } from './accent';

/** Colours a screen about one Team in that Team's colour. */
export function TeamAccent({ color, children }: { color: string | null | undefined; children: ReactNode }) {
  return <AccentProvider color={color}>{children}</AccentProvider>;
}
