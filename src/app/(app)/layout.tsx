import Link from "next/link";
import { Brand } from "@/components/brand";
import { BottomNav, SideNav } from "@/components/layout/app-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { requireProfile } from "@/lib/auth/session";
import { SwRegister } from "@/components/sw-register";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="bg-pitch min-h-dvh">
      {/* Top bar. pt = env(safe-area-inset-top) so the bar clears the iOS
          status bar / notch in standalone PWA mode (black-translucent draws
          content edge-to-edge under the clock). Android reports 0 → no change. */}
      <header
        className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-lg"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/dashboard">
            <Brand />
          </Link>
          <UserMenu
            displayName={profile.displayName}
            username={profile.username}
            avatarUrl={profile.avatarUrl}
          />
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl gap-8 px-4 py-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-20 hidden h-fit w-44 shrink-0 md:block">
          <SideNav />
        </aside>

        {/* Page content; bottom padding leaves room for the mobile tab bar */}
        <main className="min-w-0 flex-1 pb-24 md:pb-6">{children}</main>
      </div>

      <BottomNav />
      <SwRegister />
    </div>
  );
}
