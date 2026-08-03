import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/lib/supabase";

type Ticket = {
  id: string;
  title: string;
  description: string;
  priority: string;
  type: string;
  status: string;
  created_at: string;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string;
  };
};

export default function AdminTicket() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useToast();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session?.access_token && id) {
      fetchTicketData();
    }
  }, [session, id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`admin_ticket_${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch the profile for the sender
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("user_id", newMsg.sender_id)
            .single();

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, profiles: profile || undefined }];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchTicketData = async () => {
    try {
      // Fetch ticket info - we can fetch this via admin API or standard supabase if it doesn't matter,
      // but since RLS blocks it, we MUST fetch it via standard supabase with service key? No, RLS blocks admin unless they use API.
      // Wait, let's fetch tickets list API to get this ticket, or just make an endpoint for single ticket.
      // Actually, I didn't create a GET /tickets/:id endpoint. Let me fetch all and find it, or use the standard supabase?
      // RLS blocks it. I should fetch the ticket from the list.
      const ticketsRes = await fetch(`/api/admin/support/tickets/${id}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!ticketsRes.ok) throw new Error("Failed to fetch ticket");
      const ticketsData = await ticketsRes.json();
      const currentTicket = ticketsData.ticket;

      if (!currentTicket) throw new Error("Ticket not found");
      setTicket(currentTicket);

      const messagesRes = await fetch(
        `/api/admin/support/tickets/${id}/messages`,
        {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        },
      );
      if (!messagesRes.ok) throw new Error("Failed to fetch messages");
      const messagesData = await messagesRes.json();

      setMessages(messagesData.messages || []);
    } catch (error: any) {
      toast({
        title: "Error fetching ticket",
        description: error.message,
        variant: "destructive",
      });
      navigate("/admin/support");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;

    setIsSending(true);
    try {
      const response = await fetch(
        `/api/admin/support/tickets/${id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ message: newMessage }),
        },
      );

      if (!response.ok) throw new Error("Failed to send message");
      const data = await response.json();

      // Get admin profile for instant display
      const { data: profile } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", session?.user?.id)
        .single();

      const newMsg = {
        ...data.message,
        profiles: profile,
      };

      setMessages((prev) => [...prev, newMsg]);
      setNewMessage("");
    } catch (error: any) {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const toggleStatus = async () => {
    if (!ticket) return;
    const newStatus = ticket.status === "Open" ? "Closed" : "Open";
    try {
      const response = await fetch(`/api/admin/support/tickets/${id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) throw new Error("Failed to update status");

      setTicket({ ...ticket, status: newStatus });
      toast({ title: `Ticket marked as ${newStatus}` });
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Loading ticket...
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Ticket not found.
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center space-x-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/support")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
          <div className="flex items-center space-x-2 mt-1">
            <Badge
              variant={
                ticket.priority === "Highest" ? "destructive" : "secondary"
              }
            >
              {ticket.priority}
            </Badge>
            <Badge variant="outline">{ticket.type}</Badge>
            <Badge variant={ticket.status === "Open" ? "default" : "secondary"}>
              {ticket.status}
            </Badge>
          </div>
        </div>
        <Button
          variant={ticket.status === "Open" ? "destructive" : "default"}
          onClick={toggleStatus}
        >
          Mark as {ticket.status === "Open" ? "Closed" : "Open"}
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardHeader className="py-4 border-b">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Description
          </CardTitle>
          <p className="text-sm mt-2 whitespace-pre-wrap">
            {ticket.description || "No description provided."}
          </p>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm my-4">
                No messages yet. Send a message to start the conversation.
              </p>
            ) : (
              messages.map((msg) => {
                const isMine = msg.sender_id === session?.user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div className="flex items-end space-x-2 max-w-[80%]">
                      {!isMine && (
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={msg.profiles?.avatar_url} />
                          <AvatarFallback>
                            {msg.profiles?.username?.[0]?.toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`p-3 rounded-2xl ${
                          isMine
                            ? "bg-primary text-primary-foreground rounded-br-none"
                            : "bg-muted rounded-bl-none"
                        }`}
                      >
                        {!isMine && (
                          <p className="text-xs font-semibold mb-1 opacity-75">
                            {msg.profiles?.username || "User"}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.message}
                        </p>
                        <p className="text-[10px] mt-1 opacity-60 text-right">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t bg-background">
            <form
              onSubmit={handleSendMessage}
              className="flex items-center space-x-2"
            >
              <Input
                placeholder={
                  ticket.status === "Closed"
                    ? "Ticket is closed"
                    : "Type your reply..."
                }
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={isSending || ticket.status === "Closed"}
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={
                  isSending || ticket.status === "Closed" || !newMessage.trim()
                }
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
