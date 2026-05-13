import { describe, expect, it } from 'vitest';

import { projectNodeListLabel } from './nodeListLabelProjection';

describe('nodeListLabelProjection', () => {
  it('projects inline markdown to plain list text', () => {
    expect(projectNodeListLabel('- **这个版本切换**，其实等于是在做一个确认')).toBe(
      '这个版本切换，其实等于是在做一个确认'
    );
  });

  it('projects links inside strong text to their visible label', () => {
    expect(projectNodeListLabel('**[标日高级班](https://class.hujiang.com/course/30789?source=16483)**这一段')).toBe(
      '标日高级班这一段'
    );
  });

  it('strips heading markers even when imported titles have no marker spacing', () => {
    expect(projectNodeListLabel('#煮饺子时中途要不要加凉水#')).toBe('煮饺子时中途要不要加凉水');
    expect(projectNodeListLabel('### 功能介绍')).toBe('功能介绍');
  });

  it('drops markdown image and url noise from projected labels', () => {
    expect(projectNodeListLabel('![Title](asset://hash.png) [下载](https://example.com/file)')).toBe('Title 下载');
    expect(projectNodeListLabel('(https://example.com/source) ### 功能介绍')).toBe('功能介绍');
  });
});
