import { isDesktopWidth } from '../layout';

test('desktop starts at 1024', () => {
  expect(isDesktopWidth(1023)).toBe(false);
  expect(isDesktopWidth(1024)).toBe(true);
});
