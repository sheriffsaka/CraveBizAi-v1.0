import React, { useState, useEffect, useMemo, useRef } from 'react';
import Icon from './common/Icon';
import { InAppNotification, NotificationCategory } from '../types';
import { api, supabase } from '../lib/api';
import { playNotificationChime } from '../services/notificationService';

interface NotificationsPageProps {
    userEmail?: string;
    tenantId?: string;
    onNavigate?: (page: string) => void;
}

export const NotificationsPage: React.FC<NotificationsPageProps> = ({ userEmail, tenantId, onNavigate }) => {
    const [notifications, setNotifications] = useState<InAppNotification[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'unread' | 'read'>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(10);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    const prevUnreadRef = useRef<number>(0);

    const fetchNotifications = async (showRefreshState = false) => {
        try {
            if (showRefreshState) setIsRefreshing(true);
            const data = await api.fetchInAppNotifications({ tenantId, recipientEmail: userEmail });
            if (Array.isArray(data)) {
                const formatted = data.map(n => ({
                    ...n,
                    isRead: n.read || n.isRead || n.is_read || false
                }));
                const unreadCount = formatted.filter(n => !n.isRead).length;
                if (unreadCount > prevUnreadRef.current && prevUnreadRef.current !== 0) {
                    playNotificationChime();
                }
                prevUnreadRef.current = unreadCount;
                setNotifications(formatted);
            }
        } catch (err) {
            console.error("Failed to load notifications page data:", err);
        } finally {
            setLoading(false);
            if (showRefreshState) setTimeout(() => setIsRefreshing(false), 500);
        }
    };

    useEffect(() => {
        fetchNotifications();

        // 1. Fallback interval polling every 10 seconds
        const interval = setInterval(() => fetchNotifications(false), 10000);

        // 2. Cross-tab storage event synchronization
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'cravebiz_inapp_notifications_v1') {
                fetchNotifications(false);
            }
        };
        window.addEventListener('storage', handleStorageChange);

        // 3. Custom local notification updated event
        const handleCustomUpdate = () => {
            fetchNotifications(false);
        };
        window.addEventListener('cravebiz_notification_updated', handleCustomUpdate);

        // 4. Supabase Realtime channel subscription
        let channel: any = null;
        try {
            channel = supabase
                .channel('realtime_in_app_notifications_page')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'in_app_notifications' },
                    () => {
                        fetchNotifications(false);
                    }
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('[NotificationsPage] Supabase Realtime connected');
                    }
                });
        } catch (realtimeErr) {
            console.warn('[NotificationsPage] Supabase Realtime setup error:', realtimeErr);
        }

        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('cravebiz_notification_updated', handleCustomUpdate);
            if (channel) {
                try {
                    supabase.removeChannel(channel);
                } catch (e) {
                    // Ignore cleanup error
                }
            }
        };
    }, [userEmail, tenantId]);

    // Filtering logic
    const filteredNotifications = useMemo(() => {
        return notifications.filter(n => {
            // Status filter
            if (statusFilter === 'unread' && n.isRead) return false;
            if (statusFilter === 'read' && !n.isRead) return false;

            // Category filter
            if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchTitle = n.title?.toLowerCase().includes(q);
                const matchMsg = n.message?.toLowerCase().includes(q);
                const matchCategory = n.category?.toLowerCase().includes(q);
                if (!matchTitle && !matchMsg && !matchCategory) return false;
            }

            return true;
        });
    }, [notifications, statusFilter, categoryFilter, searchQuery]);

    // Pagination math
    const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage) || 1;
    const paginatedNotifications = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredNotifications.slice(start, start + itemsPerPage);
    }, [filteredNotifications, currentPage, itemsPerPage]);

    // Handlers
    const handleMarkAsRead = async (id: string) => {
        try {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true, read: true } : n));
            await api.markInAppNotificationRead(id, false);
        } catch (err) {
            console.error("Failed to mark notification read:", err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true, read: true })));
            await api.markInAppNotificationRead(undefined, true);
        } catch (err) {
            console.error("Failed to mark all notifications read:", err);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setNotifications(prev => prev.filter(n => n.id !== id));
            setSelectedIds(prev => prev.filter(i => i !== id));
            await api.deleteInAppNotification(id);
        } catch (err) {
            console.error("Failed to delete notification:", err);
        }
    };

    const handleClearRead = async () => {
        try {
            setNotifications(prev => prev.filter(n => !n.isRead));
            setSelectedIds([]);
            await api.clearInAppNotifications();
        } catch (err) {
            console.error("Failed to clear read notifications:", err);
        }
    };

    const handleToggleSelectAll = () => {
        if (selectedIds.length === paginatedNotifications.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(paginatedNotifications.map(n => n.id));
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        try {
            const idsToDelete = [...selectedIds];
            setNotifications(prev => prev.filter(n => !idsToDelete.includes(n.id)));
            setSelectedIds([]);
            for (const id of idsToDelete) {
                await api.deleteInAppNotification(id);
            }
        } catch (err) {
            console.error("Failed bulk delete:", err);
        }
    };

    const handleBulkMarkRead = async () => {
        if (selectedIds.length === 0) return;
        try {
            const idsToRead = [...selectedIds];
            setNotifications(prev => prev.map(n => idsToRead.includes(n.id) ? { ...n, isRead: true, read: true } : n));
            setSelectedIds([]);
            for (const id of idsToRead) {
                await api.markInAppNotificationRead(id, false);
            }
        } catch (err) {
            console.error("Failed bulk mark read:", err);
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'invoice': return 'invoices';
            case 'receipt': return 'sent';
            case 'document': return 'reports';
            case 'invitation': return 'user';
            case 'password_reset': return 'key';
            case 'email_verification': return 'send';
            case 'ai': return 'sparkles';
            default: return 'bell';
        }
    };

    const getTypeBadge = (type?: string) => {
        switch (type) {
            case 'success':
                return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">Success</span>;
            case 'warning':
                return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-amber-100 text-amber-800 border border-amber-200">Warning</span>;
            case 'error':
                return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-rose-100 text-rose-800 border border-rose-200">Error</span>;
            default:
                return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-sky-100 text-sky-800 border border-sky-200">Info</span>;
        }
    };

    const unreadCount = notifications.filter(n => !n.isRead).length;
    const totalCount = notifications.length;

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <div className="flex items-center space-x-3">
                        <div className="p-3 bg-primary-50 text-primary-600 rounded-xl">
                            <Icon name="bell" className="w-6 h-6" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Notification Center</h1>
                            <p className="text-xs text-gray-500 mt-0.5">Real-time database-driven alerts, reminders, and activity feed</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <button
                        onClick={() => fetchNotifications(true)}
                        disabled={isRefreshing}
                        className="inline-flex items-center space-x-2 px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition-all disabled:opacity-50"
                    >
                        <svg className={`w-4 h-4 text-gray-600 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span>{isRefreshing ? 'Syncing...' : 'Sync Now'}</span>
                    </button>

                    {unreadCount > 0 && (
                        <button
                            onClick={handleMarkAllRead}
                            className="inline-flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-200 rounded-xl transition-all"
                        >
                            <span>Mark All Read</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Stat Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Alerts</p>
                        <p className="text-2xl font-black text-gray-900 mt-1">{totalCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-gray-50 text-gray-600 flex items-center justify-center font-bold text-sm">
                        #
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-rose-500 uppercase tracking-wider">Unread</p>
                        <p className="text-2xl font-black text-rose-600 mt-1">{unreadCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm">
                        {unreadCount > 0 ? unreadCount : 0}
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">Read</p>
                        <p className="text-2xl font-black text-emerald-600 mt-1">{totalCount - unreadCount}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Icon name="check" className="w-5 h-5" />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-primary-600 uppercase tracking-wider">Filtered View</p>
                        <p className="text-2xl font-black text-primary-700 mt-1">{filteredNotifications.length}</p>
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                        <Icon name="search" className="w-5 h-5" />
                    </div>
                </div>
            </div>

            {/* Controls Bar */}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                            <Icon name="search" className="w-4 h-4" />
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            placeholder="Search notifications by title, message, or keyword..."
                            className="w-full pl-10 pr-4 py-2.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-gray-400 hover:text-gray-600"
                            >
                                Clear
                            </button>
                        )}
                    </div>

                    {/* Status Toggle Buttons */}
                    <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-xl shrink-0 text-xs font-semibold">
                        <button
                            onClick={() => { setStatusFilter('all'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            All ({totalCount})
                        </button>
                        <button
                            onClick={() => { setStatusFilter('unread'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'unread' ? 'bg-white text-rose-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            Unread ({unreadCount})
                        </button>
                        <button
                            onClick={() => { setStatusFilter('read'); setCurrentPage(1); }}
                            className={`px-3 py-1.5 rounded-lg transition-all ${statusFilter === 'read' ? 'bg-white text-emerald-600 shadow-sm font-bold' : 'text-gray-500 hover:text-gray-900'}`}
                        >
                            Read ({totalCount - unreadCount})
                        </button>
                    </div>
                </div>

                {/* Categories & Bulk Actions Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-gray-100">
                    <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto no-scrollbar py-1">
                        <span className="text-[11px] font-bold text-gray-400 uppercase mr-1 shrink-0">Category:</span>
                        {[
                            { id: 'all', label: 'All Categories' },
                            { id: 'invoice', label: 'Invoices' },
                            { id: 'receipt', label: 'Receipts' },
                            { id: 'document', label: 'Documents' },
                            { id: 'invitation', label: 'Invitations' },
                            { id: 'password_reset', label: 'Security' },
                            { id: 'email_verification', label: 'Verification' },
                        ].map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => { setCategoryFilter(cat.id); setCurrentPage(1); }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                                    categoryFilter === cat.id
                                        ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                            >
                                {cat.label}
                            </button>
                        ))}
                    </div>

                    {/* Bulk Selection Actions */}
                    <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto text-xs">
                        {selectedIds.length > 0 ? (
                            <>
                                <span className="text-xs font-bold text-gray-600">{selectedIds.length} selected</span>
                                <button
                                    onClick={handleBulkMarkRead}
                                    className="px-2.5 py-1 font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg border border-primary-200"
                                >
                                    Mark Read
                                </button>
                                <button
                                    onClick={handleBulkDelete}
                                    className="px-2.5 py-1 font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200"
                                >
                                    Delete
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleClearRead}
                                className="px-2.5 py-1 font-semibold text-gray-500 hover:text-rose-600 bg-gray-50 hover:bg-rose-50 border border-gray-200 rounded-lg transition-colors"
                            >
                                Clear Read Notifications
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Notifications List / Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-gray-400 space-y-3">
                        <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
                        <p className="text-xs font-medium">Fetching database notifications...</p>
                    </div>
                ) : paginatedNotifications.length === 0 ? (
                    <div className="p-16 text-center text-gray-400 space-y-3">
                        <div className="p-4 bg-gray-50 rounded-2xl w-16 h-16 mx-auto flex items-center justify-center text-gray-300">
                            <Icon name="bell" className="w-8 h-8" />
                        </div>
                        <h3 className="text-sm font-bold text-gray-700">No Notifications Found</h3>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto">
                            {searchQuery || statusFilter !== 'all' || categoryFilter !== 'all'
                                ? 'No alerts match your search query or applied filters. Try adjusting your filter settings.'
                                : 'You are all caught up! System alerts, invoice updates, and document requests will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {/* List Header */}
                        <div className="bg-gray-50/80 px-4 py-3 flex items-center justify-between text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.length === paginatedNotifications.length && paginatedNotifications.length > 0}
                                    onChange={handleToggleSelectAll}
                                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span>Notification Details</span>
                            </div>
                            <div className="hidden sm:flex items-center space-x-6">
                                <span>Category</span>
                                <span>Date & Time</span>
                                <span>Actions</span>
                            </div>
                        </div>

                        {/* List Items */}
                        {paginatedNotifications.map((notif) => {
                            const isSelected = selectedIds.includes(notif.id);
                            const formattedDate = new Date(notif.createdAt || notif.created_at || Date.now()).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                            });

                            return (
                                <div
                                    key={notif.id}
                                    className={`p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-gray-50/80 ${
                                        !notif.isRead ? 'bg-primary-50/20' : 'bg-white'
                                    } ${isSelected ? 'bg-primary-50/40' : ''}`}
                                >
                                    <div className="flex items-start space-x-3 min-w-0 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => handleToggleSelect(notif.id)}
                                            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500 shrink-0"
                                        />

                                        <div className="p-2.5 rounded-xl bg-gray-100 text-gray-600 shrink-0 mt-0.5">
                                            <Icon name={getCategoryIcon(notif.category) as any} className="w-5 h-5" />
                                        </div>

                                        <div className="min-w-0 flex-1 space-y-1">
                                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                                <h4 className={`text-sm ${!notif.isRead ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>
                                                    {notif.title}
                                                </h4>
                                                {getTypeBadge(notif.type)}
                                                {!notif.isRead && (
                                                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" title="Unread" />
                                                )}
                                            </div>

                                            <p className="text-xs text-gray-600 leading-relaxed max-w-2xl">
                                                {notif.message}
                                            </p>

                                            <div className="flex items-center space-x-4 text-[11px] text-gray-400 pt-1 sm:hidden">
                                                <span>{notif.category}</span>
                                                <span>•</span>
                                                <span>{formattedDate}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Desktop Side Details & Actions */}
                                    <div className="flex items-center justify-between sm:justify-end space-x-4 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100">
                                        <div className="hidden sm:flex flex-col text-right text-xs">
                                            <span className="font-semibold text-gray-700 capitalize">{notif.category}</span>
                                            <span className="text-[10px] text-gray-400">{formattedDate}</span>
                                        </div>

                                        <div className="flex items-center space-x-2">
                                            {notif.actionUrl && (
                                                <button
                                                    onClick={() => {
                                                        if (!notif.isRead) handleMarkAsRead(notif.id);
                                                        if (notif.actionUrl?.startsWith('http')) {
                                                            window.open(notif.actionUrl, '_blank');
                                                        } else if (onNavigate && notif.actionUrl) {
                                                            onNavigate(notif.actionUrl);
                                                        }
                                                    }}
                                                    className="px-3 py-1.5 text-xs font-bold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl transition-colors border border-primary-100"
                                                >
                                                    Open Link
                                                </button>
                                            )}

                                            {!notif.isRead ? (
                                                <button
                                                    onClick={() => handleMarkAsRead(notif.id)}
                                                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title="Mark as Read"
                                                >
                                                    <Icon name="check" className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <span className="text-emerald-500 p-1.5" title="Read">
                                                    <Icon name="check" className="w-4 h-4" />
                                                </span>
                                            )}

                                            <button
                                                onClick={() => handleDelete(notif.id)}
                                                className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                                title="Delete Notification"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Pagination Controls */}
                {filteredNotifications.length > 0 && (
                    <div className="p-4 bg-gray-50/80 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
                        <div className="flex items-center space-x-2 text-gray-500">
                            <span>Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredNotifications.length)} of {filteredNotifications.length} items</span>
                            <span>•</span>
                            <span className="flex items-center space-x-1">
                                <span>Per page:</span>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                    className="bg-white border border-gray-200 rounded-lg px-2 py-1 focus:outline-none"
                                >
                                    <option value={10}>10</option>
                                    <option value={20}>20</option>
                                    <option value={50}>50</option>
                                </select>
                            </span>
                        </div>

                        <div className="flex items-center space-x-1">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                                disabled={currentPage === 1}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                            >
                                &larr; Prev
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                                Math.max(0, currentPage - 3),
                                Math.min(totalPages, currentPage + 2)
                            ).map(page => (
                                <button
                                    key={page}
                                    onClick={() => setCurrentPage(page)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                        currentPage === page
                                            ? 'bg-primary-600 text-white shadow-sm'
                                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50'
                                    }`}
                                >
                                    {page}
                                </button>
                            ))}

                            <button
                                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                                disabled={currentPage === totalPages}
                                className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                            >
                                Next &rarr;
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotificationsPage;
