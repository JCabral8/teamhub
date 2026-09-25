import { Stack } from 'expo-router';
import type { ReactNode } from 'react';
import { AccentProvider, useAccent } from './accent';

/** Colours a screen about one Team, header included, in that Team's colour. */
export function TeamAccent({ color, children }: { color: string | null | undefined; children: ReactNode }) {
  return (
    <AccentProvider color={color}>
      <HeaderTint />
      {children}
    </AccentProvider>
  );
}

function HeaderTint() {
  const a = useAccent();
  return <Stack.Screen options={{ headerTintColor: a.ink }} />;
}
