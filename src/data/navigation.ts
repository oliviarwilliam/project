export type NavLink = { label: string; href: string };

export const mainNav: NavLink[] = [];

export const footerNav: { title: string; links: NavLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/how-it-works" },
      { label: "Dashboard", href: "/dashboard" },
    ],
  },
];
