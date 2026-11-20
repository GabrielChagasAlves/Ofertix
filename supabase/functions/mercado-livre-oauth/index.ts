import { createClient } from "npm:@supabase/supabase-js@2";
const ML_TOKEN_URL="https://api.mercadolibre.com/oauth/token";
const REDIRECT_URI="https://pndbombvfrxpyqnraqsy.supabase.co/functions/v1/mercado-livre-oauth";
const DEFAULT_APP_URL="https://ofertix-theta.vercel.app";
function redirect(url:string){return new Response(null,{status:302,headers:{Location:url}})}
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json"}})}
function admin(){const raw=Deno.env.get("SUPABASE_SECRET_KEYS");if(!raw)throw new Error("SUPABASE_SECRET_KEYS não configurado.");const key=JSON.parse(raw).default;if(!key)throw new Error("Secret key padrão do Supabase não encontrada.");return createClient(Deno.env.get("SUPABASE_URL")!,key,{auth:{autoRefreshToken:false,persistSession:false}})}
function appRedirect(path:string){return `${DEFAULT_APP_URL}${path}`}
Deno.serve(async(req)=>{
 if(req.method!=="GET")return json({error:"Use GET para o retorno OAuth."},405);
 const u=new URL(req.url),code=u.searchParams.get("code"),state=u.searchParams.get("state"),err=u.searchParams.get("error"),desc=u.searchParams.get("error_description");
 const clientId=Deno.env.get("MERCADO_LIVRE_CLIENT_ID"),clientSecret=Deno.env.get("MERCADO_LIVRE_CLIENT_SECRET");
 if(!clientId||!clientSecret)return json({error:"Credenciais do Mercado Livre não configuradas."},500);
 let db;try{db=admin()}catch(e){console.error(e);return json({error:"Configuração interna do Supabase incompleta."},500)}
 if(err)return redirect(appRedirect(`/configuracoes?mercado_livre=error&message=${encodeURIComponent(desc||err)}`));
 if(!code||!state)return json({message:"Endpoint de retorno OAuth do Ofertix ativo."});
 const {data:st,error:se}=await db.from("marketplace_oauth_states").delete().eq("state",state).select("id,code_verifier,expires_at,user_id").maybeSingle();
 if(se||!st)return redirect(appRedirect("/configuracoes?mercado_livre=error&message=Estado%20OAuth%20inválido%20ou%20já%20utilizado"));
 if(new Date(st.expires_at).getTime()<Date.now())return redirect(appRedirect("/configuracoes?mercado_livre=error&message=Estado%20OAuth%20expirado"));
 const {data:profile,error:profileError}=await db.from("user_profiles").select("role,is_active").eq("user_id",st.user_id).maybeSingle();
 if(profileError||profile?.role!=="admin"||!profile.is_active)return redirect(appRedirect("/configuracoes?mercado_livre=error&message=Administrador%20iniciador%20sem%20acesso%20ativo"));
 const body=new URLSearchParams({grant_type:"authorization_code",client_id:clientId,client_secret:clientSecret,code,redirect_uri:REDIRECT_URI,code_verifier:st.code_verifier});
 const tr=await fetch(ML_TOKEN_URL,{method:"POST",headers:{accept:"application/json","content-type":"application/x-www-form-urlencoded"},body});
 const td=await tr.json();
 if(!tr.ok){console.error("ML OAuth:",td);return redirect(appRedirect(`/configuracoes?mercado_livre=error&message=${encodeURIComponent(td?.error_description||td?.error||"Falha ao obter token.")}`))}
 const {data:mp,error:me}=await db.from("marketplaces").select("id").eq("slug","mercado_livre").maybeSingle();
 if(me||!mp)return redirect(appRedirect("/configuracoes?mercado_livre=error&message=Marketplace%20Mercado%20Livre%20não%20encontrado"));
 if(!td.user_id||!td.access_token||!td.refresh_token){console.error("Resposta OAuth incompleta",{user:Boolean(td.user_id),access:Boolean(td.access_token),refresh:Boolean(td.refresh_token)});return redirect(appRedirect("/configuracoes?mercado_livre=error&message=Resposta%20OAuth%20incompleta%20do%20Mercado%20Livre"))}
 const {error:ce}=await db.from("marketplace_connections").upsert({marketplace_id:mp.id,external_user_id:String(td.user_id),access_token:td.access_token,refresh_token:td.refresh_token,token_expires_at:new Date(Date.now()+Number(td.expires_in||21600)*1000).toISOString(),scope:td.scope||null,active:true,updated_at:new Date().toISOString()},{onConflict:"marketplace_id"});
 if(ce){console.error("Salvar conexão:",ce);return redirect(appRedirect("/configuracoes?mercado_livre=error&message=Token%20obtido%2C%20mas%20não%20foi%20possível%20salvar%20a%20conexão"))}
 return redirect(appRedirect("/configuracoes?mercado_livre=connected"));
});