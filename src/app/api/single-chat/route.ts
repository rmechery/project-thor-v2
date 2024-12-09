// app/api/chat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { promptTemplate } from "../chat/templates";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { createRetrieverTool } from "langchain/tools/retriever";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { supabaseAdminClient } from "@/utils/supabaseAdmin";

// Initialize the models
const llm = new ChatOpenAI({
  streaming: true,
  model: "gpt-4o-mini",
  temperature: 0,
});

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
});

const handleRequest = async ({ prompt }: { prompt: string }) => {
  try {
    const vectorStore = new SupabaseVectorStore(embeddings, {
      client: supabaseAdminClient,
      tableName: "documents",
      queryName: "match_documents_1536",
    });
    const retriever3 = vectorStore.asRetriever();

    const retrieverTool = createRetrieverTool(retriever3, {
      name: "iso_context_retriever",
      description: "Searches and returns excerpts from the ISO NE Corpus.",
    });
    const tools = [retrieverTool];

    const agentExecutor3 = createReactAgent({
      llm: llm,
      tools: tools,
      messageModifier: promptTemplate,
    });

    const threadId3 = 1;
    const config4 = {
      configurable: { thread_id: threadId3 },
    };

    const response = await agentExecutor3.invoke(
      { messages: [{ role: "user", content: prompt }] },
      config4
    );

    // Extract the AI-generated answer
    const aiMessage = response.messages[response.messages.length - 1];

    const answer = aiMessage?.content || "No response generated.";

    // Perform a similarity search to retrieve relevant documents
    const searchResults = await vectorStore.similaritySearch(prompt, 2); // Retrieve top 2 relevant documents

    // Extract the content of the retrieved documents
    const retrievedContexts = searchResults.map((doc) => doc.pageContent);

    return { answer, retrievedContexts };

  } catch (error) {
    console.error(error);
  }
};

export async function POST(req: NextRequest) {
    try {
      const { prompt } = await req.json();
      const result = await handleRequest({ prompt });
      if (!result) {
        return NextResponse.json(
          { error: "Failed to generate a response." },
          { status: 500 }
        );
      }
      const { answer, retrievedContexts } = result;
  
      return NextResponse.json({
        query: prompt,
        response: answer,
        contexts: retrievedContexts,
      });
    } catch (error) {
      console.error("Error in POST handler:", error);
      return NextResponse.json(
        { error: "An unexpected error occurred." },
        { status: 500 }
      );
    }
  }
  

// export async function POST(req: NextRequest) {
//     try {
//       const { prompt } = await req.json();
//       const { answer, retrievedContexts } = await handleRequest({ prompt });
  
//       if (!output) {
//         // Handle the case where handleRequest doesn't return a valid response
//         return NextResponse.json(
//           { error: "Failed to generate a response." },
//           { status: 500 }
//         );
//       }

//       const answer = output.messages[output.messages.length - 1].content;
  
//       return NextResponse.json({
//         query: prompt,
//         response: answer
//       });
//     } catch (error) {
//       console.error("Error in POST handler:", error);
//       return NextResponse.json(
//         { error: "An unexpected error occurred." },
//         { status: 500 }
//       );
//     }
//   }
  
