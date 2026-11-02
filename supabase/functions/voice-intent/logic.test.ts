import {
  validateIntent,
  costUsd,
  buildRequest,
  reserveChargeUsd,
  EST_INPUT_TOKENS,
  MAX_TOKENS,
  MAX_TEXT,
  PRICE_IN_PER_MTOK,
  PRICE_OUT_PER_MTOK,
} from './logic';

describe('validateIntent', () => {
  it('whitelists fields and coerces numeric strings', () => {
    expect(
      validateIntent({ type: 'record_payment', customer: 'سيد', amount: '2000', method: 'cash', evil: 'x' }),
    ).toEqual({ type: 'record_payment', customer: 'سيد', amount: 2000, method: 'cash' });
  });
  it('drops negative amount and unknown method', () => {
    expect(validateIntent({ type: 'record_payment', customer: 'a', amount: -5 })).toEqual({
      type: 'record_payment',
      customer: 'a',
    });
    expect(validateIntent({ type: 'record_payment', customer: 'a', method: 'bitcoin' })).toEqual({
      type: 'record_payment',
      customer: 'a',
    });
  });
  it('drops NaN, zero and over-limit numbers', () => {
    for (const amount of ['abc', 0, 10_000_001]) {
      expect(validateIntent({ type: 'record_payment', customer: 'a', amount })).toEqual({
        type: 'record_payment',
        customer: 'a',
      });
    }
  });
  it('missing customer becomes unknown', () => {
    expect(validateIntent({ type: 'record_payment' })).toEqual({ type: 'unknown' });
    expect(validateIntent({ type: 'ask_balance', customer: '  ' })).toEqual({ type: 'unknown' });
  });
  it('non-objects and bad types become unknown', () => {
    expect(validateIntent(null)).toEqual({ type: 'unknown' });
    expect(validateIntent('str')).toEqual({ type: 'unknown' });
    expect(validateIntent([])).toEqual({ type: 'unknown' });
    expect(validateIntent({ type: 'drop_table' })).toEqual({ type: 'unknown' });
  });
  it('range-checks rate and years', () => {
    expect(
      validateIntent({
        type: 'create_invoice',
        customer: 'a',
        price: 1000,
        rate_percent: 500,
        years: 9,
        sale_type: 'installment',
      }),
    ).toEqual({ type: 'create_invoice', customer: 'a', price: 1000, sale_type: 'installment' });
    expect(validateIntent({ type: 'create_invoice', customer: 'a', rate_percent: 20, years: 3 })).toEqual({
      type: 'create_invoice',
      customer: 'a',
      rate_percent: 20,
      years: 3,
    });
  });
  it('ask_totals needs a valid period; open needs a valid target', () => {
    expect(validateIntent({ type: 'ask_totals', period: 'month' })).toEqual({ type: 'ask_totals', period: 'month' });
    expect(validateIntent({ type: 'ask_totals', period: 'year' })).toEqual({ type: 'unknown' });
    expect(validateIntent({ type: 'open', target: 'customers' })).toEqual({ type: 'open', target: 'customers' });
    expect(validateIntent({ type: 'open', target: 'admin' })).toEqual({ type: 'unknown' });
  });
  it('trims strings and drops over-long ones', () => {
    expect(validateIntent({ type: 'ask_balance', customer: '  سيد ' })).toEqual({ type: 'ask_balance', customer: 'سيد' });
    expect(validateIntent({ type: 'ask_balance', customer: 'x'.repeat(121) })).toEqual({ type: 'unknown' });
  });
  it('ask_late ignores extras', () => {
    expect(validateIntent({ type: 'ask_late', customer: 'x' })).toEqual({ type: 'ask_late' });
  });
});

describe('costUsd', () => {
  it('matches the published prices', () => {
    expect(costUsd(1_000_000, 0)).toBe(PRICE_IN_PER_MTOK);
    expect(costUsd(0, 1_000_000)).toBe(PRICE_OUT_PER_MTOK);
  });
  it('is finite and non-negative for bad input', () => {
    expect(costUsd(NaN, -5)).toBe(0);
    expect(Number.isFinite(costUsd(Infinity, 10))).toBe(true);
    expect(costUsd(Infinity, 10)).toBeGreaterThanOrEqual(0);
  });
});

describe('reserveChargeUsd', () => {
  it('is the worst-case cost and fits the SQL charge window (0, 0.05]', () => {
    const c = reserveChargeUsd();
    expect(c).toBe(costUsd(EST_INPUT_TOKENS, MAX_TOKENS));
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(0.05);
  });
  it('input estimate covers the largest possible request (<= 2 chars/token heuristic)', () => {
    const req = buildRequest('ا'.repeat(MAX_TEXT), '2026-11-02');
    expect(JSON.stringify(req).length / 2).toBeLessThanOrEqual(EST_INPUT_TOKENS);
  });
});

describe('buildRequest', () => {
  it('forces the intent tool and keeps the transcript only in the user message', () => {
    const req = buildRequest('SECRET_TEXT', '2026-11-02');
    expect(req.tool_choice.name).toBe('intent');
    expect(req.model).toBe('claude-haiku-5-5');
    expect(JSON.stringify(req.system)).not.toContain('SECRET_TEXT');
    expect(JSON.stringify(req.tools)).not.toContain('SECRET_TEXT');
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    expect(req.messages[0].content).toContain('<transcript>SECRET_TEXT</transcript>');
  });
});
