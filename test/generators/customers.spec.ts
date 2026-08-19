// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { describe, expect, it } from 'vitest';

import {
  customerChart,
  customersGenerator,
  generateRawCustomerJson,
} from '../../src/generators/customers.ts';

describe('customerChart', () => {
  it('declares the expected identity and top-level blocks', () => {
    expect(customerChart._sliceId).toBe('customerId');
    expect(customerChart._name).toBe('Customer');
    expect(Object.keys(customerChart)).toEqual(
      expect.arrayContaining(['general', 'data', 'commonFields', '_types']),
    );
  });

  it('uses "/" (not ":") for every nested origin path', () => {
    // Regression guard: a ":" separator is silently treated as a literal,
    // nonexistent flat key by @rljson/converter, collapsing the whole block
    // into always-undefined values — this bit the project once already.
    const allOrigins = [
      ...(customerChart.data as any[]),
      ...(customerChart.commonFields as any[]),
      ...(customerChart._types![0].contact as any[]),
    ].map((def) => def.origin as string);

    for (const origin of allOrigins) {
      if (origin.includes('/')) {
        expect(origin).not.toContain(':');
      }
    }
    expect(allOrigins.some((o) => o.startsWith('data/'))).toBe(true);
    expect(allOrigins.some((o) => o.startsWith('commonFields/'))).toBe(true);
    expect(allOrigins.some((o) => o.startsWith('communication/'))).toBe(true);
  });
});

describe('generateRawCustomerJson', () => {
  it('assigns a string customerId and per-address addressId', () => {
    const [customer] = generateRawCustomerJson(1, 0) as any[];
    expect(customer.customerId).toBe(String(customer._id));
    customer.addresses.forEach((addr: any, j: number) => {
      expect(addr.addressId).toBe(`${customer._id}-${j}`);
    });
  });

  it('defaults a null/undefined isElevatorAvailable to false, never leaving it nullish', () => {
    // Enough addresses (1-3 per customer, cycling) to hit every remainder
    // mod 3 of the underlying raw generator's elevator-value pool
    // (true/false/null all appear at least once in the raw data).
    const customers = generateRawCustomerJson(10, 0) as any[];
    const allAddresses = customers.flatMap((c) => c.addresses);
    expect(allAddresses.length).toBeGreaterThan(10);
    expect(allAddresses.every((a: any) => a.isElevatorAvailable !== null)).toBe(true);
    expect(allAddresses.some((a: any) => a.isElevatorAvailable === false)).toBe(true);
    expect(allAddresses.some((a: any) => a.isElevatorAvailable === true)).toBe(true);
  });
});

describe('customersGenerator', () => {
  it('derives the /customerCake route from the chart name', () => {
    expect(customersGenerator.route.flat).toBe('/customerCake');
    expect(customersGenerator.label).toBe('Kunden');
  });

  it('generates well-formed, decomposed customer data with real nested values', () => {
    const result = customersGenerator.generate(10);

    expect(result.validationErrors).toEqual([]);
    // One row per generated customer in a per-customer scalar block...
    expect((result.rljson.customerGeneral as any)._data.length).toBe(10);
    // ...but exactly one Cake row overall (it aggregates every customer).
    expect(result.stats.customerCake).toBe(1);

    const dataRows = (result.rljson.customerData as any)._data as any[];
    // If the ":" bug ever regresses, every nested field resolves to
    // undefined — assert a real, non-empty value made it through.
    expect(dataRows.some((r) => typeof r.personalNumber === 'string' && r.personalNumber.length > 0)).toBe(true);

    const contactRows = (result.rljson.addressContact as any)._data as any[];
    expect(contactRows.some((r) => typeof r.eMail === 'string' && r.eMail.includes('@'))).toBe(true);
  });
});
