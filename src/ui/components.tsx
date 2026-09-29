// Shared building blocks, styled after the wireframes in design/. Screens compose these so spacing,
// colour and states stay consistent.
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
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from './accent';
import type { AccentPalette } from './color';
import { colors, font, radius, shadow, space, toneColors, type Tone } from './theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * A scrolling screen. `footer` stays pinned to the bottom, like the main action on most wireframes
 * (Next, Save Changes, Send Callup Invites).
 */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => void | Promise<void>;
  refreshing?: boolean;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.screenContent, { paddingBottom: footer ? space.xl : space.xxl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} /> : undefined}
      >
        <View style={styles.column}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}>
          <View style={[styles.column, { gap: space.sm }]}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  style,
  flush,
  bare,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** No vertical padding, for lists of rows. */
  flush?: boolean;
  /** No padding at all, for rows that pad themselves (Event rows). */
  bare?: boolean;
}) {
  return <View style={[styles.card, flush && styles.cardFlush, bare && styles.cardBare, style]}>{children}</View>;
}

/** A bold heading above a group ("Action Required", "Upcoming Events", "Coverage"). */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.sectionLabelRow}>
      <Text style={styles.sectionLabel}>{children}</Text>
      {right}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'danger' | 'destructive' | 'success' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  icon,
  size = 'md',
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  busy?: boolean;
  icon?: IconName;
  size?: 'md' | 'sm';
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
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSmall,
        { backgroundColor: v.bg, borderColor: v.border },
        inactive && styles.buttonDisabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={v.fg} />}
          <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSmall, { color: v.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const buttonVariants = (a: AccentPalette): Record<ButtonVariant, { bg: string; fg: string; border: string }> => ({
  primary: { bg: a.accent, fg: a.onAccent, border: a.accent },
  secondary: { bg: colors.surface, fg: a.ink, border: a.accent },
  neutral: { bg: colors.surface, fg: colors.text, border: colors.border },
  danger: { bg: colors.surface, fg: colors.negative, border: colors.negative },
  destructive: { bg: colors.negative, fg: '#FFFFFF', border: colors.negative },
  success: { bg: colors.positive, fg: '#FFFFFF', border: colors.positive },
  ghost: { bg: 'transparent', fg: a.ink, border: 'transparent' },
});

/** Tone colours, with 'primary' following the Team accent. */
export function useTone(tone: Tone): { fg: string; bg: string } {
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
  required,
  icon,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
  showCount?: boolean;
  hint?: string;
  required?: boolean;
  /** Shown inside the input on the right, like the search and calendar icons in the wireframes. */
  icon?: IconName;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'maxLength'>) {
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <View>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          maxLength={maxLength}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, rest.multiline && styles.inputMultiline, icon && { paddingRight: 40 }]}
          {...rest}
        />
        {icon ? <Ionicons name={icon} size={18} color={colors.textMuted} style={styles.inputIcon} /> : null}
      </View>
      {(showCount && maxLength) || hint ? (
        <View style={styles.fieldFoot}>
          <Text style={[font.small, { flex: 1 }]}>{hint ?? ''}</Text>
          {showCount && maxLength ? (
            <Text style={[font.small, value.length >= maxLength && { color: colors.negative }]}>
              {value.length}/{maxLength}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={{ color: colors.negative }}> *</Text> : null}
    </Text>
  );
}

/** Looks like an input but opens a picker: dates, times, lists. */
export function FieldButton({
  label,
  value,
  placeholder,
  icon = 'chevron-down',
  active,
  required,
  onPress,
}: {
  label?: string;
  value: string | null;
  placeholder?: string;
  icon?: IconName;
  active?: boolean;
  required?: boolean;
  onPress: () => void;
}) {
  const a = useAccent();
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? ''}: ${value ?? placeholder ?? ''}`}
        onPress={onPress}
        style={({ pressed }) => [styles.input, styles.select, active && { borderColor: a.accent, borderWidth: 1.5 }, pressed && styles.pressed]}
      >
        <Text style={[styles.selectText, !value && { color: colors.textFaint }]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
        <Ionicons name={icon} size={19} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function SearchField({ value, onChangeText, placeholder = 'Search players...' }: { value: string; onChangeText: (t: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Ionicons name="search" size={18} color={colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.searchInput}
        autoCorrect={false}
      />
    </View>
  );
}

/** A dropdown box ("Slapsticks ⌄") that opens a list to pick from. */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = 'Choose…',
  title,
}: {
  label?: string;
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const a = useAccent();
  const current = options.find((o) => o.value === value);
  return (
    <View style={styles.field}>
      {label ? <FieldLabel label={label} /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label ?? title ?? 'Choose'}: ${current?.label ?? placeholder}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.input, styles.select, pressed && styles.pressed]}
      >
        {current?.icon}
        <Text style={[styles.selectText, !current && { color: colors.textFaint }]} numberOfLines={1}>
          {current?.label ?? placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? label ?? 'Choose'}>
        <View>
          {options.map((o, i) => (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: o.value === value }}
              onPress={() => {
                onChange(o.value);
                setOpen(false);
              }}
              style={({ pressed }) => [styles.listRow, i > 0 && styles.listRowDivider, pressed && styles.pressed]}
            >
              {o.icon ? <View style={{ marginRight: space.md }}>{o.icon}</View> : null}
              <Text style={[font.body, { flex: 1 }, o.value === value && { fontWeight: '700', color: a.ink }]}>{o.label}</Text>
              {o.value === value && <Ionicons name="checkmark" size={20} color={a.ink} />}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

/** Two or three side-by-side choices; the chosen one is filled ("Random Callup | Simple Listed Order"). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const a = useAccent();
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: a.accent }]}
          >
            <Text style={[styles.segmentText, active && { color: a.onAccent, fontWeight: '700' }]} numberOfLines={2}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Underlined tabs across the top of a list ("List | Calendar", "Roster (13) | Callups (2)"). */
export function TabBar<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const a = useAccent();
  return (
    <View style={[styles.tabBar, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.tab, active && { borderBottomColor: a.accent, backgroundColor: a.soft }]}
          >
            <Text style={[styles.tabText, active && { color: a.ink, fontWeight: '700' }]} numberOfLines={1}>
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

/** A small status pill ("Attending", "Pending", "Team Default"). */
export function Badge({ label, tone = 'neutral', icon, style }: { label: string; tone?: Tone; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  const t = useTone(tone);
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }, style]}>
      {icon ? <Ionicons name={icon} size={12} color={t.fg} /> : null}
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A number in a filled circle, for counts on menu rows ("Invitations ②"). */
export function CountBubble({ count }: { count: number }) {
  const a = useAccent();
  return (
    <View style={[styles.bubble, { backgroundColor: a.accent }]}>
      <Text style={[styles.bubbleText, { color: a.onAccent }]}>{count}</Text>
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
  strong,
  highlighted,
  titleStyle,
}: {
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
  icon?: IconName;
  /** Shown before the title in place of an icon, such as a profile picture. */
  leading?: ReactNode;
  first?: boolean;
  /** Bold title, for rows that summarise a group ("Attending (9)"). */
  strong?: boolean;
  /** Tinted background, for the row that needs attention. */
  highlighted?: boolean;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const a = useAccent();
  const content = (
    <>
      {icon && <Ionicons name={icon} size={20} color={colors.textMuted} style={{ marginRight: space.md }} />}
      {leading && <View style={{ marginRight: space.md }}>{leading}</View>}
      <View style={{ flex: 1 }}>
        <Text style={[font.body, strong && { fontWeight: '600' }, titleStyle]} numberOfLines={1}>
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
  const style = [styles.listRow, !first && styles.listRowDivider, highlighted && { backgroundColor: a.soft, marginHorizontal: -space.lg, paddingHorizontal: space.lg }];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

/** A back chevron for the header, for screens that step back within themselves (wizards). */
export function HeaderBack({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onPress} hitSlop={12} style={{ paddingHorizontal: space.md }}>
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </Pressable>
  );
}

/** A tappable row with a checkbox, for picking several players. */
export function CheckRow({
  title,
  subtitle,
  checked,
  onPress,
  leading,
  right,
  first,
  disabled,
}: {
  title: string;
  subtitle?: string | null;
  checked: boolean;
  onPress: () => void;
  leading?: ReactNode;
  right?: ReactNode;
  first?: boolean;
  disabled?: boolean;
}) {
  const a = useAccent();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, !first && styles.listRowDivider, pressed && styles.pressed, disabled && styles.buttonDisabled]}
    >
      <View style={[styles.checkbox, checked && { backgroundColor: a.accent, borderColor: a.accent }]}>
        {checked && <Ionicons name="checkmark" size={16} color={a.onAccent} />}
      </View>
      {leading && <View style={{ marginRight: space.md }}>{leading}</View>}
      <View style={{ flex: 1 }}>
        <Text style={font.body} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={font.small}>{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

/** A single-choice row with a radio circle ("Pending / Accepted / Declined", "Send Time"). */
export function RadioRow({ label, hint, selected, onPress, right }: { label: string; hint?: string; selected: boolean; onPress: () => void; right?: ReactNode }) {
  const a = useAccent();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.radioRow, pressed && styles.pressed]}
    >
      <View style={[styles.radio, selected && { borderColor: a.accent }]}>{selected && <View style={[styles.radioDot, { backgroundColor: a.accent }]} />}</View>
      <View style={{ flex: 1 }}>
        <Text style={[font.body, selected && { fontWeight: '600' }]}>{label}</Text>
        {hint ? <Text style={font.small}>{hint}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const a = useAccent();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[font.body, { fontWeight: '600' }]}>{label}</Text>
        {hint ? <Text style={font.small}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: a.accent, false: colors.disabled }}
        thumbColor={colors.surface}
        {...({ activeThumbColor: colors.surface } as object)}
      />
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

/** A label on the left and a stepper on the right ("Forwards  − 6 +"). */
export function StepperRow({ label, ...stepper }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <View style={styles.stepperRow}>
      <Text style={[font.body, { flex: 1 }]}>{label}</Text>
      <Stepper label={label} {...stepper} />
    </View>
  );
}

const TONE_ICONS: Record<Tone, IconName> = {
  neutral: 'information-circle',
  primary: 'information-circle',
  positive: 'checkmark-circle',
  negative: 'alert-circle',
  attention: 'warning',
};

/** A tinted box with an icon: info notes, "Roster is full", "Your response has been saved". */
export function Notice({ tone = 'neutral', title, icon, children, style }: { tone?: Tone; title?: string; icon?: IconName | null; children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTone(tone);
  const iconName = icon === null ? null : (icon ?? TONE_ICONS[tone]);
  const ink = tone === 'neutral' ? colors.text : t.fg;
  return (
    <View style={[styles.notice, { backgroundColor: t.bg }, style]}>
      {iconName ? <Ionicons name={iconName} size={20} color={tone === 'neutral' ? colors.textMuted : t.fg} style={{ marginTop: 1 }} /> : null}
      <View style={{ flex: 1, gap: space.xs }}>
        {title ? <Text style={[font.body, { fontWeight: '700', color: ink }]}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={[font.small, { color: tone === 'neutral' ? colors.textMuted : t.fg }]}>{children}</Text> : children}
      </View>
    </View>
  );
}

/** A soft coloured circle with an icon inside. */
export function IconCircle({ icon, color, bg, size = 40 }: { icon: IconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.55} color={color} />
    </View>
  );
}

/** One line of Event facts with its icon (date, time, place). */
export function DetailLine({ icon, children, sub }: { icon: IconName; children: ReactNode; sub?: string | null }) {
  return (
    <View style={styles.detailLine}>
      <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Text style={font.body}>{children}</Text>
        {sub ? <Text style={font.small}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export function ProgressBar({ value, max, tone = 'positive' }: { value: number; max: number; tone?: Tone }) {
  const t = useTone(tone);
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max, now: value }}>
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: t.fg }]} />
    </View>
  );
}

/** A big tick (or info mark) with a message: "Event Created Successfully!", "You're In!". */
export function SuccessState({ title, body, tone = 'positive', icon }: { title: string; body?: string; tone?: Tone; icon?: IconName }) {
  const t = useTone(tone);
  return (
    <View style={styles.success}>
      <View style={[styles.successIcon, { backgroundColor: t.fg }]}>
        <Ionicons name={icon ?? (tone === 'positive' ? 'checkmark' : 'information')} size={52} color="#FFFFFF" />
      </View>
      <Text style={[font.title, { color: t.fg, textAlign: 'center' }]}>{title}</Text>
      {body ? <Text style={[font.body, { color: colors.textMuted, textAlign: 'center' }]}>{body}</Text> : null}
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

/** A centred dialog over a dimmed screen, like "Confirm Response" and "Send Attendance". */
export function Dialog({ visible, onClose, title, body, children }: { visible: boolean; onClose: () => void; title: string; body?: string; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.dialogBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.sheetHeader}>
            <Text style={[font.heading, { flex: 1, fontSize: 18 }]}>{title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
          </View>
          {body ? <Text style={[font.body, { color: colors.textMuted }]}>{body}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** A confirm dialog with one main action. */
export function useConfirm() {
  const [state, setState] = useState<{ title: string; body: string; confirmLabel: string; danger?: boolean; resolve: (ok: boolean) => void } | null>(null);
  const ask = (title: string, body: string, confirmLabel: string, danger = false) =>
    new Promise<boolean>((resolve) => setState({ title, body, confirmLabel, danger, resolve }));
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const element = (
    <Dialog visible={!!state} onClose={() => close(false)} title={state?.title ?? ''} body={state?.body}>
      <View style={{ gap: space.sm }}>
        <Button label={state?.confirmLabel ?? 'OK'} variant={state?.danger ? 'destructive' : 'primary'} onPress={() => close(true)} />
        <Button label="Cancel" variant="secondary" onPress={() => close(false)} />
      </View>
    </Dialog>
  );
  return { ask, element };
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: space.lg, flexGrow: 1 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: space.lg },
  footer: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow,
  },
  cardFlush: { paddingVertical: 0, gap: 0 },
  cardBare: { padding: 0, gap: 0, overflow: 'hidden' },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs, marginBottom: -space.sm },
  sectionLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.sm },
  buttonText: { fontSize: 16, fontWeight: '600' },
  buttonTextSmall: { fontSize: 14 },
  buttonDisabled: { opacity: 0.45 },
  buttonRow: { flexDirection: 'row', gap: space.md },
  pressed: { opacity: 0.7 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  fieldFoot: { flexDirection: 'row', gap: space.sm },
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
  inputIcon: { position: 'absolute', right: space.md, top: 14 },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  select: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  selectText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '500' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 42,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: space.sm },
  segmented: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 3, backgroundColor: colors.surface, gap: 3 },
  segment: { flex: 1, paddingVertical: 10, paddingHorizontal: space.xs, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentText: { fontSize: 14, fontWeight: '500', color: colors.textMuted, textAlign: 'center' },
  tabBar: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  tab: { flex: 1, paddingVertical: 11, alignItems: 'center', borderBottomWidth: 2.5, borderBottomColor: 'transparent' },
  tabText: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipText: { fontSize: 14, color: colors.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'center' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  bubble: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  bubbleText: { fontSize: 12, fontWeight: '700' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, minHeight: 50 },
  listRowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm, minHeight: 44 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.disabled, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  notice: { flexDirection: 'row', gap: space.sm, borderRadius: radius.md, padding: space.md },
  detailLine: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  progress: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  success: { alignItems: 'center', gap: space.md, paddingVertical: space.xl },
  successIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.negative, fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: colors.background },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.lg,
    gap: space.md,
    maxHeight: '88%',
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md },
  dialogBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.overlay, padding: space.xl },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: space.xl,
    gap: space.lg,
    width: '100%',
    maxWidth: 380,
    ...shadow,
  },
});
