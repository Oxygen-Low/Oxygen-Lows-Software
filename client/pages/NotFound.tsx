import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function NotFound() {
    return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-8">Page not found</p>
        <Button asChild>
          <Link to="/">Back</Link>
        </Button>
      </div>
    </div>
  );
}
