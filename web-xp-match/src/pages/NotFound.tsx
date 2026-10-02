import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.warn("404: route not found", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-5xl font-semibold text-secondary">Off the map</h1>
        <p className="mt-3 text-lg text-muted-foreground">This page wandered off. Let's get you back on route.</p>
        <Link to="/" className="press mt-6 inline-flex h-12 items-center rounded-xl bg-primary px-6 font-semibold text-primary-foreground">
          Back to the concierge
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
