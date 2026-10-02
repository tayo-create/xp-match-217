import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/xp/AppShell";
import { ErrorBoundary } from "@/components/xp/ErrorBoundary";
import { FeedbackDialog, FeedbackProvider } from "@/components/xp/FeedbackDialog";
import { RateSheet } from "@/components/xp/list/RateSheet";
import { AuthProvider, useAuth } from "@/providers/AuthProvider";
import { CollabProvider } from "@/providers/CollabProvider";
import { ConciergeProvider } from "@/providers/ConciergeProvider";
import { ListProvider } from "@/providers/ListProvider";
import { ProfileProvider, useProfile } from "@/providers/ProfileProvider";
import { ReviewsProvider } from "@/providers/ReviewsProvider";
import { SharesProvider } from "@/providers/SharesProvider";
import { SocialProvider } from "@/providers/SocialProvider";
import { SyncProvider, useSync } from "@/providers/SyncProvider";
import { TripsProvider } from "@/providers/TripsProvider";

import AuthCallback from "./pages/AuthCallback";
import Concierge from "./pages/Concierge";
import NotFound from "./pages/NotFound";
import Onboarding from "./pages/Onboarding";

// Secondary screens load on demand so the concierge opens fast.
const Beta = lazy(() => import("./pages/Beta"));
const Discover = lazy(() => import("./pages/Discover"));
const Feed = lazy(() => import("./pages/Feed"));
const JoinTrip = lazy(() => import("./pages/JoinTrip"));
const Legal = lazy(() => import("./pages/Legal"));
const List = lazy(() => import("./pages/List"));
const Messages = lazy(() => import("./pages/Messages"));
const Reviews = lazy(() => import("./pages/Reviews"));
const SharedTrip = lazy(() => import("./pages/SharedTrip"));
const TravelerDetail = lazy(() => import("./pages/TravelerDetail"));
const Travelers = lazy(() => import("./pages/Travelers"));
const TripDetail = lazy(() => import("./pages/TripDetail"));
const Trips = lazy(() => import("./pages/Trips"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Home() {
  const { needsOnboarding } = useProfile();
  const { user } = useAuth();
  const { isReady } = useSync();
  // Signed-out visitors get the sign-in gate; a new account builds its Taste Profile once its cloud data has loaded.
  if (user && isReady && needsOnboarding) return <Navigate to="/welcome" replace />;
  return <Concierge />;
}

const PageLoader = () => (
  <div className="grid min-h-[60vh] place-items-center">
    <Loader2 className="size-7 animate-spin text-muted-foreground" aria-label="Loading" />
  </div>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <ProfileProvider>
            <TripsProvider>
              <SocialProvider>
                <ReviewsProvider>
                  <ConciergeProvider>
                    <CollabProvider>
                      <SharesProvider>
                        <ListProvider>
                          <FeedbackProvider>
                            <TooltipProvider>
                              <Toaster position="bottom-right" />
                              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                                <RateSheet />
                                <FeedbackDialog />
                                <Suspense fallback={<PageLoader />}>
                                  <Routes>
                                    <Route path="/welcome" element={<Onboarding />} />
                                    <Route path="/s/:id" element={<SharedTrip />} />
                                    <Route path="/join/:roomId" element={<JoinTrip />} />
                                    <Route path="/auth/callback" element={<AuthCallback />} />
                                    <Route path="/privacy" element={<Legal />} />
                                    <Route path="/terms" element={<Legal />} />
                                    <Route element={<AppShell />}>
                                      <Route path="/" element={<Home />} />
                                      <Route path="/c/:id" element={<Concierge />} />
                                      <Route path="/discover" element={<Discover />} />
                                      <Route path="/list" element={<List />} />
                                      <Route path="/feed" element={<Feed />} />
                                      <Route path="/trips" element={<Trips />} />
                                      <Route path="/trips/:id" element={<TripDetail />} />
                                      <Route path="/travelers" element={<Travelers />} />
                                      <Route path="/travelers/:id" element={<TravelerDetail />} />
                                      <Route path="/messages" element={<Messages />} />
                                      <Route path="/messages/:id" element={<Messages />} />
                                      <Route path="/reviews" element={<Reviews />} />
                                      <Route path="/beta" element={<Beta />} />
                                    </Route>
                                    {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                                    <Route path="*" element={<NotFound />} />
                                  </Routes>
                                </Suspense>
                              </BrowserRouter>
                            </TooltipProvider>
                          </FeedbackProvider>
                        </ListProvider>
                      </SharesProvider>
                    </CollabProvider>
                  </ConciergeProvider>
                </ReviewsProvider>
              </SocialProvider>
            </TripsProvider>
          </ProfileProvider>
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
