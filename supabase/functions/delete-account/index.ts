import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return Response.json({error:'Method not allowed'},{status:405,headers:cors});
  const url = Deno.env.get('SUPABASE_URL');
  const publishable = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !publishable || !serviceKey) return Response.json({error:'Server not configured'},{status:500,headers:cors});
  if (!authorization?.startsWith('Bearer ')) return Response.json({error:'Unauthorized'},{status:401,headers:cors});
  const userClient = createClient(url,publishable,{ global:{headers:{Authorization:authorization}},auth:{persistSession:false} });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return Response.json({error:'Unauthorized'},{status:401,headers:cors});
  // Server-only credential. All public rows cascade from auth.users.
  const admin = createClient(url,serviceKey,{auth:{persistSession:false}});
  const deleted = await admin.auth.admin.deleteUser(data.user.id);
  if (deleted.error) return Response.json({error:'Account deletion failed'},{status:500,headers:cors});
  return Response.json({deleted:true},{headers:cors});
});
