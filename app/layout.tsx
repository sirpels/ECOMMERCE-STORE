import type { Metadata } from "next";
import { SiteFooter } from "@/app/components/site-footer";
import { SiteHeader } from "@/app/components/site-header";
import "./globals.css";

export const metadata: Metadata = { title: { default: "Atelier Placeholder", template: "%s | Atelier Placeholder" }, description: "Initial storefront skeleton for a fashion business." };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body><SiteHeader /><main className="site-main">{children}</main><SiteFooter /></body></html>;
}
