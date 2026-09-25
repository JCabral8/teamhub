// Shared building blocks. Screens compose these so spacing, color and states stay consistent.
import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from './accent';
import type { AccentPalette } from './color';
import { colors, font, radius, space, toneColors, type Tone } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  onRefresh,
  refreshing = false,
}: {
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, { paddingBottom: space.xxl + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={font.label}>{children}</Text>
      {right}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const v = buttonVariants(useAccent())[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [styles.button, { backgroundColor: v.bg, borderColor: v.border }, inactive && styles.buttonDisabled, pressed && styles.pressed, style]}
    >
      {busy ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={v.fg} />}
          <Text style={[styles.buttonText, { color: v.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = (a: AccentPalette): Record<ButtonVariant, { bg: string; fg: string; border: string }> => ({
  primary: { bg: a.accent, fg: a.onAccent, border: a.accent },
  secondary: { bg: colors.surface, fg: a.ink, border: colors.border },
  danger: { bg: colors.surface, fg: colors.negative, border: colors.negativeSoft },
  ghost: { bg: 'transparent', fg: a.ink, border: 'transparent' },
});

/** Tone colours, with 'primary' following the Team accent. */
function useTone(tone: Tone): { fg: string; bg: string } {
  const a = useAccent();
  return tone === 'primary' ? { fg: a.ink, bg: a.soft } : toneColors[tone];
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={styles.buttonRow}>{children}</View>;
}

export function Field({
  label,
  value,
  onChangeText,
  maxLength,
  showCount,
  hint,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
  showCount?: boolean;
  hint?: string;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'maxLength'>) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {showCount && maxLength ? (
          <Text style={[font.small, value.length >= maxLength && { color: colors.negative }]}>
            {value.length}/{maxLength}
          </Text>
        ) : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        placeholderTextColor={colors.textFaint}
        style={[styles.input, rest.multiline && styles.inputMultiline]}
        {...rest}
      />
      {hint ? <Text style={font.small}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Wrapping single-choice chips, for choices with more options than fit a segmented control. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
}) {
  const a = useAccent();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && { backgroundColor: a.accent, borderColor: a.accent }]}
          >
            <Text style={[styles.chipText, active && { color: a.onAccent, fontWeight: '600' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Badge({ label, tone = 'neutral', style }: { label: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const t = useTone(tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  right,
  onPress,
  icon,
  leading,
  first,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
  /** Shown before the title in place of an icon, such as a profile picture. */
  leading?: ReactNode;
  first?: boolean;
}) {
  const content = (
    <>
      {icon && <Ionicons name={icon} size={20} color={colors.textMuted} style={{ marginRight: space.md }} />}
      {leading && <View style={{ marginRight: space.md }}>{leading}</View>}
      <View style={{ flex: 1 }}>
        <Text style={font.body} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={font.small} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && <Ionicons name="chevron-forward" size={18} color={colors.textFaint} style={{ marginLeft: space.sm }} />}
    </>
  );
  const style = [styles.listRow, !first && styles.listRowDivider];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const a = useAccent();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{label}</Text>
        {hint ? <Text style={font.small}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: a.accent, false: colors.disabled }} thumbColor={colors.surface} />
    </View>
  );
}

export function Stepper({ value, onChange, min = 0, max = 99, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  const a = useAccent();
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - 1))}
        style={[styles.stepperButton, value <= min && styles.buttonDisabled]}
      >
        <Ionicons name="remove" size={18} color={a.ink} />
      </Pressable>
      <Text style={styles.stepperValue} accessibilityLabel={`${label} ${value}`}>
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + 1))}
        style={[styles.stepperButton, value >= max && styles.buttonDisabled]}
      >
        <Ionicons name="add" size={18} color={a.ink} />
      </Pressable>
    </View>
  );
}

export function Notice({ tone = 'neutral', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  const t = useTone(tone);
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }]}>
      {title ? <Text style={[font.body, { fontWeight: '600', color: tone === 'neutral' ? colors.text : t.fg }]}>{title}</Text> : null}
      {typeof children === 'string' ? <Text style={[font.small, { color: tone === 'neutral' ? colors.textMuted : t.fg }]}>{children}</Text> : children}
    </View>
  );
}

export function ErrorText({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return (
    <Text style={styles.error} accessibilityRole="alert">
      {error}
    </Text>
  );
}

export function Loading() {
  const a = useAccent();
  return (
    <View style={styles.center}>
      <ActivityIndicator color={a.ink} />
    </View>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Text style={font.heading}>{title}</Text>
      {body ? <Text style={[font.small, { textAlign: 'center' }]}>{body}</Text> : null}
      {children}
    </View>
  );
}

/** Bottom sheet. Works on iOS, Android and web (Alert with custom buttons does not work on web). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: space.xl + insets.bottom }]}>
          <View style={styles.sheetHeader}>
            <Text style={font.heading}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: space.md }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** A confirm sheet with one main action. */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: string; confirmLabel: string; danger?: boolean; resolve: (ok: boolean) => void } | null>(null);
  const ask = (title: string, body: string, confirmLabel: string, danger = false) =>
    new Promise<boolean>((resolve) => setState({ title, body, confirmLabel, danger, resolve }));
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const element = (
    <Sheet visible={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
      <Text style={font.body}>{state?.body}</Text>
      <ButtonRow>
        <Button label="Cancel" variant="secondary" onPress={() => close(false)} style={{ flex: 1 }} />
        <Button label={state?.confirmLabel ?? 'OK'} variant={state?.danger ? 'danger' : 'primary'} onPress={() => close(true)} style={{ flex: 1 }} />
      </ButtonRow>
    </Sheet>
  );
  return { ask, element };
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: space.lg, gap: space.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm, marginBottom: -space.sm },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonDisabled: { opacity: 0.45 },
  buttonRow: { flexDirection: 'row', gap: space.md },
  pressed: { opacity: 0.7 },
  field: { gap: space.xs },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  segmented: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 3 },
  segment: { flex: 1, paddingVertical: space.sm, alignItems: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.surface, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  segmentTextActive: { color: colors.text, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontSize: 14, color: colors.text },
  badge: { paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, minHeight: 48 },
  listRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperButton: { width: 34, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 16, fontWeight: '600', color: colors.text },
  notice: { borderRadius: radius.md, padding: space.md, gap: space.xs },
  error: { color: colors.negative, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: colors.background },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
