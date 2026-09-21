import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findVendorId } from '../src/onboardingAutomation.js';

const vendorContext = { vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' };

test('findVendorId matches by exact name and domain', () => {
  const vendors = [
    { id: 3, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
    { id: 1, vendor_name: 'Other Vendor', vendor_domain: 'other.com' },
  ];
  assert.equal(findVendorId(vendors, vendorContext), 3);
});

test('findVendorId picks the highest id when there are duplicates', () => {
  const vendors = [
    { id: 4, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
    { id: 9, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
    { id: 6, vendor_name: 'Acme QA Tools', vendor_domain: 'acmeqa.example.com' },
  ];
  assert.equal(findVendorId(vendors, vendorContext), 9);
});

test('findVendorId returns null when no match exists', () => {
  const vendors = [{ id: 1, vendor_name: 'Other Vendor', vendor_domain: 'other.com' }];
  assert.equal(findVendorId(vendors, vendorContext), null);
});
