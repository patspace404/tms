"use client";

import React, { useState, useEffect, useRef } from "react";
import useSWR from "swr";
import {
  Bell,
  Check,
  Circle,
  UserCheck,
  AtSign,
  PlayCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useRouter } from "next/navigation";

// Define the notification type based on Prisma schema
type Notification = {
  id: string;
  type: "ASSIGNMENT" | "MENTION" | "SYSTEM" | "RUN_STARTED" | "RUN_COMPLETED";
  entityId: string | null;
  link: string | null;
  title: string;
  message: string | null;
  isRead: boolean;
  createdAt: string;
  actor: { name: string | null; email: string } | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Poll every 30 seconds
  const { data, mutate } = useSWR<{ notifications: Notification[]; unreadCount: number }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 30000 }
  );

  const unreadCount = data?.unreadCount || 0;
  const notifications = data?.notifications || [];

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    // Optimistic UI update
    mutate(
      (currentData) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          unreadCount: Math.max(0, currentData.unreadCount - 1),
          notifications: currentData.notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
          ),
        };
      },
      false
    );

    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    mutate(); // Revalidate
  };

  const markAllAsRead = async () => {
    mutate(
      (currentData) => {
        if (!currentData) return currentData;
        return {
          ...currentData,
          unreadCount: 0,
          notifications: currentData.notifications.map((n) => ({ ...n, isRead: true })),
        };
      },
      false
    );

    await fetch("/api/notifications", { method: "PATCH" });
    mutate();
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
    setIsOpen(false);
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "Just now";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  const getTypeIcon = (type: Notification["type"]) => {
    switch (type) {
      case "ASSIGNMENT":
        return <UserCheck className="w-4 h-4 text-primary" />;
      case "MENTION":
        return <AtSign className="w-4 h-4 text-amber-500" />;
      case "RUN_STARTED":
        return <PlayCircle className="w-4 h-4 text-blue-500" />;
      case "RUN_COMPLETED":
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      default:
        return <Info className="w-4 h-4 text-text-muted" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-text-muted hover:text-primary hover:bg-primary-light rounded-[9px] transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-danger rounded-full border-2 border-surface shadow-sm" />
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 qm-panel overflow-hidden z-50 origin-top-right animate-fade-up">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-hover/50">
            <h3 className="font-semibold text-text-main">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-medium text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto custom-scrollbar bg-surface">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-text-muted flex flex-col items-center justify-center">
            <Bell className="w-8 h-8 opacity-25 mb-2" />
                <p className="text-sm">You have no notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-surface-hover cursor-pointer transition-colors group flex gap-3 ${
                      !notification.isRead ? "bg-primary-light/70" : ""
                    }`}
                  >
                    <div className="flex-shrink-0 mt-0.5 relative">
                      <div className="w-7 h-7 rounded-lg bg-surface-2 border border-border/60 flex items-center justify-center">
                        {getTypeIcon(notification.type)}
                      </div>
                      {!notification.isRead && (
                        <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          !notification.isRead ? "font-semibold text-text-main" : "font-medium text-text-muted"
                        }`}
                      >
                        {notification.title}
                      </p>
                      {notification.message && (
                        <p className="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">
                          {notification.message}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[11px] text-text-muted/50 font-medium">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                        {notification.actor?.name && (
                          <>
                            <span className="text-border">•</span>
                            <span className="text-[11px] text-text-muted">{notification.actor.name}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-2 border-t border-border/50 bg-surface-hover/30 text-center">
            <span className="text-xs text-text-muted/50 font-medium tracking-wide uppercase">
              In-App Notifications
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
