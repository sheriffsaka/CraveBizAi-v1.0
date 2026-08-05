import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://dfqvgezjhudmnlyeycju.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmcXZnZXpqaHVkbW5seWV5Y2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyNDAyOTMsImV4cCI6MjA4MTgxNjI5M30.8VsHsDpychdSMJmrfnmkxi5ed8CygwErX3-RkVPXkUI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface InAppNotificationRecord {
    id: string;
    tenantId?: string;
    tenant_id?: string;
    userId?: string;
    user_id?: string;
    recipientEmail?: string;
    recipient_email?: string;
    recipientUserId?: string;
    title: string;
    message: string;
    category: string;
    type: 'info' | 'success' | 'warning' | 'error';
    notification_type?: string;
    relatedEntityId?: string;
    related_entity_id?: string;
    actionUrl?: string;
    action_url?: string;
    read: boolean;
    is_read?: boolean;
    isRead?: boolean;
    createdAt: string;
    created_at?: string;
    updatedAt?: string;
    updated_at?: string;
    expiresAt?: string;
    expires_at?: string;
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

export async function createInAppNotificationRecordAsync(data: {
    tenantId?: string;
    recipientEmail?: string;
    recipientUserId?: string;
    userId?: string;
    title: string;
    message: string;
    category: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    relatedEntityId?: string;
    actionUrl?: string;
    expiresAt?: string;
    metadata?: any;
}): Promise<InAppNotificationRecord> {
    const nowIso = new Date().toISOString();
    const id = 'notif_srv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const userId = data.userId || data.recipientUserId || data.recipientEmail || 'anonymous';
    
    const record: InAppNotificationRecord = {
        id,
        tenantId: data.tenantId,
        tenant_id: data.tenantId,
        userId,
        user_id: userId,
        recipientEmail: data.recipientEmail?.toLowerCase(),
        recipient_email: data.recipientEmail?.toLowerCase(),
        recipientUserId: data.recipientUserId,
        title: data.title,
        message: data.message,
        category: data.category,
        type: data.type || 'info',
        notification_type: data.category || data.type || 'info',
        relatedEntityId: data.relatedEntityId || data.metadata?.entityId || data.metadata?.relatedEntityId,
        related_entity_id: data.relatedEntityId || data.metadata?.entityId || data.metadata?.relatedEntityId,
        actionUrl: data.actionUrl,
        action_url: data.actionUrl,
        read: false,
        is_read: false,
        isRead: false,
        createdAt: nowIso,
        created_at: nowIso,
        updatedAt: nowIso,
        updated_at: nowIso,
        expiresAt: data.expiresAt,
        expires_at: data.expiresAt,
        metadata: data.metadata
    };

    // Deduplicate in memory
    const nowMs = Date.now();
    const isDup = inMemoryNotifications.some(n => 
        (n.title === record.title && n.message === record.message) &&
        (n.user_id === record.user_id || n.recipientEmail === record.recipientEmail) &&
        (Math.abs(nowMs - new Date(n.createdAt || n.created_at || nowMs).getTime()) < 10000)
    );

    if (isDup) {
        console.log("[InAppNotificationModule] Duplicate notification suppressed:", record.title);
        return record;
    }

    inMemoryNotifications.unshift(record);
    if (inMemoryNotifications.length > 500) {
        inMemoryNotifications = inMemoryNotifications.slice(0, 500);
    }
    persistNotifications();

    // Persist to Supabase table (trying both in_app_notifications and notifications)
    try {
        const supabasePayload = {
            id: record.id,
            user_id: record.user_id,
            recipient_email: record.recipient_email,
            tenant_id: record.tenant_id,
            type: record.type || 'info',
            notification_type: record.notification_type || record.category || record.type || 'info',
            title: record.title,
            message: record.message,
            category: record.category || record.type || 'system',
            entity_type: record.category || record.type || 'system',
            related_entity_id: record.related_entity_id || null,
            entity_id: record.related_entity_id || null,
            action_url: record.action_url || null,
            is_read: false,
            read: false,
            created_at: record.created_at,
            updated_at: record.updated_at,
            expires_at: record.expires_at || null,
            metadata: record.metadata || {}
        };

        const { error } = await supabase.from('in_app_notifications').upsert(supabasePayload);
        if (error) {
            try {
                await supabase.from('notifications').upsert(supabasePayload);
            } catch (fbErr) {
                console.warn("[InAppNotificationModule] Fallback table insert notice:", fbErr);
            }
        }
    } catch (e) {
        console.warn("[InAppNotificationModule] Supabase insert warning:", e);
    }

    return record;
}

