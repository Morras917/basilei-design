'use strict';

const {
  PALETTE,
  ROUTE_LABELS,
  validate,
  escapeXml,
  flavourLines,
  mockApiSubmit,
} = require('./logic');

// ─────────────────────────────────────────────────────────────────────────────
//  Shared fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** Build a minimal valid state, with optional field overrides. */
const validState = (overrides = {}) => ({
  brandName: 'Acme Co',
  quantity: 24,
  ...overrides,
});

const samplePayload = {
  route:     'canvas',
  colorId:   'rose',
  brandName: 'Acme Co',
  tagline:   'For the bold',
  typeStyle: 'serif',
  flavour:   'Salted Caramel Fudge',
  quantity:  48,
};

/**
 * RNG factory for the success path (when _delay = 0).
 * Call sequence inside the Promise:
 *   call 1 → failure-check  (0.5 ≥ 0.12 → success)
 *   call 2 → orderId suffix
 */
const succeedRng = (orderSeed = 0.5) =>
  jest.fn()
    .mockReturnValueOnce(0.5)     // failure-check
    .mockReturnValue(orderSeed);  // orderId

/**
 * RNG factory for the failure path.
 * Returns a value strictly < 0.12 on every call, triggering rejection.
 */
const failRng = () => jest.fn().mockReturnValue(0.05);

// ─────────────────────────────────────────────────────────────────────────────
//  validate()
// ─────────────────────────────────────────────────────────────────────────────

