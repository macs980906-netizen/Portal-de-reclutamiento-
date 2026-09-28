"use client";

import { useEffect } from "react";
import { captureAttribution } from "@/lib/attribution";

/** Guarda UTM y referrer al llegar (sólo en este dispositivo, sin enviar nada a terceros). */
export function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
  }, []);
  return null;
}
