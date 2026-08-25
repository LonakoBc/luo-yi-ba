import { expect, it } from 'vitest';
import { appUrl, browserPath, readRouteLocation } from './appRouting';

it('Toy 构建从 hash 读取页面路径和查询参数', () => {
  const location = { pathname: '/toy/luo-yi-ba/', search: '', hash: '#/multiplayer/join?code=ABC234' };
  expect(readRouteLocation(location, true)).toEqual({ pathname: '/multiplayer/join', search: '?code=ABC234' });
});

it('Toy 构建生成不会离开当前 slug 的 hash 路由与邀请链接', () => {
  const location = { href: 'https://www.bilibili.com/toy/luo-yi-ba/#/multiplayer', origin: 'https://www.bilibili.com' };
  expect(browserPath('/sorting', true)).toBe('#/sorting');
  expect(appUrl('/multiplayer/join?code=ABC234', location, true)).toBe('https://www.bilibili.com/toy/luo-yi-ba/#/multiplayer/join?code=ABC234');
});
