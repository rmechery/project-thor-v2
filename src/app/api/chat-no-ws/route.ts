import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationLog } from "../chat/conversationLog";
import { promptTemplate } from "../chat/templates";
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
  streaming: false, // Disable streaming for HTTP responses
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
    const retriever = vectorStore.asRetriever();

    const conversationLog = new ConversationLog(userId);
    await conversationLog.addEntry({ entry: prompt, speaker: "user" });

    const interactionId = await conversationLog.insertAIMessage();

    const pool = new Pool({
      connectionString: process.env.POSTGRES_DB_URL
    });

    const checkpointer = new PostgresSaver(pool);

    const retrieverTool = createRetrieverTool(retriever, {
      name: "iso_context_retriever",
      description: "Searches and returns excerpts from the ISO NE Corpus.",
    });
    const tools = [retrieverTool];

    const agentExecutor = createReactAgent({
      llm: llm,
      tools: tools,
      checkpointSaver: checkpointer,
      messageModifier: promptTemplate
    });

    const threadId = userId;
    const config = { 
      configurable: { thread_id: threadId },
    };

    const result = await agentExecutor.invoke(
      { messages: [{ role: "user", content: prompt }] },
      config
    );

    // Update the conversation log with the AI's response
    await supabaseAuthedClient
      .from("conversations")
      .update({ entry: result.generations[0][0].text })
      .eq("id", interactionId);

    return result.generations[0][0].text;
  } catch (error) {
    console.error(error);
    throw new Error("Error processing request");
  }
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

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
  try {
    const response = await handleRequest({
      prompt,
      userId: data.user.id,
      supabaseAuthedClient: supabase,
    });
    return NextResponse.json({ response });
  } catch (error) {
    return NextResponse.json(
      {
        error: "processing_error",
        description: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
