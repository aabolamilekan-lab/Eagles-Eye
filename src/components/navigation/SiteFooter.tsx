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
    <footer className="mt-(--spacing-section) border-t border-primary-hover bg-primary">
      <div className="shell flex flex-col gap-10 py-12 md:flex-row md:justify-between">
        <div className="flex max-w-xs flex-col gap-3">
          <Wordmark tone="on-primary" />
          <p className="font-ui text-body-sm text-on-primary">
            {note ?? "Stories worth reading, and a place to publish them."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {sections.map((section) => (
            <nav key={section.heading} aria-label={section.heading}>
              <h2 className="label-micro text-on-primary/75">{section.heading}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inverted-focus inline-flex min-h-11 items-center font-ui text-body-sm text-on-primary underline-offset-2 transition-colors hover:underline"
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
    </footer>
  );
}
