import { createClient } from "@supabase/supabase-js";

let supabase;

/**
 * Returns a singleton instance of the Supabase JS client.
 */
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
  return supabase;
}

/**
 * Upload a PDF buffer to Supabase Storage and returns access URLs.
 * 
 * @param {Buffer} pdfBuffer - The generated PDF binary.
 * @param {string} fileName - Destination filename in the bucket.
 * @returns {Promise<{ publicUrl: string, signedUrl: string }>}
 */
export async function uploadPdf(pdfBuffer, fileName) {
  const client = getSupabaseClient();
  const bucket = process.env.SUPABASE_BUCKET;

  const { error } = await client.storage
    .from(bucket)
    .upload(fileName, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  // Get public URL (works if bucket is public)
  const { data: publicData } = client.storage.from(bucket).getPublicUrl(fileName);

  // Get signed URL (valid for 1 hour, works if bucket is private)
  const { data: signedData, error: signedError } = await client.storage
    .from(bucket)
    .createSignedUrl(fileName, 3600);

  if (signedError) {
    throw new Error(`Failed to generate signed URL: ${signedError.message}`);
  }

  return {
    publicUrl: publicData?.publicUrl ?? null,
    signedUrl: signedData?.signedUrl ?? null,
  };
}

/**
 * Generates a new fresh signed URL for an existing file.
 * @param {string} fileName 
 * @returns {Promise<{ signedUrl: string }>}
 */
export async function getSignedUrl(fileName) {
  const client = getSupabaseClient();
  const bucket = process.env.SUPABASE_BUCKET;

  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(fileName, 3600); // Berlaku 1 jam

  if (error) {
    throw new Error(`Failed to generate signed URL: ${error.message}`);
  }

  return { signedUrl: data?.signedUrl ?? null };
}
