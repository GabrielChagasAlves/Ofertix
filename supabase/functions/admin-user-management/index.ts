import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const screenKeys=["dashboard","products","origin_classification","integrations","rules","affiliate_links","approval","executions","publications","channels","clicks","settings"];
const actionKeys=["products.origin.update","products.update","offers.approve","offers.reject"];
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"Método não permitido."},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,anon=Deno.env.get("SUPABASE_ANON_KEY")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth=req.headers.get("Authorization");if(!auth)return json({error:"Sessão ausente."},401);
  const caller=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user},error:userError}=await caller.auth.getUser();if(userError||!user)return json({error:"Sessão inválida."},401);
  const admin=createClient(url,service);
  const {data:profile,error:profileError}=await admin.from("user_profiles").select("role,is_active").eq("user_id",user.id).maybeSingle();
  if(profileError||profile?.role!=="admin"||!profile.is_active)return json({error:"Apenas administradores podem gerenciar usuários."},403);
  const body=await req.json(),action=body.action;
  if(action==="list"){
   const [{data:authData,error:authError},{data:profiles,error:profilesError}]=await Promise.all([admin.auth.admin.listUsers({page:1,perPage:1000}),admin.from("user_profiles").select("user_id,role,is_active,permissions")]);
   if(authError)throw authError;if(profilesError)throw profilesError;
   const byId=new Map((profiles||[]).map(p=>[p.user_id,p]));
   return json({users:(authData.users||[]).map(u=>{const p=byId.get(u.id);return {user_id:u.id,email:u.email||null,role:p?.role||"operator",is_active:p?.is_active??false,permissions:p?.permissions||{screens:{},actions:{}}};})});
  }
  if(action==="invite"){
   const email=String(body.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({error:"Informe um e-mail válido."},400);
   const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:req.headers.get("origin")||undefined});
   if(error)throw error;
   return json({user_id:data.user?.id,email,invited:true});
  }
  if(action==="permissions"){
   const id=String(body.user_id||"");if(!id)return json({error:"Usuário inválido."},400);
   const {data:target,error:targetError}=await admin.from("user_profiles").select("role").eq("user_id",id).maybeSingle();
   if(targetError)throw targetError;if(!target)return json({error:"Perfil não encontrado."},404);if(target.role==="admin")return json({error:"Não é permitido alterar o administrador por esta tela."},403);
   const raw=body.permissions||{},screens=raw.screens||{},actions=raw.actions||{};
   const clean={screens:Object.fromEntries(screenKeys.map(k=>[k,screens[k]===true])),actions:Object.fromEntries(actionKeys.map(k=>[k,actions[k]===true]))};
   const {error}=await admin.from("user_profiles").update({permissions:clean,is_active:body.is_active!==false,updated_at:new Date().toISOString()}).eq("user_id",id);
   if(error)throw error;return json({updated:true});
  }
  return json({error:"Ação desconhecida."},400);
 }catch(error){return json({error:error instanceof Error?error.message:"Erro interno."},500);}
});
