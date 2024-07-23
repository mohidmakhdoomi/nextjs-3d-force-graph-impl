import type {Metadata} from "next";
import {GeistSans} from "geist/font/sans";
import "./globals.css";
import React from 'react';

export const metadata: Metadata = {
    title: "Next.js + react-force-graph",
    description: "Next.js App Router + react-force-graph-3d + Three.js",
};

export default function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={GeistSans.className}>
        <body>{children}</body>
        </html>
    );
}