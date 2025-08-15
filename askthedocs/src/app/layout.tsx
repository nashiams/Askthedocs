import type { Metadata } from "next";
import { Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { InputProvider } from "./providers/input-context";
import { ChatSessionsProvider } from "./providers/chat-sessions-context";
import { SessionProvider } from "next-auth/react";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });

export const metadata: Metadata = {
  title: "AskTheDocs",
  description: "AI That Actually Reads the Docs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${dmSans.variable} font-sans`}>
         <SessionProvider>
           <ChatSessionsProvider>
             <InputProvider>
               {children}
             </InputProvider>
           </ChatSessionsProvider>
         </SessionProvider>
      </body>
    </html>
  );
}