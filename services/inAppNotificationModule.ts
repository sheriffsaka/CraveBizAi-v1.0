import fs from 'fs';
import path from 'path';

export interface InAppNotificationRecord {
    id: string;
    tenantId?: string;
    recipientEmail?: string;
    recipientUserId?: string;
    title: string;
    message: string;
    category: string;
    type: 'info' | 'success' | 'warning' | 'error';
    read: boolean;
    createdAt: string;
    actionUrl?: string;
    metadata?: any;
}

const NOTIFICATIONS_FILE = path.join(process.cwd(), 'in_app_notifications.json');
let inMemoryNotifications: InAppNotificationRecord[] = [];

// Load initial notifications from file if present
try {
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
        const raw = fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8');
        inMemoryNotifications = JSON.parse(raw) || [];
    }
} catch (e) {
    console.warn("[InAppNotificationModule] Failed to read stored notifications file:", e);
}

function persistNotifications() {
    try {
        fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(inMemoryNotifications.slice(0, 500), null, 2), 'utf-8');
    } catch (e) {
        console.warn("[InAppNotificationModule] Failed to persist notifications to file:", e);
    }
}

export function createInAppNotificationRecord(data: {
    tenantId?: string;
    recipientEmail?: string;
    recipientUserId?: string;
    title: string;
    message: string;
    category: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    actionUrl?: string;
    metadata?: any;
}): InAppNotificationRecord {
    const record: InAppNotificationRecord = {
        id: 'notif_srv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        tenantId: data.tenantId,
        recipientEmail: data.recipientEmail?.toLowerCase(),
        recipientUserId: data.recipientUserId,
        title: data.title,
        message: data.message,
        category: data.category,
        type: data.type || 'info',
        read: false,
        createdAt: new Date().toISOString(),
        actionUrl: data.actionUrl,
        metadata: data.metadata
    };

    // Deduplicate within 3 seconds
    const isDup = inMemoryNotifications.some(n => 
        n.title === record.title && 
        n.message === record.message && 
        (Date.now() - new Date(n.createdAt).getTime() < 3000)
    );

    if (!isDup) {
        inMemoryNotifications.unshift(record);
        if (inMemoryNotifications.length > 500) {
            inMemoryNotifications = inMemoryNotifications.slice(0, 500);
        }
        persistNotifications();
    }

    return record;
}

export function getInAppNotificationsStore(params?: {
    tenantId?: string;
    recipientEmail?: string;
    unreadOnly?: boolean;
}): InAppNotificationRecord[] {
    let result = [...inMemoryNotifications];

    if (params?.tenantId) {
        const tId = params.tenantId;
        result = result.filter(n => !n.tenantId || n.tenantId === tId);
    }

    if (params?.recipientEmail) {
        const email = params.recipientEmail.toLowerCase();
        result = result.filter(n => !n.recipientEmail || n.recipientEmail === email);
    }

    if (params?.unreadOnly) {
        result = result.filter(n => !n.read);
    }

    return result;
}

export function markInAppNotificationReadStore(id?: string, markAll: boolean = false, recipientEmail?: string, tenantId?: string): InAppNotificationRecord[] {
    inMemoryNotifications = inMemoryNotifications.map(n => {
        const matchTenant = !tenantId || !n.tenantId || n.tenantId === tenantId;
        const matchEmail = !recipientEmail || !n.recipientEmail || n.recipientEmail === recipientEmail.toLowerCase();
        if ((markAll && matchTenant && matchEmail) || n.id === id) {
            return { ...n, read: true };
        }
        return n;
    });
    persistNotifications();
    return inMemoryNotifications;
}

export function clearInAppNotificationsStore(recipientEmail?: string, tenantId?: string): InAppNotificationRecord[] {
    inMemoryNotifications = inMemoryNotifications.filter(n => {
        const matchTenant = !tenantId || !n.tenantId || n.tenantId === tenantId;
        const matchEmail = !recipientEmail || !n.recipientEmail || n.recipientEmail === recipientEmail.toLowerCase();
        if (matchTenant && matchEmail && n.read) {
            return false; // delete read notifications
        }
        return true;
    });
    persistNotifications();
    return inMemoryNotifications;
}

export function broadcastSystemAnnouncementStore(title: string, message: string, category: string = 'announcement'): { count: number } {
    createInAppNotificationRecord({
        title,
        message,
        category,
        type: 'info'
    });
    return { count: 1 };
}
