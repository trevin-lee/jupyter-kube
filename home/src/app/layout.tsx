import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "NRP Jupyter Launcher - Deploy JupyterLab to National Research Platform",
  description: "A desktop application designed for the National Research Platform (NRP) Kubernetes cluster. Deploy and manage JupyterLab environments with NRP-optimized configuration.",
  keywords: ["JupyterLab", "National Research Platform", "NRP", "Research Computing", "Kubernetes", "Data Science", "Machine Learning", "Docker", "Conda", "Python"],
  authors: [{ name: "Trevin Lee" }],
  creator: "Trevin Lee",
  openGraph: {
    title: "NRP Jupyter Launcher - Deploy JupyterLab to National Research Platform",
    description: "Deploy JupyterLab environments to the National Research Platform. NRP-optimized configuration, Git integration, and custom environments.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "NRP Jupyter Launcher - Deploy JupyterLab to National Research Platform",
    description: "Deploy JupyterLab environments to the National Research Platform.",
  },
  icons: {
    icon: "/jupyter-kube.png",
    shortcut: "/jupyter-kube.png",
    apple: "/jupyter-kube.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
