// @license
// Copyright (c) 2025 Rljson
//
// Use of this source code is governed by terms that can be
// found in the LICENSE file in the root of this package.

import { DecomposeChart } from '@rljson/converter';
import { Json } from '@rljson/json';

// generateRawCustomers/RawAddress are not published in @rljson/rljson yet
// (work in progress in the sibling RLJSON repo) — imported straight from
// source until that lands in a release.
import {
  generateRawCustomers,
  RawAddress,
} from '../../../RLJSON/src/example/customer-generator.ts';

import { createChartGenerator } from './chart-generator.ts';
import { GeneratorEntry } from './generator-entry.ts';

/**
 * Decompose chart for customer data. Owned by the Generator itself (not
 * imported from @rljson/db's internal test fixtures) so it can evolve
 * independently of that package's example data.
 */
export const customerChart: DecomposeChart = {
  _sliceId: 'customerId',
  _name: 'Customer',
  general: [
    { origin: 'number', destination: 'number', type: 'number' },
    { origin: 'version', destination: 'version', type: 'number' },
    { origin: 'created', destination: 'created' },
    { origin: 'modified', destination: 'modified' },
  ],
  // Nested source paths use "/" (per @rljson/converter's nestedProperty),
  // not ":" — e.g. "data/index" reaches raw.data.index. A ":" is silently
  // treated as a literal (nonexistent) flat key, so every field in a block
  // written with ":" resolves to undefined and the whole block collapses
  // into a single, content-less, always-identical row.
  data: [
    { origin: 'data/index', destination: 'index' },
    { origin: 'data/personalNumber', destination: 'personalNumber' },
    { origin: 'data/customerNumber2', destination: 'customerNumber2' },
    { origin: 'data/customerNumber3', destination: 'customerNumber3' },
    { origin: 'data/debitorNumber', destination: 'debitorNumber' },
    { origin: 'data/apoNumber', destination: 'apoNumber' },
    { origin: 'data/natoCustomer', destination: 'natoCustomer', type: 'boolean' },
    { origin: 'data/customerDiscountPercentage', destination: 'customerDiscountPercentage', type: 'number' },
    { origin: 'data/advertisingAllowed', destination: 'advertisingAllowed', type: 'boolean' },
    { origin: 'data/merchandiseManagementNumber', destination: 'merchandiseManagementNumber' },
    { origin: 'data/gdprInformation', destination: 'gdprInformation', type: 'boolean' },
    { origin: 'data/turnover', destination: 'turnover', type: 'number' },
    { origin: 'data/creditRating', destination: 'creditRating' },
    { origin: 'data/eInvoice', destination: 'eInvoice', type: 'boolean' },
    { origin: 'data/deliveryAdressKey', destination: 'deliveryAdressKey' },
    { origin: 'data/timeStamp2', destination: 'timeStamp2' },
    { origin: 'data/differentVat', destination: 'differentVat', type: 'number' },
    { origin: 'data/differentVatRate', destination: 'differentVatRate', type: 'number' },
    { origin: 'data/reverseChargeProcedure', destination: 'reverseChargeProcedure', type: 'boolean' },
  ],
  commonFields: [
    { origin: 'commonFields/createdBy', destination: 'createdBy' },
    { origin: 'commonFields/updatedBy', destination: 'updatedBy' },
    { origin: 'commonFields/createdAt', destination: 'createdAt' },
    { origin: 'commonFields/updatedAt', destination: 'updatedAt' },
    { origin: 'commonFields/status', destination: 'status', type: 'number' },
    { origin: 'commonFields/version', destination: 'version', type: 'number' },
    { origin: 'commonFields/recordNo', destination: 'recordNo', type: 'number' },
  ],
  _types: [
    {
      _path: 'addresses',
      _sliceId: 'addressId',
      _name: 'Address',
      flags: [
        { origin: 'isInvoice', destination: 'isInvoice', type: 'boolean' },
        { origin: 'isDeliver', destination: 'isDeliver', type: 'boolean' },
        { origin: 'isGraphic', destination: 'isGraphic', type: 'boolean' },
        { origin: 'isOrder', destination: 'isOrder', type: 'boolean' },
        { origin: 'isOffer', destination: 'isOffer', type: 'boolean' },
        { origin: 'privateAddress', destination: 'privateAddress', type: 'boolean' },
        { origin: 'isNameLikeFirstAddress', destination: 'isNameLikeFirstAddress', type: 'boolean' },
      ],
      person: [
        { origin: 'title', destination: 'title' },
        { origin: 'firstName', destination: 'firstName' },
        { origin: 'lastName', destination: 'lastName' },
        { origin: 'name1', destination: 'name1' },
        { origin: 'name2', destination: 'name2' },
        { origin: 'name3', destination: 'name3' },
        { origin: 'name4', destination: 'name4' },
        { origin: 'birthDate', destination: 'birthDate' },
        { origin: 'title2', destination: 'title2' },
        { origin: 'firstName2', destination: 'firstName2' },
        { origin: 'lastName2', destination: 'lastName2' },
        { origin: 'birthDate2', destination: 'birthDate2' },
        { origin: 'salutatoryAddress', destination: 'salutatoryAddress' },
      ],
      location: [
        { origin: 'street', destination: 'street' },
        { origin: 'street2', destination: 'street2' },
        { origin: 'street3', destination: 'street3' },
        { origin: 'postCode', destination: 'postCode' },
        { origin: 'city', destination: 'city' },
        { origin: 'countryCode', destination: 'countryCode' },
        { origin: 'countryCodeISO', destination: 'countryCodeISO' },
        { origin: 'countryName', destination: 'countryName' },
        { origin: 'floor', destination: 'floor' },
        { origin: 'isElevatorAvailable', destination: 'isElevatorAvailable', type: 'boolean' },
      ],
      fiscal: [
        { origin: 'vatId', destination: 'vatId' },
        { origin: 'taxNumber', destination: 'taxNumber' },
        { origin: 'taxNumber2', destination: 'taxNumber2' },
        { origin: 'validFrom', destination: 'validFrom' },
        { origin: 'validThru', destination: 'validThru' },
      ],
      contact: [
        { origin: 'communication/phonePrivate', destination: 'phonePrivate' },
        { origin: 'communication/phoneCommercial', destination: 'phoneCommercial' },
        { origin: 'communication/fax', destination: 'fax' },
        { origin: 'communication/mobile1', destination: 'mobile1' },
        { origin: 'communication/mobile2', destination: 'mobile2' },
        { origin: 'communication/eMail', destination: 'eMail' },
      ],
    },
  ],
};

export const customersGenerator: GeneratorEntry = createChartGenerator({
  label: 'Kunden',
  chart: customerChart,

  // generateRawCustomers() is deliberately deterministic (index-based, no
  // Math.random) for a given startIndex — same inputs always produce
  // byte-identical content, useful for reproducible tests.
  // createChartGenerator supplies a fresh startIndex on every generate()
  // call, so this only needs to actually vary the content per index (it
  // already does, via generateRawCustomers) — no anti-deduplication logic
  // needed here.
  generateRaw: (count, startIndex) => {
    const raw = generateRawCustomers(count, startIndex);
    const withIds = raw.map((customer) => ({
      ...customer,
      customerId: String(customer._id),
      addresses: customer.addresses.map((addr: RawAddress, j: number) => ({
        ...addr,
        addressId: `${customer._id}-${j}`,
        isElevatorAvailable: addr.isElevatorAvailable ?? false,
      })),
    }));
    // RawCustomer's typed interfaces have no index signature, so they don't
    // structurally satisfy Json — the values themselves are plain JSON data.
    return withIds as unknown as Json[];
  },
});
