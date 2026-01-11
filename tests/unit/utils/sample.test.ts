/**
 * Sample Test Suite
 * Verifies that Jest is properly configured
 */

describe('Sample Test Suite', () => {
  it('should verify Jest is working', () => {
    expect(true).toBe(true);
  });

  it('should perform basic arithmetic', () => {
    const sum = 2 + 2;
    expect(sum).toBe(4);
  });

  it('should handle string operations', () => {
    const greeting = 'Hello, World!';
    expect(greeting).toContain('World');
    expect(greeting.length).toBeGreaterThan(0);
  });
});
