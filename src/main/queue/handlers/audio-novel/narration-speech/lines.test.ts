import { describe, expect, it } from 'vitest';
import { narrationLinesOf } from './lines';

describe('narrationLinesOf', () => {
  it('reads the title first, then one sentence per line', () => {
    const body = 'Bến cảng giữ những quyển sổ của nó. Sera đếm số cột buồm hai lần! Rồi nàng ghi lại?\n\nĐến hồi chuông thứ ba, sương mù đã lấy trọn cầu tàu.';
    expect(narrationLinesOf('Chuyến phà đêm', body)).toEqual([
      'Chuyến phà đêm',
      'Bến cảng giữ những quyển sổ của nó.',
      'Sera đếm số cột buồm hai lần!',
      'Rồi nàng ghi lại?',
      'Đến hồi chuông thứ ba, sương mù đã lấy trọn cầu tàu.',
    ]);
  });

  it('keeps a closing quote on the sentence it closes and cuts after an ellipsis', () => {
    expect(narrationLinesOf('', '"Đi thôi." Nàng nói… Rồi im lặng.')).toEqual(['"Đi thôi."', 'Nàng nói…', 'Rồi im lặng.']);
  });

  it('leaves out a blank title and blank lines', () => {
    expect(narrationLinesOf('  ', '\n\n  Một dòng.  \n\n')).toEqual(['Một dòng.']);
  });
});
