import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import { createApiContext, getVendors, getVendor } from '../src/fairtprmApi.js';

const config = {
  baseURL: process.env.FAIRTPRM_BASE_URL,
  token: process.env.FAIRTPRM_API_TOKEN,
};

test('getVendors returns the seeded test vendor', async () => {
  const ctx = await createApiContext(config);
  const vendors = await getVendors(ctx);
  assert.ok(vendors.some((v) => v.vendor_name === 'First Test Vendor'));
  await ctx.dispose();
});

test('getVendor returns full detail including scores', async () => {
  const ctx = await createApiContext(config);
  const vendor = await getVendor(ctx, 1);
  assert.equal(vendor.vendor_name, 'First Test Vendor');
  assert.equal(typeof vendor.current_srs_score, 'number');
  await ctx.dispose();
});