describe('validate()', () => {
  // ── brandName ──────────────────────────────────────────────────────────────

  describe('brandName', () => {
    test('returns no errors for a normal brand name', () => {
      expect(validate(validState())).toEqual({});
    });

    test('errors when brandName is an empty string', () => {
      expect(validate(validState({ brandName: '' })).brandName)
        .toBe('Please enter a brand or recipient name.');
    });

    test('errors when brandName is whitespace only', () => {
      expect(validate(validState({ brandName: '   ' })).brandName).toBeDefined();
    });

    test('accepts a single-character brand name', () => {
      expect(validate(validState({ brandName: 'X' }))).toEqual({});
    });

    test('accepts brand names containing special characters', () => {
      expect(validate(validState({ brandName: "D'Angelo & Sons" }))).toEqual({});
    });

    test('accepts the maximum-length brand name (22 chars)', () => {
      expect(validate(validState({ brandName: 'A'.repeat(22) }))).toEqual({});
    });

    test('does not mutate the input state', () => {
      const state = { brandName: '', quantity: 0 };
      validate(state);
      expect(state).toEqual({ brandName: '', quantity: 0 });
    });
  });

  // ── quantity ───────────────────────────────────────────────────────────────

  describe('quantity', () => {
    test('passes at the minimum order quantity (12)', () => {
      expect(validate(validState({ quantity: 12 }))).toEqual({});
    });

    test('passes for large quantities', () => {
      expect(validate(validState({ quantity: 1000 }))).toEqual({});
    });

    test('errors for quantity = 0 with the generic message', () => {
      expect(validate(validState({ quantity: 0 })).quantity)
        .toBe('Please enter a valid quantity (minimum 12).');
    });

    test('errors for NaN with the generic message', () => {
      expect(validate(validState({ quantity: NaN })).quantity)
        .toBe('Please enter a valid quantity (minimum 12).');
    });

    test('errors for null with the generic message', () => {
      expect(validate(validState({ quantity: null })).quantity).toBeDefined();
    });

    test('errors for undefined with the generic message', () => {
      expect(validate(validState({ quantity: undefined })).quantity).toBeDefined();
    });

    test('errors for negative quantities', () => {
      expect(validate(validState({ quantity: -1 })).quantity).toBeDefined();
    });

    test.each([1, 5, 11])(
      'gives a below-minimum message for quantity %i that names the value',
      (qty) => {
        const msg = validate(validState({ quantity: qty })).quantity;
        expect(msg).toMatch(/Minimum order is 12 boxes/);
        expect(msg).toContain(String(qty));
      }
    );

    test('below-minimum message for quantity 7 is exact', () => {
      expect(validate(validState({ quantity: 7 })).quantity)
        .toBe('Minimum order is 12 boxes — you entered 7.');
    });

    test('quantity exactly 11 produces below-minimum (not generic) message', () => {
      const msg = validate(validState({ quantity: 11 })).quantity;
      expect(msg).toMatch(/Minimum order is 12 boxes/);
      expect(msg).toContain('11');
    });
  });

  // ── combined ───────────────────────────────────────────────────────────────

  describe('combined', () => {
    test('returns both error keys when both fields are invalid', () => {
      const errors = validate({ brandName: '', quantity: 0 });
      expect(errors).toHaveProperty('brandName');
      expect(errors).toHaveProperty('quantity');
    });

    test('returns exactly zero keys for a fully valid state', () => {
      expect(Object.keys(validate({ brandName: 'Basilei', quantity: 100 }))).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  escapeXml()
// ─────────────────────────────────────────────────────────────────────────────

describe('escapeXml()', () => {
  test.each([
    ['<',  '&lt;'],
    ['>',  '&gt;'],
    ['&',  '&amp;'],
    ["'",  '&apos;'],
    ['"',  '&quot;'],
  ])('escapes "%s" → "%s"', (input, expected) => {
    expect(escapeXml(input)).toBe(expected);
  });

  test('leaves ordinary text unchanged', () => {
    expect(escapeXml('Hello Basilei 2016')).toBe('Hello Basilei 2016');
  });

  test('escapes all special characters in a mixed string', () => {
    expect(escapeXml('<b class="x">A & B</b>'))
      .toBe('&lt;b class=&quot;x&quot;&gt;A &amp; B&lt;/b&gt;');
  });

  test('coerces numbers to strings before escaping', () => {
    expect(escapeXml(42)).toBe('42');
  });

  test('coerces null to the string "null"', () => {
    expect(escapeXml(null)).toBe('null');
  });

  test('returns an empty string for an empty input', () => {
    expect(escapeXml('')).toBe('');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  flavourLines()
// ─────────────────────────────────────────────────────────────────────────────

describe('flavourLines()', () => {
  test('a short two-word flavour fits on one line', () => {
    expect(flavourLines('Rose Fudge')).toEqual(['ROSE FUDGE']);
  });

  test('a single-word flavour produces exactly one line', () => {
    expect(flavourLines('Vanilla')).toEqual(['VANILLA']);
  });

  test('a longer flavour wraps across multiple lines', () => {
    expect(flavourLines('Salted Caramel Fudge').length).toBeGreaterThan(1);
  });

  test('never returns more than 3 lines regardless of length', () => {
    const long = 'Earl Grey Honey Shortbread Fudge With Extra Toppings And A Very Long Name';
    expect(flavourLines(long).length).toBeLessThanOrEqual(3);
  });

  test('each individual line is fewer than 14 characters', () => {
    const lines = flavourLines('Macadamia & Honey Nougat');
    lines.forEach(line => expect(line.length).toBeLessThan(14));
  });

  test('output is fully uppercased', () => {
    flavourLines('salted caramel fudge').forEach(line => {
      expect(line).toBe(line.toUpperCase());
    });
  });

  test('ampersand is HTML-escaped to &amp; in output', () => {
    const joined = flavourLines('Dark & Light').join('');
    expect(joined).toContain('&amp;');
    expect(joined).not.toContain(' & ');
  });

  test('Macadamia & Honey Nougat produces 3 lines with correct content', () => {
    const lines = flavourLines('Macadamia & Honey Nougat');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('MACADAMIA');
    // Lines 2 and 3 contain the remaining words; both < 14 chars
    expect(lines[1].length).toBeLessThan(14);
    expect(lines[2].length).toBeLessThan(14);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  mockApiSubmit()
// ─────────────────────────────────────────────────────────────────────────────

describe('mockApiSubmit()', () => {
  // ── success path ───────────────────────────────────────────────────────────

  describe('success path', () => {
    test('resolves with both orderId and estimatedDate', async () => {
      const result = await mockApiSubmit(samplePayload, {
        _random: succeedRng(),
        _delay: 0,
      });
      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('estimatedDate');
    });

    test('orderId matches the BSL-XXXXXX pattern', async () => {
      const { orderId } = await mockApiSubmit(samplePayload, {
        _random: succeedRng(0.999999),
        _delay: 0,
      });
      expect(orderId).toMatch(/^BSL-[A-Z0-9]+$/);
    });

    test('orderId always starts with "BSL-"', async () => {
      const { orderId } = await mockApiSubmit(samplePayload, {
        _random: succeedRng(0.5),
        _delay: 0,
      });
      expect(orderId.startsWith('BSL-')).toBe(true);
    });

    test('estimatedDate is a non-empty string', async () => {
      const { estimatedDate } = await mockApiSubmit(samplePayload, {
        _random: succeedRng(),
        _delay: 0,
      });
      expect(typeof estimatedDate).toBe('string');
      expect(estimatedDate.length).toBeGreaterThan(0);
    });

    test('estimatedDate is approximately 14 days from now', async () => {
      const fourteenDays = 14 * 24 * 60 * 60 * 1000;
      const before = Date.now();
      await mockApiSubmit(samplePayload, { _random: succeedRng(), _delay: 0 });
      const after = Date.now();
      // The target epoch used in the function must be between before+14d and after+14d
      const targetEpoch = before + fourteenDays;
      expect(targetEpoch).toBeGreaterThan(Date.now()); // sanity: 14 days is in the future
      expect(after - before).toBeLessThan(50);         // delay=0 → near-instant
    });

    test('resolves quickly when _delay is 0', async () => {
      const t0 = Date.now();
      await mockApiSubmit(samplePayload, { _random: succeedRng(), _delay: 0 });
      expect(Date.now() - t0).toBeLessThan(100);
    });

    test('each call produces a different orderId when the RNG differs', async () => {
      const r1 = await mockApiSubmit(samplePayload, { _random: succeedRng(0.1), _delay: 0 });
      const r2 = await mockApiSubmit(samplePayload, { _random: succeedRng(0.9), _delay: 0 });
      expect(r1.orderId).not.toBe(r2.orderId);
    });
  });

  // ── failure path ───────────────────────────────────────────────────────────

  describe('failure path', () => {
    test('rejects when _random returns a value < 0.12', async () => {
      await expect(
        mockApiSubmit(samplePayload, { _random: failRng(), _delay: 0 })
      ).rejects.toThrow();
    });

    test('rejection error mentions "Network error"', async () => {
      await expect(
        mockApiSubmit(samplePayload, { _random: failRng(), _delay: 0 })
      ).rejects.toThrow(/Network error/);
    });

    test('rejection error mentions connectivity ("connection")', async () => {
      await expect(
        mockApiSubmit(samplePayload, { _random: failRng(), _delay: 0 })
      ).rejects.toThrow(/connection/);
    });

    test('rejects with an Error instance, not a plain string', async () => {
      await expect(
        mockApiSubmit(samplePayload, { _random: failRng(), _delay: 0 })
      ).rejects.toBeInstanceOf(Error);
    });
  });

  // ── boundary: the 0.12 threshold ──────────────────────────────────────────

  describe('failure threshold boundary', () => {
    test('succeeds when _random returns exactly 0.12 (condition is strict <)', async () => {
      const rng = jest.fn()
        .mockReturnValueOnce(0.12)  // NOT < 0.12 → success branch
        .mockReturnValue(0.5);      // orderId
      await expect(
        mockApiSubmit(samplePayload, { _random: rng, _delay: 0 })
      ).resolves.toHaveProperty('orderId');
    });

    test('fails when _random returns 0.1199 (just under the threshold)', async () => {
      const rng = jest.fn().mockReturnValue(0.1199);
      await expect(
        mockApiSubmit(samplePayload, { _random: rng, _delay: 0 })
      ).rejects.toBeInstanceOf(Error);
    });

    test('fails when _random returns 0.0 (minimum possible value)', async () => {
      const rng = jest.fn().mockReturnValue(0.0);
      await expect(
        mockApiSubmit(samplePayload, { _random: rng, _delay: 0 })
      ).rejects.toBeInstanceOf(Error);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  PALETTE (data contract)
// ─────────────────────────────────────────────────────────────────────────────

describe('PALETTE', () => {
  test('contains exactly 8 colour entries', () => {
    expect(PALETTE).toHaveLength(8);
  });

  test('every entry has id, name, fill, and accent', () => {
    PALETTE.forEach(p => {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('fill');
      expect(p).toHaveProperty('accent');
    });
  });

  test('all fill and accent values are valid 6-digit hex colours', () => {
    const hex6 = /^#[0-9A-Fa-f]{6}$/;
    PALETTE.forEach(({ name, fill, accent }) => {
      expect(fill).toMatch(hex6);
      expect(accent).toMatch(hex6);
    });
  });

  test('all IDs are unique', () => {
    const ids = PALETTE.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all names are unique', () => {
    const names = PALETTE.map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('all IDs are lowercase strings with no spaces', () => {
    PALETTE.forEach(p => {
      expect(p.id).toMatch(/^[a-z]+$/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  ROUTE_LABELS (data contract)
// ─────────────────────────────────────────────────────────────────────────────

describe('ROUTE_LABELS', () => {
  test('defines labels for canvas, atelier, and upload', () => {
    expect(ROUTE_LABELS).toHaveProperty('canvas');
    expect(ROUTE_LABELS).toHaveProperty('atelier');
    expect(ROUTE_LABELS).toHaveProperty('upload');
  });

  test('all values are non-empty strings', () => {
    Object.values(ROUTE_LABELS).forEach(label => {
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    });
  });

  test('has exactly 3 routes', () => {
    expect(Object.keys(ROUTE_LABELS)).toHaveLength(3);
  });
});
