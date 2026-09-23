import { useEffect, useState } from 'react';
import { Field } from './components';
import { clock, parseClockInput } from './format';

/** Free-text time entry ("7:30 PM", "19:30") that reports HH:MM, or null while the text is not a time. */
export function TimeField({ label, value, onChange, hint }: { label: string; value: string | null; onChange: (time: string | null) => void; hint?: string }) {
  const [text, setText] = useState(value ? clock(value) : '');
  useEffect(() => {
    if (value && parseClockInput(text) !== value) setText(clock(value));
    // Only react to outside changes of the value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const parsed = parseClockInput(text);
  return (
    <Field
      label={label}
      value={text}
      placeholder="7:30 PM"
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={(t) => {
        setText(t);
        onChange(parseClockInput(t));
      }}
      onBlur={() => parsed && setText(clock(parsed))}
      hint={text && !parsed ? 'Enter a time like 7:30 PM' : hint}
    />
  );
}
