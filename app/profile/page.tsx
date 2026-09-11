"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, Camera, Mail, Lock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { initialsOf } from "@/lib/initials";

function initialsFrom(name: string, email: string) {
  return initialsOf(name, email);
}

function passwordStrength(pw: string): { pct: number; label: string; color: string } {
  if (!pw) return { pct: 0, label: "", color: "var(--text-faint)" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  const pct = Math.min(100, (score / 5) * 100);
  if (pct >= 80) return { pct, label: "Strong", color: "var(--pass)" };
  if (pct >= 50) return { pct, label: "Good", color: "var(--warn)" };
  return { pct: Math.max(pct, 18), label: "Weak", color: "var(--fail)" };
}

export default function ProfilePage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [name, setName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });

  useEffect(() => {
    if (session?.user?.name) {
      setName(session.user.name);
    }
  }, [session]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "New passwords do not match." });
      return;
    }

    setLoading(true);
    setMessage({ type: "", text: "" });

    try {
      const res = await fetch("/api/user/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "Profile updated successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        // Tell next-auth to refresh the session so the new name shows in the top nav
        await update({ name });

        // Redirect back after a short delay
        setTimeout(() => {
          router.back();
        }, 1000);
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to update profile.",
        });
      }
    } catch (err) {
      setMessage({ type: "error", text: "An unexpected error occurred." });
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="flex justify-center p-12">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  const email = session.user?.email || "";
  const initials = initialsFrom(name, email);
  const strength = passwordStrength(newPassword);

  return (
    <form
      onSubmit={handleUpdateProfile}
      className="flex min-h-[600px] w-full flex-col bg-background text-[14px] leading-[1.45] text-text-main antialiased font-sans"
    >
      {/* header — contents share the body's centred column so the title lines
          up with the cards instead of hugging the edge on a wide window */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto w-full max-w-[560px] p-[18px_22px]">
          <div className="text-[18px] font-semibold tracking-[-0.01em]">Profile</div>
          <div className="mt-0.5 text-[13px] text-text-muted">Manage your account and sign-in details</div>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-auto p-[28px_22px]">
        <div className="mx-auto flex max-w-[560px] flex-col gap-[24px]">
          {message.text && (
            <div
              className={`flex items-start gap-3 rounded-[13px] border p-4 text-[13px] font-medium shadow-sm ${
                message.type === "error"
                  ? "border-danger/25 bg-danger-soft text-danger"
                  : "border-success/25 bg-success-soft text-success"
              }`}
            >
              {message.type === "error" ? (
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
              ) : (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
              )}
              <div className="leading-tight">{message.text}</div>
            </div>
          )}

          {/* avatar block */}
          <div className="flex items-center gap-[18px] rounded-[13px] border border-border bg-surface p-[18px_20px] shadow-sm">
            <div className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-primary-soft text-[24px] font-bold text-primary-text">
              {initials}
            </div>
            <div className="flex-1">
              <div className="text-[15px] font-semibold">{name || "Your name"}</div>
              <div className="text-[12.5px] text-text-muted">{email}</div>
            </div>
            <Button type="button" variant="secondary" size="sm" disabled>
              <Camera size={16} /> Change photo
            </Button>
          </div>

          {/* account fields */}
          <div className="flex flex-col gap-[16px] rounded-[13px] border border-border bg-surface p-[20px] shadow-sm">
            <div className="text-[13px] font-semibold">Account</div>
            <div>
              <label className="mb-[7px] block text-[12.5px] text-text-muted">Display name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your full name"
                className="flex h-[42px] w-full items-center rounded-[11px] bg-surface px-[13px] text-[14px] text-text-main outline-none shadow-[inset_0_0_0_1px_var(--border)] transition-shadow focus:shadow-[inset_0_0_0_2px_var(--ring)] placeholder:text-text-faint"
              />
            </div>
            <div>
              <label className="mb-[7px] block text-[12.5px] text-text-muted">Email address</label>
              <div className="flex h-[42px] items-center gap-[9px] rounded-[11px] bg-surface-hover px-[13px] text-[14px] text-text-muted shadow-[inset_0_0_0_1px_var(--border)]">
                <Mail size={18} className="text-text-faint" />
                {email}
                <span className="ml-auto rounded-full bg-success-soft px-[8px] py-[2px] text-[10.5px] font-bold text-success">
                  Verified
                </span>
              </div>
              <p className="mt-[7px] text-[11.5px] text-text-faint">
                Your email is used for login and cannot be changed here.
              </p>
            </div>
          </div>

          {/* change password */}
          <div className="flex flex-col gap-[16px] rounded-[13px] border border-border bg-surface p-[20px] shadow-sm">
            <div>
              <div className="text-[13px] font-semibold">Change password</div>
              <div className="mt-0.5 text-[12px] text-text-faint">
                Use at least 8 characters with a number and a symbol. Leave blank to keep your current password.
              </div>
            </div>
            <div>
              <label className="mb-[7px] block text-[12.5px] text-text-muted">Current password</label>
              <div className="flex h-[42px] items-center gap-[9px] rounded-[11px] bg-surface px-[13px] shadow-[inset_0_0_0_1px_var(--border)] focus-within:shadow-[inset_0_0_0_2px_var(--ring)] transition-shadow">
                <Lock size={18} className="text-text-faint" />
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-full flex-1 bg-transparent text-[14px] text-text-main outline-none placeholder:text-text-faint"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-[12px]">
              <div>
                <label className="mb-[7px] block text-[12.5px] text-text-muted">New password</label>
                <input
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="flex h-[42px] w-full items-center rounded-[11px] bg-surface px-[13px] text-[14px] text-text-main outline-none shadow-[inset_0_0_0_1px_var(--border)] transition-shadow focus:shadow-[inset_0_0_0_2px_var(--ring)] placeholder:text-text-faint"
                />
              </div>
              <div>
                <label className="mb-[7px] block text-[12.5px] text-text-muted">Confirm</label>
                <input
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••"
                  className="flex h-[42px] w-full items-center rounded-[11px] bg-surface px-[13px] text-[14px] text-text-main outline-none shadow-[inset_0_0_0_1px_var(--border)] transition-shadow focus:shadow-[inset_0_0_0_2px_var(--ring)] placeholder:text-text-faint"
                />
              </div>
            </div>
            {newPassword && (
              <div className="flex items-center gap-[8px]">
                <div className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-surface-hover">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${strength.pct}%`, background: strength.color }}
                  ></div>
                </div>
                <span className="text-[11.5px] font-semibold" style={{ color: strength.color }}>
                  {strength.label}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* sticky footer — same centred column, so the buttons sit under the
          cards rather than out at the window edge */}
      <div className="border-t border-border bg-surface">
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-end gap-[9px] p-[13px_22px]">
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={loading}
            className="h-[40px] rounded-[10px] px-[18px] text-[14px] text-white shadow-sm"
            style={{ background: "var(--primary)" }}
          >
            {loading ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
