import { InAppNotification, NotificationCategory } from '../types';

const NOTIFICATIONS_STORAGE_KEY = 'cravebiz_inapp_notifications_v1';
const NOTIFICATION_EVENT = 'cravebiz_notification_updated';

// Web Audio API chime for new notification sound
let audioCtx: AudioContext | null = null;

export function playNotificationChime() {
    try {
        if (typeof window === 'undefined') return;
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        if (!audioCtx) {
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5

        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
        // Silently catch audio play issues (e.g. user gesture requirements)
    }
}

export function getLocalNotifications(): InAppNotification[] {
    try {
        const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
        if (raw) {
            return JSON.parse(raw);
        }
    } catch (e) {
        console.warn('Failed to parse local notifications:', e);
    }
    return [];
}

export function saveLocalNotifications(list: InAppNotification[]): void {
    try {
        localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent(NOTIFICATION_EVENT, { detail: list }));
    } catch (e) {
        console.warn('Failed to save local notifications:', e);
    }
}

export function createInAppNotificationClient(params: {
    tenantId?: string;
    recipientEmail?: string;
    recipientUserId?: string;
    title: string;
    message: string;
    category: NotificationCategory;
    type?: 'info' | 'success' | 'warning' | 'error';
    actionUrl?: string;
    metadata?: Record<string, any>;
    playSound?: boolean;
}): InAppNotification {
    const newNotif: InAppNotification = {
        id: 'notif_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        tenantId: params.tenantId,
        recipientEmail: params.recipientEmail,
        recipientUserId: params.recipientUserId,
        title: params.title,
        message: params.message,
        category: params.category,
        type: params.type || 'info',
        read: false,
        createdAt: new Date().toISOString(),
        actionUrl: params.actionUrl,
        metadata: params.metadata
    };

    const current = getLocalNotifications();
    // Prevent exact duplicate spam within 2 seconds
    const isDuplicate = current.some(n => 
        n.title === newNotif.title && 
        n.message === newNotif.message && 
        (Date.now() - new Date(n.createdAt).getTime() < 2000)
    );

    if (!isDuplicate) {
        const updated = [newNotif, ...current].slice(0, 100); // keep last 100
        saveLocalNotifications(updated);
        if (params.playSound !== false) {
            playNotificationChime();
        }
    }

    return newNotif;
}

export function markNotificationReadClient(id?: string, markAll: boolean = false): InAppNotification[] {
    const current = getLocalNotifications();
    const updated = current.map(n => {
        if (markAll || n.id === id) {
            return { ...n, read: true };
        }
        return n;
    });
    saveLocalNotifications(updated);
    return updated;
}

export function clearLocalNotificationsClient(): InAppNotification[] {
    const current = getLocalNotifications();
    // Keep unread or remove all read
    const updated = current.filter(n => !n.read);
    saveLocalNotifications(updated);
    return updated;
}

export function removeNotificationByIdClient(id: string): InAppNotification[] {
    const current = getLocalNotifications();
    const updated = current.filter(n => n.id !== id);
    saveLocalNotifications(updated);
    return updated;
}

export function subscribeToNotifications(callback: (notifications: InAppNotification[]) => void): () => void {
    const handler = (e: any) => {
        callback(e.detail || getLocalNotifications());
    };
    window.addEventListener(NOTIFICATION_EVENT, handler);
    // Initial emission
    callback(getLocalNotifications());
    return () => {
        window.removeEventListener(NOTIFICATION_EVENT, handler);
    };
}
