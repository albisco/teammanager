export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        colorScheme: "light",
        // Force light-mode CSS variables regardless of OS/browser dark mode
        // or any .dark class on ancestor elements
        ["--background" as string]: "0 0% 100%",
        ["--foreground" as string]: "222.2 84% 4.9%",
        ["--card" as string]: "0 0% 100%",
        ["--card-foreground" as string]: "222.2 84% 4.9%",
        ["--popover" as string]: "0 0% 100%",
        ["--popover-foreground" as string]: "222.2 84% 4.9%",
        ["--primary" as string]: "222.2 47.4% 11.2%",
        ["--primary-foreground" as string]: "210 40% 98%",
        ["--secondary" as string]: "210 40% 96.1%",
        ["--secondary-foreground" as string]: "222.2 47.4% 11.2%",
        ["--muted" as string]: "210 40% 96.1%",
        ["--muted-foreground" as string]: "215.4 16.3% 46.9%",
        ["--accent" as string]: "210 40% 96.1%",
        ["--accent-foreground" as string]: "222.2 47.4% 11.2%",
        ["--destructive" as string]: "0 84.2% 60.2%",
        ["--destructive-foreground" as string]: "210 40% 98%",
        ["--border" as string]: "214.3 31.8% 91.4%",
        ["--input" as string]: "214.3 31.8% 91.4%",
        ["--ring" as string]: "222.2 84% 4.9%",
      }}
    >
      {children}
    </div>
  );
}
