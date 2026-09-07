// poll public URL until Universal SSL recovers; check every 10min, up to 6h
for (let i = 1; i <= 36; i++) {
  const ts = new Date().toISOString().slice(0, 19);
  try {
    const r = await fetch('https://dsh.daha.dpdns.org/', { headers: { 'user-agent': 'curl/8' } });
    const t = await r.text();
    const wall = t.includes('\u8bbf\u95ee\u9a8c\u8bc1');
    console.log('[' + ts + '] try ' + i + ': status=' + r.status + ' wall-hit=' + wall);
    if (wall) { console.log('RECOVERED: Universal SSL is back, public URL works again'); process.exit(0); }
  } catch (e) {
    console.log('[' + ts + '] try ' + i + ': ' + (e.cause ? String(e.cause).slice(0, 80) : e.message));
  }
  await new Promise(res => setTimeout(res, 10 * 60 * 1000));
}
console.log('TIMEOUT: still broken after 6h');
process.exit(1);