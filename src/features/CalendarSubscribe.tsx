// My Profile > Calendar: subscribe to your TeamHub schedule in Google, Apple or Outlook calendars.
import { useState } from 'react';
import { Linking, Text } from 'react-native';
import { calendarLinks, getCalendarToken, resetCalendarToken } from '../lib/calendar';
import { useAction, useLoader } from '../lib/hooks';
import { shareOrCopy } from '../lib/share';
import { Button, Card, ErrorText, useConfirm } from '../ui/components';
import { font } from '../ui/theme';

export function CalendarSubscribe() {
  const { data: token, error, reload } = useLoader(getCalendarToken, []);
  const [copied, setCopied] = useState(false);
  const reset = useAction();
  const confirm = useConfirm();
  const links = token ? calendarLinks(token) : null;
  const open = (url: string) => void Linking.openURL(url).catch(() => undefined);

  const onReset = async () => {
    const ok = await confirm.ask(
      'Reset calendar link?',
      'Calendars using your current link stop updating. Add TeamHub to your calendar again afterwards.',
      'Reset Link',
      true,
    );
    if (!ok) return;
    await reset.run(async () => {
      await resetCalendarToken();
      setCopied(false);
      await reload();
    });
  };

  return (
    <Card>
      <Text style={font.small}>
        Add your TeamHub schedule to your own calendar. Games and Events from all your Teams show up there and update when times change. Google Calendar can
        take up to a day to pick up a change; Apple and Outlook are usually quicker.
      </Text>
      <ErrorText error={error} />
      <Button label="Add to Google Calendar" icon="logo-google" variant="secondary" disabled={!links} onPress={() => links && open(links.google)} />
      <Button label="Add to Apple Calendar" icon="logo-apple" variant="secondary" disabled={!links} onPress={() => links && open(links.webcal)} />
      <Button label="Add to Outlook" icon="mail-outline" variant="secondary" disabled={!links} onPress={() => links && open(links.outlook)} />
      <Button
        label={copied ? 'Link Copied' : 'Copy Calendar Link'}
        icon={copied ? 'checkmark' : 'copy-outline'}
        variant="ghost"
        disabled={!links}
        onPress={() => void (links && shareOrCopy(links.feed).then(setCopied))}
      />
      <Text style={font.small}>Keep this link to yourself: anyone with it can see your schedule.</Text>
      <Button label="Reset Link" variant="danger" busy={reset.busy} onPress={() => void onReset()} />
      <ErrorText error={reset.error} />
      {confirm.element}
    </Card>
  );
}
