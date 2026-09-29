import type { Metadata } from "next";
import { privacyConfig } from "@/config/privacy";
import { SiteHeader } from "@/components/brand";
import { DevBanner } from "@/components/dev-banner";
import { WizardLoader } from "@/components/wizard/wizard-loader";

export const metadata: Metadata = {
  title: "Postulación · Asesores comerciales RiderMex",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default function PostularPage() {
  return (
    <div className="stage min-h-dvh">
      <DevBanner />
      <SiteHeader cta={false} />
      <main>
        <WizardLoader
          privacyVersion={privacyConfig().noticeVersion}
          aiAssisted={(process.env.AI_PROVIDER ?? "none") !== "none"}
          cvMaxMb={Number(process.env.CV_MAX_MB ?? (process.env.DATA_BACKEND === "sheets" ? 4 : 5))}
        />
      </main>
    </div>
  );
}
