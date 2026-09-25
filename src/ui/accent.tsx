// The accent colour of the Team being viewed. The root uses the selected Team's colour; screens
// about one Team (an Event, Team Settings) wrap themselves in that Team's colour.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { HEX_COLOR, accentPalette, type AccentPalette } from './color';
import { colors } from './theme';

const DEFAULT_ACCENT = accentPalette(colors.primary);

/** The palette for a Team's saved colour; Teams without one use the app's default blue. */
export function paletteFor(color: string | null | undefined): AccentPalette {
  return color && HEX_COLOR.test(color) ? accentPalette(color) : DEFAULT_ACCENT;
}

const AccentContext = createContext<AccentPalette>(DEFAULT_ACCENT);

export function AccentProvider({ color, children }: { color: string | null | undefined; children: ReactNode }) {
  const value = useMemo(() => paletteFor(color), [color]);
  return <AccentContext.Provider value={value}>{children}</AccentContext.Provider>;
}

export const useAccent = () => useContext(AccentContext);
