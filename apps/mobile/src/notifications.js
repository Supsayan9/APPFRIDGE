import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false
    })
});
export async function registerForPushNotificationsAsync() {
    if (!Device.isDevice) {
        return { ok: false, reason: 'simulator', message: 'Push працює тільки на фізичному пристрої.' };
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        return { ok: false, reason: 'permission_denied', message: 'Доступ до сповіщень не надано.' };
    }
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX
        });
    }
    try {
        const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId;
        if (!projectId) {
            return {
                ok: false,
                reason: 'missing_project_id',
                message: 'Не задано EXPO_PUBLIC_EAS_PROJECT_ID (EAS projectId) у apps/mobile/.env.'
            };
        }
        const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
        return {
            ok: true,
            registration: {
                token: token.data,
                platform: Platform.OS === 'ios' ? 'ios' : 'android'
            }
        };
    }
    catch (error) {
        return {
            ok: false,
            reason: 'token_error',
            message: error instanceof Error ? error.message : 'Не вдалося отримати Expo Push Token.'
        };
    }
}
