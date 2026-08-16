import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: { default: "Torneo di Bocce", template: "%s · Torneo di Bocce" },
  description: "Edizione corrente, tabellone, risultati e archivio del Torneo di Bocce.",
  applicationName: "Torneo di Bocce",
  appleWebApp: { capable: true, statusBarStyle: "default" as const, title: "Torneo di Bocce" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="it"><body>{children}<Script id="pwa" strategy="afterInteractive">{`if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");`}</Script></body></html>;
}
