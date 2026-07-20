import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Jupyter Kube Launcher - Deploy JupyterLab to Kubernetes",
  description: "A desktop application for deploying JupyterLab environments to any Kubernetes cluster. Automatic kubeconfig detection, GPU support, Git integration, and custom conda environments.",
  keywords: ["JupyterLab", "Kubernetes", "k8s", "Research Computing", "Data Science", "Machine Learning", "GPU", "Docker", "Conda", "Python"],
  authors: [{ name: "Trevin Lee" }],
  creator: "Trevin Lee",
  openGraph: {
    title: "Jupyter Kube Launcher - Deploy JupyterLab to Kubernetes",
    description: "Deploy JupyterLab environments to any Kubernetes cluster. Automatic configuration, Git integration, and custom environments.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Jupyter Kube Launcher - Deploy JupyterLab to Kubernetes",
    description: "Deploy JupyterLab environments to any Kubernetes cluster.",
  },
  icons: {
    icon: "/jupyter-kube-icon.svg",
    shortcut: "/jupyter-kube-icon.svg",
    apple: "/jupyter-kube-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <Analytics />
      <body
        className={`${inter.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
