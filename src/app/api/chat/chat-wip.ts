import { OpenAIEmbeddings, ChatOpenAI } from "@langchain/openai";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { createHistoryAwareRetriever } from "langchain/chains/history_aware_retriever";
import { createStuffDocumentsChain } from "langchain/chains/combine_documents";
import { createRetrievalChain } from "langchain/chains/retrieval";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMessageHistory } from "langchain/stores/message/in_memory";
import { BaseChatMessageHistory } from "@langchain/core/chat_history";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { ConversationLog } from "./conversationLog";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/server";

const embeddings = new OpenAIEmbeddings({
  model: "text-embedding-3-small",
});

// Answer question
const systemPrompt2 =
  "You are an assistant for question-answering tasks. " +
  "Use the following pieces of retrieved context to answer " +
  "the question. If you don't know the answer, say that you " +
  "don't know. Use three sentences maximum and keep the " +
  "answer concise." +
  "\n\n" +
  "{context}";

const qaPrompt2 = ChatPromptTemplate.fromMessages([
  ["system", systemPrompt2],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

// Contextualize question
const contextualizeQSystemPrompt2 =
  "Given a chat history and the latest user question " +
  "which might reference context in the chat history, " +
  "formulate a standalone question which can be understood " +
  "without the chat history. Do NOT answer the question, " +
  "just reformulate it if needed and otherwise return it as is.";

const contextualizeQPrompt2 = ChatPromptTemplate.fromMessages([
  ["system", contextualizeQSystemPrompt2],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

const llm2 = new ChatOpenAI({ model: "gpt-3.5-turbo", temperature: 0 });

const retriever2 = (supabaseAuthedClient: SupabaseClient) =>
  new SupabaseVectorStore(embeddings, {
    client: supabaseAuthedClient,
    tableName: "documents_1536",
    queryName: "match_documents_1536",
  }).asRetriever({
    k: 2,
  });

// Statefully manage chat history
const store2: Record<string, BaseChatMessageHistory> = {};

function getSessionHistory2(sessionId: string): BaseChatMessageHistory {
  if (!(sessionId in store2)) {
    store2[sessionId] = new ChatMessageHistory();
  }
  return store2[sessionId];
}

// Function to add a new message to the chat history
async function addMessageToSessionHistory(
  sessionId: string,
  speaker: 'ai' | 'user',
  entry: string
) {
  const chatHistory = getSessionHistory2(sessionId);
  chatHistory.addMessage({ speaker, text: entry, timestamp: new Date() });
}

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
    const channel = supabaseAuthedClient.channel(userId);
    const { data } = await supabaseAuthedClient
      .from("conversations")
      .insert({ speaker: "ai", user_id: userId })
      .select()
      .single()
      .throwOnError();
    const interactionId = data?.id;

    // Retrieve the conversation log and save the user's prompt
    const conversationLog = new ConversationLog(userId);
    const conversationHistory = await conversationLog.getConversation({
      limit: 10,
    });
    await conversationLog.addEntry({
      entry: prompt,
      speaker: "user",
    });
    for (msg in conversationHistory){
      await addMessageToSessionHistory(userId, 'user', prompt);
    }

    const historyAwareRetriever2 = await createHistoryAwareRetriever({
      llm: llm2,
      retriever: retriever2(supabaseAuthedClient),
      rephrasePrompt: contextualizeQPrompt2,
    });

    const questionAnswerChain3 = await createStuffDocumentsChain({
      llm: llm2,
      prompt: qaPrompt2,
    });

    const ragChain3 = await createRetrievalChain({
      retriever: historyAwareRetriever2,
      combineDocsChain: questionAnswerChain3,
    });

    const conversationalRagChain2 = new RunnableWithMessageHistory({
      runnable: ragChain3,
      getMessageHistory: getSessionHistory2,
      inputMessagesKey: "input",
      historyMessagesKey: "chat_history",
      outputMessagesKey: "answer",
    });

    await conversationalRagChain2.stream(
      { input: prompt },
      { configurable: { sessionId: "unique_session_id" } }
    );
  } catch (error) {
    console.error(error);
    // @ts-expect-error Something
    console.error("Something went wrong with OpenAI: ", error.message);
  }
};

export default async function POST(req: Request): Promise<Response> {
  const supabase = await createClient();

  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return new Response(
      JSON.stringify({
        error: "not_authenticated",
        description:
          "The user does not have an active session or is not authenticated",
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

  // Run queries with RLS on the server
  const { prompt } = await req.json();
  await handleRequest({
    prompt,
    userId: session.user.id,
    supabaseAuthedClient: supabase,
  });
  return new Response(JSON.stringify({ message: "started" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
