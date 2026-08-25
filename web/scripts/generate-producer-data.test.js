import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { generateProducerData } from './generate-producer-data.mjs';

describe('P 主 Excel 数据生成', () => {
  it('导入 104 位 P 主、45 位名 P，并保留名 P 标记与两处数据修正', async () => {
    const scriptDir = path.dirname(fileURLToPath(import.meta.url));
    const producers = await generateProducerData({
      input: path.resolve(scriptDir, '..', '..', 'producers', 'P主代表曲统计表(1).xlsx'),
      output: path.resolve(scriptDir, '..', '.test-output', 'producers.json'),
    });
    expect(producers).toHaveLength(104);
    expect(producers.filter((producer) => producer.famous)).toHaveLength(45);
    for (const name of ['著小生zoki', '天使盐', '米库喵']) {
      expect(producers.find((producer) => producer.name === name)?.famous).toBe(false);
    }
    for (const name of ['伊野奏', '立入禁止', '绛舞乱丸', 'iKz']) {
      expect(producers.find((producer) => producer.name === name)?.famous).toBe(true);
    }
    expect(producers.find((producer) => producer.name === 'H.K.君')?.legendCount).toBe(1);
    const yousa = producers.find((producer) => producer.name.includes('泠鸢'));
    expect(yousa.debutDate).toBe('2013-02-05');
    const suya = producers.find((producer) => producer.name === 'Suya');
    expect(suya.representativeSongs).toContain('我唱人间');
    expect(new Set(suya.representativeSongs).size).toBe(5);
  });
});
