import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, CheckCircle2, Mail, Save, ShieldCheck, UploadCloud, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";

export function Perfil() {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error: authError }) => {
      if (!active) return;
      if (authError || !data.user) {
        setError("Não foi possível carregar os dados da sua conta.");
        return;
      }
      const user = data.user;
      const metadata = user.user_metadata ?? {};
      setUserId(user.id);
      setEmail(user.email ?? "");
      setName(typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : "");
      setAvatarUrl(typeof metadata.avatar_url === "string" ? metadata.avatar_url : typeof metadata.picture === "string" ? metadata.picture : "");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!photo) { setPhotoPreview(""); return; }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function choosePhoto(file?: File) {
    setError("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Escolha uma imagem JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setError("A imagem deve ter no máximo 3 MB.");
      return;
    }
    setPhoto(file);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      let nextAvatarUrl = avatarUrl;
      if (photo) {
        const extension = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
        const path = `${userId}/avatar-${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("ofertix-user-avatars").upload(path, photo, {
          cacheControl: "3600", upsert: true, contentType: photo.type,
        });
        if (uploadError) throw uploadError;
        nextAvatarUrl = supabase.storage.from("ofertix-user-avatars").getPublicUrl(path).data.publicUrl;
      }
      const { error: updateError } = await supabase.auth.updateUser({
        data: { full_name: name.trim(), avatar_url: nextAvatarUrl },
      });
      if (updateError) throw updateError;
      setAvatarUrl(nextAvatarUrl);
      setPhoto(null);
      setSuccess("Seu perfil foi atualizado.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Não foi possível salvar seu perfil.");
    } finally {
      setSaving(false);
    }
  }

  const visibleAvatar = photoPreview || avatarUrl;
  const initial = (name.trim() || email || "U").slice(0, 1).toUpperCase();

  return (
    <div className="page ops-page profile-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">SUA CONTA</p>
          <h1>Meu perfil</h1>
          <p className="page-description">Atualize suas informações e personalize sua identificação no Ofertix.</p>
        </div>
      </header>

      {error && <div className="ops-alert" role="alert">{error}</div>}
      {success && <div className="profile-success"><CheckCircle2 size={17} />{success}</div>}

      <form className="profile-layout" onSubmit={saveProfile}>
        <section className="profile-identity-card">
          <div className="profile-avatar-wrap">
            {visibleAvatar ? <img src={visibleAvatar} alt="Foto de perfil" className="profile-avatar" /> : <span className="profile-avatar profile-avatar-fallback">{initial}</span>}
            <button type="button" className="profile-camera-button" onClick={() => fileRef.current?.click()} aria-label="Alterar foto de perfil">
              <Camera size={17} />
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(event) => choosePhoto(event.target.files?.[0])} />
          </div>
          <h2>{name.trim() || "Seu nome"}</h2>
          <p>{email}</p>
          <button type="button" className="profile-upload-button" onClick={() => fileRef.current?.click()}>
            <UploadCloud size={16} /> Escolher foto
          </button>
          <small>JPG, PNG ou WEBP · até 3 MB</small>
        </section>

        <section className="profile-details-card">
          <div className="profile-section-heading">
            <span className="profile-section-icon"><UserRound size={19} /></span>
            <div><h2>Informações pessoais</h2><p>Esses dados identificam sua conta nas telas do sistema.</p></div>
          </div>
          <label className="profile-field">
            <span>Nome de exibição</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Como deseja ser identificado?" required />
          </label>
          <label className="profile-field">
            <span>E-mail da conta</span>
            <div className="profile-readonly-field"><Mail size={16} /><input value={email} readOnly aria-readonly="true" /><span>Verificado pela autenticação</span></div>
          </label>
          <div className="profile-security-note"><ShieldCheck size={18} /><span>Seu acesso e suas permissões continuam protegidos pelo controle de usuários e pela autenticação do Ofertix.</span></div>
          <div className="profile-form-footer">
            <span>{photo ? "Nova foto selecionada" : "As alterações só serão aplicadas ao salvar."}</span>
            <button className="ops-button ops-button-primary" type="submit" disabled={saving || !userId}>
              <Save size={16} /> {saving ? "Salvando..." : "Salvar perfil"}
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
