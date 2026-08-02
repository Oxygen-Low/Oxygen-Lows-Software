import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

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

export default function SupportTicket() {
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
    if (session?.user && id) {
      fetchTicketData();
    }
  }, [session, id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!id) return;
    
    const channel = supabase
      .channel(`user_ticket_${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_messages',
          filter: `ticket_id=eq.${id}`,
        },
        async (payload) => {
          const newMsg = payload.new as Message;
          // Fetch the profile for the sender
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('user_id', newMsg.sender_id)
            .single();

          setMessages((prev) => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, { ...newMsg, profiles: profile || undefined }];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchTicketData = async () => {
    try {
      const [ticketRes, messagesRes] = await Promise.all([
        supabase.from("support_tickets").select("*").eq("id", id).single(),
        supabase
          .from("support_messages")
          .select(`*, profiles:sender_id(username, avatar_url)`)
          .eq("ticket_id", id)
          .order("created_at", { ascending: true }),
      ]);

      if (ticketRes.error) throw ticketRes.error;
      if (messagesRes.error) throw messagesRes.error;

      setTicket(ticketRes.data);
      setMessages(messagesRes.data || []);
    } catch (error: any) {
      toast({
        title: "Error fetching ticket",
        description: error.message,
        variant: "destructive",
      });
      navigate("/support");
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !id) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase
        .from("support_messages")
        .insert({
          ticket_id: id,
          sender_id: session?.user?.id,
          message: newMessage,
        })
        .select(`*, profiles:sender_id(username, avatar_url)`)
        .single();

      if (error) throw error;

      setMessages((prev) => [...prev, data]);
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

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading ticket...</div>;
  }

  if (!ticket) {
    return <div className="p-8 text-center text-muted-foreground">Ticket not found.</div>;
  }

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/support")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{ticket.title}</h1>
          <div className="flex items-center space-x-2 mt-1">
            <Badge variant={ticket.priority === "Highest" ? "destructive" : "secondary"}>
              {ticket.priority}
            </Badge>
            <Badge variant="outline">{ticket.type}</Badge>
            <Badge variant={ticket.status === "Open" ? "default" : "secondary"}>
              {ticket.status}
            </Badge>
          </div>
        </div>
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
                            {msg.profiles?.username?.[0]?.toUpperCase() || "A"}
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
                            {msg.profiles?.username || "Admin"}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
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
                    : "Type your message..."
                }
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                disabled={isSending || ticket.status === "Closed"}
                className="flex-1"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isSending || ticket.status === "Closed" || !newMessage.trim()}
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
