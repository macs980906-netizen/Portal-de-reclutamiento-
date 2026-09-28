import type { Metadata } from "next";
import { LEGAL } from "@/config/legal";
import { SiteHeader } from "@/components/brand";
import { DevBanner } from "@/components/dev-banner";
import { WizardLoader } from "@/components/wizard/wizard-loader";

export const metadata: Metadata = {
  title: "Postulación · Asesores comerciales RiderMex",
  robots: { index: false },
};

export default function PostularPage() {
  return (
    <div className="stage min-h-dvh">
      <DevBanner />
      <SiteHeader cta={false} />
      <main>
        <WizardLoader privacyVersion={LEGAL.noticeVersion} />
      </main>
    </div>
  );
}
