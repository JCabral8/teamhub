import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useAuth } from '../lib/auth';
import { useAction } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { Button, Card, ErrorText, Field, Notice, Screen, Segmented } from '../ui/components';
import { font } from '../ui/theme';

type Mode = 'signIn' | 'signUp';

export default function SignIn() {
  const { session } = useAuth();
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [mode, setMode] = useState<Mode>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [checkEmail, setCheckEmail] = useState(false);
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    if (session) router.replace((next as '/') || '/');
  }, [session, next, router]);

  const submit = () =>
    run(async () => {
      if (!email.trim() || !password) return setError('Enter your email and password.');
      if (mode === 'signUp') {
        if (!name.trim()) return setError('Enter your name.');
        if (password.length < 8) return setError('Use at least 8 characters for your password.');
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() } },
        });
        if (err) throw err;
        if (!data.session) setCheckEmail(true);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    });

  return (
    <Screen>
      <Text style={font.title}>{mode === 'signIn' ? 'Welcome back' : 'Create your account'}</Text>
      <Text style={font.small}>Every player and Manager has their own TeamHub account.</Text>
      <Segmented
        options={[
          { value: 'signIn', label: 'Sign In' },
          { value: 'signUp', label: 'Create Account' },
        ]}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
        }}
      />
      <Card>
        {mode === 'signUp' && <Field label="Your name" value={name} onChangeText={setName} maxLength={60} autoComplete="name" textContentType="name" />}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          onSubmitEditing={submit}
        />
        <ErrorText error={error} />
        <Button label={mode === 'signIn' ? 'Sign In' : 'Create Account'} onPress={submit} busy={busy} />
      </Card>
      {checkEmail && <Notice tone="primary" title="Check your email">Confirm your address using the link we sent, then sign in.</Notice>}
    </Screen>
  );
}