export function createInAppNotificationRecord(data: {
    tenantId?: string;
    recipientEmail?: string;
    recipientUserId?: string;
    userId?: string;
    title: string;
    message: string;
    category: string;
    type?: 'info' | 'success' | 'warning' | 'error';
    relatedEntityId?: string;
    actionUrl?: string;
    expiresAt?: string;
    metadata?: any;
}): InAppNotificationRecord {
    createInAppNotificationRecordAsync(data).catch(e => console.warn("Background notification save error:", e));
    
    const nowIso = new Date().toISOString();
    return {
        id: 'notif_srv_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        tenantId: data.tenantId,
        recipientEmail: data.recipientEmail?.toLowerCase(),
        recipientUserId: data.recipientUserId,
        title: data.title,
        message: data.message,
        category: data.category,
        type: data.type || 'info',
        read: false,
        createdAt: nowIso,
        actionUrl: data.actionUrl,
        metadata: data.metadata
    };
}

export async function getInAppNotificationsStoreAsync(params?: {
    tenantId?: string;
    recipientEmail?: string;
    userId?: string;
    unreadOnly?: boolean;
}): Promise<InAppNotificationRecord[]> {
    const mapItems = (data: any[]) => data.map(item => ({
        id: item.id,
        tenantId: item.tenant_id,
        tenant_id: item.tenant_id,
        userId: item.user_id || item.recipient_email,
        user_id: item.user_id || item.recipient_email,
        recipientEmail: item.recipient_email || item.user_id,
        recipient_email: item.recipient_email || item.user_id,
        recipientUserId: item.recipient_user_id || item.user_id,
        title: item.title,
        message: item.message,
        category: item.entity_type || item.category || item.notification_type || 'system',
        type: item.type || 'info',
        notification_type: item.notification_type || item.entity_type || item.category,
        relatedEntityId: item.entity_id || item.related_entity_id,
        related_entity_id: item.entity_id || item.related_entity_id,
        actionUrl: item.action_url,
        action_url: item.action_url,
        read: item.is_read ?? item.read ?? false,
        is_read: item.is_read ?? item.read ?? false,
        isRead: item.is_read ?? item.read ?? false,
        createdAt: item.created_at || new Date().toISOString(),
        created_at: item.created_at || new Date().toISOString(),
        updatedAt: item.updated_at,
        updated_at: item.updated_at,
        expiresAt: item.expires_at,
        expires_at: item.expires_at,
        metadata: item.metadata
    }));

    try {
        let query = supabase.from('in_app_notifications').select('*').order('created_at', { ascending: false });
        if (params?.tenantId) {
            query = query.eq('tenant_id', params.tenantId);
        }
        if (params?.recipientEmail) {
            query = query.or(`recipient_email.ilike.${params.recipientEmail.toLowerCase()},user_id.ilike.${params.recipientEmail.toLowerCase()}`);
        }
        if (params?.userId) {
            query = query.eq('user_id', params.userId);
        }
        if (params?.unreadOnly) {
            query = query.eq('is_read', false);
        }

        const { data, error } = await query;
        if (!error && Array.isArray(data) && data.length > 0) {
            return mapItems(data);
        }

        // Try 'notifications' table as fallback
        let fallbackQuery = supabase.from('notifications').select('*').order('created_at', { ascending: false });
        if (params?.tenantId) {
            fallbackQuery = fallbackQuery.eq('tenant_id', params.tenantId);
        }
        if (params?.recipientEmail) {
            fallbackQuery = fallbackQuery.or(`recipient_email.ilike.${params.recipientEmail.toLowerCase()},user_id.ilike.${params.recipientEmail.toLowerCase()}`);
        }
        if (params?.userId) {
            fallbackQuery = fallbackQuery.eq('user_id', params.userId);
        }
        if (params?.unreadOnly) {
            fallbackQuery = fallbackQuery.eq('is_read', false);
        }
        const { data: fbData, error: fbError } = await fallbackQuery;
        if (!fbError && Array.isArray(fbData) && fbData.length > 0) {
            return mapItems(fbData);
        }
    } catch (e) {
        console.warn("[InAppNotificationModule] Supabase fetch error, using fallback store:", e);
    }

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
        result = result.filter(n => !n.read && !n.is_read);
    }
    return result;
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

