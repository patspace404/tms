"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { Inter } from "next/font/google";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  AuthShell,
  AuthHeading,
  AuthOutlineButton,
  AuthBanner,
} from "@/components/auth/AuthShell";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

/**
 * Microsoft's brand mark. Inlined rather than fetched: the four squares are
 * four rects, and an external image would be one more thing that can fail on
 * the one page a locked-out user needs to work.
 */
function MicrosoftMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

/** NextAuth sends people back here with ?error=… when a sign-in fails. */
const SSO_ERRORS: Record<string, string> = {
  AccessDenied:
    "Your account is not allowed into this workspace. Ask an administrator for access.",
  OAuthCallback: "Microsoft sign-in did not complete. Please try again.",
  OAuthSignin: "Could not reach Microsoft. Please try again.",
  Configuration: "Single sign-on is not configured. Contact your administrator.",
};

function LoginPageContent() {
  const searchParams = useSearchParams();
  const inviteAccepted = searchParams.get("invite_accepted");
  const errorCode = searchParams.get("error");

  const [loading, setLoading] = useState(false);
  const [msEnabled, setMsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d) => setMsEnabled(!!d?.["azure-ad"]))
      .catch(() => setMsEnabled(false));
  }, []);

  const statRow = (
    <div className="mt-[26px] flex gap-[22px]">
      {[
        ["94.2%", "avg pass rate"],
        ["2,484", "cases tracked"],
        ["11", "active runs"],
      ].map(([value, label]) => (
        <div key={label}>
          <div className="text-[20px] font-semibold tabular-nums text-white">
            {value}
          </div>
          <div className="text-[11px] text-[var(--neutral-400)]">{label}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div className={inter.className}>
      <AuthShell
        headline="Every test cycle, read at a glance."
        subtext="Plan, execute and triage with a precision instrument built for QA teams under pressure."
        brandBottom={statRow}
      >
        {/* The logo artwork has a white ground, so it sits in a white tile —
            deliberate in both themes, and it never punches a hole through the
            counter of the mark the way keying out the white would. */}
        <div className="flex justify-center">
          <div className="flex h-[76px] w-[76px] items-center justify-center rounded-[18px] bg-white shadow-sm ring-1 ring-black/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/socketnine-logo.jpg"
              alt="Socket Nine"
              width={60}
              height={60}
              className="h-[60px] w-[60px] object-contain"
            />
          </div>
        </div>

        <AuthHeading
          title="Welcome back"
          subtitle="Sign in with your Socket Nine Microsoft account."
        />

        <div className="flex flex-col gap-[18px]">
          {inviteAccepted && (
            <AuthBanner variant="success" icon={CheckCircle2}>
              Invitation accepted! You can now sign in.
            </AuthBanner>
          )}

          {errorCode && (
            <AuthBanner variant="danger" icon={AlertCircle}>
              {SSO_ERRORS[errorCode] ?? "Sign-in failed. Please try again."}
            </AuthBanner>
          )}

          {msEnabled === false && (
            <AuthBanner variant="danger" icon={AlertCircle}>
              Single sign-on is unavailable right now. Contact your administrator.
            </AuthBanner>
          )}

          <AuthOutlineButton
            type="button"
            onClick={() => {
              setLoading(true);
              signIn("azure-ad", { callbackUrl: "/" });
            }}
            // Null while the provider list is still loading — don't flash an
            // enabled button that would do nothing if SSO turns out to be off.
            disabled={!msEnabled || loading}
            leadingIcon={MicrosoftMark}
          >
            {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
          </AuthOutlineButton>

          <p className="text-center text-[13px] text-text-muted mt-[-2px]">
            No account?{" "}
            <a
              href="mailto:support@qmaster.app?subject=Workspace%20access%20request"
              className="font-semibold text-primary hover:text-primary-hover transition-colors"
            >
              Request access
            </a>
          </p>
        </div>
      </AuthShell>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background text-text-muted">
          Loading workspace…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
