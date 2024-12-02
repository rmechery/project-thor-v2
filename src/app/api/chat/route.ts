// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationLog } from "./conversationLog";
import { promptTemplate } from "./templates";
import { createClient } from "@/utils/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrieverTool } from "langchain/tools/retriever";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from 'pg';


const { Pool } = pg;

// Initialize the models
const llm = new ChatOpenAI({
  streaming: true,
  model: "gpt-4o-mini",
  temperature: 0,
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
    await conversationLog.addEntry({ entry: prompt, speaker: "user" });

    const interactionId = await conversationLog.insertAIMessage();

    const pool = new Pool({
      connectionString: process.env.POSTGRES_DB_URL
    });

    const checkpointer = new PostgresSaver(pool);

    const retrieverTool = createRetrieverTool(retriever3, {
      name: "iso_context_retriever",
      description: "Searches and returns excerpts from the ISO NE Corpus.",
    });
    const tools = [retrieverTool];

    const agentExecutor3 = createReactAgent({
      llm: llm,
      tools: tools,
      checkpointSaver: checkpointer,
      messageModifier: promptTemplate
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
          handleLLMNewToken: async (token: unknown) => {
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
          handleLLMEnd: async (result: { generations: { text: unknown; }[][]; }) => {
              await supabaseAuthedClient
                .from("conversations")
                .update({ entry: result.generations[0][0].text })
                .eq("id", interactionId);
              await channel.send({
                type: "broadcast",
                event: "chat",
                payload: {
                  event: "responseEnd",
                  token: result.generations[0][0].text,
                  interactionId,
                },
              });
          },
        };

        const threadId3 = userId; //old was`conversationId` but didn't work
        const config4 = { 
          configurable: { thread_id: threadId3 },
          callbacks: [customHandler],
        };

        await agentExecutor3.invoke(
          { messages: [{ role: "user", content: prompt }] },
          config4
        );
      }
    });
  } catch (error) {
    console.error(error);
  }
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {data, error} = await supabase.auth.getUser();

  if (error || !data?.user) {
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
    userId: data.user.id,
    supabaseAuthedClient: supabase,
  });
  return NextResponse.json({ message: "started" });
}
