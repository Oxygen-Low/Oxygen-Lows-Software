import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabase";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

type Ticket = {
  id: string;
  title: string;
  description: string;
  priority: string;
  type: string;
  status: string;
  created_at: string;
};

export default function Support() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [type, setType] = useState("Suggestion");

  useEffect(() => {
    if (session?.user) {
      fetchTickets();
    }
  }, [session]);

  const fetchTickets = async () => {
    try {
      const { data, error } = await supabase
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error fetching tickets"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !priority || !type) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("support_tickets").insert({
        user_id: session?.user?.id,
        title,
        description,
        priority,
        type,
      });

      if (error) throw error;

      toast({
        title: t("support.ticketCreated", undefined, "Ticket created successfully"),
      });
      setIsDialogOpen(false);
      setTitle("");
      setDescription("");
      setPriority("Medium");
      setType("Suggestion");
      fetchTickets();
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error creating ticket"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t("support.title", undefined, "Support Tickets")}</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>{t("support.createTicket", undefined, "Create Ticket")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{t("support.createTicket", undefined, "Create a Support Ticket")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTicket} className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("support.subject", undefined, "Title")} *</label>
                <Input
                  required
                  placeholder="e.g., File Compressor error"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("support.description", undefined, "Description")}</label>
                <Textarea
                  placeholder="Details of your issue..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("support.priority", undefined, "Priority")} *</label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Highest">Highest (Security)</SelectItem>
                    <SelectItem value="High">{t("support.priorityHigh", undefined, "High")}</SelectItem>
                    <SelectItem value="Medium">{t("support.priorityMedium", undefined, "Medium")}</SelectItem>
                    <SelectItem value="Low">{t("support.priorityLow", undefined, "Low")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("support.type", undefined, "Type")} *</label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Suggestion">{t("support.typeSuggestion", undefined, "Suggestion")}</SelectItem>
                    <SelectItem value="Bug Report">{t("support.typeBug", undefined, "Bug Report")}</SelectItem>
                    <SelectItem value="Security Vulnerability Report">
                      Security Vulnerability
                    </SelectItem>
                    <SelectItem value="User Report">User Report</SelectItem>
                    <SelectItem value="Request">Request</SelectItem>
                    <SelectItem value="Account Deletion Request">
                      Account Deletion Request
                    </SelectItem>
                    <SelectItem value="Other">{t("support.typeOther", undefined, "Other")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t("common.submitting", undefined, "Submitting...") : t("support.createTicket", undefined, "Submit Ticket")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("support.myTickets", undefined, "Your Tickets")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">{t("common.loading", undefined, "Loading tickets...")}</p>
          ) : tickets.length === 0 ? (
            <p className="text-muted-foreground">{t("support.noTickets", undefined, "No tickets found.")}</p>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/support/${ticket.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/support/${ticket.id}`);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  <div className="space-y-1 mb-2 sm:mb-0">
                    <p className="font-medium">{ticket.title}</p>
                    <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                      <span>
                        {new Date(ticket.created_at).toLocaleDateString()}
                      </span>
                      <span>•</span>
                      <span>{ticket.type}</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant={
                        ticket.priority === "Highest"
                          ? "destructive"
                          : ticket.priority === "High"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {ticket.priority}
                    </Badge>
                    <Badge
                      variant={ticket.status === "Open" ? "default" : "outline"}
                    >
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
    </Layout>
  );
}
