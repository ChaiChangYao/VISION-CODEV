import { describe, expect, it } from 'vitest';
import { Button, Icon } from './index';

describe('@vision-codef/ui', () => {
  it('exports the shared icon and button primitives', () => {
    expect(Icon).toBeDefined();
    expect(Button).toBeDefined();
  });
});
