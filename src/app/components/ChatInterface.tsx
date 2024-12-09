"use client";

import { useContext, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as timeago from "timeago.js";
import {
  MainContainer,
  ChatContainer,
  MessageList,
  MessageInput,
  Message,
  ConversationHeader,
  TypingIndicator,
  Button,
} from "@chatscope/chat-ui-kit-react";
import { supabaseBrowserClient } from "@/utils/supabaseBrowser";
import Error from "next/error";
import { AuthContextType, AuthContext } from "./AuthWrapper";
import "@/styles/globals.scss";


/**
 * Represents a conversation entry.
 *
 * @typedef {Object} ConversationEntry
 * @property {string} message - The message content.
 * @property {"bot" | "user"} speaker - The speaker of the message.
 * @property {Date} date - The date the message was sent.
 * @property {string} [id] - The optional ID of the message.
 */
type ConversationEntry = {
  message: string;
  speaker: "bot" | "user";
  date: Date;
  id?: string;
};

/**
 * Represents a status message from the realtime channel connection.
 *
 * @typedef {Object} ConversationEntry
 * @property {string} interactionId - The supabase channel interaction ID.
 * @property {string} token - The supabase channel streaming token.
 * @property {"response" | "responseEnd"} [event] - The channel event status.
 */
type MessageEntry = {
  interactionId: string;
  token: string;
  event: "response" | "responseEnd";
};

/**
 * Updates the chatbot message in the conversation.
 *
 * @param {ConversationEntry[]} conversation - The current conversation entries.
 * @param {MessageEntry} message - The new message entry to update the conversation with.
 * @returns {ConversationEntry[]} The updated conversation entries.
 *
 * This function updates the message of a specific conversation entry identified by the interactionId
 * from the provided message. If the message event is "responseEnd", it replaces the message token.
 * Otherwise, it appends the message token to the existing message. If the interactionId does not
 * exist in the conversation, it adds a new entry with the provided message token.
 */
const updateChatbotMessage = (
  conversation: ConversationEntry[],
  message: MessageEntry
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

/**
 * Loads conversation logs for a given user from the Supabase database.
 *
 * @param {string} userId - The ID of the user whose conversation logs are to be fetched.
 * @returns {Promise<ConversationEntry[]>} A promise that resolves to an array of conversation entries.
 *
 * @throws Will throw an error if there is an issue fetching the conversation logs from the database.
 */
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


/**
 * ChatInterface component provides a user interface for interacting with a chatbot.
 * It manages the conversation state, handles user input, and displays messages from both the user and the bot.
 *
 * @component
 * @returns {JSX.Element} The rendered ChatInterface component.
 *
 * @example
 * <ChatInterface />
 *
 * @remarks
 * - Uses `useState` to manage the text input, conversation history, bot typing status, and status message.
 * - Uses `useContext` to access the `AuthContext` for user authentication.
 * - Uses `useEffect` to load conversation logs when the user ID changes.
 * - Subscribes to a Supabase channel to receive real-time updates for chat events.
 * - Provides functions to submit user messages, sign out, and clear the conversation.
 */
export default function ChatInterface() {
  const [text, setText] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [botIsTyping, setBotIsTyping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Waiting for query...");
  const { userId, setUserId } = useContext<AuthContextType>(AuthContext);

  useEffect(() => {
    if (typeof window !== "undefined" && userId) {
      loadConversationLogs(userId).then(setConversation);
    }
  }, [userId]);

  const applyContentStyles = useCallback(() => {
    document.querySelectorAll('.cs-message .cs-message__content').forEach((content, idx) => {
      let highlightedStyle = "";
      if(conversation[idx].speaker === "bot") {
        highlightedStyle = 'border: 4px solid #FAB82E';
      } else {
        highlightedStyle = 'border: 4px solid #1999D8';
      }

      content.setAttribute('style', highlightedStyle);
    });
  }, [conversation]);

  useEffect(() => {
    applyContentStyles();
  }, [conversation, applyContentStyles]); 

  if (!userId) {
    return <Error statusCode={404}></Error>;
  }

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
          setBotIsTyping(false);
          break;
        default:
          setBotIsTyping(false);
          setStatusMessage("Waiting for query...");
          break;
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

  // Function to sign the user out
  const signOut = async () => {
    await supabaseBrowserClient.auth.signOut();
    setConversation([]);
    setUserId(undefined);
  };

  const clearConversation = async () => {
    await supabaseBrowserClient
      .from("conversations")
      .delete()
      .eq("user_id", userId)
      .throwOnError();

    await supabaseBrowserClient
      .from("checkpoint_blobs")
      .delete()
      .eq("thread_id", userId)
      .throwOnError();

    await supabaseBrowserClient
      .from("checkpoint_writes")
      .delete()
      .eq("thread_id", userId)
      .throwOnError();

    await supabaseBrowserClient
      .from("checkpoints")
      .delete()
      .eq("thread_id", userId)
      .throwOnError();

    setConversation([]);
  };

  return (
    <div style={{ position: "relative", height: "98vh", overflow: "hidden" }}>
      <MainContainer responsive>
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
              <Button style={{ padding: "0.25em" }} onClick={signOut} border>
                Sign Out
              </Button>
            </ConversationHeader.Actions>
          </ConversationHeader>

          <MessageList
            typingIndicator={
              botIsTyping ? <TypingIndicator content="AI is typing" /> : null
            }
          >
            {conversation.map((entry, index) => {
              return (
                <Message
                  key={index}
                  model={{
                    type: "custom",
                    sender: entry.speaker,
                    position: "single",
                    direction:
                      entry.speaker === "bot" ? "incoming" : "outgoing",
                  }}
                  style={{ 
                    width: "80%",
                    // "border": entry.speaker === "bot" ? "4px solid #FAB82E" : "4px solid #1999D8",
                  }}
                >
                  <Message.CustomContent
                  >
                    <div className="prose w-full max-w-none p-4"
                    style={{
                        fontSize: '1rem',
                        lineHeight: '1rem',
                        padding: '0', // Remove all padding
                        margin: '0', // Optionally, remove all margins as well
                    }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]} className="w-full break-words">
                        {entry.message}
                      </ReactMarkdown>
                    </div>
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
  );
}
