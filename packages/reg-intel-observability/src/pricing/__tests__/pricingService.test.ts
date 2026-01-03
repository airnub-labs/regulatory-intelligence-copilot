/**
 * Pricing Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createPricingService,
  calculateLlmCost,
  type PricingService,
  type ModelPricing,
} from '../index.js';
import { OPENAI_PRICING, ANTHROPIC_PRICING, GROQ_PRICING } from '../pricingData.js';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    service = createPricingService();
  });

  describe('getPricing', () => {
    it('should get pricing for GPT-4', async () => {
      const pricing = await service.getPricing('openai', 'gpt-4');

      expect(pricing).toBeDefined();
      expect(pricing?.provider).toBe('openai');
      expect(pricing?.model).toBe('gpt-4');
      expect(pricing?.inputPricePerMillion).toBe(30.0);
      expect(pricing?.outputPricePerMillion).toBe(60.0);
    });

    it('should get pricing for GPT-3.5 Turbo', async () => {
      const pricing = await service.getPricing('openai', 'gpt-3.5-turbo');

      expect(pricing).toBeDefined();
      expect(pricing?.provider).toBe('openai');
      expect(pricing?.model).toBe('gpt-3.5-turbo');
      expect(pricing?.inputPricePerMillion).toBe(0.5);
      expect(pricing?.outputPricePerMillion).toBe(1.5);
    });

    it('should get pricing for Claude 3 Opus', async () => {
      const pricing = await service.getPricing('anthropic', 'claude-3-opus-20240229');

      expect(pricing).toBeDefined();
      expect(pricing?.provider).toBe('anthropic');
      expect(pricing?.inputPricePerMillion).toBe(15.0);
      expect(pricing?.outputPricePerMillion).toBe(75.0);
    });

    it('should get pricing for Claude 3 Haiku', async () => {
      const pricing = await service.getPricing('anthropic', 'claude-3-haiku-20240307');

      expect(pricing).toBeDefined();
      expect(pricing?.inputPricePerMillion).toBe(0.25);
      expect(pricing?.outputPricePerMillion).toBe(1.25);
    });

    it('should get pricing for Groq Llama', async () => {
      const pricing = await service.getPricing('groq', 'llama-3.3-70b-versatile');

      expect(pricing).toBeDefined();
      expect(pricing?.provider).toBe('groq');
      expect(pricing?.inputPricePerMillion).toBe(0.59);
      expect(pricing?.outputPricePerMillion).toBe(0.79);
    });

    it('should return null for unknown model', async () => {
      const pricing = await service.getPricing('unknown', 'unknown-model');

      expect(pricing).toBeNull();
    });

    it('should normalize model names', async () => {
      const pricing = await service.getPricing('anthropic', 'claude-3-opus');

      expect(pricing).toBeDefined();
      expect(pricing?.model).toContain('opus');
    });

    it('should handle case insensitive lookups', async () => {
      const pricing = await service.getPricing('OpenAI', 'GPT-4');

      expect(pricing).toBeDefined();
      expect(pricing?.provider).toBe('openai');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for GPT-4 request', async () => {
      const cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(cost).toBeDefined();
      expect(cost.inputCostUsd).toBeCloseTo(0.03); // 1000 / 1M * $30
      expect(cost.outputCostUsd).toBeCloseTo(0.03); // 500 / 1M * $60
      expect(cost.totalCostUsd).toBeCloseTo(0.06);
      expect(cost.isEstimated).toBe(false);
    });

    it('should calculate cost for GPT-3.5 Turbo request', async () => {
      const cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      expect(cost).toBeDefined();
      expect(cost.inputCostUsd).toBeCloseTo(0.005); // 10000 / 1M * $0.5
      expect(cost.outputCostUsd).toBeCloseTo(0.0075); // 5000 / 1M * $1.5
      expect(cost.totalCostUsd).toBeCloseTo(0.0125);
      expect(cost.isEstimated).toBe(false);
    });

    it('should calculate cost for Claude 3 Haiku', async () => {
      const cost = await service.calculateCost({
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        inputTokens: 100000,
        outputTokens: 50000,
      });

      expect(cost).toBeDefined();
      expect(cost.inputCostUsd).toBeCloseTo(0.025); // 100000 / 1M * $0.25
      expect(cost.outputCostUsd).toBeCloseTo(0.0625); // 50000 / 1M * $1.25
      expect(cost.totalCostUsd).toBeCloseTo(0.0875);
    });

    it('should calculate cost for Groq Llama', async () => {
      const cost = await service.calculateCost({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        inputTokens: 50000,
        outputTokens: 25000,
      });

      expect(cost).toBeDefined();
      expect(cost.inputCostUsd).toBeCloseTo(0.0295); // 50000 / 1M * $0.59
      expect(cost.outputCostUsd).toBeCloseTo(0.01975); // 25000 / 1M * $0.79
      expect(cost.totalCostUsd).toBeCloseTo(0.04925);
    });

    it('should use default pricing for unknown model', async () => {
      const cost = await service.calculateCost({
        provider: 'unknown',
        model: 'unknown-model',
        inputTokens: 1000,
        outputTokens: 500,
      });

      expect(cost).toBeDefined();
      expect(cost.isEstimated).toBe(true);
      expect(cost.totalCostUsd).toBeGreaterThan(0);
    });

    it('should handle zero tokens', async () => {
      const cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 0,
        outputTokens: 0,
      });

      expect(cost).toBeDefined();
      expect(cost.inputCostUsd).toBe(0);
      expect(cost.outputCostUsd).toBe(0);
      expect(cost.totalCostUsd).toBe(0);
    });

    it('should round costs to 6 decimal places', async () => {
      const cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 3,
        outputTokens: 7,
      });

      expect(cost).toBeDefined();
      // 3 / 1M * $30 = 0.00009
      // 7 / 1M * $60 = 0.00042
      // Total = 0.00051
      expect(cost.inputCostUsd).toBe(0.00009);
      expect(cost.outputCostUsd).toBe(0.00042);
      expect(cost.totalCostUsd).toBe(0.00051);
    });
  });

  describe('getProviderPricing', () => {
    it('should get all OpenAI pricing', async () => {
      const pricing = await service.getProviderPricing('openai');

      expect(pricing).toBeDefined();
      expect(pricing.length).toBeGreaterThan(0);
      expect(pricing.every((p) => p.provider === 'openai')).toBe(true);
    });

    it('should get all Anthropic pricing', async () => {
      const pricing = await service.getProviderPricing('anthropic');

      expect(pricing).toBeDefined();
      expect(pricing.length).toBeGreaterThan(0);
      expect(pricing.every((p) => p.provider === 'anthropic')).toBe(true);
    });

    it('should handle unknown provider', async () => {
      const pricing = await service.getProviderPricing('unknown');

      expect(pricing).toBeDefined();
      expect(pricing.length).toBe(0);
    });
  });

  describe('updatePricing', () => {
    it('should add new pricing', async () => {
      const newPricing: ModelPricing = {
        provider: 'test',
        model: 'test-model',
        inputPricePerMillion: 1.0,
        outputPricePerMillion: 2.0,
        effectiveDate: '2025-01-01',
      };

      await service.updatePricing(newPricing);

      const retrieved = await service.getPricing('test', 'test-model');
      expect(retrieved).toBeDefined();
      expect(retrieved?.inputPricePerMillion).toBe(1.0);
      expect(retrieved?.outputPricePerMillion).toBe(2.0);
    });

    it('should handle pricing updates with multiple effective dates', async () => {
      const oldPricing: ModelPricing = {
        provider: 'test',
        model: 'versioned-model',
        inputPricePerMillion: 1.0,
        outputPricePerMillion: 2.0,
        effectiveDate: '2024-01-01',
      };

      const newPricing: ModelPricing = {
        provider: 'test',
        model: 'versioned-model',
        inputPricePerMillion: 0.5,
        outputPricePerMillion: 1.0,
        effectiveDate: '2025-01-01',
      };

      await service.updatePricing(oldPricing);
      await service.updatePricing(newPricing);

      // Should get newest pricing by default
      const current = await service.getPricing('test', 'versioned-model');
      expect(current?.inputPricePerMillion).toBe(0.5);

      // Should get old pricing for historical date
      const historical = await service.getPricing(
        'test',
        'versioned-model',
        new Date('2024-06-01')
      );
      expect(historical?.inputPricePerMillion).toBe(1.0);
    });
  });

  describe('calculateLlmCost helper', () => {
    it('should calculate cost using helper function', async () => {
      const cost = await calculateLlmCost('openai', 'gpt-4', 1000, 500);

      expect(cost).toBeDefined();
      expect(cost.totalCostUsd).toBeCloseTo(0.06);
    });
  });

  describe('cost comparisons', () => {
    it('should show GPT-4 is more expensive than GPT-3.5', async () => {
      const gpt4Cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const gpt35Cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      expect(gpt4Cost.totalCostUsd).toBeGreaterThan(gpt35Cost.totalCostUsd);
      // GPT-4 should be ~60x more expensive
      expect(gpt4Cost.totalCostUsd / gpt35Cost.totalCostUsd).toBeGreaterThan(30);
    });

    it('should show Claude Haiku is cheapest Anthropic model', async () => {
      const opusCost = await service.calculateCost({
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const sonnetCost = await service.calculateCost({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      const haikuCost = await service.calculateCost({
        provider: 'anthropic',
        model: 'claude-3-haiku-20240307',
        inputTokens: 10000,
        outputTokens: 5000,
      });

      expect(haikuCost.totalCostUsd).toBeLessThan(sonnetCost.totalCostUsd);
      expect(haikuCost.totalCostUsd).toBeLessThan(opusCost.totalCostUsd);
      expect(sonnetCost.totalCostUsd).toBeLessThan(opusCost.totalCostUsd);
    });

    it('should show Groq is cheaper than OpenAI', async () => {
      const groqCost = await service.calculateCost({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
        inputTokens: 100000,
        outputTokens: 50000,
      });

      const gpt4Cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: 100000,
        outputTokens: 50000,
      });

      expect(groqCost.totalCostUsd).toBeLessThan(gpt4Cost.totalCostUsd);
      // Should be ~50x cheaper
      expect(gpt4Cost.totalCostUsd / groqCost.totalCostUsd).toBeGreaterThan(40);
    });
  });

  describe('real-world scenarios', () => {
    it('should calculate daily costs for 1000 requests', async () => {
      const requestsPerDay = 1000;
      const avgInputTokens = 500;
      const avgOutputTokens = 500;

      const costPerRequest = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: avgInputTokens,
        outputTokens: avgOutputTokens,
      });

      const dailyCost = costPerRequest.totalCostUsd * requestsPerDay;
      const monthlyCost = dailyCost * 30;

      expect(dailyCost).toBeCloseTo(45.0); // $45/day
      expect(monthlyCost).toBeCloseTo(1350.0); // $1,350/month
    });

    it('should show cost savings by switching models', async () => {
      const requestsPerDay = 1000;
      const avgInputTokens = 500;
      const avgOutputTokens = 500;

      const gpt4Cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-4',
        inputTokens: avgInputTokens,
        outputTokens: avgOutputTokens,
      });

      const gpt35Cost = await service.calculateCost({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        inputTokens: avgInputTokens,
        outputTokens: avgOutputTokens,
      });

      const gpt4Monthly = gpt4Cost.totalCostUsd * requestsPerDay * 30;
      const gpt35Monthly = gpt35Cost.totalCostUsd * requestsPerDay * 30;
      const savings = gpt4Monthly - gpt35Monthly;
      const savingsPercent = (savings / gpt4Monthly) * 100;

      expect(savings).toBeGreaterThan(1000); // Save >$1000/month
      expect(savingsPercent).toBeGreaterThan(95); // >95% savings
    });
  });
});
