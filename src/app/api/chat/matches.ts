import { SupabaseClient } from "@supabase/supabase-js";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";

export type Metadata = {
  url: string;
  text: string;
  source: string;
  seq_num: number;
  section: string
  content_type: string;
};

const getMatchesFromEmbeddings = async (
  inquiry: string,
  client: SupabaseClient,
  topK: number
) => {
  const embeddings = new OpenAIEmbeddings();

  const store = new SupabaseVectorStore(embeddings, {
    client,
    tableName: "documents",
    queryName: "match_documents_1536"
  });
  try {
    //const filter = { "content_type": "html" };
    const queryResult = await store.similaritySearch(
      inquiry, 
      topK,
      //filter
    );
    return (
      queryResult.map((match) => ({
        ...match,
        metadata: {
          ...match.metadata,        // keep existing metadata fields
          text: match.pageContent || "",  // add the content into metadata["content"]
        },
      })) || []
    );
  } catch (e) {
    console.log("Error querying embeddings: ", e);
    throw new Error(`Error querying embeddings: ${e}`);
  }
};

export { getMatchesFromEmbeddings };
