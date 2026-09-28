let cachedKeys;
let cachedAt = 0;

const decode = (part) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=")),c=>c.charCodeAt(0))));
const bytes = (part) => Uint8Array.from(atob(part.replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(part.length/4)*4,"=")),c=>c.charCodeAt(0));

export async function verifyAccessIdentity(request, environment, now = Math.floor(Date.now()/1000)) {
  const team = environment.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim().replace(/^https?:\/\//,"").replace(/\.cloudflareaccess\.com\/?$/,"");
  const audience = environment.CLOUDFLARE_ACCESS_AUD?.trim();
  if (!team || !audience) return { ok:false, status:503 };
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok:false, status:401 };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok:false, status:401 };
  try {
    const header=decode(parts[0]); const payload=decode(parts[1]);
    if (header.alg!=="RS256" || !header.kid) return {ok:false,status:401};
    if (payload.iss!==`https://${team}.cloudflareaccess.com` || !(Array.isArray(payload.aud)?payload.aud:[payload.aud]).includes(audience)) return {ok:false,status:401};
    if (!payload.exp || payload.exp<now || payload.nbf&&payload.nbf>now || !payload.email) return {ok:false,status:401};
    const keys=await accessKeys(team);
    const jwk=keys.find(key=>key.kid===header.kid);
    if (!jwk) return {ok:false,status:401};
    const key=await crypto.subtle.importKey("jwk",jwk,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,bytes(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    return valid ? {ok:true,email:String(payload.email).trim().toLowerCase()} : {ok:false,status:401};
  } catch { return {ok:false,status:401}; }
}

async function accessKeys(team) {
  if (cachedKeys && Date.now()-cachedAt<3600000) return cachedKeys;
  const response=await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error("Access certificates unavailable");
  const body=await response.json(); cachedKeys=body.keys||[]; cachedAt=Date.now(); return cachedKeys;
}
