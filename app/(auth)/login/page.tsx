"use client";

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import {
  AuthBanner,
  AuthCenteredShell,
  AuthInkButton,
} from "@/components/auth/AuthShell";

/**
 * Microsoft's brand mark. Inlined rather than fetched: it is four rects, and an
 * external image would be one more thing that can fail on the one page a
 * locked-out user needs to work.
 */
function MicrosoftMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true" focusable="false">
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
  // null while the provider list is in flight — an enabled button that would do
  // nothing is worse than a disabled one for the moment it takes to find out.
  const [msEnabled, setMsEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/providers")
      .then((r) => r.json())
      .then((d) => setMsEnabled(!!d?.["azure-ad"]))
      .catch(() => setMsEnabled(false));
  }, []);

  return (
    <AuthCenteredShell>
      {/* The artwork has a white ground, so it sits in a white tile: deliberate
          in either theme, and it never punches a hole through the counter of
          the mark the way keying out the white would. */}
      <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-white shadow-[var(--shadow-float)] ring-1 ring-black/[0.06] dark:ring-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/socketnine-logo.jpg"
          alt="Socket Nine"
          width={56}
          height={56}
          className="h-[56px] w-[56px] object-contain"
        />
      </div>

      <h1 className="mt-[26px] text-balance text-[25px] font-semibold leading-[1.2] tracking-[-0.02em] text-text-main">
        Sign in to QMaster
      </h1>
      <p className="mt-[8px] text-[14px] leading-[1.55] text-text-muted">
        Use your Socket Nine Microsoft account.
      </p>

      {(inviteAccepted || errorCode || msEnabled === false) && (
        <div className="mt-[24px] flex w-full flex-col gap-[10px] text-left">
          {inviteAccepted && (
            <AuthBanner variant="success" icon={CheckCircle2}>
              Invitation accepted. You can sign in now.
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
        </div>
      )}

      <div className="mt-[28px] w-full">
        <AuthInkButton
          type="button"
          onClick={() => {
            setLoading(true);
            signIn("azure-ad", { callbackUrl: "/" });
          }}
          disabled={!msEnabled}
          loading={loading}
          loadingText="Taking you to Microsoft"
          leadingIcon={MicrosoftMark}
        >
          Sign in with Microsoft
        </AuthInkButton>
      </div>

      <p className="mt-[20px] text-[13px] text-text-muted">
        No account?{" "}
        <a
          href="mailto:support@qmaster.app?subject=Workspace%20access%20request"
          className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-background)] rounded-[3px]"
        >
          Request access
        </a>
      </p>
    </AuthCenteredShell>
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
