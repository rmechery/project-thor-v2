// // app/api/chat/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/server";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ConversationLog } from "./conversationLog";
import { Metadata, getMatchesFromEmbeddings } from "./matches";
import { templates } from "./templates-old";

const parser = new StringOutputParser();

// Initialize the models
const streamingModel = new ChatOpenAI({
  streaming: true,
  model: "gpt-3.5-turbo",
  temperature: 0.7,
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return Response.json(
        {
          error: "not_authenticated",
          description:
            "The user does not have an active session or is not authenticated",
        },
        { status: 401 }
      );
    }

    const { prompt } = await req.json();
    const userId = session.user.id;
    const channel = supabase.channel(userId);

    // Get conversation history
    const conversationLog = new ConversationLog(userId);
    const conversationHistory = await conversationLog.getConversation({
      limit: 10,
    });
    await conversationLog.addEntry({ entry: prompt, speaker: "user" });

    const inquiryPromptSystemTemplate =
      "Given a chat history and the latest user question " +
      "which might reference context in the chat history, " +
      "formulate a standalone question which can be understood " +
      "without the chat history. Do NOT answer the question, " +
      "just reformulate it if needed and otherwise return it as is.";

    // Update chain creation for LangChain v3
    const inquiryPrompt = new ChatPromptTemplate({
      inputVariables: ["userPrompt", "conversationHistory"],
      template: templates.inquiryTemplate,
    });

    const inquiryChain = RunnableSequence.from([inquiryPrompt, streamingModel]);

    const inquiryChainResult = await inquiryChain.invoke({
      userPrompt: prompt,
      conversationHistory,
    });
    const inquiry: string = await parser.invoke(inquiryChainResult);

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

        const matches = await getMatchesFromEmbeddings(inquiry, supabase, 2);

        const urls =
          matches &&
          Array.from(
            new Set(
              matches.map((match) => {
                const metadata = match.metadata as Metadata;
                return metadata.url;
              })
            )
          );

        const docs =
          matches &&
          Array.from(
            matches.reduce((map, match) => {
              const metadata = match.metadata as Metadata;
              const { text, url } = metadata;
              if (!map.has(url)) {
                map.set(url, text);
              }
              return map;
            }, new Map())
          ).map(([_, text]) => text);

        const allDocs = docs.join("\n");
        if (allDocs.length > 4000) {
          await channel.send({
            type: "broadcast",
            event: "chat",
            payload: {
              event: "status",
              message: "Just a second, forming final answer...",
            },
          });
        }

        const responsePrompt = new PromptTemplate({
          inputVariables: [
            "urls",
            "question",
            "summaries",
            "conversationHistory",
          ],
          template: templates.qaTemplate,
        });
        const responseChain = RunnableSequence.from([
          responsePrompt,
          streamingModel,
        ]);

        streamingModel.callbacks = [
          {
            async handleLLMNewToken(token) {
              // Direct handling without channel.send
              await channel.send({
                type: "broadcast",
                event: "chat",
                payload: {
                  event: "response",
                  token,
                },
              });
            },
            async handleLLMEnd(result) {
              // Store answer in DB directly
              const { data } = await supabase
                .from("conversations")
                .insert({
                  speaker: "ai",
                  user_id: userId,
                  entry: result.generations[0][0].text,
                })
                .select()
                .single()
                .throwOnError();
              await channel.send({
                type: "broadcast",
                event: "chat",
                payload: {
                  event: "responseEnd",
                  token: "END",
                },
              });
            },
          },
        ];

        await responseChain.invoke({
          summaries: allDocs,
          question: prompt,
          conversationHistory,
          urls,
        });
        //await streamToResponse(stream, interactionId, channel);
      }
    });

    return NextResponse.json({ message: "started" });
  } catch (error) {
    console.error("Error in chat handler:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// // Initialize the models
// // const baseOpenAI = new OpenAI({
// //   modelName: "gpt-3.5-turbo-0125",
// //   temperature: 0.9
// // });

// const streamingModel = new ChatOpenAI({
//   streaming: true,
//   modelName: "gpt-3.5-turbo",
//   temperature: 0.7
// });

// // Helper to handle streaming
// const streamToResponse = async (
//   stream: ReadableStream,
//   interactionId: string,
//   // eslint-disable-next-line @typescript-eslint/no-explicit-any
//   channel: any
// ) => {
//   const reader = stream.getReader();
//   const decoder = new TextDecoder();
//   let responseText = '';

//   try {
//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) {
//         break;
//       }

//       const token = decoder.decode(value);
//       responseText += token;

//       await channel.send({
//         type: "broadcast",
//         event: "chat",
//         payload: {
//           event: "response",
//           token,
//           interactionId,
//         },
//       });
//     }

//     // Store complete response
//     const supabase = await createClient();
//     await supabase
//       .from("conversations")
//       .update({ entry: responseText })
//       .eq("id", interactionId);

//     await channel.send({
//       type: "broadcast",
//       event: "chat",
//       payload: {
//         event: "responseEnd",
//         token: "END",
//         interactionId,
//       },
//     });

//   } finally {
//     reader.releaseLock();
//   }
// };

// export async function POST(req: Request) {
//   try {
//     const supabase = await createClient();
//     const { data: { session } } = await supabase.auth.getSession();

//     if (!session) {
//       return NextResponse.json(
//         {
//           error: "not_authenticated",
//           description: "The user does not have an active session or is not authenticated",
//         },
//         { status: 401 }
//       );
//     }

//     const { prompt } = await req.json();
//     const userId = session.user.id;
//     const channel = supabase.channel(userId);

//     // Create conversation entry
//     const { data } = await supabase
//       .from("conversations")
//       .insert({ speaker: "ai", user_id: userId })
//       .select()
//       .single();

//     const interactionId = data?.id;

//     // Get conversation history
//     const conversationLog = new ConversationLog(userId);
//     const conversationHistory = await conversationLog.getConversation({
//       limit: 10,
//     });
//     await conversationLog.addEntry({ entry: prompt, speaker: "user" });

//     // Create inquiry chain
//     const inquiryPrompt = PromptTemplate.fromTemplate(templates.inquiryTemplate);
//     const inquiryChain = RunnableSequence.from([
//       inquiryPrompt,
//       streamingModel,
//       new StringOutputParser(),
//     ]);

//     const inquiry = await inquiryChain.invoke({
//       userPrompt: prompt,
//       conversationHistory,
//     });

//     // Set up realtime channel
//     channel.subscribe(async (status) => {
//       if (status === "SUBSCRIBED") {
//         await channel.send({
//           type: "broadcast",
//           event: "chat",
//           payload: {
//             event: "status",
//             message: "Finding matches...",
//           },
//         });

//         // Get relevant matches
//         const matches = await getMatchesFromEmbeddings(
//           inquiry,
//           supabase,
//           2
//         );

//         const urls = matches && Array.from(
//           new Set(
//             matches.map((match) => {
//               const metadata = match.metadata as Metadata;
//               return metadata.url;
//             })
//           )
//         );

//         const docs = matches && Array.from(
//           matches.reduce((map, match) => {
//             const metadata = match.metadata as Metadata;
//             const { text, url } = metadata;
//             if (!map.has(url)) {
//               map.set(url, text);
//             }
//             return map;
//           }, new Map())
//         // eslint-disable-next-line @typescript-eslint/no-unused-vars
//         ).map(([_, text]) => text);

//         const allDocs = docs.join("\n");
//         if (allDocs.length > 4000) {
//           await channel.send({
//             type: "broadcast",
//             event: "chat",
//             payload: {
//               event: "status",
//               message: "Just a second, forming final answer...",
//             },
//           });
//         }

//         // Create response chain
//         const responsePrompt = PromptTemplate.fromTemplate(templates.qaTemplate);
//         const responseChain = RunnableSequence.from([
//           responsePrompt,
//           streamingModel,
//         ]);

//         const stream = await responseChain.stream({
//           summaries: allDocs,
//           question: prompt,
//           conversationHistory,
//           urls,
//         });

//         await streamToResponse(stream, interactionId, channel);
//       }
//     });

//     return NextResponse.json({ message: "started" });

//   } catch (error) {
//     console.error("Error in chat handler:", error);
//     return NextResponse.json(
//       { error: "Internal server error" },
//       { status: 500 }
//     );
//   }
// }
