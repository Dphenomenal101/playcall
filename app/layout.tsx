import React from "react"
import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { Geist, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "@/components/ui/toaster"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Playcall | Open-source AI sales coaching OS for GTM teams",
  description: "An open-source AI sales call coach that scores reps against your actual playbook. Upload your methodology and track real adherence.",
  keywords: [
    "Sales Coaching",
    "AI Sales Coach",
    "GTM Teams",
    "Call Scoring",
    "Open Source Sales",
    "Playbook Adherence",
    "Sales Enablement"
  ],
  authors: [{ name: "Phenomenal" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://playcall.dphenomenal.com",
    title: "Playcall | Open-source AI sales coaching OS",
    description: "Score sales calls against your actual playbook using your own AI models. No generic advice, just actionable insights.",
    siteName: "Playcall",
  },
  twitter: {
    card: "summary_large_image",
    title: "Playcall | AI Sales Coaching",
    description: "An open-source AI sales call coach that scores reps against your actual playbook.",
  },
  icons: {
    icon: [
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#050505",
}

import { DemoProvider } from "@/components/demo-provider"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen">
        {process.env.NODE_ENV === 'development' ? (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        ) : null}
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          <DemoProvider>
            {children}
          </DemoProvider>
        </ThemeProvider>
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
