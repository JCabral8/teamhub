// A colour wheel: drag on the disc for hue and saturation, and along the bar below for brightness.
// The images come from scripts/generate-color-wheel.mjs (hue runs clockwise from the right).
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Platform, Pressable, StyleSheet, View, type GestureResponderEvent, type PanResponderGestureState, type ViewStyle } from 'react-native';
import { contrast, hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './color';
import { colors, radius, space } from './theme';

const WHEEL = require('../../assets/color-wheel.png');
const FADE = require('../../assets/brightness-fade.png');
const THUMB = 26;
const BAR = 30;

// Stops the page from scrolling while a finger drags a control in a mobile browser.
const noScroll = (Platform.OS === 'web' ? { touchAction: 'none', cursor: 'pointer' } : {}) as ViewStyle;

type HSV = { h: number; s: number; v: number };
const toHex = ({ h, s, v }: HSV) => rgbToHex(hsvToRgb(h, s, v));

/**
 * A drag handler that reports the touch position inside its view. The position is taken from the
 * first touch, then moved by the drag distance, so it stays right when the finger leaves the view.
 */
function useDrag(onPoint: (x: number, y: number) => void) {
  const handler = useRef(onPoint);
  handler.current = onPoint;
  const start = useRef({ x: 0, y: 0 });
  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e: GestureResponderEvent) => {
        start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
        handler.current(start.current.x, start.current.y);
      },
      onPanResponderMove: (_e: GestureResponderEvent, g: PanResponderGestureState) => handler.current(start.current.x + g.dx, start.current.y + g.dy),
    }),
  ).current.panHandlers;
}

export function ColorWheel({ value, onChange, size = 240 }: { value: string; onChange: (hex: string) => void; size?: number }) {
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(hexToRgb(value)));
  // Follow outside changes (a swatch, the hex field) without losing the hue of greys and black.
  useEffect(() => {
    if (toHex(hsv) !== value.toUpperCase()) setHsv(rgbToHsv(hexToRgb(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (next: HSV) => {
    setHsv(next);
    onChange(toHex(next));
  };
  const r = size / 2;
  const wheel = useDrag((x, y) => {
    const dx = x - r;
    const dy = y - r;
    update({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / r), v: hsv.v || 1 });
  });
  const bar = useDrag((x) => update({ ...hsv, v: Math.min(1, Math.max(0, x / size)) }));

  const angle = (hsv.h * Math.PI) / 180;
  const pure = toHex({ ...hsv, v: 1 });
  const current = toHex(hsv);
  const thumbBorder = contrast(current, '#FFFFFF') < 1.6 ? colors.textMuted : '#FFFFFF';
  return (
    <View style={{ gap: space.lg, alignItems: 'center' }}>
      <View
        {...wheel}
        accessibilityLabel="Colour wheel"
        style={[{ width: size, height: size, borderRadius: r, backgroundColor: '#000000' }, noScroll]}
      >
        {/* Fading the disc over black shows every colour at the chosen brightness. */}
        <View pointerEvents="none">
          <Image source={WHEEL} style={{ width: size, height: size, opacity: 0.15 + 0.85 * hsv.v }} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.thumb,
            { backgroundColor: current, borderColor: thumbBorder, left: r + Math.cos(angle) * hsv.s * r - THUMB / 2, top: r + Math.sin(angle) * hsv.s * r - THUMB / 2 },
          ]}
        />
      </View>
      <View {...bar} accessibilityLabel="Brightness" style={[{ width: size, height: BAR }, noScroll]}>
        <View pointerEvents="none" style={[styles.bar, { backgroundColor: pure }]}>
          <Image source={FADE} style={StyleSheet.absoluteFill} resizeMode="stretch" />
        </View>
        <View
          pointerEvents="none"
          style={[styles.thumb, { backgroundColor: current, borderColor: thumbBorder, top: (BAR - THUMB) / 2, left: hsv.v * size - THUMB / 2 }]}
        />
      </View>
    </View>
  );
}

/** A row of colours to tap. */
export function Swatches({ options, value, onPick }: { options: string[]; value: string | null; onPick: (hex: string) => void }) {
  return (
    <View style={styles.swatches}>
      {options.map((hex) => {
        const on = value?.toUpperCase() === hex.toUpperCase();
        return (
          <Pressable
            key={hex}
            accessibilityRole="radio"
            accessibilityLabel={hex}
            accessibilityState={{ checked: on }}
            onPress={() => onPick(hex)}
            style={[styles.swatch, { backgroundColor: hex }, on && styles.swatchOn]}
          >
            {on && <Ionicons name="checkmark" size={18} color={contrast(hex, '#FFFFFF') >= 3 ? '#FFFFFF' : colors.text} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  bar: { flex: 1, borderRadius: radius.pill, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  swatchOn: { borderWidth: 3, borderColor: colors.text },
});
