import { redirect } from "next/navigation";

export default function AdsRedirectPage() {
  redirect("/dashboard/trouvetou?tab=ads");
}
