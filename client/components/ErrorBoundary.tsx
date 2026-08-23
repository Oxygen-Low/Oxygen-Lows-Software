import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  isChunkLoadError: boolean;
}

function isChunkError(error: Error | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  const name = (error.name || "").toLowerCase();
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("chunkloaderror") ||
    msg.includes("mime type") ||
    msg.includes("expected a javascript-or-wasm module script") ||
    name.includes("chunkloaderror")
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      isChunkLoadError: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      isChunkLoadError: isChunkError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
          <div className="bg-destructive/10 text-destructive p-4 rounded-full mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">
            {this.state.isChunkLoadError
              ? "New Version Available"
              : "Something went wrong"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-6">
            {this.state.isChunkLoadError
              ? "A new version of the app was deployed. Please reload the page to load the latest components."
              : this.state.error?.message ||
                "An unexpected error occurred while loading this view."}
          </p>
          <Button
            onClick={this.handleReload}
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Page
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
