"use client";

import Head from "next/head";
import { JSX, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import * as timeago from "timeago.js";
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  ConversationHeader,
  TypingIndicator,
  Button,
} from "@chatscope/chat-ui-kit-react";
import { supabaseBrowserClient } from "@/utils/supabaseBrowser";
import { Auth } from "@supabase/auth-ui-react";
import {
  // Import predefined theme
  ThemeSupa,
} from "@supabase/auth-ui-shared";
import { NULL } from "sass";

type ConversationEntry = {
  message: string;
  speaker: "bot" | "user";
  date: Date;
  id?: string;
};

const updateChatbotMessage = (
  conversation: ConversationEntry[],
  message: {
    interactionId: string;
    token: string;
    event: "response" | "responseEnd";
  }
): ConversationEntry[] => {
  const interactionId = message.interactionId;

  const updatedConversation = conversation.reduce(
    (acc: ConversationEntry[], e: ConversationEntry) => [
      ...acc,
      e.id === interactionId
        ? {
            ...e,
            message:
              message.event === "responseEnd"
                ? message.token
                : e.message + message.token,
          }
        : e,
    ],
    []
  );

  return conversation.some((e) => e.id === interactionId)
    ? updatedConversation
    : [
        ...updatedConversation,
        {
          id: interactionId,
          message: message.token,
          speaker: "bot",
          date: new Date(),
        },
      ];
};

async function loadConversationLogs(
  userId: string
): Promise<ConversationEntry[]> {
  try {
    // Fetch conversation logs from Supabase
    const { data, error } = await supabaseBrowserClient
      .from("conversations")
      .select("id, entry, speaker, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Transform data into ConversationEntry type
    const messages: ConversationEntry[] = data.map((entry) => ({
      message: entry.entry ?? "", // Set default to empty string if entry is null
      speaker: entry.speaker === "user" ? "user" : "bot",
      date: new Date(entry.created_at),
      id: entry.id,
    }));

    return messages;
  } catch (error) {
    console.error("Error loading conversation logs:", error);
    return [];
  }
}

export default function Home() {
  const [text, setText] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [botIsTyping, setBotIsTyping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Waiting for query...");
  const [userId, setUserId] = useState<string | undefined>();

  // Function to sign the user out
  const signOut = async () => {
    await supabaseBrowserClient.auth.signOut();
    setConversation([]);
    setUserId(undefined);
  };

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        supabaseBrowserClient.auth.onAuthStateChange((_e, newSession) => {
          setUserId(newSession?.user.id);
        });
      } else {
        setUserId(session?.user.id);
        loadConversationLogs(session.user.id).then(setConversation);
      }
    });
  }, []);

  if (!userId)
    return (
      <Auth
        supabaseClient={supabaseBrowserClient}
        appearance={{ theme: ThemeSupa }}
        providers={[]}
      />
    );

  const channel = supabaseBrowserClient.channel(userId);
  
  channel
    .on("broadcast", { event: "chat" }, ({ payload }) => {
      switch (payload.event) {
        case "response":
          setConversation((state) => updateChatbotMessage(state, payload));
          break;
        case "status":
          setStatusMessage(payload.message);
          break;
        case "responseEnd":
          setConversation((state) => updateChatbotMessage(state, payload));
        default:
          setBotIsTyping(false);
          setStatusMessage("Waiting for query...");
      }
    })
    .subscribe();

  const submit = async () => {
    setConversation((state) => [
      ...state,
      {
        message: text,
        speaker: "user",
        date: new Date(),
      },
    ]);
    try {
      setBotIsTyping(true);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: text }),
      });

      await response.json();
    } catch (error) {
      console.error("Error submitting message:", error);
    }
    setText("");
  };

  const clearConversation = async () => {
    await supabaseBrowserClient
      .from("conversations")
      .delete()
      .eq("user_id", userId)
      .throwOnError();

    setConversation([]);
  };

  return (
    <>
      <Head>
        <title>Team Odin</title>
        <meta name="description" content="Generated by create next app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main>
        <div
          style={{ position: "relative", height: "98vh", overflow: "hidden" }}
        >
          <MainContainer>
            <ChatContainer>
              <ConversationHeader>
                <ConversationHeader.Actions></ConversationHeader.Actions>
                <ConversationHeader.Content
                  userName="ThorGPT"
                  info={statusMessage}
                />
                <ConversationHeader.Actions>
                  <Button
                    style={{ padding: "0.25em" }}
                    onClick={clearConversation}
                    border
                  >
                    Clear Conversation
                  </Button>
                  <Button
                    style={{ padding: "0.25em" }}
                    onClick={signOut}
                    border
                  >
                    Sign Out
                  </Button>
                </ConversationHeader.Actions>
              </ConversationHeader>

              <MessageList
                typingIndicator={
                  botIsTyping ? (
                    <TypingIndicator content="AI is typing" />
                  ) : null
                }
              >
                {conversation.map((entry, index) => {
                  return (
                    <Message
                      key={index}
                      style={{ width: "90%" }}
                      model={{
                        type: "custom",
                        sender: entry.speaker,
                        position: "single",
                        direction:
                          entry.speaker === "bot" ? "incoming" : "outgoing",
                      }}
                    >
                      <Message.CustomContent>
                        <ReactMarkdown
                          remarkPlugins={[remarkMath, rehypeKatex]}
                        >
                          {entry.message}
                        </ReactMarkdown>
                      </Message.CustomContent>
                      <Message.Footer
                        sentTime={timeago.format(entry.date)}
                        sender={entry.speaker === "bot" ? "AI" : "You"}
                      />
                    </Message>
                  );
                })}
              </MessageList>
              <MessageInput
                placeholder="Type message here"
                onSend={submit}
                onChange={(e, text) => {
                  setText(text);
                }}
                sendButton={true}
                autoFocus
              />
            </ChatContainer>
          </MainContainer>
        </div>
      </main>
    </>
  );
}
