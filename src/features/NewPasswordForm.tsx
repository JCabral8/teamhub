// Choose a new password, typed twice. Used after a "reset your password" email and in My Profile.
import { useState } from 'react';
import { authError } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { Button, ErrorText, Field, Notice } from '../ui/components';

const MIN_LENGTH = 8;

export function NewPasswordForm({ buttonLabel, onDone }: { buttonLabel: string; onDone?: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saved, setSaved] = useState(false);
  const { busy, error, setError, run } = useAction();

  const save = () =>
    run(async () => {
      setSaved(false);
      if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
      if (password !== confirm) return setError("The two passwords don't match.");
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw authError(err);
      setPassword('');
      setConfirm('');
      setSaved(true);
      onDone?.();
    });

  return (
    <>
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
      <Field
        label="Type it again"
        value={confirm}
        onChangeText={setConfirm}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => void save()}
      />
      <ErrorText error={error} />
      <Button label={buttonLabel} busy={busy} onPress={() => void save()} />
      {saved && <Notice tone="positive" title="Password changed" />}
    </>
  );
}
