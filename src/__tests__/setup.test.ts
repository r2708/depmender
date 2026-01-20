// Basic setup test to verify Jest and fast-check are working
import fc from 'fast-check';

describe('Project Setup', () => {
  test('Jest is working correctly', () => {
    expect(true).toBe(true);
  });

  test('fast-check is configured correctly', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number';
      })
    );
  });

  test('TypeScript compilation is working', () => {
    const testObject: { name: string; version: number } = {
      name: 'depguardian',
      version: 1
    };
    
    expect(testObject.name).toBe('depguardian');
    expect(testObject.version).toBe(1);
  });
});