import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "genOferta — объединение изменений в Оферту",
  description:
    "AI-агент: собирает изменения из нескольких документов в объединённый файл и обновляет текст публичной оферты «Удобный доступ» с выделением правок.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
