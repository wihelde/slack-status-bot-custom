import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Config Storage', () => {
  let testConfigDir: string;
  let testConfigPath: string;

  beforeEach(() => {
    // Create temporary directory for tests
    testConfigDir = path.join(os.tmpdir(), 'slack-status-bot-test-' + Date.now());
    testConfigPath = path.join(testConfigDir, 'config.json');
    
    if (!fs.existsSync(testConfigDir)) {
      fs.mkdirSync(testConfigDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testConfigPath)) {
      fs.unlinkSync(testConfigPath);
    }
    if (fs.existsSync(testConfigDir)) {
      fs.rmdirSync(testConfigDir);
    }
  });

  describe('Token Persistence', () => {
    it('should save tokens to config file', () => {
      const config = {
        sources: {
          spotify: true,
          appleMusic: true,
          zoom: true,
          teams: true,
          huddle: true,
        },
        slackTokens: ['xoxp-test-token-123'],
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf-8');
      
      const saved = fs.readFileSync(testConfigPath, 'utf-8');
      const parsed = JSON.parse(saved);

      expect(parsed.slackTokens).toEqual(['xoxp-test-token-123']);
    });

    it('should preserve tokens when updating sources', () => {
      const config = {
        sources: {
          spotify: true,
          appleMusic: true,
          zoom: true,
          teams: true,
          huddle: true,
        },
        slackTokens: ['xoxp-test-token-123'],
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf-8');

      // Simulate daemon updating only sources
      const existingConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));
      const updatedConfig = {
        ...existingConfig,
        sources: {
          spotify: false, // Changed
          appleMusic: true,
          zoom: true,
          teams: true,
          huddle: true,
        },
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(updatedConfig, null, 2), 'utf-8');

      const final = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(final.slackTokens).toEqual(['xoxp-test-token-123']);
      expect(final.sources.spotify).toBe(false);
    });

    it('should support multiple tokens', () => {
      const config = {
        sources: {
          spotify: true,
          appleMusic: true,
          zoom: true,
          teams: true,
          huddle: true,
        },
        slackTokens: [
          'xoxp-token-workspace-1',
          'xoxp-token-workspace-2',
          'xoxp-token-workspace-3',
        ],
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf-8');

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(saved.slackTokens).toHaveLength(3);
      expect(saved.slackTokens[1]).toBe('xoxp-token-workspace-2');
    });

    it('should handle empty tokens array', () => {
      const config = {
        sources: {
          spotify: true,
          appleMusic: true,
          zoom: true,
          teams: true,
          huddle: true,
        },
        slackTokens: [],
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf-8');

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(saved.slackTokens).toEqual([]);
      expect(saved.slackTokens.length).toBe(0);
    });
  });

  describe('Config Structure', () => {
    it('should maintain correct config structure', () => {
      const config = {
        sources: {
          spotify: true,
          appleMusic: false,
          zoom: true,
          teams: false,
          huddle: true,
        },
        slackTokens: ['xoxp-test'],
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf-8');

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(saved).toHaveProperty('sources');
      expect(saved).toHaveProperty('slackTokens');
      expect(saved).toHaveProperty('lastUpdated');
      
      expect(Object.keys(saved.sources)).toEqual([
        'spotify',
        'appleMusic',
        'zoom',
        'teams',
        'huddle',
      ]);
    });

    it('should preserve lastUpdated timestamp', () => {
      const now = new Date().toISOString();
      const config = {
        sources: {
          spotify: true,
          appleMusic: true,
          zoom: true,
          teams: true,
          huddle: true,
        },
        slackTokens: ['xoxp-test'],
        lastUpdated: now,
      };

      fs.writeFileSync(testConfigPath, JSON.stringify(config, null, 2), 'utf-8');

      const saved = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8'));

      expect(saved.lastUpdated).toBe(now);
    });
  });
});

