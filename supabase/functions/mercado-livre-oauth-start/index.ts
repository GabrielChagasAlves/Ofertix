import { createClient } from "npm:@supabase/supabase-js@2";
const ML_AUTH_URL="https://auth.mercadolivre.com.br/authorization";
const REDIRECT_URI="https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-oauth";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json"}});
function b64(bytes:Uint8Array){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function randomString(n=64){const b=new Uint8Array(n);crypto.getRandomValues(b);return b64(b)}
async function challenge(v:string){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))))}
function admin(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(!raw)throw new Error("SUPABASE_SECRET_KEYS não configurado.");const key=JSON.parse(raw).default;if(!key)throw new Error("Secret key padrão do Supabase não encontrada.");return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{autoRefreshToken:false,persistSession:false}})}
function aalFromVerifiedJwt(authorization: string): string | null {
  try {
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : authorization.trim();
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded.aal === "string" ? decoded.aal : null;
  } catch {
    return null;
  }
}

Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Use POST."},405);
 const authorization=req.headers.get("Authorization");if(!authorization)return json({error:"Sessão administrativa necessária."},401);
 const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!;
 const caller=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{autoRefreshToken:false,persistSession:false}});
 const {data:{user},error:userError}=await caller.auth.getUser();if(userError||!user)return json({error:"Sessão inválida."},401);
 // getUser() above validates the JWT; inspect its signed AAL claim directly.
 if(aalFromVerifiedJwt(authorization)!=="aal2")return json({error:"Confirme o MFA do administrador antes de conectar o Mercado Livre."},403);
 let db;try{db=admin()}catch(e){console.error(e);return json({error:"Configuração interna incompleta."},500)}
 const {data:profile,error:profileError}=await db.from("user_profiles").select("role,is_active").eq("user_id",user.id).maybeSingle();
 if(profileError)return json({error:"Não foi possível validar o perfil administrativo."},500);
 if(profile?.role!=="admin"||!profile.is_active)return json({error:"Apenas administradores ativos podem conectar o Mercado Livre."},403);
 const clientId=Deno.env.get("MERCADO_LIVRE_CLIENT_ID");if(!clientId||!Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET"))return json({error:"Credenciais do Mercado Livre não configuradas."},500);
 const state=randomString(32),verifier=randomString(64),codeChallenge=await challenge(verifier);
 const {error:insertError}=await db.from("marketplace_oauth_states").insert({state,code_verifier:verifier,user_id:user.id,expires_at:new Date(Date.now()+600000).toISOString()});
 if(insertError){console.error("Criar estado OAuth:",insertError);return json({error:"Não foi possível iniciar a conexão OAuth."},500)}
 const authorizationUrl=new URL(ML_AUTH_URL);authorizationUrl.searchParams.set("response_type","code");authorizationUrl.searchParams.set("client_id",clientId);authorizationUrl.searchParams.set("redirect_uri",REDIRECT_URI);authorizationUrl.searchParams.set("state",state);authorizationUrl.searchParams.set("code_challenge",codeChallenge);authorizationUrl.searchParams.set("code_challenge_method","S256");
 return json({authorization_url:authorizationUrl.toString()});
});