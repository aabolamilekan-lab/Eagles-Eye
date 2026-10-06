import type { Metadata } from "next";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { buildTwitter } from "@/lib/seo/twitter";

const description =
  "What Eagles Eye is: a quiet home for long-form stories, for readers and publishers.";

export const metadata: Metadata = {
  title: "About",
  description,
  alternates: { canonical: "/about" },
  openGraph: buildOpenGraph({
    title: "About Eagles Eye",
    description,
    path: "/about",
  }),
  twitter: buildTwitter({ title: "About Eagles Eye", description }),
};

export default function AboutPage() {
  return (
    <div className="shell py-(--spacing-section)">
      <div className="reading-column">
        <p className="label-micro text-primary">About</p>
        <h1 className="mt-3 font-display text-display-lg text-ink text-balance">
          A calm home for long-form stories
        </h1>

        <div className="prose mt-10">
          <p>
            Eagles Eye is a publishing and reading platform for stories that
            deserve room to breathe. It is built around two simple surfaces: a
            catalogue that makes published work easy to find, and a focused desk
            for the people who write and publish it.
          </p>

          <h2>For readers</h2>
          <p>
            Browse the catalogue, search by title or topic, and read chapter by
            chapter with clear navigation between them. Only published stories
            and published chapters are ever visible. Drafts and archived work
            stay out of the catalogue, search, and every public page.
          </p>

          <h2>For publishers</h2>
          <p>
            Administrators write chapters in a rich-text editor, organise
            stories into categories, and control exactly when a story becomes
            public. Rich text is sanitised on the server before it is stored, so
            published work is safe by construction.
          </p>

          <h2>Where it is going</h2>
          <p>
            This build establishes the reading and administration structure. The
            data layer, accounts, and the publisher tooling are the next
            milestones.
          </p>
        </div>
      </div>
    </div>
  );
}
