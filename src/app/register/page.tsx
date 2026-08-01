import { redirect } from "next/navigation";

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = searchParams.next ? `?next=${encodeURIComponent(searchParams.next)}` : "";
  redirect(`/login${next}`);
}
