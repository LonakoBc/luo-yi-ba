import { createHash } from 'node:crypto';
import path from 'node:path';
import { PoliteFetcher } from './vcpedia-fetcher.mjs';
import { VCPEDIA_API_URL } from './vcpedia-lib.mjs';
import { ROOT } from './singer-config.mjs';

const queries = process.argv.slice(2).filter((value) => !value.startsWith('--'));
const interval = Number(process.argv.find((value) => value.startsWith('--interval='))?.slice(11) ?? 1);
if (!queries.length) throw new Error('请提供至少一个搜索词');
const fetcher = new PoliteFetcher({
  cacheDir: path.join(ROOT, '.cache', 'vcpedia', 'library-expansion-2026', 'search'),
  minDelayMs: interval * 1000,
});
for (const query of queries) {
  const url = new URL(VCPEDIA_API_URL);
  for (const [key, value] of Object.entries({ action: 'query', list: 'search', srsearch: query, srlimit: '10', format: 'json', formatversion: '2', maxlag: '5' })) {
    url.searchParams.set(key, value);
  }
  const key = createHash('sha256').update(query).digest('hex').slice(0, 16);
  const data = await fetcher.requestJson({ url: url.href, cacheKey: key });
  console.log(`\n## ${query}`);
  for (const item of data.query?.search ?? []) console.log(`- ${item.title}`);
}
