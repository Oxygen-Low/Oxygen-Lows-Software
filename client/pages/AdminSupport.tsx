import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Ticket = {
  id: string;
  title: string;
  priority: string;
  type: string;
  status: string;
  created_at: string;
  user: {
    email: string;
  };
  profiles: {
    username: string;
  };
};

export default function AdminSupport() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.access_token) {
      fetchTickets();
    }
  }, [session]);

  const fetchTickets = async () => {
    try {
      const response = await fetch("/api/admin/support/tickets", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tickets. Make sure you are an admin.");
      }

      const data = await response.json();
      setTickets(data.tickets || []);
    } catch (error: any) {
      toast({
        title: "Error fetching tickets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Admin Support Panel</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Support Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Loading tickets...</p>
          ) : tickets.length === 0 ? (
            <p className="text-muted-foreground">No tickets found.</p>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/admin/support/${ticket.id}`)}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-1 mb-2 sm:mb-0">
                    <p className="font-medium">{ticket.title}</p>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>{ticket.type}</span>
                      <span>•</span>
                      <span>{ticket.profiles?.username || ticket.user?.email || "Unknown User"}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant={ticket.priority === "Highest" ? "destructive" : ticket.priority === "High" ? "default" : "secondary"}>
                      {ticket.priority}
                    </Badge>
                    <Badge variant={ticket.status === "Open" ? "default" : "outline"}>
                      {ticket.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
