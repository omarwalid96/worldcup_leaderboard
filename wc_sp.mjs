import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl:'require' });
try {
  // mimic listSponsors query
  const r = await sql`select id, image_url from sponsors order by created_at desc`;
  console.log('listSponsors OK, rows:', r.length);
  r.forEach(x=>console.log('  ', x.id, x.image_url?.slice(0,60)));
} catch(e){ console.log('listSponsors ERROR:', e.message); }
await sql.end();
