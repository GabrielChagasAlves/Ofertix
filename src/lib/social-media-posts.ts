import { supabase } from "./supabase";
import { uploadSocialMediaImage, type SocialMediaUpload } from "./social-media";

export type SocialMediaPost = {
  id: string;
  network: "instagram";
  caption: string;
  media_url: string;
  media_path: string | null;
  status: "draft" | "pending_approval" | "approved" | "scheduled" | "published" | "rejected" | "failed";
  scheduled_at: string | null;
  metricool_post_url: string | null;
  external_post_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export async function createInstagramDraft(input: {
  image: File;
  caption: string;
}): Promise<{ post: SocialMediaPost; upload: SocialMediaUpload }> {
  const caption = input.caption.trim();
  if (!input.image) throw new Error("Selecione a arte da publicação.");
  if (!caption) throw new Error("Informe a legenda da publicação.");

  const upload = await uploadSocialMediaImage(input.image, "instagram");
  const { data, error } = await supabase
    .from("social_media_posts")
    .insert({
      network: "instagram",
      caption,
      media_url: upload.public_url,
      media_path: upload.path,
      status: "draft",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message || "A imagem foi enviada, mas não foi possível salvar o rascunho.");
  return { post: data as SocialMediaPost, upload };
}

export async function submitInstagramDraftForApproval(postId: string): Promise<void> {
  const { data, error } = await supabase
    .from("social_media_posts")
    .update({ status: "pending_approval", updated_at: new Date().toISOString() })
    .eq("id", postId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("O rascunho não está mais disponível para envio à aprovação.");
}
