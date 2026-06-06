import { redirect } from "next/navigation";

// Empires were promoted to a top-level /empires section. Preserve inbound links.
export default function EmpiresLeaderboardRedirect() {
  redirect("/empires");
}
