import { supabase } from "./supabase";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export type SocialMediaUpload = {
  success: true;
  bucket: string;
  path: string;
  public_url: string;
  mime_type: string;
  size_bytes: number;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      if (comma < 0) return reject(new Error("Formato de imagem inválido."));
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Envia a arte aprovada para o bucket público ofertix-social-media.
 * A sessão Supabase atual é enviada automaticamente pelo SDK; a Edge Function
 * valida o JWT e o conteúdo binário antes de armazenar a imagem.
 */
export async function uploadSocialMediaImage(
  file: File,
  folder = "instagram",
): Promise<SocialMediaUpload> {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Formato não permitido. Envie PNG, JPG ou WebP.");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("A imagem deve ter até 10 MB.");
  }

  const image_base64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke("social-media-upload", {
    body: {
      image_base64,
      mime_type: file.type,
      file_name: file.name,
      folder,
    },
  });

  if (error) throw new Error(error.message || "Falha ao enviar a imagem para o Supabase.");
  if (!data?.success || typeof data.public_url !== "string") {
    throw new Error(data?.error || "O Supabase não retornou a URL pública da imagem.");
  }

  return data as SocialMediaUpload;
}
