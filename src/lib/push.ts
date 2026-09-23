// Registers this device for push notifications and opens the Event when a notification is tapped.
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

async function register(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'TeamHub', importance: Notifications.AndroidImportance.HIGH });
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return; // Push needs an EAS project id (set by `eas init`).
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await supabase.from('push_tokens').upsert({ token, platform: Platform.OS }, { onConflict: 'user_id,token', ignoreDuplicates: true });
}

export function usePushRegistration(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    register().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const eventId = (response.notification.request.content.data as { eventId?: string } | undefined)?.eventId;
      if (eventId) router.push({ pathname: '/event/[id]', params: { id: eventId } });
      else router.push('/notifications');
    });
    return () => sub.remove();
  }, []);
}
