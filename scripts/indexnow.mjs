#!/usr/bin/env node
/*
  Tells Bing (and the other IndexNow engines: Yandex, Naver, Seznam) that the website's pages
  changed. Bing's index feeds Copilot and ChatGPT search, so new pages show up there sooner.
  Run it after a production deploy that changed the website's words:

    node scripts/indexnow.mjs

  It reads the live sitemap, so it submits exactly what is deployed. The key below is public by
  design: IndexNow checks that https://teacheraid.education/<key>.txt holds it.
*/
const HOST = "teacheraid.education";
const KEY = "afc3075ad87aae81a883b8a1feb9881f";

const sitemap = await fetch(`https://${HOST}/sitemap.xml`).then((r) => {
  if (!r.ok) throw new Error(`sitemap.xml: HTTP ${r.status}`);
  return r.text();
});
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) throw new Error("sitemap.xml lists no URLs");

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
});
// 200 and 202 both mean accepted; 202 while the key is still being checked.
console.log(`IndexNow: HTTP ${res.status} for ${urlList.length} URLs`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
