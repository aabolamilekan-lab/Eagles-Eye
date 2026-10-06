import { NotFoundState } from "@/components/ui/EmptyState";

export default function RootNotFound() {
  return (
    <main id="main" className="shell flex flex-1 items-center justify-center py-24">
      <NotFoundState />
    </main>
  );
}
