import React, { useState, useEffect, useRef } from 'react';
import Icon from './common/Icon';
import { InAppNotification } from '../types';
import { api } from '../lib/api';
import { playNotificationChime } from '../services/notificationService';

interface NotificationBellProps {
    userEmail?: string;
    tenantId?: string;
    onNavigate?: (page: string) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ userEmail, tenantId, onNavigate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<InAppNotification[]>([]);
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [loading, setLoading] = useState(false);
    const prevCountRef = useRef<number>(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const loadNotifications = async () => {
        try {
            setLoading(true);
            const data = await api.fetchInAppNotifications({ tenantId, recipientEmail: userEmail });
            if (Array.isArray(data)) {
                const unreadCount = data.filter(n => !(n.read || n.isRead)).length;
                if (unreadCount > prevCountRef.current && prevCountRef.current !== 0) {
                    playNotificationChime();
                }
                prevCountRef.current = unreadCount;
                setNotifications(data.map(n => ({ ...n, isRead: n.read || n.isRead })));
            }
        } catch (err) {
            console.error('Failed to load in-app notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadNotifications();
        // Poll every 10 seconds for new in-app notifications
        const interval = setInterval(loadNotifications, 10000);
        return () => clearInterval(interval);
    }, [userEmail, tenantId]);

    // Handle outside click to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    const filteredNotifications = notifications.filter(n => {
        if (filterCategory === 'all') return true;
        if (filterCategory === 'unread') return !n.isRead;
        return n.category === filterCategory;
    });

    const handleMarkAsRead = async (id: string) => {
        try {
            await api.markInAppNotificationRead(id, false);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        } catch (err) {
            console.error('Error marking notification as read:', err);
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await api.markInAppNotificationRead(undefined, true);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        } catch (err) {
            console.error('Error marking all notifications read:', err);
        }
    };

    const handleClearAll = async () => {
        try {
            await api.clearInAppNotifications();
            setNotifications(prev => prev.filter(n => !n.isRead));
        } catch (err) {
            console.error('Error clearing notifications:', err);
        }
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'invoice': return 'document';
            case 'receipt': return 'check';
            case 'document': return 'file-text';
            case 'invitation': return 'user';
            case 'password_reset': return 'key';
            case 'email_verification': return 'mail';
            case 'ai': return 'sparkles';
            case 'credit': return 'credit-card';
            default: return 'bell';
        }
    };

    const getTypeColor = (type?: string) => {
        switch (type) {
            case 'success': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
            case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
            case 'error': return 'text-rose-600 bg-rose-50 border-rose-200';
            default: return 'text-sky-600 bg-sky-50 border-sky-200';
        }
    };

    return (
        <div className="relative shrink-0" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-xl transition-all border border-gray-100 shadow-sm focus:outline-none"
                title="In-App Notifications"
            >
                <Icon name="bell" className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-md animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-auto sm:right-0 sm:mt-2 w-auto sm:w-96 max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                    {/* Header */}
                    <div className="p-4 border-b border-gray-100 bg-gray-50/80 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            <Icon name="bell" className="w-4 h-4 text-primary-600" />
                            <h3 className="text-sm font-bold text-gray-900">Notifications</h3>
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 text-[10px] font-black bg-primary-100 text-primary-700 rounded-full">
                                    {unreadCount} new
                                </span>
                            )}
                        </div>
                        <div className="flex items-center space-x-2 text-xs">
                            {unreadCount > 0 && (
                                <button
                                    onClick={handleMarkAllRead}
                                    className="text-xs text-primary-600 font-semibold hover:underline"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex items-center space-x-1 p-2 bg-gray-50/50 border-b border-gray-100 text-[11px] font-medium overflow-x-auto no-scrollbar">
                        {['all', 'unread', 'invoice', 'receipt', 'document', 'invitation'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilterCategory(cat)}
                                className={`px-2.5 py-1 rounded-lg capitalize whitespace-nowrap transition-colors ${
                                    filterCategory === cat
                                        ? 'bg-white font-bold text-primary-600 shadow-sm border border-gray-100'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                        {filteredNotifications.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                                <Icon name="bell" className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                <p className="text-xs font-medium">No notifications in this view</p>
                            </div>
                        ) : (
                            filteredNotifications.map(n => (
                                <div
                                    key={n.id}
                                    onClick={() => {
                                        if (!n.isRead) handleMarkAsRead(n.id);
                                        if (n.actionUrl) {
                                            if (n.actionUrl.startsWith('http')) {
                                                window.open(n.actionUrl, '_blank');
                                            } else if (onNavigate) {
                                                onNavigate(n.actionUrl);
                                            }
                                        }
                                    }}
                                    className={`p-3.5 transition-colors cursor-pointer hover:bg-gray-50 flex items-start space-x-3 ${
                                        !n.isRead ? 'bg-primary-50/30' : 'bg-white'
                                    }`}
                                >
                                    <div className={`p-2 rounded-xl border shrink-0 ${getTypeColor(n.type)}`}>
                                        <Icon name={getCategoryIcon(n.category) as any} className="w-4 h-4" />
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                            <h4 className={`text-xs ${!n.isRead ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'} truncate`}>
                                                {n.title}
                                            </h4>
                                            <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                                                {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-600 mt-1 line-clamp-2 leading-relaxed">
                                            {n.message}
                                        </p>
                                        {n.actionUrl && (
                                            <span className="inline-flex items-center text-[10px] text-primary-600 font-bold mt-1.5 hover:underline">
                                                View details &rarr;
                                            </span>
                                        )}
                                    </div>

                                    {!n.isRead && (
                                        <div className="w-2 h-2 rounded-full bg-primary-600 shrink-0 mt-1.5" />
                                    )}
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-2.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between px-4">
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                if (onNavigate) onNavigate('notifications');
                            }}
                            className="text-[11px] text-primary-700 hover:text-primary-800 font-bold hover:underline flex items-center space-x-1"
                        >
                            <span>View All Notifications &rarr;</span>
                        </button>
                        <button
                            onClick={handleClearAll}
                            className="text-[10px] text-gray-500 hover:text-rose-600 font-semibold transition-colors"
                        >
                            Clear read
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotificationBell;
