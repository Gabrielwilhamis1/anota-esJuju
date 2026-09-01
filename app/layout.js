import "./globals.css";

export const metadata = {
  title: "Minhas Anotações",
  description: "Organize seus estudos, tarefas e ideias em um só lugar.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
