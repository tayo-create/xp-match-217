import { ArrowLeft } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import { Wordmark } from "@/components/xp/Sidebar";

const UPDATED = "October 2, 2026";
const CONTACT = "hello@xpmatchme.com";

/** Plain-language privacy policy and beta terms. */
export default function Legal() {
  const { pathname } = useLocation();
  const terms = pathname.startsWith("/terms");
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-6 pt-8">
        <Wordmark />
        <nav className="flex gap-4 text-sm font-medium">
          <Link to="/privacy" className={terms ? "text-foreground/60 hover:text-foreground" : "text-primary"}>
            Privacy
          </Link>
          <Link to="/terms" className={terms ? "text-primary" : "text-foreground/60 hover:text-foreground"}>
            Beta terms
          </Link>
        </nav>
      </header>
      <article className="prose prose-neutral mx-auto max-w-3xl px-6 pb-20 pt-10 prose-headings:font-display prose-headings:text-secondary prose-h1:text-5xl prose-h2:mt-10 prose-h2:text-2xl prose-a:text-primary">
        <Link to="/" className="not-prose inline-flex items-center gap-2 text-sm text-foreground/70 hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to XP Match
        </Link>
        {terms ? <Terms /> : <Privacy />}
        <p className="text-sm text-muted-foreground">Last updated {UPDATED}. Questions? Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </article>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="lead">XP Match is built to plan trips around your taste. We keep what we collect small, and you can delete it any time.</p>
      <h2>What stays on your device</h2>
      <p>Your Taste Profile, trips, chats, ratings and list are saved in your browser first. If you never sign in, they never leave this device, except for the requests described below.</p>
      <h2>What we store when you sign in</h2>
      <ul>
        <li><strong>Account:</strong> your name, email and profile photo from Google or Apple.</li>
        <li><strong>Sync:</strong> a copy of your profile, trips, chats and list so they follow you across devices.</li>
        <li><strong>Feed posts:</strong> ratings and trips you share, including their photos, notes, dishes and companions' first names. These are public. Each post also includes a summary of your Taste Profile (travel personality mix, interests and style dials) so other travelers can see how well your tastes match. Turn off "Share to the feed" on a rating to keep it private.</li>
        <li><strong>Directory and messages:</strong> if you're discoverable, your card and taste summary appear to other signed-in travelers. Direct messages are stored so both people can read them.</li>
        <li><strong>Trip rooms:</strong> shared trips and their members.</li>
      </ul>
      <h2>Photos and location</h2>
      <p>When you import from your camera roll, photo locations and times are read inside your browser to rebuild the trip. Photos are only uploaded if you save them to a rating while signed in. "Near me" on the feed asks for your location once and uses it only in your browser to filter posts.</p>
      <h2>Services we use</h2>
      <ul>
        <li>Cloudflare hosts the app and stores synced data.</li>
        <li>OpenStreetMap (Nominatim) looks up place names and addresses for search and photo import.</li>
        <li>An AI model powers the concierge. Your messages and Taste Profile are sent to it to plan trips.</li>
        <li>Booking.com, Viator and Google Maps open when you tap a booking link. We may earn a commission.</li>
      </ul>
      <h2>Beta feedback and crash reports</h2>
      <p>When you send feedback or the app hits an error, we receive the message, the page you were on, your browser type, screen size and app version. Crash reports never include your trips or chats.</p>
      <h2>Deleting your data</h2>
      <p>Open the account menu and choose <em>Delete account</em>. This erases your synced data, directory card, messages and every feed post and photo you shared. "Reset this device" clears what's saved in this browser.</p>
      <p>We don't sell your data or show ads.</p>
    </>
  );
}

function Terms() {
  return (
    <>
      <h1>Beta terms</h1>
      <p className="lead">Thanks for testing XP Match early. A few ground rules while we build.</p>
      <h2>It's a beta</h2>
      <p>Features may change, break or disappear, and data could occasionally be reset. Don't rely on XP Match as your only copy of a trip. Download the PDF of anything important.</p>
      <h2>Recommendations</h2>
      <p>Picks, match scores and AI suggestions are a starting point, not a guarantee. Check opening hours, prices, accessibility and safety yourself before you go.</p>
      <h2>What you post</h2>
      <ul>
        <li>Only share photos and reviews that are yours, and be honest about places you've actually been.</li>
        <li>No harassment, hate, spam, ads or explicit content. Don't post other people's private details.</li>
        <li>You keep ownership of your posts. By sharing them, you let XP Match show them in the app and let other travelers copy trips you share.</li>
        <li>Anyone can report a post. Posts with several reports are hidden until we review them, and we may remove posts or accounts that break these rules.</li>
      </ul>
      <h2>Bookings</h2>
      <p>Booking links go to partner sites. Your booking is with that partner and follows their terms. XP Match may earn a commission at no extra cost to you.</p>
      <h2>Feedback</h2>
      <p>Ideas you send may make it into the product. We appreciate them, and you won't owe or be owed anything for them.</p>
    </>
  );
}
