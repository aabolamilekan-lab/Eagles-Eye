import Link from "next/link";
import { Wordmark } from "@/components/navigation/Wordmark";

export function SiteFooter({
  sections,
  note,
}: {
  sections: Array<{ heading: string; links: Array<{ label: string; href: string }> }>;
  note?: string;
}) {
  return (
    <footer className="mt-16 sm:mt-24 border-t border-primary-hover bg-primary text-on-primary">
      <div className="shell py-12 sm:py-16 md:py-20">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between md:items-start">
          <div className="flex max-w-sm flex-col gap-3">
            <Wordmark tone="on-primary" />
            <p className="font-ui text-body-sm text-on-primary/85 leading-relaxed">
              {note ?? "Stories worth reading, and a place to publish them."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {sections.map((section) => (
              <nav key={section.heading} aria-label={section.heading}>
                <h2 className="label-micro text-on-primary/75 tracking-wider uppercase font-medium">
                  {section.heading}
                </h2>
                <ul className="mt-4 flex flex-col gap-2">
                  {section.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="inverted-focus inline-flex min-h-11 items-center font-ui text-body-sm text-on-primary/85 underline-offset-4 transition-colors hover:text-on-primary hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-on-primary/15 pt-6 text-on-primary/75 font-ui text-body-xs">
          <p>© {new Date().getFullYear()} Eagles Eye. All rights reserved.</p>
          <a
            href="#main"
            className="inverted-focus inline-flex items-center gap-1.5 text-on-primary/80 transition-colors hover:text-on-primary hover:underline underline-offset-4"
          >
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