export async function markInAppNotificationReadStoreAsync(
    id?: string, 
    markAll: boolean = false, 
    recipientEmail?: string, 
    tenantId?: string
): Promise<InAppNotificationRecord[]> {
    const nowIso = new Date().toISOString();
    try {
        if (markAll) {
            let query = supabase.from('in_app_notifications').update({ is_read: true, read: true, updated_at: nowIso });
            if (recipientEmail) {
                query = query.eq('recipient_email', recipientEmail.toLowerCase());
            }
            if (tenantId) {
                query = query.eq('tenant_id', tenantId);
            }
            await query;
        } else if (id) {
            await supabase.from('in_app_notifications').update({ is_read: true, read: true, updated_at: nowIso }).eq('id', id);
        }
    } catch (e) {
        console.warn("[InAppNotificationModule] Supabase mark read error:", e);
    }

    inMemoryNotifications = inMemoryNotifications.map(n => {
        const matchTenant = !tenantId || !n.tenantId || n.tenantId === tenantId;
        const matchEmail = !recipientEmail || !n.recipientEmail || n.recipientEmail === recipientEmail.toLowerCase();
        if ((markAll && matchTenant && matchEmail) || n.id === id) {
            return { ...n, read: true, is_read: true, isRead: true, updatedAt: nowIso };
        }
        return n;
    });
    persistNotifications();
    return inMemoryNotifications;
}

export function markInAppNotificationReadStore(id?: string, markAll: boolean = false, recipientEmail?: string, tenantId?: string): InAppNotificationRecord[] {
    markInAppNotificationReadStoreAsync(id, markAll, recipientEmail, tenantId).catch(e => console.warn("Mark read async error:", e));
    return inMemoryNotifications.map(n => {
        if (markAll || n.id === id) {
            return { ...n, read: true };
        }
        return n;
    });
}

export async function clearInAppNotificationsStoreAsync(recipientEmail?: string, tenantId?: string): Promise<InAppNotificationRecord[]> {
    try {
        let query = supabase.from('in_app_notifications').delete().or('is_read.eq.true,read.eq.true');
        if (recipientEmail) {
            query = query.eq('recipient_email', recipientEmail.toLowerCase());
        }
        if (tenantId) {
            query = query.eq('tenant_id', tenantId);
        }
        await query;
    } catch (e) {
        console.warn("[InAppNotificationModule] Supabase clear error:", e);
    }

    inMemoryNotifications = inMemoryNotifications.filter(n => {
        const matchTenant = !tenantId || !n.tenantId || n.tenantId === tenantId;
        const matchEmail = !recipientEmail || !n.recipientEmail || n.recipientEmail === recipientEmail.toLowerCase();
        if (matchTenant && matchEmail && (n.read || n.is_read)) {
            return false;
        }
        return true;
    });
    persistNotifications();
    return inMemoryNotifications;
}

export function clearInAppNotificationsStore(recipientEmail?: string, tenantId?: string): InAppNotificationRecord[] {
    clearInAppNotificationsStoreAsync(recipientEmail, tenantId).catch(e => console.warn("Clear notifications async error:", e));
    return inMemoryNotifications.filter(n => !n.read);
}

export async function deleteInAppNotificationStoreAsync(id: string): Promise<InAppNotificationRecord[]> {
    try {
        await supabase.from('in_app_notifications').delete().eq('id', id);
    } catch (e) {
        console.warn("[InAppNotificationModule] Supabase delete notification error:", e);
    }
    inMemoryNotifications = inMemoryNotifications.filter(n => n.id !== id);
    persistNotifications();
    return inMemoryNotifications;
}

export function deleteInAppNotificationStore(id: string): InAppNotificationRecord[] {
    deleteInAppNotificationStoreAsync(id).catch(e => console.warn("Delete notification async error:", e));
    inMemoryNotifications = inMemoryNotifications.filter(n => n.id !== id);
    return inMemoryNotifications;
}

export async function broadcastSystemAnnouncementStoreAsync(title: string, message: string, category: string = 'announcement'): Promise<{ count: number }> {
    await createInAppNotificationRecordAsync({
        title,
        message,
        category,
        type: 'info'
    });
    return { count: 1 };
}

export function broadcastSystemAnnouncementStore(title: string, message: string, category: string = 'announcement'): { count: number } {
    broadcastSystemAnnouncementStoreAsync(title, message, category).catch(e => console.warn("Announcement async error:", e));
    return { count: 1 };
}
