// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationLog } from "./conversationLog";
import { createClient } from "@/utils/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrieverTool } from "langchain/tools/retriever";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { v4 as uuidv4 } from "uuid";

// Initialize the models
const llm = new ChatOpenAI({
  streaming: true,
  model: "gpt-3.5-turbo",
  temperature: 0.7,
});

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
});

const handleRequest = async ({
  prompt,
  userId,
  supabaseAuthedClient,
}: {
  prompt: string;
  userId: string;
  supabaseAuthedClient: SupabaseClient;
}) => {
  try {
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabaseAuthedClient,
      tableName: "documents",
      queryName: "match_documents_1536",
    });
    const retriever3 = vectorStore.asRetriever();

    const channel = supabaseAuthedClient.channel(userId);

    const conversationLog = new ConversationLog(userId);
    // const conversationHistory = await conversationLog.getConversation({
    //   limit: 10,
    // });
    await conversationLog.addEntry({ entry: prompt, speaker: "user" });

    const { data } = await supabaseAuthedClient
      .from("conversations")
      .insert({ speaker: "ai", user_id: userId })
      .select()
      .single()
      .throwOnError();
    const interactionId = data?.id;

    const tool2 = createRetrieverTool(retriever3, {
      name: "iso_context_retriever",
      description: "Searches and returns excerpts from the ISO NE Corpus.",
    });
    const tools2 = [tool2];
    const memory4 = new MemorySaver();

    const agentExecutor3 = createReactAgent({
      llm: llm,
      tools: tools2,
      checkpointSaver: memory4,
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "chat",
          payload: {
            event: "status",
            message: "Finding matches...",
          },
        });

        const customHandler = {
          handleLLMNewToken: async (token) => {
            await channel.send({
              type: "broadcast",
              event: "chat",
              payload: {
                event: "response",
                token,
                interactionId,
              },
            });
          },
          handleLLMEnd: async (result) => {
            await supabaseAuthedClient
                .from("conversations")
                .update({ entry: result.generations[0][0].text })
                .eq("id", interactionId);
              await channel.send({
                type: "broadcast",
                event: "chat",
                payload: {
                  event: "responseEnd",
                  token: "END",
                  interactionId,
                },
              });
          },
        };

        const threadId3 = uuidv4();
        const config4 = { configurable: { thread_id: threadId3 } };

        await agentExecutor3.stream(
          { messages: [{ role: "user", content: prompt }] },
          { configurable: config4, callbacks: [customHandler] }
        );
      }
    });
  } catch (error) {
    console.error(error);
  }
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json(
      {
        error: "not_authenticated",
        description:
          "The user does not have an active session or is not authenticated",
      },
      { status: 401 }
    );
  }

  const { prompt } = await req.json();
  await handleRequest({
    prompt,
    userId: session.user.id,
    supabaseAuthedClient: supabase,
  });
  return NextResponse.json({ message: "started" });
}
