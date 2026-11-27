import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, ExternalLink, Inbox, Trash2, X } from 'lucide-react';
import { api } from '../services/api';
import { formatDateTimeIST } from '../utils/format';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export const NotificationBell: React.FC<{ lightTheme?: boolean }> = ({ lightTheme = false }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications?limit=20');
      setNotifications(res.data.items || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch {
      // ignore background poll errors
    }
  };

  useEffect(() => {
    void fetchNotifications();
    const interval = setInterval(() => {
      void fetchNotifications();
    }, 20000); // 20s auto-poll for new customer enquiries
    return () => clearInterval(interval);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleMarkAsRead = async (id: string, link?: string | null) => {
    try {
      await api.post(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
    setOpen(false);
    if (link) {
      navigate(link.startsWith('/admin') ? link : `/admin${link.startsWith('/') ? link : `/${link}`}`);
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = async () => {
    setLoading(true);
    try {
      await api.post('/notifications/clear-all');
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSingle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    try {
      const res = await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (typeof res.data?.unread_count === 'number') {
        setUnreadCount(res.data.unread_count);
      } else if (target && !target.is_read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Admin Notifications"
        aria-label="Admin Notifications"
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors cursor-pointer ${
          lightTheme
            ? 'border border-[#E3E8F0] bg-white text-slate-600 hover:bg-slate-50 hover:text-[#0752A5]'
            : 'bg-white/10 text-white hover:bg-white/20 active:bg-white/30'
        }`}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 sm:w-96 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-100 text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  className="flex items-center gap-1 text-[11px] font-semibold text-[#0752A5] hover:underline cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck className="w-3 h-3" />
                  <span>Mark read</span>
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={loading}
                  className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
                  title="Clear all notifications"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear All</span>
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
                <Inbox className="w-8 h-8 mb-1.5 opacity-50" />
                <p className="text-xs font-semibold">No notifications yet</p>
                <p className="text-[10px] text-slate-400">Customer booking enquiries will appear here</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleMarkAsRead(n.id, n.link)}
                  className={`group relative flex items-start gap-3 p-3 transition-colors cursor-pointer rounded-xl ${
                    n.is_read ? 'hover:bg-slate-50' : 'bg-blue-50/60 hover:bg-blue-50'
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      n.is_read ? 'bg-slate-100 text-slate-500' : 'bg-[#0752A5] text-white shadow-xs'
                    }`}
                  >
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`truncate text-xs ${n.is_read ? 'font-medium text-slate-700' : 'font-bold text-[#172033]'}`}>
                        {n.title}
                      </p>
                      {!n.is_read && <span className="h-2 w-2 rounded-full bg-blue-600 shrink-0" />}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600 line-clamp-2 leading-relaxed">{n.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {n.created_at ? formatDateTimeIST(n.created_at) : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSingle(e, n.id)}
                    title="Dismiss notification"
                    className="absolute right-2 top-2 p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-200/60 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-slate-100 p-1.5 text-center">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate('/enquiries');
              }}
              className="w-full py-1.5 text-[11px] font-bold text-[#0752A5] hover:bg-slate-50 rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              <span>View All Booking Enquiries</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
