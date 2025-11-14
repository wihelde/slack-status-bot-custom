import { ZoomAdapter, TeamsAdapter, HuddleAdapter } from '../meetings';

jest.mock('child_process');

describe('ZoomAdapter', () => {
  let adapter: ZoomAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new ZoomAdapter();
  });

  describe('isAvailable', () => {
    it('should be available on all platforms', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('enable/disable', () => {
    it('should enable and disable', () => {
      expect(adapter.isEnabled()).toBe(true);
      adapter.setEnabled(false);
      expect(adapter.isEnabled()).toBe(false);
      adapter.setEnabled(true);
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('basic structure', () => {
    it('should have getStatus method', () => {
      expect(typeof adapter.getStatus).toBe('function');
    });
  });
});

describe('TeamsAdapter', () => {
  let adapter: TeamsAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new TeamsAdapter();
  });

  describe('isAvailable', () => {
    it('should be available on all platforms', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('enable/disable', () => {
    it('should enable and disable', () => {
      expect(adapter.isEnabled()).toBe(true);
      adapter.setEnabled(false);
      expect(adapter.isEnabled()).toBe(false);
      adapter.setEnabled(true);
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('basic structure', () => {
    it('should have getStatus method', () => {
      expect(typeof adapter.getStatus).toBe('function');
    });
  });
});

describe('HuddleAdapter', () => {
  let adapter: HuddleAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new HuddleAdapter();
  });

  describe('isAvailable', () => {
    it('should be available on all platforms', () => {
      expect(adapter.isAvailable()).toBe(true);
    });
  });

  describe('enable/disable', () => {
    it('should enable and disable', () => {
      expect(adapter.isEnabled()).toBe(true);
      adapter.setEnabled(false);
      expect(adapter.isEnabled()).toBe(false);
      adapter.setEnabled(true);
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('basic structure', () => {
    it('should have getStatus method', () => {
      expect(typeof adapter.getStatus).toBe('function');
    });
  });
});
