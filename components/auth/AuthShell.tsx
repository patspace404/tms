"use client";

import React from "react";
import { Radar, ArrowRight, type LucideIcon } from "lucide-react";

/**
 * Two-pane "Instrument" auth layout — graphite brand panel (left) + themed
 * form panel (right). Matches the QMaster visual-language Auth design.
 * Shared by signup, forgot/reset password and invite-accept screens.
 *
 * Login uses `AuthCenteredShell` instead: once it became a single SSO button
 * the split had nothing to balance, and a half-empty pane beside a full one
 * advertises the emptiness rather than framing it.
 */
export function AuthShell({
  headline,
  subtext,
  brandTop,
  brandBottom,
  children,
}: {
  headline: string;
  subtext: string;
  brandTop?: React.ReactNode; // e.g. avatar stack, above the headline
  brandBottom?: React.ReactNode; // e.g. stat row, below the subtext
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen w-full bg-background text-[14px] text-text-main antialiased lg:grid lg:grid-cols-2">
      {/* Brand panel — always graphite */}
      <section className="relative hidden min-h-screen overflow-hidden bg-[var(--neutral-950)] px-[44px] py-[40px] text-white lg:flex lg:flex-col">
        <svg
          className="absolute right-[-120px] top-1/2 -translate-y-1/2 opacity-40"
          width="560"
          height="560"
          viewBox="0 0 560 560"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="280" cy="280" r="90" stroke="var(--blue-500)" strokeWidth="1" />
          <circle cx="280" cy="280" r="150" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".6" />
          <circle cx="280" cy="280" r="220" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".35" />
          <circle cx="280" cy="280" r="290" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".18" />
          <line x1="280" y1="0" x2="280" y2="560" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".2" />
          <line x1="0" y1="280" x2="560" y2="280" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".2" />
          <path d="M280 280 L470 170" stroke="var(--blue-400)" strokeWidth="2" />
          <circle cx="470" cy="170" r="5" fill="var(--blue-400)" />
          <circle cx="370" cy="350" r="3.5" fill="var(--green-400)" />
          <circle cx="200" cy="180" r="3.5" fill="var(--amber-400)" />
        </svg>

        <div className="relative flex items-center gap-[10px]">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
            <Radar size={20} strokeWidth={2.2} />
          </div>
          <span className="text-[17px] font-bold tracking-[-0.01em]">QMaster</span>
        </div>

        <div className="relative mt-auto max-w-[380px]">
          {brandTop}
          <h1 className="max-w-[380px] text-[27px] font-semibold leading-[1.15] tracking-[-0.02em] text-white">
            {headline}
          </h1>
          <p className="mt-[14px] max-w-[360px] text-[14px] leading-[1.6] text-[var(--neutral-400)]">
            {subtext}
          </p>
          {brandBottom}
        </div>
      </section>

      {/* Form panel — follows theme */}
      <section className="flex min-h-screen items-center justify-center bg-surface p-[40px] max-sm:px-6">
        <div className="flex w-full max-w-[340px] flex-col gap-[18px]">
          <div className="flex items-center gap-[10px] lg:hidden">
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-primary text-primary-foreground">
              <Radar size={20} strokeWidth={2.2} />
            </div>
            <span className="text-[17px] font-bold tracking-[-0.01em] text-text-main">
              QMaster
            </span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}


/**
 * Single-surface auth layout: one centred column on the app's own background,
 * with the radar motif behind it as an ambient field rather than a panel.
 *
 * A threshold, not a destination — the reader looks at it for a few seconds and
 * clicks once. So there is no card, no marketing copy and no seam: removing the
 * last box is what makes the page read as one surface instead of two.
 */
export function AuthCenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-[14px] text-text-main antialiased">
      {/* Ambient field. Decorative, so it is hidden from assistive tech and
          never intercepts a click. Light mode needs far less of it than dark
          before it stops being texture and starts being noise.

          The radial mask is the point: without it the rings run straight
          through the heading and the page reads busy rather than calm. Fading
          the centre out leaves texture at the edges and clean paper where the
          words are. */}
      <svg
        style={{
          maskImage:
            "radial-gradient(closest-side, transparent 34%, rgba(0,0,0,0.55) 58%, #000 100%)",
          WebkitMaskImage:
            "radial-gradient(closest-side, transparent 34%, rgba(0,0,0,0.55) 58%, #000 100%)",
        }}
        className="pointer-events-none absolute left-1/2 top-1/2 h-[860px] w-[860px] -translate-x-1/2 -translate-y-1/2 opacity-[0.16] dark:opacity-[0.34]"
        viewBox="0 0 560 560"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="280" cy="280" r="90" stroke="var(--blue-500)" strokeWidth="1" />
        <circle cx="280" cy="280" r="150" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".6" />
        <circle cx="280" cy="280" r="220" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".35" />
        <circle cx="280" cy="280" r="290" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".18" />
        <line x1="280" y1="0" x2="280" y2="560" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".2" />
        <line x1="0" y1="280" x2="560" y2="280" stroke="var(--blue-500)" strokeWidth="1" strokeOpacity=".2" />
        <path d="M280 280 L470 170" stroke="var(--blue-400)" strokeWidth="2" />
        <circle cx="470" cy="170" r="5" fill="var(--blue-400)" />
      </svg>

      <main className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="flex w-full max-w-[352px] flex-col items-center text-center">
          {children}
        </div>
      </main>
    </div>
  );
}

/** Small uppercase eyebrow above a form heading (matches the design). */
export function AuthEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-primary">
      {children}
    </div>
  );
}

/** Heading + optional subtext block for the form panel. */
export function AuthHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-text-main">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-[13.5px] text-text-muted">{subtitle}</p>
      )}
    </div>
  );
}

/** Labeled input with an optional leading icon, styled like the design. */
export function AuthField({
  label,
  icon: Icon,
  rightSlot,
  labelRight,
  className,
  ...input
}: {
  label: string;
  icon?: LucideIcon;
  rightSlot?: React.ReactNode;
  labelRight?: React.ReactNode;
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <div className="mb-[7px] flex items-center justify-between">
        <label className="text-[13px] text-text-muted">{label}</label>
        {labelRight}
      </div>
      <div className="flex h-[44px] items-center gap-[9px] rounded-[11px] bg-surface px-[13px] text-[14px] shadow-[inset_0_0_0_1px_var(--border-color)] transition-shadow focus-within:shadow-[inset_0_0_0_2px_var(--ring)]">
        {Icon && <Icon size={19} className="shrink-0 text-text-faint" />}
        <input
          className={`h-full min-w-0 flex-1 bg-transparent text-[14px] text-text-main outline-none placeholder:text-text-muted ${className || ""}`}
          {...input}
        />
        {rightSlot}
      </div>
    </div>
  );
}

const spinner = (
  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

/**
 * Full-width neutral-ink button — same geometry as the primary and outline
 * buttons, only the fill differs, so the auth surfaces keep one button
 * vocabulary.
 *
 * Ink rather than the blue primary because its only use is "Sign in with
 * Microsoft": the blue would fight the four-colour Microsoft mark sitting
 * inside it, and ink inverts per theme into the two treatments Microsoft
 * actually sanctions — near-black on light, white on dark.
 */
export function AuthInkButton({
  loading,
  loadingText,
  leadingIcon: Leading,
  children,
  ...rest
}: {
  loading?: boolean;
  loadingText?: string;
  leadingIcon?: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="flex h-[46px] w-full items-center justify-center gap-[10px] rounded-[12px] bg-[var(--neutral-950)] px-4 text-[15px] font-semibold text-white shadow-[var(--shadow-sm)] transition-[background-color,box-shadow,transform] duration-150 ease-out hover:bg-[var(--neutral-800)] hover:shadow-[var(--shadow-md)] active:translate-y-px active:shadow-[var(--shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-background)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-[var(--neutral-950)] disabled:hover:shadow-[var(--shadow-sm)] disabled:active:translate-y-0 motion-reduce:transition-none motion-reduce:active:translate-y-0 dark:bg-[var(--neutral-50)] dark:text-[var(--neutral-950)] dark:hover:bg-white dark:disabled:hover:bg-[var(--neutral-50)]"
    >
      {loading ? (
        <>
          {spinner}
          {loadingText || "Please wait"}
        </>
      ) : (
        <>
          {Leading && <Leading size={18} />}
          {children}
        </>
      )}
    </button>
  );
}

/** Full-width primary submit button (44px, matches the design). */
export function AuthPrimaryButton({
  loading,
  loadingText,
  trailingIcon: Trailing = ArrowRight,
  leadingIcon: Leading,
  children,
  ...rest
}: {
  loading?: boolean;
  loadingText?: string;
  trailingIcon?: LucideIcon | null;
  leadingIcon?: LucideIcon;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={loading || rest.disabled}
      className="flex h-[44px] w-full items-center justify-center gap-2 rounded-[11px] bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          {spinner}
          {loadingText || "Please wait"}
        </>
      ) : (
        <>
          {Leading && <Leading size={18} />}
          {children}
          {Trailing && <Trailing size={18} />}
        </>
      )}
    </button>
  );
}

/** Full-width outline button (44px) — secondary auth actions. */
export function AuthOutlineButton({
  leadingIcon: Leading,
  children,
  ...rest
}: {
  /** Any icon that takes a `size` — a Lucide icon, or a brand mark such as
      the Microsoft squares on the login page. */
  leadingIcon?: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className="flex h-[44px] w-full items-center justify-center gap-2 rounded-[11px] border border-border bg-surface px-4 text-[15px] font-semibold text-text-main transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Leading && <Leading size={18} />}
      {children}
    </button>
  );
}

/** Inline banner (error / success / info) inside the form panel. */
export function AuthBanner({
  variant = "info",
  icon: Icon,
  children,
}: {
  variant?: "success" | "danger" | "info";
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  const styles = {
    success: "border-success/25 bg-success-soft text-success-foreground",
    danger: "border-danger/25 bg-danger-soft text-danger-foreground",
    info: "border-primary/20 bg-primary-light text-primary",
  }[variant];
  return (
    <div className={`flex items-start gap-2.5 rounded-[11px] border px-3 py-2.5 text-[13px] font-semibold ${styles}`}>
      {Icon && <Icon size={17} className="mt-0.5 shrink-0" />}
      <div className="leading-snug">{children}</div>
    </div>
  );
}
